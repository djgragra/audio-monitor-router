import contextlib
import io
import json
import os
import subprocess
import sys
import time
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from amr_engine.meter_client import MAX_FAILURES, MeterClient  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
ENGINE_DIR = os.path.dirname(HERE)


def wait_for(fn, seconds=5.0):
    end = time.time() + seconds
    while time.time() < end:
        v = fn()
        if v:
            return v
        time.sleep(0.05)
    return fn()


class ClientTests(unittest.TestCase):
    def test_levels_come_from_the_child_and_only_for_the_names_asked(self):
        c = MeterClient([sys.executable, os.path.join(HERE, "fake_meter_child.py")], enabled=True)
        try:
            got = wait_for(lambda: c.peaks(["Out A (Card)", "Out B (Card)"]))
            self.assertEqual(got, {"Out A (Card)": [0.5, 0.5], "Out B (Card)": [0.5, 0.5]})
            self.assertEqual(list(wait_for(lambda: c.peaks(["Out A (Card)"]) and c.peaks(["Out A (Card)"]))), ["Out A (Card)"])
        finally:
            c.stop()
        self.assertIsNone(c.proc)

    def test_a_child_that_keeps_dying_switches_the_feature_off_and_says_why_once(self):
        c = MeterClient([sys.executable, os.path.join(HERE, "fake_crash_child.py")], enabled=True)
        err = io.StringIO()
        with contextlib.redirect_stderr(err):
            for _ in range(60):
                self.assertEqual(c.peaks(["X"]), {})
                if c.disabled:
                    break
                time.sleep(0.1)
        self.assertTrue(c.disabled)
        self.assertEqual(c.failures, MAX_FAILURES)
        self.assertEqual(err.getvalue().count("endpoint meters off"), 1)
        self.assertIn("exit code 7", err.getvalue())
        self.assertEqual(c.peaks(["X"]), {})              # and it stays off without starting anything again

    def test_a_program_that_does_not_exist_is_not_an_error(self):
        c = MeterClient(["no-such-meter-program-xyz"], enabled=True)
        err = io.StringIO()
        with contextlib.redirect_stderr(err):
            self.assertEqual(c.peaks(["X"]), {})
        self.assertTrue(c.disabled)

    def test_off_means_no_process(self):
        c = MeterClient([sys.executable, "-c", "pass"], enabled=False)
        self.assertEqual(c.peaks(["X"]), {})
        self.assertIsNone(c.proc)

    def test_reset_is_sent_and_clears_the_levels(self):
        c = MeterClient([sys.executable, os.path.join(HERE, "fake_meter_child.py")], enabled=True)
        try:
            wait_for(lambda: c.peaks(["A (B)"]))
            c.reset()
            self.assertEqual(c.latest, {})
        finally:
            c.stop()


class WorkerTests(unittest.TestCase):
    def test_the_real_worker_answers_and_ends_when_asked(self):
        p = subprocess.Popen([sys.executable, "-m", "amr_engine", "--meters"], cwd=ENGINE_DIR, stdin=subprocess.PIPE,
                             stdout=subprocess.PIPE, text=True, encoding="utf-8")
        try:
            p.stdin.write(json.dumps({"names": ["Something (Card)"]}) + "\n")
            p.stdin.flush()
            line = p.stdout.readline()
            self.assertIn("peaks", json.loads(line))            # empty here: the meters exist only on Windows
            p.stdin.write('{"quit": true}\n')
            p.stdin.flush()
            self.assertEqual(p.wait(timeout=5), 0)
        finally:
            if p.poll() is None:
                p.kill()

    def test_the_diagnostics_command_prints_json_and_ends(self):
        out = subprocess.run([sys.executable, "-m", "amr_engine", "--meters-list"], cwd=ENGINE_DIR, capture_output=True, text=True, timeout=20)
        self.assertEqual(out.returncode, 0)
        info = json.loads(out.stdout.strip().splitlines()[-1])
        self.assertIn("stats", info)
        self.assertIsInstance(info["names"], list)

    def test_the_worker_ends_when_the_parent_closes_the_pipe(self):
        p = subprocess.Popen([sys.executable, "-m", "amr_engine", "--meters"], cwd=ENGINE_DIR, stdin=subprocess.PIPE,
                             stdout=subprocess.PIPE, text=True, encoding="utf-8")
        try:
            p.stdin.close()
            self.assertEqual(p.wait(timeout=5), 0)
        finally:
            if p.poll() is None:
                p.kill()


if __name__ == "__main__":
    unittest.main()
