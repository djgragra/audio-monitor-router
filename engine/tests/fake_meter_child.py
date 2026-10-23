# A stand-in for the meter process: answers like the real one, with a fixed level for the names it is asked about.
import json
import sys
import threading
import time

print('hello from the meter child', file=sys.stderr, flush=True)
names = []
stop = False


def read():
    global names, stop
    for line in sys.stdin:
        msg = json.loads(line)
        if msg.get("quit"):
            break
        if "names" in msg:
            names = msg["names"]
    stop = True


threading.Thread(target=read, daemon=True).start()
while not stop:
    print(json.dumps({"peaks": {n: [0.5, 0.5] for n in names}, "extra": 1}), flush=True)
    time.sleep(0.05)
