"""Audio backends: the real one (PortAudio through sounddevice) and a fake one for tests."""
import sys

SAMPLE_RATE = 48000


class SoundDeviceBackend:
    """PortAudio. On Windows only WASAPI devices are listed (shared mode, never exclusive)."""

    def __init__(self):
        import sounddevice as sd
        from .meter_client import MeterClient, NamesWatcher
        self.sd = sd
        self.meters = MeterClient()
        self._names = NamesWatcher()

    def endpoint_peaks(self, names):
        """What is playing on each output right now (Windows only; empty elsewhere). Read by a child process."""
        return self.meters.peaks(names)

    def close(self):
        self.meters.stop()

    def query(self):
        sd = self.sd
        apis = sd.query_hostapis()
        wanted = None
        if sys.platform == "win32":
            wanted = next((i for i, a in enumerate(apis) if "WASAPI" in a["name"]), None)
        out = []
        for i, d in enumerate(sd.query_devices()):
            if wanted is not None and d["hostapi"] != wanted:
                continue
            api = apis[d["hostapi"]]
            out.append({
                "index": i, "name": d["name"], "hostapi": api["name"],
                "max_in": d["max_input_channels"], "max_out": d["max_output_channels"],
                "rate": d["default_samplerate"],
                "default_in": api.get("default_input_device") == i,
                "default_out": api.get("default_output_device") == i,
            })
        # the meter process loads its endpoints again only when a device really came or went, not at every look
        if self._names.changed(d["name"] for d in out):
            self.meters.reset()
        return out

    def refresh(self):
        """Ask PortAudio to look at the devices again (it caches the list).

        WARNING: this closes every open stream. The engine calls it only when no route is running."""
        try:
            self.sd._terminate()
            self.sd._initialize()
        except Exception:
            pass

    def _extra(self):
        try:
            return self.sd.WasapiSettings(auto_convert=True) if sys.platform == "win32" else None
        except Exception:
            return None

    def open_input(self, index, channels, callback, latency="low"):
        return self.sd.InputStream(device=index, samplerate=SAMPLE_RATE, channels=channels, dtype="float32",
                                   latency=latency, callback=lambda d, f, t, s: callback(d),
                                   extra_settings=self._extra())

    def open_output(self, index, channels, callback):
        def cb(outdata, frames, t, s):
            callback(outdata)
        return self.sd.OutputStream(device=index, samplerate=SAMPLE_RATE, channels=channels, dtype="float32",
                                    latency="low", callback=cb, extra_settings=self._extra())


class _FakeStream:
    def __init__(self, callback):
        self.callback = callback
        self.active = False

    def start(self):
        self.active = True

    def abort(self):
        self.active = False

    def close(self):
        self.active = False


class FakeBackend:
    """No sound card needed: tests change `devices` and call the stream callbacks by hand."""

    def __init__(self, devices):
        self.devices = list(devices)
        self.inputs = {}
        self.outputs = {}
        self.refreshes = 0
        self.refuse = set()        # device indexes that cannot be opened
        self.peaks = {}            # device name -> [peak per channel]: what the fake system is playing

    def query(self):
        return [dict(d) for d in self.devices]

    def endpoint_peaks(self, names):
        return {n: self.peaks[n] for n in names if n in self.peaks}

    def close(self):
        pass

    def refresh(self):
        self.refreshes += 1

    def open_input(self, index, channels, callback, latency="low"):
        if index in self.refuse:
            raise OSError("device refused")
        s = _FakeStream(callback)
        self.inputs.setdefault(index, []).append(s)
        return s

    def open_output(self, index, channels, callback):
        s = _FakeStream(callback)
        self.outputs[index] = s
        return s
