# Changelog

## Unreleased (beta 0.1.0, Windows)

- New structure: Electron interface plus a separate audio engine (`engine/`), talking through a documented protocol (`docs/PROTOCOL.md`).
- The engine lists the audio endpoints the system reports, splits them in stereo pairs (or mono ports), and notices when a device is plugged or unplugged. Nothing is hard-coded: no device name, brand or filter comes with the app.
- Mono sources are heard on both sides; a mono destination receives the sum of left and right.
- Drift buffer between the two clocks kept from the prototype, now with underrun and overrun counters and tests in both directions (+300 and -300 ppm, simulated).
