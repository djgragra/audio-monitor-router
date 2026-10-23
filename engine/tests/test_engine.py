import os
import sys
import unittest

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from amr_engine import devices as dev  # noqa: E402
from amr_engine.backend import FakeBackend  # noqa: E402
from amr_engine.buffer import DriftBuffer  # noqa: E402
from amr_engine.router import Engine  # noqa: E402


def fake_devices():
    """A made-up machine: a 4-channel interface, a network card with stereo endpoints, a mono mic, speakers."""
    return [
        {"index": 0, "name": "IN 1-2 (Studio Interface)", "hostapi": "API", "max_in": 2, "max_out": 0, "rate": 48000},
        {"index": 1, "name": "IN 1-4 (Studio Interface)", "hostapi": "API", "max_in": 4, "max_out": 0, "rate": 48000},
        {"index": 2, "name": "Mic (Studio Interface)", "hostapi": "API", "max_in": 1, "max_out": 0, "rate": 48000},
        {"index": 3, "name": "Net Receive 1-2 (Network Card)", "hostapi": "API", "max_in": 2, "max_out": 0, "rate": 48000},
        {"index": 4, "name": "OUT 1-2 (Studio Interface)", "hostapi": "API", "max_in": 0, "max_out": 2, "rate": 48000},
        {"index": 5, "name": "Speakers (Onboard Audio)", "hostapi": "API", "max_in": 0, "max_out": 2, "rate": 44100},
        {"index": 6, "name": "Desk Speaker (Onboard Audio)", "hostapi": "API", "max_in": 0, "max_out": 1, "rate": 44100},
    ]


class DeviceTests(unittest.TestCase):
    def test_split_name(self):
        self.assertEqual(dev.split_name("OUT 1-2 (Studio Interface)"), ("OUT 1-2", "Studio Interface"))
        self.assertEqual(dev.split_name("Plain Name"), ("Plain Name", "Plain Name"))

    def test_channel_ports(self):
        self.assertEqual(dev.channel_ports(1), [("mono", [0])])
        self.assertEqual(dev.channel_ports(2), [("1-2", [0, 1])])
        self.assertEqual(dev.channel_ports(5), [("1-2", [0, 1]), ("3-4", [2, 3]), ("5", [4])])

    def test_ports_from_machine(self):
        src, dst = dev.build_ports(fake_devices())
        names = [p["name"] for p in src]
        self.assertIn("IN 1-4 1-2", names)
        self.assertIn("IN 1-4 3-4", names)
        self.assertEqual(len(src), 5)       # stereo, quad (2 ports), mono mic, network pair
        self.assertEqual(len(dst), 3)       # interface out, speakers, mono desk speaker

    def test_ids_are_unique_and_stable(self):
        a, b = dev.build_ports(fake_devices())
        a2, b2 = dev.build_ports(list(reversed(fake_devices())))
        self.assertEqual(len({p["id"] for p in a}), len(a))
        self.assertEqual({p["id"] for p in a}, {p["id"] for p in a2})
        self.assertEqual({p["id"] for p in b}, {p["id"] for p in b2})

    def test_same_name_twice_gets_a_suffix(self):
        twin = [{"index": i, "name": "Card (Twin)", "hostapi": "API", "max_in": 2, "max_out": 0, "rate": 48000}
                for i in range(2)]
        src, _ = dev.build_ports(twin)
        self.assertEqual(len({p["id"] for p in src}), 2)


class BufferTests(unittest.TestCase):
    def run_drift(self, ppm, seconds=60):
        b, rate, t_in, acc, outs, fills = DriftBuffer(), 48000.0, 0, 0.0, [], []
        for _ in range(seconds * 100):
            ph = np.arange(t_in, t_in + 480) / rate * 440.0 * 2 * np.pi
            x = np.sin(ph).astype(np.float32)
            b.write(np.stack([x, x], 1))
            t_in += 480
            acc += 480 * (1 + ppm * 1e-6)
            while acc >= 512:
                outs.append(b.read(512)[:, 0])
                fills.append(b.w - b.r)
                acc -= 512
        return b, np.concatenate(outs)[int(48000 * 0.2):], fills

    def test_clock_drift_both_ways_no_glitches(self):
        for ppm in (+300, -300):
            b, out, fills = self.run_drift(ppm)
            self.assertEqual(b.underruns, 0, ppm)
            self.assertEqual(b.overruns, 0, ppm)
            self.assertEqual(int((out == 0).sum()), 0, ppm)
            self.assertLess(float(np.abs(np.diff(out)).max()), 0.1, ppm)    # a 440 Hz sine steps at most ~0.06
            self.assertGreater(min(fills[10:]), 0)


