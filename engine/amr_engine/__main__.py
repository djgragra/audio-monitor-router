"""Engine process: reads JSON commands (one per line) on stdin, writes JSON events on stdout."""
import json
import sys
import threading
import time

from .router import Engine


def setup_stdio():
    """Commands and events are UTF-8 on every system: Windows would otherwise read stdin as cp1252 and an
    accented device name would no longer match."""
    for stream in (sys.stdin, sys.stdout):
        stream.reconfigure(encoding="utf-8", errors="replace")


def selftest():
    """Used by the Windows build to be sure that everything the engine needs is inside the packaged program."""
    import numpy  # noqa: F401
    import sounddevice  # noqa: F401
    if sys.platform == "win32":
        from comtypes import CLSCTX_ALL, CoInitialize  # noqa: F401
        from pycaw.pycaw import AudioUtilities, IAudioMeterInformation  # noqa: F401
    print("selftest ok")
    return 0


def main():
    if "--selftest" in sys.argv:
        sys.exit(selftest())
    if "--meters-list" in sys.argv:        # diagnostics: what Windows gives the level meters (used by the build, for the log)
        from .endpoint_meter import EndpointMeters
        m = EndpointMeters()
        m._load()
        print(json.dumps({"stats": m.stats, "names": sorted((m._meters or {}).keys())}))
        return
    if "--meters" in sys.argv:             # the child process that reads the Windows level meters
        from .meter_worker import run
        run()
        return
    setup_stdio()
    from .backend import SoundDeviceBackend
    engine = Engine(SoundDeviceBackend())
    out_lock = threading.Lock()
    stop = threading.Event()

    def emit(ev):
        with out_lock:
            sys.stdout.write(json.dumps(ev) + "\n")
            sys.stdout.flush()

    def ticker():
        n = 0
        while not stop.wait(0.05):
            n += 1
            if engine.routes:
                emit(engine.meters())
            if n % 4 == 0:                    # 5 times a second
                sig = engine.signal()
                if sig:
                    emit(sig)
            if n % 40 == 0:                   # every 2 seconds
                for ev in engine.poll():
                    emit(ev)

    emit({"event": "ready", "protocol": 1})
    for ev in engine.poll():
        emit(ev)
    threading.Thread(target=ticker, daemon=True).start()
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            msg = json.loads(line)
        except ValueError:
            emit({"event": "error", "message": "invalid JSON"})
            continue
        if msg.get("cmd") == "quit":
            break
        for ev in engine.handle(msg):
            emit(ev)
    stop.set()
    engine.shutdown()
    engine.backend.close()


if __name__ == "__main__":
    main()
