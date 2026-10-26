# Audio Monitor Router

A routing matrix for the audio devices of your computer: choose which input you hear and on which output (headphones, monitors, HDMI, another sound card). One source per output, several outputs at the same time, a volume and a level meter for each. It works with any audio device the system exposes, including network audio cards such as Dante Virtual Soundcard receive pairs.

**Status: first public version (26.10.1), Windows only.** Tried by the author on one Windows 11 PC with a USB audio interface, onboard audio, HDMI and Dante Virtual Soundcard; see *Not validated* below for what has not been tried. macOS is planned for a later version; Linux is not planned (the system already has routing tools). Not included: guided update and backup of settings.

## What it does

- Reads the sound devices of the machine it runs on, at start and while it runs. A device you unplug disappears from the matrix; when it comes back, its routes and labels come back.
- Rows are sources (inputs), columns are destinations (outputs), grouped by sound card. Stereo pairs by default; a mono endpoint is heard on both sides.
- Your own names (labels) and a "hide" list are optional and stay on your computer. Nothing is pre-filled.
- It only reads and plays audio: it never changes network subscriptions or the settings of your sound cards.

## Assumptions and limits

- Routing between two different devices goes through a small buffer that follows the difference between their clocks, so it adds a delay (60 ms by default; three settings, 30, 60 and 120 ms; **not measured on real hardware**). It is for monitoring, not for recording or live playout.
- On Windows only shared-mode (WASAPI) endpoints are used, so the app never takes a card away from other programs. Endpoints that Windows lists as separate pairs appear as separate rows; overlapping endpoints of the same card (for example "IN 1-2" and "IN 1-4") are all listed, and you can hide the ones you do not need.
- A device plugged in while something is playing appears when you press *Refresh devices* (it restarts the running routes for a moment) or as soon as nothing is playing: PortAudio can only look at the devices again by closing every stream. A device that is unplugged is noticed at once, because its stream stops.
- The speaker next to an output shows what ANY program plays on it, read from Windows' own level meter of the endpoint (through `pycaw`); it opens no stream, and it is read by a separate child process (`amr-engine --meters`) so that a COM problem cannot touch the audio. It matches the endpoint by its full name, so two devices with the same name may share a level. On systems other than Windows there is no output speaker.
- The speaker next to a source opens one extra input per visible source (one per device: a card with four channels is opened once). While it is on, the list of devices is looked at again every 6 seconds when nothing is playing, and never while something plays; a signal icon may blink off for a moment when that happens. The level that counts as "signal" is -60 dBFS (peak), held for 0.8 s.
- A possible loop is only a warning: the app compares cards, not the real signal path, so an interface that monitors its own inputs is also flagged and can be confirmed.
- Outputs of Dante Virtual Soundcard are hidden by default (they only transmit); the system default output is marked with a dot. The app does not read what kind of device an endpoint is (speakers, headphones, HDMI): the audio library does not tell.
- Two sound cards with exactly the same system name can swap their ids if the system reorders them (not checked on real hardware).

## Validation and references

| Reference | What it validates | Result | How to re-run |
|---|---|---|---|
| `engine/tests/test_engine.py` | port splitting, stable ids, channel selection, mono handling, device unplugged and back, drift buffer at ±300 ppm for 60 simulated seconds | passes (made-up devices, no sound card) | `npm test` |
| `dev/matrix.test.js` | matrix, labels, hidden ports, dormant routes, settings clean-up | passes | `npm test` |

### Not validated

- Tried on **one** Windows 11 PC only (one USB interface, onboard audio, HDMI, Dante Virtual Soundcard). Other drivers, sound cards and computers: not tried.
- Latency: the lowest setting without clicks has not been measured; long unattended runs have not been timed.
- A device unplugged during playback: covered by a test with a fake device; not tried with a real one.
- The signal speakers with many real inputs at once (for example sixteen network pairs): CPU load not measured.
- The notification area icon, closing to it, and start at sign-in on Windows: tried in Electron on Linux with a virtual display only.
- macOS: not built, not tried. Linux: not planned.

## Run locally

```
npm install
npm test
npm start                 # needs Python 3 with numpy, sounddevice and (Windows) pycaw: pip install -r engine/requirements.txt
```

## Structure

`main.js`, `preload.cjs` Electron main process and bridge · `renderer/` the interface · `src/` settings, engine client, logs, links · `engine/` the audio engine (Python, JSON lines) · `dev/` tests and generators (`make-icon.py`, `make-screenshots.cjs`) · `docs/screenshots/` · `docs/PROTOCOL.md` the protocol.

## Credits

NumPy (BSD-3-Clause), python-sounddevice (MIT) with PortAudio (MIT-style). Electron and the build tools will be listed here when added.

## In breve (italiano)

Una matrice di ascolto per le schede audio del computer: scegli quale ingresso ascoltare e su quale uscita. L'app legge le schede che trova sulla macchina; una scheda tolta sparisce. Nomi personalizzati e nascondi sono scelte tue. Versione beta, prima Windows; non ancora pubblicata.

MIT License · Graziano Melzi · OnAir Garage · hello@onairgarage.com
