import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMatrix, setRoute, syncPlan, gainFromVolume } from '../renderer/js/matrix.js';
import { normalize, DEFAULTS } from '../src/settings.js';

// A made-up machine: nothing here is a real device.
const port = (id, group, name, ch = [0, 1]) => ({ id, group, name, channels: ch });
const machine = () => ({
  sources: [port('a/1', 'Card A', 'In 1-2'), port('a/2', 'Card A', 'In 3-4'), port('n/1', 'Net Card', 'Receive 1-2')],
  destinations: [port('a/o', 'Card A', 'Out 1-2'), port('s/o', 'Speakers', 'Speakers')],
});

test('settings start empty: no device, label or route comes from a default', () => {
  assert.deepEqual(normalize(undefined), { ...DEFAULTS, hidden: [], labels: {}, routes: {}, volumes: {} });
  assert.deepEqual(DEFAULTS.hidden, []);
  assert.deepEqual(DEFAULTS.routes, {});
});

test('normalize drops invalid values and keeps the valid ones', () => {
  const s = normalize({ language: 'xx', theme: 'light', labels: { 'a/1': 'Main', 'a/2': '  ', x: 3 }, hidden: ['a/1', 'a/1', 7], volumes: { 'a/o': 150, 's/o': 40 } });
  assert.equal(s.language, 'en');
  assert.equal(s.theme, 'light');
  assert.deepEqual(s.labels, { 'a/1': 'Main' });
  assert.deepEqual(s.hidden, ['a/1']);
  assert.deepEqual(s.volumes, { 's/o': 40 });
});

test('ports are grouped by device and carry the user label', () => {
  const m = buildMatrix(machine(), normalize({ labels: { 'n/1': 'Studio feed' } }));
  assert.deepEqual(m.rows.map((g) => g.group), ['Card A', 'Net Card']);
  assert.equal(m.rows[1].ports[0].label, 'Studio feed');
  assert.equal(m.columns.length, 2);
});

test('a device that is gone disappears, its route waits, and it comes back with the device', () => {
  let s = setRoute(normalize({}), 's/o', 'n/1');
  const full = machine();
  assert.equal(buildMatrix(full, s).active.length, 1);

  const without = { ...full, sources: full.sources.filter((p) => p.group !== 'Net Card') };
  const m = buildMatrix(without, s);
  assert.deepEqual(m.rows.map((g) => g.group), ['Card A']);
  assert.equal(m.active.length, 0);
  assert.deepEqual(m.dormant, [{ destination: 's/o', source: 'n/1' }]);

  assert.equal(buildMatrix(full, s).active.length, 1);          // plugged in again
});

test('hidden ports are not shown, unless a route is using them', () => {
  let s = normalize({ hidden: ['a/2', 'a/1'] });
  s = setRoute(s, 'a/o', 'a/1');
  const names = buildMatrix(machine(), s).rows.flatMap((g) => g.ports.map((p) => p.id));
  assert.deepEqual(names, ['a/1', 'n/1']);
});

test('one source per destination: a new choice replaces the old one', () => {
  let s = setRoute(normalize({}), 's/o', 'a/1');
  s = setRoute(s, 's/o', 'n/1');
  assert.deepEqual(s.routes, { 's/o': 'n/1' });
  assert.deepEqual(setRoute(s, 's/o', null).routes, {});
});

test('syncPlan starts what is missing, restarts a changed source and stops what is no longer wanted', () => {
  const r = (destination, source) => ({ destination, source });
  const p = syncPlan({ x: '1', y: '2', w: '5' }, [r('y', '2'), r('z', '3'), r('x', '9')]);
  assert.deepEqual(p.start, [r('z', '3'), r('x', '9')]);
  assert.deepEqual(p.stop, ['w']);
});

test('volume to gain: squared curve, clamped', () => {
  assert.equal(gainFromVolume(100), 1);
  assert.equal(gainFromVolume(0), 0);
  assert.equal(gainFromVolume(50), 0.25);
  assert.equal(gainFromVolume(250), 1);
  assert.ok(Math.abs(gainFromVolume(undefined) - 0.64) < 1e-9);
});
