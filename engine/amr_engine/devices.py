"""Turns the raw device list of the system into sources and destinations made of ports.

Nothing here knows any device by name: everything comes from what the system reports.
A *port* is one row (source) or column (destination) of the matrix: a stereo pair, or a single
channel of a mono endpoint. An endpoint with more than two channels is split in pairs.
"""
import re

_GROUP_RE = re.compile(r"^(?P<port>.*?)\s*\((?P<group>[^()]+)\)\s*$")


def split_name(name):
    """'OUT 1-2 (Some Card)' -> ('OUT 1-2', 'Some Card'). Without brackets the group is the name."""
    m = _GROUP_RE.match(name)
    if m and m.group("port"):
        return m.group("port").strip(), m.group("group").strip()
    return name.strip(), name.strip()


def channel_ports(channels):
    """List of (label, [channel indexes]) for an endpoint with this many channels."""
    if channels <= 0:
        return []
    if channels == 1:
        return [("mono", [0])]
    ports = []
    for start in range(0, channels, 2):
        pair = list(range(start, min(start + 2, channels)))
        label = f"{pair[0] + 1}-{pair[-1] + 1}" if len(pair) == 2 else f"{pair[0] + 1}"
        ports.append((label, pair))
    return ports


def build_ports(raw_devices):
    """raw_devices: [{index, name, hostapi, max_in, max_out, rate}] -> (sources, destinations).

    Ids are stable between runs: host API, direction and name (a repeated name gets '#2', '#3'…
    in the order the system lists it; two identical cards can swap places if the system reorders
    them, which is a limit of the audio APIs, not checked on real hardware).
    """
    sources, destinations = [], []
    seen = {}
    for d in raw_devices:
        for kind, nch, bucket in (("input", d["max_in"], sources), ("output", d["max_out"], destinations)):
            if nch <= 0:
                continue
            base = f'{d["hostapi"]}|{kind}|{d["name"]}'
            seen[base] = seen.get(base, 0) + 1
            dev_id = base if seen[base] == 1 else f"{base}#{seen[base]}"
            port_name, group = split_name(d["name"])
            single = len(channel_ports(nch)) == 1
            for label, chans in channel_ports(nch):
                bucket.append({
                    "id": f"{dev_id}/{label}",
                    "device_id": dev_id,
                    "device_index": d["index"],
                    "group": group,
                    "name": port_name if single else f"{port_name} {label}",
                    "kind": kind,
                    "channels": chans,
                    "device_channels": nch,
                    "rate": d.get("rate"),
                })
    return sources, destinations


def public(port):
    """What is sent to the interface: no internal indexes."""
    return {k: v for k, v in port.items() if k != "device_index"}
