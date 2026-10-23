import os
import sys
import unittest

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from amr_engine.backend import FakeBackend  # noqa: E402
from amr_engine.router import Engine  # noqa: E402
from test_engine import fake_devices  # noqa: E402


def block(values, frames=480):
    b = np.zeros((frames, len(values)), np.float32)
    for c, v in enumerate(values):
        b[:, c] = v
    return b


class Base(unittest.TestCase):
    def setUp(self):
        self.backend = FakeBackend(fake_devices())
        self.engine = Engine(self.backend)
        ev = self.engine.scan()
        self.src = {p["name"]: p["id"] for p in ev["sources"]}
        self.dst = {p["name"]: p["id"] for p in ev["destinations"]}

    def watch(self, *names):
        self.engine.handle({"cmd": "monitor_sources", "ports": [self.src[n] for n in names]})

    def feed(self, device_index, values, blocks=12):
        for _ in range(blocks):
            for s in self.backend.inputs[device_index]:
                s.callback(block(values))

    def start(self, rid, src, dst, **opts):
        return self.engine.handle({"cmd": "start_route", "route_id": rid, "source": self.src[src], "destination": self.dst[dst], **opts})

    def pull(self, device_index, channels, n=256):
        out = np.zeros((n, channels), np.float32)
        self.backend.outputs[device_index].callback(out)
        return out


class SignalTests(Base):
    def test_one_stream_per_device_and_levels_per_pair(self):
        self.watch("IN 1-4 1-2", "IN 1-4 3-4", "Mic")
        self.assertEqual(sorted(self.engine.monitor.streams), [1, 2])     # the quad device is opened once
        self.feed(1, [0.0, 0.0, 0.5, 0.5], blocks=2)                      # sound only on channels 3-4
        lv = self.engine.signal()["levels"]
        self.assertEqual(lv[self.src["IN 1-4 1-2"]], -90.0)
        self.assertAlmostEqual(lv[self.src["IN 1-4 3-4"]], -6.0, delta=0.1)
        self.assertEqual(lv[self.src["Mic"]], -90.0)

    def test_levels_start_again_after_each_report(self):
        self.watch("Mic")
        self.feed(2, [0.5], blocks=1)
        self.assertGreater(self.engine.signal()["levels"][self.src["Mic"]], -20)
        self.assertEqual(self.engine.signal()["levels"][self.src["Mic"]], -90.0)

    def test_nothing_watched_nothing_reported(self):
        self.assertIsNone(self.engine.signal())

    def test_a_device_that_refuses_does_not_stop_the_others(self):
        self.backend.refuse = {3}
        self.watch("Net Receive 1-2", "Mic")
        self.assertEqual(list(self.engine.monitor.streams), [2])
        self.assertIn(self.src["Mic"], self.engine.signal()["levels"])

    def test_unwatched_sources_are_closed(self):
        self.watch("Mic", "Net Receive 1-2")
        self.watch("Mic")
        self.assertEqual(list(self.engine.monitor.streams), [2])

    def test_unplugged_device_is_noticed_through_the_monitor_stream(self):
        self.watch("Net Receive 1-2", "Mic")
        self.backend.devices = [d for d in self.backend.devices if d["index"] != 3]
        for s in self.backend.inputs[3]:
            s.active = False
        events = self.engine.poll()
        self.assertEqual([e["event"] for e in events], ["devices"])
        self.assertNotIn("Net Receive 1-2", [p["name"] for p in events[0]["sources"]])
        self.assertEqual(list(self.engine.monitor.streams), [2])          # the other source is watched again

    def test_idle_refresh_is_slower_with_the_monitor_and_keeps_it_running(self):
        self.watch("Mic")
        before = self.backend.refreshes
        for _ in range(6):
            self.engine.poll()
        self.assertEqual(self.backend.refreshes - before, 2)              # every third poll, not every poll
        self.assertEqual(list(self.engine.monitor.streams), [2])
        self.assertTrue(self.engine.monitor.alive)

    def test_no_refresh_at_all_while_a_route_plays_even_with_the_monitor(self):
        self.start("r1", "Net Receive 1-2", "Speakers")
        self.watch("Mic")
        before = self.backend.refreshes
        for _ in range(6):
            self.assertEqual(self.engine.poll(), [])
        self.assertEqual(self.backend.refreshes, before)

    def test_the_monitor_comes_back_after_a_reload_with_a_route_running(self):
        self.start("r1", "Net Receive 1-2", "Speakers")
        self.watch("Mic")
        self.engine.handle({"cmd": "list_devices"})
        self.assertEqual(list(self.engine.monitor.streams), [2])
        self.assertTrue(self.engine.routes["r1"].alive)


