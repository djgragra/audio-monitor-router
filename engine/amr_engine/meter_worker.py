"""Child process that reads the Windows endpoint level meters, so that nothing COM can ever touch the audio engine.

Protocol (JSON lines): on stdin {"names": [...]}, {"reset": true}, {"quit": true}; on stdout {"peaks": {name: [..]}}
about five times a second. All COM objects live in this process' main thread, from creation to release. When the
parent goes away (stdin closes) it exits.
"""
import json
import os
import queue
import sys
import threading

from .endpoint_meter import EndpointMeters

INTERVAL_S = 0.2


def run():
    for stream in (sys.stdin, sys.stdout):
        stream.reconfigure(encoding="utf-8", errors="replace")
    lines = queue.Queue()

    def read_stdin():
        for line in sys.stdin:
            lines.put(line)
        lines.put(None)                       # the parent closed the pipe

    threading.Thread(target=read_stdin, daemon=True).start()
    meters = EndpointMeters()
    names = []
    while True:
        try:
            line = lines.get(timeout=INTERVAL_S)
        except queue.Empty:
            line = ""
        if line is None:
            break
        if line.strip():
            try:
                msg = json.loads(line)
            except ValueError:
                msg = {}
            if msg.get("quit"):
                break
            if msg.get("reset"):
                meters.reset()
            if isinstance(msg.get("names"), list):
                names = [n for n in msg["names"] if isinstance(n, str)]
        peaks = meters.peaks(names) if names else {}
        sys.stdout.write(json.dumps({"peaks": peaks}) + "\n")
        sys.stdout.flush()
    # End at once, without Python's clean-up: it would release the COM objects one by one at exit, and that
    # is where this process used to fail with "COM method call without VTable". Windows frees them with the process.
    sys.stdout.flush()
    os._exit(0)
