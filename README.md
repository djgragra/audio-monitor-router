# dante-monitor-router

Monitor routing matrix for Dante Virtual Soundcard on Windows: pick which receive pair you hear and on which output (headphones, monitors, HDMI), Dante Controller-style.

**Status: private working prototype (Python), not yet rebuilt under the OnAir Garage standard.**

## Prototype (`prototype-python/`)

- Rows: stereo inputs found by Windows (DVS Receive pairs, audio-interface inputs). Columns: stereo outputs (interface outputs, HDMI, speakers). DVS Transmit and MOTIV outputs are excluded.
- One source per output; several outputs can be active at once. Per-output volume and level meter. Last setup is restored at start.
- Routing is done with WASAPI shared streams and a drift-compensating buffer between the two clocks. It never changes Dante subscriptions: those stay in Dante Controller.
- Run: `prototype-python\avvia.bat` (needs Python 3). Build an exe: `prototype-python\crea_exe.bat`.
- Tested: the buffer in simulation (`python prototype-python/test_drift_buffer.py`); the app on the author's PC (DVS 16x16, Behringer UMC404HD, HDMI), reported working by the author.
- Not validated: other PCs, other drivers, latency measurements, long unattended runs.
