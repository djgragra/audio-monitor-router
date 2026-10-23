"""Talks to the meter child process (see meter_worker.py). Whatever goes wrong there, the audio engine is not touched:
after three unexpected exits the output speakers are simply switched off and the reason is written once on stderr."""
import json
import os
import subprocess
import sys
import threading

MAX_FAILURES = 3


def default_command():
    if getattr(sys, "frozen", False):
        return [sys.executable, "--meters"], None
    return [sys.executable, "-m", "amr_engine", "--meters"], os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class MeterClient:
    def __init__(self, command=None, cwd=None, enabled=None):
        if command is None:
            command, cwd = default_command()
        self.command, self.cwd = command, cwd
        self.enabled = (sys.platform == "win32") if enabled is None else enabled
        self.disabled = False
        self.failures = 0
        self.proc = None
        self.latest = {}
        self._sent = None
        self._stopping = False
        self.lock = threading.RLock()

    # --- process ---
    def _start(self):
        flags = 0x08000000 if sys.platform == "win32" else 0          # CREATE_NO_WINDOW
        common = dict(cwd=self.cwd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, encoding="utf-8",
                      errors="replace", bufsize=1, creationflags=flags)
        # All three channels are our own. Leaving stderr to be inherited failed on Windows with "WinError 50: the request is
        # not supported": the parent's stderr is a pipe made by Electron that cannot be duplicated for a child.
        try:
            self.proc = subprocess.Popen(self.command, stderr=subprocess.PIPE, **common)
            threading.Thread(target=self._forward_errors, args=(self.proc,), daemon=True).start()
        except OSError:
            self.proc = subprocess.Popen(self.command, stderr=subprocess.DEVNULL, **common)
        self._sent = None
        self.latest = {}
        threading.Thread(target=self._read, args=(self.proc,), daemon=True).start()

    @staticmethod
    def _forward_errors(proc):
        """What the child writes on its error channel goes to ours, so it reaches the log."""
        try:
            for line in proc.stderr:
                if line.strip():
                    print(f"meters: {line.rstrip()}", file=sys.stderr, flush=True)
        except Exception:
            pass

    def _read(self, proc):
        try:
            for line in proc.stdout:
                try:
                    peaks = json.loads(line).get("peaks")
                except ValueError:
                    continue
                if isinstance(peaks, dict):
                    with self.lock:
                        if proc is self.proc:
                            self.latest = peaks
        except Exception:
            pass

    def _ensure(self):
        if self.proc is not None and self.proc.poll() is None:
            return True
        if self.proc is not None and not self._stopping:
            self.failures += 1
            if self.failures >= MAX_FAILURES:
                print(f"endpoint meters off: the meter process stopped {self.failures} times "
                      f"(last exit code {self.proc.returncode})", file=sys.stderr, flush=True)
                self.disabled = True
                return False
        try:
            self._start()
            return True
        except Exception as e:
            print(f"endpoint meters off: cannot start the meter process: {e}", file=sys.stderr, flush=True)
            self.disabled = True
            return False

    def _send(self, msg):
        try:
            self.proc.stdin.write(json.dumps(msg) + "\n")
            self.proc.stdin.flush()
        except Exception:
            pass                                   # it died: the next call notices and counts it

    # --- what the engine uses ---
    def peaks(self, names):
        """{device name: [peak per channel, 0..1]} as last read; empty while the process starts or when it is off."""
        if not self.enabled or self.disabled:
            return {}
        names = list(names)
        with self.lock:
            if not self._ensure():
                return {}
            if names != self._sent:
                self._send({"names": names})
                self._sent = names
            return {n: v for n, v in self.latest.items() if n in names}

    def reset(self):
        """The list of devices changed: the meter process loads its endpoints again."""
        with self.lock:
            self.latest = {}
            if self.proc is not None and self.proc.poll() is None:
                self._send({"reset": True})

    def stop(self):
        with self.lock:
            self._stopping = True
            proc, self.proc = self.proc, None
        if proc is None:
            return
        try:
            proc.stdin.write('{"quit": true}\n')
            proc.stdin.flush()
            proc.stdin.close()
            proc.wait(timeout=1.5)
            proc.stdout.close()
            if proc.stderr:
                proc.stderr.close()
        except Exception:
            try:
                proc.kill()
            except Exception:
                pass
