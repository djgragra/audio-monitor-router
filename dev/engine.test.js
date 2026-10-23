// Runs the Python engine tests, so `npm test` covers the whole repository.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const engine = fileURLToPath(new URL('../engine', import.meta.url));

test('engine unit tests (Python)', (t) => {
  for (const py of ['python3', 'python']) {
    const r = spawnSync(py, ['-m', 'unittest', 'discover', '-s', 'tests'], { cwd: engine, encoding: 'utf8' });
    if (r.error) continue;                       // this name is not installed, try the next
    assert.equal(r.status, 0, r.stderr || r.stdout);
    return;
  }
  t.skip('Python 3 with numpy not found');
});
