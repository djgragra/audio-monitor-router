"""Peak level of what is playing on each Windows sound endpoint: the same meter Windows shows in its sound settings.

It reads what ANY program plays on an output (a browser on the audio interface, for example), without opening a
stream. Windows only, through the `pycaw` package; anywhere else, or if anything fails, `peaks` returns nothing and the
interface simply shows no speaker on the outputs. The first problem is written once on stderr, so it ends up in the log.
"""
import sys

EDATAFLOW_ALL = 2          # render and capture endpoints
DEVICE_STATE_ACTIVE = 1


def port_peak(peaks, channels):
    """Peak of a port from the per-channel peaks of its device. One value only (no per-channel data): that one."""
    if not peaks:
        return 0.0
    if len(peaks) == 1:
        return float(peaks[0])
    return max(float(peaks[c]) for c in channels if c < len(peaks)) if any(c < len(peaks) for c in channels) else 0.0


def _key(name):
    return " ".join(str(name).split()).casefold()


class EndpointMeters:
    def __init__(self):
        self._meters = None      # name key -> COM meter; None = not loaded yet
        self._disabled = False

    def reset(self):
        """The list of devices changed: load the meters again at the next read."""
        self._meters = None

    def _fail(self, what, exc):
        if not self._disabled:
            print(f"endpoint meters off: {what}: {exc}", file=sys.stderr, flush=True)
        self._disabled = True
        self._meters = {}

    def _load(self):
        # COM objects belong to the thread that creates them: this runs in the engine's ticker thread, and so do the reads
        try:
            from ctypes import POINTER, cast
            from comtypes import CLSCTX_ALL, CoInitialize
            from pycaw.pycaw import AudioUtilities, IAudioMeterInformation
            CoInitialize()
            enumerator = AudioUtilities.GetDeviceEnumerator()
            collection = enumerator.EnumAudioEndpoints(EDATAFLOW_ALL, DEVICE_STATE_ACTIVE)
            meters = {}
            for i in range(collection.GetCount()):
                dev = collection.Item(i)
                try:
                    name = AudioUtilities.CreateDevice(dev).FriendlyName
                    iface = dev.Activate(IAudioMeterInformation._iid_, CLSCTX_ALL, None)
                    meters[_key(name)] = cast(iface, POINTER(IAudioMeterInformation))
                except Exception:
                    continue                  # one endpoint without a meter does not matter
            self._meters = meters
        except Exception as e:
            self._fail("load", e)

    @staticmethod
    def _read(meter):
        from ctypes import c_float
        try:
            n = int(meter.GetMeteringChannelCount())
            values = (c_float * n)()
            meter.GetChannelsPeakValues(n, values)
            return [float(v) for v in values]
        except Exception:
            return [float(meter.GetPeakValue())]

    def peaks(self, names):
        """{device name: [peak per channel, 0..1]} for the names Windows knows; others are left out."""
        if self._disabled or sys.platform != "win32":
            return {}
        if self._meters is None:
            self._load()
        out = {}
        for name in names:
            meter = (self._meters or {}).get(_key(name))
            if meter is None:
                continue
            try:
                out[name] = self._read(meter)
            except Exception as e:
                self._fail("read", e)
                return {}
        return out
