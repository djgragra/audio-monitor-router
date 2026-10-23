"""Routes: one source port to one destination port, with gain and a peak meter."""
import math
import threading

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

    @property
    def alive(self):
        """False when the system closed a stream under us (device unplugged, driver reset)."""
        return all(getattr(s, "active", True) for s in (self._in, self._out) if s is not None)

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
    """State of the engine. `handle` takes one command (a dict) and returns the events to send back.

    PortAudio can only look at the devices again by closing every stream (see SoundDeviceBackend.refresh),
    so that is done only when no route is running, or when the user asks for it (`list_devices`), in which
    case the routes that can still be opened are started again.
    """

    def __init__(self, backend):
        self.backend = backend
        self.sources, self.destinations = [], []
        self.routes = {}          # route_id -> Route
        self.specs = {}           # route_id -> (source id, destination id, gain): what to restart after a reload
        self._last_listing = None
        self._warned = {}         # route_id -> (underruns, overruns) already reported
        self.lock = threading.RLock()

    # --- devices ---
    def scan(self):
        self.sources, self.destinations = dev.build_ports(self.backend.query())
        return {"event": "devices",
                "sources": [dev.public(p) for p in self.sources],
                "destinations": [dev.public(p) for p in self.destinations]}

    def _listing_key(self, ev):
        return ([p["id"] for p in ev["sources"]], [p["id"] for p in ev["destinations"]])

    def _stop_all(self):
        for r in self.routes.values():
            r.stop()
        self.routes.clear()

    def reload(self):
        """Look at the devices again and start again the routes that still make sense."""
        events = []
        with self.lock:
            wanted = dict(self.specs)
            self._stop_all()
            self.backend.refresh()
            ev = self.scan()
            self._last_listing = self._listing_key(ev)
            events.append(ev)
            for rid, (src_id, dst_id, gain) in wanted.items():
                src = next((p for p in self.sources if p["id"] == src_id), None)
                dst = next((p for p in self.destinations if p["id"] == dst_id), None)
                if src is None or dst is None:
                    self.specs.pop(rid, None)
                    events.append({"event": "route_stopped", "route_id": rid, "reason": "device_gone"})
                    continue
                try:
                    self.routes[rid] = Route(self.backend, src, dst, gain)
                except Exception as e:
                    self.specs.pop(rid, None)
                    events.append({"event": "route_error", "route_id": rid, "message": str(e)})
        return events

    def poll(self):
        """Called every second or two. Nothing here may close a stream that is playing."""
        with self.lock:
            events = []
            dead = [rid for rid, r in self.routes.items() if not r.alive]
            if dead:
                for rid in dead:
                    self.routes.pop(rid).stop()
                    self.specs.pop(rid, None)
                    events.append({"event": "route_stopped", "route_id": rid, "reason": "device_gone"})
                # a stream that died usually means a device went away: look again, and keep the other routes going
                return events + self.reload()
            if not self.routes:
                self.backend.refresh()          # safe: nothing is playing
                ev = self.scan()
                key = self._listing_key(ev)
                if key != self._last_listing:
                    self._last_listing = key
                    events.append(ev)
            for rid, r in self.routes.items():
                seen = self._warned.get(rid, (0, 0))
                now = (r.dbuf.underruns, r.dbuf.overruns)
                if now != seen:
                    self._warned[rid] = now
                    events.append({"event": "route_warning", "route_id": rid, "underruns": now[0], "overruns": now[1]})
            return events

    # --- commands ---
    def handle(self, msg):
        cmd = msg.get("cmd")
        with self.lock:
            if cmd == "list_devices":
                return self.reload()
            if cmd == "start_route":
                return self._start(msg)
            if cmd == "stop_route":
                rid = msg.get("route_id")
                r = self.routes.pop(rid, None)
                self.specs.pop(rid, None)
                if r:
                    r.stop()
                return [{"event": "route_stopped", "route_id": rid, "reason": "requested"}]
            if cmd == "set_gain":
                rid = msg.get("route_id")
                gain = float(msg.get("gain", 1.0))
                if rid in self.specs:
                    self.specs[rid] = (*self.specs[rid][:2], gain)
                r = self.routes.get(rid)
                if r:
                    r.gain = gain
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
        gain = float(msg.get("gain", 1.0))
        try:
            self.routes[rid] = Route(self.backend, src, dst, gain)
        except Exception as e:
            self.specs.pop(rid, None)
            return [{"event": "route_error", "route_id": rid, "message": str(e)}]
        self.specs[rid] = (src["id"], dst["id"], gain)
        self._warned.pop(rid, None)
        return [{"event": "route_started", "route_id": rid}]

    def meters(self):
        with self.lock:
            return {"event": "meters", "levels": {rid: round(r.take_peak_db(), 1) for rid, r in self.routes.items()}}

    def shutdown(self):
        with self.lock:
            self._stop_all()
            self.specs.clear()
