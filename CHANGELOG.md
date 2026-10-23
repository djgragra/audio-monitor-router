# Changelog

## 0.1.1 (beta, Windows)

- Fixed: the sound stopped after about a second. The engine looked at the devices again every 2 seconds, and with PortAudio that closes every open stream. It now never does this while something is playing; a device that disappears is noticed because its stream stops, and the other routes are started again.
- Headers stay in place when the matrix scrolls: output names on top, cards and ports on the left, volume and level at the bottom.
- Ports are in numeric order (1-2, 3-4 … 13-14), and Settings → Devices lets you move cards and ports up or down and show or hide each one, or a whole card.
- Network transmit outputs (the "Transmit" pairs of Dante Virtual Soundcard) are hidden by default: they only send audio to the network. A setting shows them.
- The system default output is marked with a dot.
- The engine writes to the log when the buffer between two devices runs dry or overflows, to help find glitches.

Thanks to Graziano for testing the first beta.

## 0.1.0 (beta, Windows)

- New structure: Electron interface plus a separate audio engine (`engine/`), talking through a documented protocol (`docs/PROTOCOL.md`).
- The engine lists the audio endpoints the system reports, splits them in stereo pairs (or mono ports), and notices when a device is plugged or unplugged. Nothing is hard-coded: no device name, brand or filter comes with the app.
- Mono sources are heard on both sides; a mono destination receives the sum of left and right.
- First interface: matrix with one source per output, volume and level meter per output, custom names (double click), hide, English / Italiano / Español, dark / light / system theme, Help & About with support info, logs and the tip card.
- Drift buffer between the two clocks kept from the prototype, now with underrun and overrun counters and tests in both directions (+300 and -300 ppm, simulated).
