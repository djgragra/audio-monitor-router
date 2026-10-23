"""Routes: one source port to one destination port, with gain and a peak meter."""
import math

import numpy as np

from .buffer import DriftBuffer
from . import devices as dev


class Route:
    def __init__(self, backend, src, dst, gain=1.0):
        self.src, self.dst, self.gain = src, dst, gain
        self.peak = 0.0
        self.dbuf = DriftBuffer()
        self._in = self._out = None
        try:
            self._in = backend.open_input(src["device_index"], src["device_channels"], self._cb_in)
            self._out = backend.open_output(dst["device_index"], dst["device_channels"], self._cb_out)
            self._in.start()
            self._out.start()
        except Exception:
            self.stop()
            raise

    def _cb_in(self, indata):
        cols = self.src["channels"]
        pair = indata[:, cols]
        if pair.shape[1] == 1:                       # mono source: same signal left and right
            pair = np.repeat(pair, 2, axis=1)
        self.dbuf.write(pair)

    def _cb_out(self, outdata):
        d = self.dbuf.read(len(outdata)) * self.gain
        outdata[:] = 0
        cols = self.dst["channels"]
        if len(cols) == 1:                           # mono destination: left and right summed
            outdata[:, cols[0]] = d.mean(axis=1)
        else:
            outdata[:, cols] = d
        if len(d):
            self.peak = max(self.peak, float(np.abs(d).max()))

    def take_peak_db(self):
        p, self.peak = self.peak, 0.0
        return 20 * math.log10(p) if p > 1e-6 else -90.0

    def stop(self):
        for s in (self._in, self._out):
            if s is not None:
                try:
                    s.abort()
                    s.close()
                except Exception:
                    pass


class Engine:
    """State of the engine. `handle` takes one command (a dict) and returns the events to send back."""

    def __init__(self, backend):
        self.backend = backend
        self.sources, self.destinations = [], []
        self.routes = {}          # route_id -> Route
        self._last_listing = None

    # --- devices ---
    def scan(self):
        self.sources, self.destinations = dev.build_ports(self.backend.query())
        return {"event": "devices",
                "sources": [dev.public(p) for p in self.sources],
                "destinations": [dev.public(p) for p in self.destinations]}

    def poll(self):
        """Called every second or two: reports changes in the devices and stops routes that lost a device."""
        self.backend.refresh()
        ev = self.scan()
        events = []
        key = ([p["id"] for p in ev["sources"]], [p["id"] for p in ev["destinations"]])
        present = {p["id"] for p in self.sources + self.destinations}
        for rid, r in list(self.routes.items()):
            if r.src["id"] not in present or r.dst["id"] not in present:
                r.stop()
                del self.routes[rid]
                events.append({"event": "route_stopped", "route_id": rid, "reason": "device_gone"})
        if key != self._last_listing:
            self._last_listing = key
            events.insert(0, ev)
        return events

    # --- commands ---
    def handle(self, msg):
        cmd = msg.get("cmd")
        if cmd == "list_devices":
            self._last_listing = None
            return [self.scan()]
        if cmd == "start_route":
            return self._start(msg)
        if cmd == "stop_route":
            r = self.routes.pop(msg.get("route_id"), None)
            if r:
                r.stop()
            return [{"event": "route_stopped", "route_id": msg.get("route_id"), "reason": "requested"}]
        if cmd == "set_gain":
            r = self.routes.get(msg.get("route_id"))
            if r:
                r.gain = float(msg.get("gain", 1.0))
            return []
        return [{"event": "error", "message": f"unknown command: {cmd}"}]

    def _start(self, msg):
        rid = msg.get("route_id")
        src = next((p for p in self.sources if p["id"] == msg.get("source")), None)
        dst = next((p for p in self.destinations if p["id"] == msg.get("destination")), None)
        if src is None or dst is None:
            return [{"event": "route_error", "route_id": rid, "message": "device not present"}]
        old = self.routes.pop(rid, None)
        if old:
            old.stop()
        try:
            self.routes[rid] = Route(self.backend, src, dst, float(msg.get("gain", 1.0)))
        except Exception as e:
            return [{"event": "route_error", "route_id": rid, "message": str(e)}]
        return [{"event": "route_started", "route_id": rid}]

    def meters(self):
        return {"event": "meters", "levels": {rid: round(r.take_peak_db(), 1) for rid, r in self.routes.items()}}

    def stats(self):
        return {rid: {"underruns": r.dbuf.underruns, "overruns": r.dbuf.overruns} for rid, r in self.routes.items()}

    def shutdown(self):
        for r in self.routes.values():
            r.stop()
        self.routes.clear()
