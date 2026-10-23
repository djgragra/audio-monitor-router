import test from 'node:test';
import assert from 'node:assert/strict';
import { createSignalTracker } from '../renderer/js/signal.js';
import { loadBounds, saveBounds, fitBounds } from '../src/window-state.js';
import { MAIN_TEXT, tMain } from '../src/i18n-main.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('signal: unknown until reported, on above the threshold, held a moment, then off', () => {
  const t = createSignalTracker({ threshold: -60, holdMs: 800 });
  assert.equal(t.state('a', 0), null);
  t.update({ a: -90, b: -30 }, 1000);
  assert.equal(t.state('a', 1000), false);
  assert.equal(t.state('b', 1000), true);
  t.update({ a: -90, b: -90 }, 1200);
  assert.equal(t.state('b', 1500), true);        // a pause shorter than the hold does not blink the icon
  assert.equal(t.state('b', 2100), false);
});

test('signal: a source no longer watched is forgotten', () => {
  const t = createSignalTracker();
  t.update({ a: -20, b: -20 }, 0);
  t.keepOnly(['a']);
  assert.equal(t.state('b', 0), null);
  assert.equal(t.state('a', 0), true);
});

test('window state: sizes that make no sense are ignored, a position on a missing screen is dropped', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'amr-'));
  const f = path.join(dir, 'w.json');
  assert.equal(loadBounds(f), null);
  saveBounds(f, { x: 10, y: 20, width: 900, height: 500 });
  assert.deepEqual(loadBounds(f), { x: 10, y: 20, width: 900, height: 500 });
  fs.writeFileSync(f, JSON.stringify({ width: 10, height: 10 }));
  assert.equal(loadBounds(f), null);
  const screens = [{ x: 0, y: 0, width: 1920, height: 1080 }];
  assert.deepEqual(fitBounds({ x: 100, y: 100, width: 900, height: 500 }, screens), { x: 100, y: 100, width: 900, height: 500 });
  assert.deepEqual(fitBounds({ x: 3000, y: 100, width: 900, height: 500 }, screens), { width: 900, height: 500 });   // that monitor is gone
  assert.deepEqual(fitBounds({ width: 900, height: 500 }, screens), { width: 900, height: 500 });
  assert.equal(fitBounds(null, screens), null);
});

test('main-process texts exist in the three languages with the same keys', () => {
  const keys = (l) => Object.keys(MAIN_TEXT[l]).sort();
  assert.deepEqual(keys('it'), keys('en'));
  assert.deepEqual(keys('es'), keys('en'));
  assert.equal(tMain('xx', 'tray.quit'), 'Quit');
});
