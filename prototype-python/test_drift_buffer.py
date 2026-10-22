import os
import sys, numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from engine import DriftBuffer
for ppm in (+300, -300):
    b = DriftBuffer(); rate = 48000.0
    f = 440.0; t_in = 0; outs = []; fills = []; underruns = 0
    # sorgente scrive 480 frame a blocchi; destinazione legge 512 con clock diverso
    src_blocks = 0; acc_in = 0.0; acc_out = 0.0
    for step in range(60000):      # ~ 10 min
        # tempo simulato in blocchi da 10 ms di sorgente
        n_in = 480
        ph = (np.arange(t_in, t_in + n_in) / rate * f * 2 * np.pi)
        x = np.sin(ph).astype(np.float32)
        b.write(np.stack([x, x], 1))
        t_in += n_in
        acc_out += n_in * (1 + ppm * 1e-6)   # frame che la destinazione consuma nel tempo di 10 ms
        while acc_out >= 512:
            o = b.read(512); acc_out -= 512
            outs.append(o[:, 0]); fills.append(b.w - b.r)
    o = np.concatenate(outs)
    nz = o[int(48000*0.2):]
    d = np.abs(np.diff(nz))
    print(f"ppm={ppm:+d} fill min/max={min(fills[10:]):.0f}/{max(fills[10:]):.0f} target={b.target} maxstep={d.max():.3f} zeros={(nz==0).sum()}")
