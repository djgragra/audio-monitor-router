import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createEngineClient } from '../src/engine-client.js';
import { createStore } from '../src/store.js';
import { isAllowedLink, SUPPORT, TOOL_PAGE } from '../src/links.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const fake = fileURLToPath(new URL('./fake-engine.mjs', import.meta.url));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test('client: events arrive, bad lines are ignored, unknown commands are refused', async () => {
  const events = [];
  const logs = [];
  const c = createEngineClient({ command: process.execPath, args: [fake], onEvent: (e) => events.push(e), onLog: (l, m) => logs.push(m) });
  c.start();
  await wait(400);
  assert.equal(events[0].event, 'ready');
  assert.equal(c.send({ cmd: 'rm -rf' }), false);
  assert.equal(c.send({ cmd: 'start_route', route_id: 'r1' }), true);
  await wait(300);
  assert.ok(events.some((e) => e.event === 'route_started' && e.route_id === 'r1'));
  assert.ok(logs.some((m) => m.includes('not JSON')));
  c.stop();
  await wait(300);
  assert.equal(c.running, false);
});

test('client: a program that does not exist is reported, not thrown', async () => {
  const events = [];
  createEngineClient({ command: 'no-such-engine-xyz', onEvent: (e) => events.push(e) }).start();
  await wait(300);
  assert.equal(events[0].event, 'engine_down');
  assert.equal(events[0].reason, 'missing');
});

test('store: written atomically, cleaned on read, unchanged data is not rewritten', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'amr-'));
  const file = path.join(dir, 'settings.json');
  fs.writeFileSync(file, '{"language":"it","labels":{"a":"x","b":5}}');
  const s = createStore(file);
  assert.equal(s.get().language, 'it');
  assert.deepEqual(s.get().labels, { a: 'x' });
  s.update({ theme: 'light' });
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).theme, 'light');
  assert.equal(fs.existsSync(`${file}.tmp`), false);
  const before = fs.statSync(file).mtimeMs;
  s.update({ theme: 'light' });
  assert.equal(fs.statSync(file).mtimeMs, before);
  fs.writeFileSync(file, 'not json');
  assert.equal(createStore(file).get().language, 'en');             // a broken file starts clean
});

test('links: only the support pages, the tool page, the releases and the mail address', () => {
  for (const u of Object.values(SUPPORT)) assert.ok(isAllowedLink(u));
  assert.ok(isAllowedLink(TOOL_PAGE));
  assert.equal(isAllowedLink('https://evil.example/'), false);
  assert.equal(isAllowedLink('https://onairgarage.com/support/?x=1'), false);
  assert.equal(isAllowedLink('file:///etc/passwd'), false);
});

test('client: when the engine exits, the last line it wrote on stderr is the cause', async () => {
  const events = [];
  const script = "console.error('first'); console.error('ImportError: no sound library'); process.exit(1)";
  createEngineClient({ command: process.execPath, args: ['-e', script], onEvent: (e) => events.push(e) }).start();
  await wait(500);
  assert.equal(events.at(-1).reason, 'exit');
  assert.match(events.at(-1).detail, /ImportError/);
});
