# Audio Monitor Router manual

Audio Monitor Router is a routing matrix for the audio devices of your computer: you choose which **input** you hear and on which **output** (headphones, monitors, HDMI, another sound card). One source per output, several outputs at the same time, a volume and a level for each. It works with any audio device the system exposes, including network audio cards such as the receive pairs of Dante Virtual Soundcard. It is a free desktop app from OnAir Garage, for **Windows** (macOS is planned, Linux is not).

## Install and first launch

Download `Audio-Monitor-Router-Setup-<V>.exe` from the [Releases](https://github.com/djgragra/audio-monitor-router/releases) page and check it against `SHA256SUMS.txt`. Windows 10 or later, 64-bit.

- Run the installer. The app has no Microsoft certificate, so if SmartScreen says "Windows protected your PC", click *More info* → *Run anyway*.
- The app always opens in English; choose Italiano or Español in *Settings → General* and the choice is remembered. The theme is dark by default, with light and "follow the system" available.
- Python is **not** needed: the audio engine is inside the installer.

The app only reads and plays the audio of this computer. It never changes network subscriptions (those stay in Dante Controller) or the settings of your sound cards, and it contacts no address by itself.

## The matrix

Rows are **sources** (the inputs of the computer), columns are **outputs**, grouped by sound card, as the system reports them. Press **LISTEN** where a source meets an output to hear it there; press it again to stop.

- **One source per output**: pressing LISTEN on another row of the same column replaces the source. Several outputs can play at the same time, each with its own source.
- **Stereo pairs**: a stereo endpoint is one row or column. A mono endpoint is heard on both sides. A device with more than two channels is split in pairs (1-2, 3-4…).
- **System default**: the input and the output Windows uses unless a program chooses another one carry a **DEFAULT** badge.
- **Names**: double click a name to give it your own name; the original name is shown under it or in the tooltip. Names are your choice, kept on this computer.

### Volume, channels and level

Under each output: a **volume** slider, the buttons **L**, **R** and **MONO**, and a **level** meter.

- **L** and **R** are lit while that channel is heard (both lit = stereo). Press one to leave that channel out.
- **MONO** sums left and right and plays the result on both sides.
- The **level** shows the peak of what the app plays on that output, only while a source is listening.

### Signal speakers

A small **speaker** next to a source lights up when that input carries a signal (above −60 dBFS, held for about a second), like in Dante Controller. A speaker next to an **output** lights up when *any program* plays on it (a browser, a player…): it reads the level Windows itself measures for that device.

The speakers on sources open one extra input for each visible source. If that causes trouble, switch it off in *Settings → General*.

### Loop warning

If a route could send the audio back into the card it comes from (an interface that monitors its own inputs), the app asks for a **second click**. It compares cards, not the real signal path, so it can warn when there is no loop: confirm if you know it is fine.

## Devices and names

*Settings → Devices* lists every card, source and output.

- **Show or hide** a single port or a whole card with the check boxes. Hidden devices stay out of the matrix.
- **Order**: cards follow the system order and ports follow numeric order until you move them with the arrows.
- **Network transmit outputs** (for example the "Transmit" pairs of Dante Virtual Soundcard) only send audio to the network: they are hidden by default, and *Show network transmit outputs* brings them back.
- **Custom names** are listed here; *Remove all custom names* clears them.

When a device is unplugged, it disappears from the matrix and a route that used it stops. When it comes back, its names and its route come back too. A device plugged in while something is playing appears when you press **Refresh devices** (it restarts the running routes for a moment), or by itself as soon as nothing is playing.

## Settings

- **Language** and **Theme**.
- **Latency**: *Minimum* (30 ms buffer), *Normal* (60 ms, the default) or *Safe* (120 ms). Two sound cards never run at exactly the same speed, so a small buffer absorbs the difference. Smaller means less delay but more risk of clicks; Windows adds its own delay on top. If you hear clicks, choose a larger one. This is for monitoring, not for recording or live playout.
- **Show which sources have signal**: the speakers described above.
- **Start when I sign in to the computer**: off by default; the app then starts hidden, in the notification area.
- **Closing the window keeps the app running** in the notification area (on by default; a notice appears the first time). The icon's menu has *Open* and *Quit*.

## Troubleshooting

- **No sound on an output**: check that the output is the one you mean, that the volume is not at zero and that L and R are lit. Windows may be using the device exclusively in another program.
- **Clicks**: choose a larger latency.
- **"The audio engine could not be started"**: the message says why. Antivirus programs sometimes block a new program: allow it and start again.
- **Something is missing**: press **Refresh devices**, or check *Settings → Devices* for hidden ones.
- **Reporting a problem**: in *Settings → Help & About*, *Copy support info* copies the version and system (never your settings), and *Open logs folder* opens the log.

## Limits

- The delay is not zero (60 ms by default, not measured on real hardware) and Windows adds its own.
- Only shared-mode (WASAPI) endpoints are used, so the app never takes a card away from other programs. Overlapping endpoints of one card (for example "IN 1-2" and "IN 1-4") are all listed: hide the ones you do not need.
- Windows does not tell whether an endpoint is speakers, headphones or HDMI, so the app cannot show it.
- Two cards with exactly the same name can swap places if the system reorders them.
- It has been tried on **one** Windows 11 computer only. Not tried: other sound cards and drivers, long unattended runs, a device unplugged during playback with a real device, many network pairs at once.

## Credits and license

Audio Monitor Router is free software under the MIT License, © 2026 Graziano Melzi, part of OnAir Garage (onairgarage.com). It uses Electron (MIT), NumPy (BSD-3-Clause), python-sounddevice (MIT) with PortAudio, pycaw and comtypes (MIT).
