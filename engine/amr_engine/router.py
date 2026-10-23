"""Routes: one source port to one destination port, with gain and a peak meter."""
import math
import threading

import numpy as np

from .buffer import DriftBuffer, TARGET_LATENCY_S
from .endpoint_meter import port_peak
from .monitor import SignalMonitor, peak_db
from . import devices as dev


class Route:
    """One source port heard on one destination port. `opts`: gain, mute_left, mute_right, mono."""

    def __init__(self, backend, src, dst, opts=None, target_s=TARGET_LATENCY_S):
        self.src, self.dst = src, dst
        self.opts = {"gain": 1.0, "mute_left": False, "mute_right": False, "mono": False, **(opts or {})}
        self.peak = 0.0
        self.dbuf = DriftBuffer(target_s=target_s)
        self._in = self._out = None
        try:
            self._in = backend.open_input(src["device_index"], src["device_channels"], self._cb_in)
            self._out = backend.open_output(dst["device_index"], dst["device_channels"], self._cb_out)
            self._in.start()
            self._out.start()
        except Exception:
            self.stop()
            raise

    @property
    def gain(self):
        return self.opts["gain"]

    def _cb_in(self, indata):
        cols = self.src["channels"]
        pair = indata[:, cols]
        if pair.shape[1] == 1:                       # mono source: same signal left and right
            pair = np.repeat(pair, 2, axis=1)
        self.dbuf.write(pair)

    def _cb_out(self, outdata):
        o = self.opts
        d = self.dbuf.read(len(outdata)) * o["gain"]
        if o["mono"]:                                # left and right summed, heard on both sides
            d[:] = d.mean(axis=1, keepdims=True)
        if o["mute_left"]:
            d[:, 0] = 0.0
        if o["mute_right"]:
            d[:, 1] = 0.0
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


LATENCY_MS = {"low": 30, "normal": 60, "safe": 120}
OPT_KEYS = ("gain", "mute_left", "mute_right", "mono")


def _opts(msg):
    out = {}
    if "gain" in msg:
        out["gain"] = float(msg["gain"])
    for k in ("mute_left", "mute_right", "mono"):
        if k in msg:
            out[k] = bool(msg[k])
    return out


