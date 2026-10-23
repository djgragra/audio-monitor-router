# Audio Monitor Router

A routing matrix for the audio devices of your computer: choose which input you hear and on which output (headphones, monitors, HDMI, another sound card). One source per output, several outputs at the same time, a volume and a level meter for each. It works with any audio device the system exposes, including network audio cards such as Dante Virtual Soundcard receive pairs.

**Status: private beta in progress (0.1.0, Windows first). Not released.** The interface is not written yet; the engine and the matrix logic are.

## What it does

- Reads the sound devices of the machine it runs on, at start and while it runs. A device you unplug disappears from the matrix; when it comes back, its routes and labels come back.
- Rows are sources (inputs), columns are destinations (outputs), grouped by sound card. Stereo pairs by default; a mono endpoint is heard on both sides.
- Your own names (labels) and a "hide" list are optional and stay on your computer. Nothing is pre-filled.
- It only reads and plays audio: it never changes network subscriptions or the settings of your sound cards.

## Assumptions and limits

- Routing between two different devices goes through a small buffer that follows the difference between their clocks, so it adds a delay (target 60 ms, **not measured on real hardware yet**). It is for monitoring, not for recording or live playout.
- On Windows only shared-mode (WASAPI) endpoints are used, so the app never takes a card away from other programs. Endpoints that Windows lists as separate pairs appear as separate rows; overlapping endpoints of the same card (for example "IN 1-2" and "IN 1-4") are all listed, and you can hide the ones you do not need.
- Two sound cards with exactly the same system name can swap their ids if the system reorders them (not checked on real hardware).

## Validation and references

| Reference | What it validates | Result | How to re-run |
|---|---|---|---|
| `engine/tests/test_engine.py` | port splitting, stable ids, channel selection, mono handling, device unplugged and back, drift buffer at ±300 ppm for 60 simulated seconds | passes (made-up devices, no sound card) | `npm test` |
| `dev/matrix.test.js` | matrix, labels, hidden ports, dormant routes, settings clean-up | passes | `npm test` |

### Not validated

- Real audio on any system: the engine tests use a fake backend. The earlier prototype was reported working on the author's Windows PC only.
- Latency, long unattended runs, other drivers and other computers.
- macOS and Linux (Linux is not planned: the system already has routing tools).

## Run locally

```
npm test
python -m amr_engine      # from the engine/ folder; needs Python 3, numpy and sounddevice
```

## Structure

`engine/` the audio engine (Python, talks JSON lines) · `src/` interface-side logic (settings, matrix) · `dev/` tests · `docs/PROTOCOL.md` the protocol.

## Credits

NumPy (BSD-3-Clause), python-sounddevice (MIT) with PortAudio (MIT-style). Electron and the build tools will be listed here when added.

## In breve (italiano)

Una matrice di ascolto per le schede audio del computer: scegli quale ingresso ascoltare e su quale uscita. L'app legge le schede che trova sulla macchina; una scheda tolta sparisce. Nomi personalizzati e nascondi sono scelte tue. Versione beta, prima Windows; non ancora pubblicata.

MIT License · Graziano Melzi · OnAir Garage · hello@onairgarage.com
