# Engine protocol (version 1)

The interface (Electron) starts the engine as a child process and talks to it with **one JSON object per line**:
commands on its stdin, events on its stdout. Nothing else is written to stdout. The engine can be replaced by
another program that speaks this protocol without touching the interface.

Start: `python -m amr_engine` from the `engine/` folder (a frozen binary in releases).

## Ports

Every endpoint the system reports is split into **ports**: a stereo pair, or one channel of a mono endpoint;
an endpoint with more than two channels gives one port per pair. A port is one row (source) or column
(destination) of the matrix.

```
{ "id": "<api>|<input|output>|<system name>[#n]/<1-2|mono|…>", "device_id": "…", "group": "Card name",
  "name": "OUT 1-2", "kind": "input|output", "channels": [0, 1], "device_channels": 4, "rate": 48000 }
```

`id` is stable between runs and never changes when a device is plugged in again; two devices with exactly the same
system name get `#2`, `#3`… in the order the system lists them. `group` is the text in brackets of the system
name (the card), or the whole name.

## Commands (interface → engine)

| cmd | fields | effect |
|---|---|---|
| `list_devices` | | answers with `devices` |
| `start_route` | `route_id`, `source`, `destination` (port ids), `gain` (0..1) | opens both streams; replaces a route with the same `route_id` |
| `stop_route` | `route_id` | |
| `set_gain` | `route_id`, `gain` | |
| `quit` | | stops every route and exits |

## Events (engine → interface)

| event | fields |
|---|---|
| `ready` | `protocol` |
| `devices` | `sources`, `destinations` (lists of ports). Sent at start and **whenever the list changes** (the engine checks every 2 s): a device that is unplugged simply is not in the list any more |
| `route_started` | `route_id` |
| `route_stopped` | `route_id`, `reason` (`requested`, `device_gone`) |
| `route_error` | `route_id`, `message` |
| `meters` | `levels`: `{route_id: peak dB}`, 20 times a second while a route is running |
| `error` | `message` |

## Not decided yet

Per-channel mute inside a pair, the loop guard (a source routed back into itself through a virtual cable),
and how the engine is bundled per system are open: see the state file in the hub.