class ChannelTests(Base):
    def play(self, left, right, **opts):
        self.start("r1", "Net Receive 1-2", "Speakers", **opts)
        self.feed(3, [left, right])
        return self.pull(5, 2)[100]

    def test_plain_stereo(self):
        out = self.play(0.4, 0.2)
        self.assertAlmostEqual(float(out[0]), 0.4, places=3)
        self.assertAlmostEqual(float(out[1]), 0.2, places=3)

    def test_mute_left_and_right(self):
        out = self.play(0.4, 0.2, mute_left=True)
        self.assertEqual([round(float(x), 3) for x in out], [0.0, 0.2])
        self.setUp()
        out = self.play(0.4, 0.2, mute_right=True)
        self.assertEqual([round(float(x), 3) for x in out], [0.4, 0.0])

    def test_mono_sums_left_and_right_on_both_sides(self):
        out = self.play(0.4, 0.2, mono=True)
        self.assertAlmostEqual(float(out[0]), 0.3, places=3)
        self.assertAlmostEqual(float(out[1]), 0.3, places=3)

    def test_mono_with_one_side_muted_gives_the_sum_on_the_other(self):
        out = self.play(0.4, 0.2, mono=True, mute_left=True)
        self.assertEqual(float(out[0]), 0.0)
        self.assertAlmostEqual(float(out[1]), 0.3, places=3)

    def test_the_buttons_work_while_playing(self):
        self.start("r1", "Net Receive 1-2", "Speakers")
        self.engine.handle({"cmd": "set_channels", "route_id": "r1", "mute_right": True})
        self.feed(3, [0.4, 0.2])
        out = self.pull(5, 2)[100]
        self.assertEqual([round(float(x), 3) for x in out], [0.4, 0.0])

    def test_mute_survives_a_reload(self):
        self.start("r1", "Net Receive 1-2", "Speakers", mute_left=True, gain=0.5)
        self.engine.handle({"cmd": "list_devices"})
        r = self.engine.routes["r1"]
        self.assertEqual((r.opts["mute_left"], r.opts["gain"]), (True, 0.5))


class LatencyTests(Base):
    def test_target_follows_the_setting_and_routes_are_opened_again(self):
        self.start("r1", "Net Receive 1-2", "Speakers")
        self.assertEqual(self.engine.routes["r1"].dbuf.target, int(48000 * 0.060))
        old = self.engine.routes["r1"]
        self.engine.handle({"cmd": "set_latency", "latency": "low"})
        self.assertIsNot(self.engine.routes["r1"], old)
        self.assertEqual(self.engine.routes["r1"].dbuf.target, int(48000 * 0.030))
        self.engine.handle({"cmd": "set_latency", "latency": "safe"})
        self.assertEqual(self.engine.routes["r1"].dbuf.target, int(48000 * 0.120))

    def test_same_setting_does_nothing_and_a_wrong_one_is_ignored(self):
        self.start("r1", "Net Receive 1-2", "Speakers")
        route = self.engine.routes["r1"]
        self.engine.handle({"cmd": "set_latency", "latency": "normal"})
        self.engine.handle({"cmd": "set_latency", "latency": "turbo"})
        self.assertIs(self.engine.routes["r1"], route)

    def test_a_new_route_uses_the_current_setting(self):
        self.engine.handle({"cmd": "set_latency", "latency": "low"})
        self.start("r1", "Mic", "Speakers")
        self.assertEqual(self.engine.routes["r1"].dbuf.target, int(48000 * 0.030))


if __name__ == "__main__":
    unittest.main()