class Engine:
    """State of the engine. `handle` takes one command (a dict) and returns the events to send back.

    PortAudio can only look at the devices again by closing every stream (see SoundDeviceBackend.refresh),
    so that is done only when no route is running (every 2 s, every 6 s while the signal monitor is on, which is
    stopped and started again around it), or when the user asks for it (`list_devices`), in which case the routes
    that can still be opened are started again.
    """

    def __init__(self, backend):
        self.backend = backend
        self.sources, self.destinations = [], []
        self.routes = {}          # route_id -> Route
        self.specs = {}           # route_id -> {"src", "dst", gain, mute_left, mute_right, mono}: what to restart after a reload
        self.latency_ms = LATENCY_MS["normal"]
        self.monitor = SignalMonitor(backend)
        self.watch_ids = []       # ports the interface wants a signal for: sources (own streams) and outputs (system meter)
        self._idle_polls = 0
        self._last_listing = None
        self._warned = {}         # route_id -> (underruns, overruns) already reported
        self.lock = threading.RLock()

    # --- devices ---
    def scan(self):
        self.sources, self.destinations = dev.build_ports(self.backend.query())
        self._apply_monitor()
        return {"event": "devices",
                "sources": [dev.public(p) for p in self.sources],
                "destinations": [dev.public(p) for p in self.destinations]}

    def _apply_monitor(self):
        wanted = set(self.watch_ids)
        self.monitor.set_ports([p for p in self.sources if p["id"] in wanted])

    def _listing_key(self, ev):
        return ([p["id"] for p in ev["sources"]], [p["id"] for p in ev["destinations"]])

    def _stop_all(self):
        for r in self.routes.values():
            r.stop()
        self.routes.clear()

    def _open(self, rid, spec):
        src = next((p for p in self.sources if p["id"] == spec["src"]), None)
        dst = next((p for p in self.destinations if p["id"] == spec["dst"]), None)
        if src is None or dst is None:
            return "device not present"
        try:
            self.routes[rid] = Route(self.backend, src, dst, {k: spec[k] for k in OPT_KEYS}, self.latency_ms / 1000.0)
        except Exception as e:
            return str(e)
        return None

    def _restart_routes(self):
        """Start again every route in `specs`; returns the events for the ones that cannot be."""
        events = []
        for rid, spec in list(self.specs.items()):
            err = self._open(rid, spec)
            if err == "device not present":
                self.specs.pop(rid)
                events.append({"event": "route_stopped", "route_id": rid, "reason": "device_gone"})
            elif err:
                self.specs.pop(rid)
                events.append({"event": "route_error", "route_id": rid, "message": err})
        return events

    def _look_again(self):
        """Close everything, ask PortAudio for the devices again, open again what still exists."""
        self._stop_all()
        self.monitor.stop()
        self.backend.refresh()
        ev = self.scan()
        self._last_listing = self._listing_key(ev)
        return [ev] + self._restart_routes()

    def reload(self):
        with self.lock:
            return self._look_again()

    def poll(self):
        """Called every second or two. Nothing here may close a stream that is playing."""
        with self.lock:
            events = []
            dead = [rid for rid, r in self.routes.items() if not r.alive]
            for rid in dead:
                self.routes.pop(rid).stop()
                self.specs.pop(rid, None)
                events.append({"event": "route_stopped", "route_id": rid, "reason": "device_gone"})
            if dead or not self.monitor.alive:
                # a stream that died usually means a device went away: look again, and keep the other routes going
                return events + self._look_again()
            if not self.routes:
                self._idle_polls += 1
                if self._idle_polls >= (3 if self.monitor.streams else 1):
                    self._idle_polls = 0
                    self.monitor.stop()          # the refresh would close its streams anyway
                    self.backend.refresh()       # safe: no route is playing
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
            if cmd in ("set_gain", "set_channels"):
                rid = msg.get("route_id")
                if rid in self.specs:
                    self.specs[rid].update(_opts(msg))
                if rid in self.routes:
                    self.routes[rid].opts.update(_opts(msg))
                return []
            if cmd == "set_latency":
                return self._set_latency(msg.get("latency"))
            if cmd == "monitor_ports":
                self.watch_ids = [x for x in msg.get("ports", []) if isinstance(x, str)]
                self._apply_monitor()
                return []
        return [{"event": "error", "message": f"unknown command: {cmd}"}]

    def _set_latency(self, name):
        ms = LATENCY_MS.get(name)
        if ms is None or ms == self.latency_ms:
            return []
        self.latency_ms = ms
        self._stop_all()                                   # the buffer size is fixed when a route opens: open them again
        return self._restart_routes()

    def _start(self, msg):
        rid = msg.get("route_id")
        spec = {"src": msg.get("source"), "dst": msg.get("destination"), "gain": 1.0, "mute_left": False, "mute_right": False, "mono": False}
        spec.update(_opts(msg))
        old = self.routes.pop(rid, None)
        if old:
            old.stop()
        err = self._open(rid, spec)
        if err:
            self.specs.pop(rid, None)
            return [{"event": "route_error", "route_id": rid, "message": err}]
        self.specs[rid] = spec
        self._warned.pop(rid, None)
        return [{"event": "route_started", "route_id": rid}]

    def meters(self):
        with self.lock:
            return {"event": "meters", "levels": {rid: round(r.take_peak_db(), 1) for rid, r in self.routes.items()}}

    def signal(self):
        """Levels (dB) of the watched ports, or None when there is nothing to report. Sources come from their own
        streams; outputs from the system meter of the device, which also shows what other programs play on it."""
        with self.lock:
            levels = self.monitor.take_levels() if self.monitor.streams else {}
            wanted = set(self.watch_ids)
            outs = [p for p in self.destinations if p["id"] in wanted]
            if outs:
                peaks = self.backend.endpoint_peaks(sorted({p["device_name"] for p in outs})) or {}
                for p in outs:
                    if p["device_name"] in peaks:
                        levels[p["id"]] = peak_db(port_peak(peaks[p["device_name"]], p["channels"]))
            return {"event": "signal", "levels": levels} if levels else None

    def shutdown(self):
        with self.lock:
            self._stop_all()
            self.monitor.stop()
            self.specs.clear()
