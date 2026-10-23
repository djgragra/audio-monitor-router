"""Signal monitor: tells which source ports have audio, so the interface can light a speaker next to them.

One input stream per *device* (a device with four channels gives two ports but is opened once), at the
backend's relaxed latency to keep the number of callbacks low. Only peak levels are kept.
"""
import math

import numpy as np

MAX_STREAMS = 32          # more than any real machine needs; a limit against a runaway list


class SignalMonitor:
    def __init__(self, backend):
        self.backend = backend
        self.streams = {}      # device_index -> (stream, [(port_id, [columns])])
        self.peaks = {}        # port_id -> peak since the last take
        self.failed = set()    # device_index values that could not be opened (in use, driver refuses)

    def _callback(self, ports):
        def cb(indata):
            for port_id, cols in ports:
                p = float(np.abs(indata[:, cols]).max()) if len(indata) else 0.0
                if p > self.peaks.get(port_id, 0.0):
                    self.peaks[port_id] = p
        return cb

    def set_ports(self, ports):
        """ports: source ports (as built by devices.build_ports) to watch. Opens and closes streams as needed."""
        by_device = {}
        for p in ports:
            by_device.setdefault(p["device_index"], {"channels": p["device_channels"], "ports": []})["ports"].append((p["id"], p["channels"]))
        for idx in [i for i in self.streams if i not in by_device or [x[0] for x in self.streams[i][1]] != [x[0] for x in by_device[i]["ports"]]]:
            self._close(idx)
        for idx, d in list(by_device.items())[:MAX_STREAMS]:
            if idx in self.streams or idx in self.failed:
                continue
            try:
                stream = self.backend.open_input(idx, d["channels"], self._callback(d["ports"]), latency="high")
                stream.start()
                self.streams[idx] = (stream, d["ports"])
            except Exception:
                self.failed.add(idx)
        wanted = {pid for d in by_device.values() for pid, _ in d["ports"]}
        self.peaks = {k: v for k, v in self.peaks.items() if k in wanted}

    def _close(self, idx):
        stream, _ = self.streams.pop(idx)
        try:
            stream.abort()
            stream.close()
        except Exception:
            pass

    @property
    def alive(self):
        """False when the system closed one of the streams under us (device unplugged)."""
        return all(getattr(s, "active", True) for s, _ in self.streams.values())

    def take_levels(self):
        """Peak level in dB of every watched port since the last call (-90 for silence)."""
        out = {}
        for _, ports in self.streams.values():
            for pid, _ in ports:
                p = self.peaks.get(pid, 0.0)
                out[pid] = round(20 * math.log10(p), 1) if p > 1e-6 else -90.0
        self.peaks = {}
        return out

    def stop(self):
        for idx in list(self.streams):
            self._close(idx)
        self.failed.clear()
        self.peaks = {}
