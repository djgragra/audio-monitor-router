"""Drift-compensating buffer between two audio clocks."""
import threading

import numpy as np

SAMPLE_RATE = 48000
TARGET_LATENCY_S = 0.060   # safety margin between the two clocks


class DriftBuffer:
    """Stereo ring buffer read at a variable ratio (linear interpolation).

    The read ratio follows the buffer fill level, so the clock difference between source and
    destination (network audio, USB, HDMI) does not produce clicks.
    """

    def __init__(self, channels=2, rate=SAMPLE_RATE, target_s=TARGET_LATENCY_S):
        self.ch = channels
        self.cap = int(rate * 2)
        self.target = int(rate * target_s)
        self.buf = np.zeros((self.cap, channels), np.float32)
        self.w = 0          # frames written (total)
        self.r = 0.0        # read position (frames, fractional)
        self.primed = False
        self.underruns = 0
        self.overruns = 0
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
            if self.w - self.r > self.cap - 8:      # overflow: realign
                self.r = float(self.w - self.target)
                self.overruns += 1

    def read(self, n):
        out = np.zeros((n, self.ch), np.float32)
        with self.lock:
            fill = self.w - self.r
            if not self.primed:
                if fill < self.target:
                    return out
                self.primed = True
            if fill > 3 * self.target:               # too full: realign
                self.r = float(self.w - self.target)
                fill = self.target
                self.overruns += 1
            err = (fill - self.target) / self.target
            ratio = 1.0 + max(-0.02, min(0.02, err * 0.02))
            need = n * ratio
            if fill < need + 2:                       # underrun: refill the buffer
                self.primed = False
                self.underruns += 1
                return out
            pos = self.r + np.arange(n) * ratio
            i0 = np.floor(pos).astype(np.int64)
            frac = (pos - i0).astype(np.float32)[:, None]
            a = self.buf[i0 % self.cap]
            b = self.buf[(i0 + 1) % self.cap]
            out[:] = a + (b - a) * frac
            self.r += need
        return out