class EngineTests(unittest.TestCase):
    def setUp(self):
        self.backend = FakeBackend(fake_devices())
        self.engine = Engine(self.backend)
        ev = self.engine.scan()
        self.src = {p["name"]: p["id"] for p in ev["sources"]}
        self.dst = {p["name"]: p["id"] for p in ev["destinations"]}

    def feed(self, device_index, frames_by_channel, blocks=12):
        s = self.backend.inputs[device_index]
        n = len(frames_by_channel)
        for _ in range(blocks):
            block = np.zeros((480, n), np.float32)
            for c, v in enumerate(frames_by_channel):
                block[:, c] = v
            s.callback(block)

    def pull(self, device_index, channels, n=256):
        out = np.zeros((n, channels), np.float32)
        self.backend.outputs[device_index].callback(out)
        return out

    def test_unknown_device_is_an_error_not_a_crash(self):
        ev = self.engine.handle({"cmd": "start_route", "route_id": "r1", "source": "nope", "destination": "nope"})
        self.assertEqual(ev[0]["event"], "route_error")

    def test_pair_goes_to_the_right_channels(self):
        ev = self.engine.handle({"cmd": "start_route", "route_id": "r1", "source": self.src["IN 1-4 3-4"],
                                 "destination": self.dst["OUT 1-2"], "gain": 0.5})
        self.assertEqual(ev[0]["event"], "route_started")
        self.feed(1, [0.1, 0.2, 0.8, 0.4])                 # 4-channel interface: the pair 3-4 is selected
        out = self.pull(4, 2)
        self.assertAlmostEqual(float(out[100, 0]), 0.4, places=3)
        self.assertAlmostEqual(float(out[100, 1]), 0.2, places=3)

    def test_mono_source_is_copied_to_both_sides(self):
        self.engine.handle({"cmd": "start_route", "route_id": "r1", "source": self.src["Mic"],
                            "destination": self.dst["Speakers"]})
        self.feed(2, [0.6])
        out = self.pull(5, 2)
        self.assertAlmostEqual(float(out[100, 0]), 0.6, places=3)
        self.assertAlmostEqual(float(out[100, 1]), 0.6, places=3)

    def test_device_removed_stops_the_route_and_it_disappears(self):
        self.engine.handle({"cmd": "start_route", "route_id": "r1", "source": self.src["Net Receive 1-2"],
                            "destination": self.dst["Speakers"]})
        self.engine.poll()
        self.backend.devices = [d for d in self.backend.devices if d["index"] != 3]    # unplug the network card
        events = self.engine.poll()
        kinds = [e["event"] for e in events]
        self.assertEqual(kinds, ["devices", "route_stopped"])
        self.assertEqual(events[1]["reason"], "device_gone")
        self.assertNotIn("Net Receive 1-2", [p["name"] for p in events[0]["sources"]])
        self.assertEqual(self.engine.routes, {})

    def test_device_back_has_the_same_id(self):
        gone = [d for d in self.backend.devices if d["index"] != 3]
        before = set(self.src.values())
        self.backend.devices = gone
        self.engine.poll()
        self.backend.devices = fake_devices()
        ev = self.engine.poll()[0]
        self.assertEqual({p["id"] for p in ev["sources"]}, before)

    def test_no_change_no_event(self):
        self.engine.poll()
        self.assertEqual(self.engine.poll(), [])


if __name__ == "__main__":
    unittest.main()


class StdioTests(unittest.TestCase):
    def test_commands_are_read_as_utf8_whatever_the_system_encoding(self):
        import subprocess
        code = ("import sys; sys.path.insert(0, %r); from amr_engine.__main__ import setup_stdio; setup_stdio(); "
                "print(sys.stdin.readline().strip())") % os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        env = dict(os.environ, PYTHONIOENCODING="cp1252")
        out = subprocess.run([sys.executable, "-c", code], input="Altoparlanti è così\n".encode("utf-8"), capture_output=True, env=env)
        self.assertEqual(out.stdout.decode("utf-8").strip(), "Altoparlanti è così")
