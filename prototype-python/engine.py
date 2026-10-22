"""Motore audio: inoltro stereo sorgente -> destinazione con compensazione della deriva dei clock."""
import threading

import numpy as np

SAMPLE_RATE = 48000
TARGET_LATENCY_S = 0.060   # buffer di sicurezza tra i due clock


class DriftBuffer:
    """Buffer circolare stereo con lettura a rapporto variabile (interpolazione lineare).

    Il rapporto di lettura si adatta al riempimento del buffer, cosi' la differenza
    di clock tra sorgente e destinazione (Dante / USB / HDMI) non produce click.
    """

    def __init__(self, channels=2, rate=SAMPLE_RATE, target_s=TARGET_LATENCY_S):
        self.ch = channels
        self.cap = int(rate * 2)
        self.target = int(rate * target_s)
        self.buf = np.zeros((self.cap, channels), np.float32)
        self.w = 0          # frame scritti (totale)
        self.r = 0.0        # posizione di lettura (frame, frazionaria)
        self.primed = False
        self.lock = threading.Lock()

    def write(self, data):
        n = len(data)
        if n == 0:
            return
        with self.lock:
            idx = self.w % self.cap
            first = min(n, self.cap - idx)
            self.buf[idx:idx + first] = data[:first]
            if n > first:
                self.buf[:n - first] = data[first:]
            self.w += n
            if self.w - self.r > self.cap - 8:      # overflow: riallinea
                self.r = float(self.w - self.target)

    def read(self, n):
        out = np.zeros((n, self.ch), np.float32)
        with self.lock:
            fill = self.w - self.r
            if not self.primed:
                if fill < self.target:
                    return out
                self.primed = True
            if fill > 3 * self.target:               # troppo pieno: riallinea
                self.r = float(self.w - self.target)
                fill = self.target
            err = (fill - self.target) / self.target
            ratio = 1.0 + max(-0.02, min(0.02, err * 0.02))
            need = n * ratio
            if fill < need + 2:                       # underrun: ricarica il buffer
                self.primed = False
                return out
            pos = self.r + np.arange(n) * ratio
            i0 = np.floor(pos).astype(np.int64)
            frac = (pos - i0).astype(np.float32)[:, None]
            a = self.buf[i0 % self.cap]
            b = self.buf[(i0 + 1) % self.cap]
            out[:] = a + (b - a) * frac
            self.r += need
        return out


def list_devices(exclude_src=(), exclude_dst=()):
    """Ritorna (sorgenti, destinazioni): liste di dict {index, name} stereo, su host API WASAPI."""
    import sounddevice as sd
    apis = sd.query_hostapis()
    wasapi = [i for i, a in enumerate(apis) if "WASAPI" in a["name"]]
    api = wasapi[0] if wasapi else None
    srcs, dsts = [], []
    for i, d in enumerate(sd.query_devices()):
        if api is not None and d["hostapi"] != api:
            continue
        name = d["name"]
        if d["max_input_channels"] >= 2 and not _match(name, exclude_src):
            srcs.append({"index": i, "name": name})
        if d["max_output_channels"] >= 2 and not _match(name, exclude_dst):
            dsts.append({"index": i, "name": name})
    return srcs, dsts


def _match(name, patterns):
    low = name.lower()
    return any(p.lower() in low for p in patterns)


class Route:
    """Un inoltro attivo: apre uno stream di ingresso e uno di uscita collegati da DriftBuffer."""

    def __init__(self, src_index, dst_index, gain=1.0):
        import sounddevice as sd
        self.gain = gain
        self.peak = 0.0
        self.dbuf = DriftBuffer()
        try:
            extra = sd.WasapiSettings(auto_convert=True)
        except Exception:
            extra = None
        kw = dict(samplerate=SAMPLE_RATE, channels=2, dtype="float32", latency="low")
        self._in = sd.InputStream(device=src_index, callback=self._cb_in,
                                  extra_settings=extra, **kw)
        self._out = sd.OutputStream(device=dst_index, callback=self._cb_out,
                                    extra_settings=extra, **kw)
        try:
            self._in.start()
            self._out.start()
        except Exception:
            self.stop()
            raise

    def _cb_in(self, indata, frames, time_info, status):
        self.dbuf.write(indata)

    def _cb_out(self, outdata, frames, time_info, status):
        d = self.dbuf.read(frames) * self.gain
        outdata[:] = d
        if frames:
            self.peak = max(self.peak, float(np.abs(d).max()))

    def stop(self):
        for s in (getattr(self, "_in", None), getattr(self, "_out", None)):
            if s is not None:
                try:
                    s.abort()
                    s.close()
                except Exception:
                    pass
