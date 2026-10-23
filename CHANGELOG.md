# Changelog

## 0.2.3 (beta, Windows)

- Fixed: the process that reads the Windows level meters could not start ("WinError 50: the request is not supported"), so the output speakers stayed off. It now gets its own error channel instead of inheriting the one made by Electron, which Windows could not duplicate.

Thanks to Graziano for sending the log that showed it.

## 0.2.2 (beta, Windows)

- Fixed: the audio engine stopped over and over with "COM method call without VTable". The code that reads Windows' level meters for the output speakers now runs in a **separate small process**: if anything goes wrong there, only the output speakers stop (after three failures it switches them off and says why in the log); the audio engine and the routes are not affected.
- The log now says once how many outputs have a level meter ("endpoint meters: N of M endpoints have a meter") and the first problem, if any. The build prints the same for the build machine.

## 0.2.1 (beta, Windows)

- The speaker also lights on the **outputs** when Windows plays something on them (a browser on the audio interface, for example). It reads the same level meter Windows shows in its sound settings, so it needs no extra stream. If Windows does not give a meter for an output, that output simply shows no speaker.
- **L and R** are lit while that channel is heard (both lit = stereo); press one to leave it out. The third button is now **MONO** (left and right summed), because "M" reads as mute to audio people.
- Every source and output name has room for two lines and the rows have the same height; a longer name is cut and complete in its tooltip. The original name of a source shows under its label only when the label is short.
- Buttons that are off now say LISTEN in a soft blue, so the matrix is not empty; the one that is on is larger.
- The first column is wider.
- The build checks that the packaged engine contains what it needs (`--selftest`).

Thanks to Graziano for the second round of tests.

## 0.2.0 (beta, Windows)

- A speaker next to every source lights up when that source has audio (like the signal column of Dante Controller). It watches every visible source at once with one extra input each; Settings → General can switch it off.
- Mute left, mute right and mono (left and right summed) for every output, under the volume.
- Warning for possible loops: sending an input to an output of the same card, or closing a circle between cards (for example through a virtual cable), needs a second click to confirm.
- Latency setting: Minimum (30 ms buffer), Normal (60 ms), Safe (120 ms). Applies at once, restarting the running routes.
- Notification area icon with Open and Quit. Closing the window keeps the listening running there (with a one-time notice); a setting turns this off. Start when signing in to the computer is available and **off** by default; it starts hidden.
- The window remembers its size and position.

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
