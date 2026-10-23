import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMatrix, describe, setRoute, syncPlan, gainFromVolume, moveGroup, movePort, isNetworkTransmit, wouldLoop } from '../renderer/js/matrix.js';
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

const mk = (id, group, name, kind = 'input', extra = {}) => ({ id, group, name, kind, channels: [0, 1], ...extra });
const names = (groups) => groups.map((g) => [g.group, g.ports.map((p) => p.name)]);

test('ports are ordered by number, not as text: 2 before 13', () => {
  const found = { sources: ['13-14', '1-2', '15-16', '3-4', '11-12', '5-6'].map((n) => mk(`n${n}`, 'Net', `Receive ${n}`)), destinations: [] };
  const m = buildMatrix(found, normalize({}));
  assert.deepEqual(m.rows[0].ports.map((p) => p.name), ['Receive 1-2', 'Receive 3-4', 'Receive 5-6', 'Receive 11-12', 'Receive 13-14', 'Receive 15-16']);
});

test('cards keep the order the system gave until the user moves them', () => {
  const found = { sources: [mk('c1', 'Cable', 'Out'), mk('n1', 'Net', 'R 1'), mk('b1', 'Board', 'In 1')], destinations: [] };
  const s = normalize({});
  assert.deepEqual(buildMatrix(found, s).rows.map((g) => g.group), ['Cable', 'Net', 'Board']);
  const moved = { ...s, order: moveGroup(found, s, 'sources', 'Board', -1) };
  assert.deepEqual(buildMatrix(found, moved).rows.map((g) => g.group), ['Cable', 'Board', 'Net']);
  const again = { ...moved, order: moveGroup(found, moved, 'sources', 'Cable', +1) };
  assert.deepEqual(buildMatrix(found, again).rows.map((g) => g.group), ['Board', 'Cable', 'Net']);
  assert.deepEqual(moveGroup(found, again, 'sources', 'Net', +1).sources.groups, ['Board', 'Cable', 'Net']);   // already last: unchanged
});

test('a port can be moved inside its card, and the others keep their place', () => {
  const found = { sources: [mk('a', 'X', 'In 1'), mk('b', 'X', 'In 2'), mk('c', 'X', 'In 3'), mk('z', 'Y', 'Only')], destinations: [] };
  let s = normalize({});
  s = { ...s, order: movePort(found, s, 'sources', 'c', -1) };
  assert.deepEqual(names(buildMatrix(found, s).rows), [['X', ['In 1', 'In 3', 'In 2']], ['Y', ['Only']]]);
  s = { ...s, order: movePort(found, s, 'sources', 'c', -1) };
  assert.deepEqual(names(buildMatrix(found, s).rows)[0][1], ['In 3', 'In 1', 'In 2']);
});

test('a card that is unplugged does not break the saved order; a new card goes last', () => {
  const full = { sources: [mk('a', 'A', 'x'), mk('b', 'B', 'x'), mk('c', 'C', 'x')], destinations: [] };
  let s = normalize({});
  s = { ...s, order: moveGroup(full, s, 'sources', 'C', -1) };
  s = { ...s, order: moveGroup(full, s, 'sources', 'C', -1) };
  const without = { sources: full.sources.filter((p) => p.group !== 'C'), destinations: [] };
  assert.deepEqual(buildMatrix(without, s).rows.map((g) => g.group), ['A', 'B']);
  const withNew = { sources: [...full.sources, mk('d', 'D', 'x')], destinations: [] };
  assert.deepEqual(buildMatrix(withNew, s).rows.map((g) => g.group), ['C', 'A', 'B', 'D']);
});

test('network transmit outputs are hidden by default and shown by the setting; inputs are never touched', () => {
  const found = {
    sources: [mk('r', 'Dante Virtual Soundcard', 'DVS Receive 1-2')],
    destinations: [mk('t', 'Dante Virtual Soundcard', 'DVS Transmit 1-2', 'output'), mk('h', 'Headphones Card', 'Phones', 'output')],
  };
  assert.equal(isNetworkTransmit(found.destinations[0]), true);
  assert.equal(isNetworkTransmit(found.sources[0]), false);
  let m = buildMatrix(found, normalize({}));
  assert.deepEqual(m.columns.map((g) => g.group), ['Headphones Card']);
  assert.equal(m.rows.length, 1);
  m = buildMatrix(found, normalize({ showNetworkTransmit: true }));
  assert.deepEqual(m.columns.map((g) => g.group), ['Dante Virtual Soundcard', 'Headphones Card']);
});

test('describe tells why a port is hidden, and a port in use stays visible', () => {
  const found = { sources: [mk('s', 'A', 'In')], destinations: [mk('t', 'Dante Virtual Soundcard', 'Tx', 'output'), mk('o', 'B', 'Out', 'output')] };
  const s = normalize({ hidden: ['o'], routes: { t: 's' } });
  const d = describe(found, s);
  const t = d.destinations.flatMap((g) => g.ports).find((p) => p.id === 't');
  const o = d.destinations.flatMap((g) => g.ports).find((p) => p.id === 'o');
  assert.deepEqual([t.hiddenByCategory, t.visible], [true, true]);       // in use: stays
  assert.deepEqual([o.hiddenByUser, o.visible], [true, false]);
});

test('the system default output is carried to the interface', () => {
  const found = { sources: [], destinations: [mk('o', 'B', 'Out', 'output', { default: true })] };
  assert.equal(buildMatrix(found, normalize({})).columns[0].ports[0].default, true);
});

test('order and the transmit setting are cleaned when read from disk', () => {
  const s = normalize({ showNetworkTransmit: 'yes', order: { sources: { groups: ['A', 3, 'A'], ports: 'x' }, destinations: null } });
  assert.equal(s.showNetworkTransmit, false);
  assert.deepEqual(s.order, { sources: { groups: ['A'], ports: [] }, destinations: { groups: [], ports: [] } });
});

test('loop guard: an input of a card fed by an output of the same card is flagged', () => {
  const found = {
    sources: [mk('cin', 'Virtual Cable', 'Cable Out'), mk('mic', 'Interface', 'In 1')],
    destinations: [mk('cout', 'Virtual Cable', 'Cable In', 'output'), mk('spk', 'Speakers Card', 'Spk', 'output'), mk('iout', 'Interface', 'Out 1', 'output')],
  };
  assert.equal(wouldLoop(found, {}, 'cout', 'cin'), true);           // same card
  assert.equal(wouldLoop(found, {}, 'spk', 'cin'), false);           // heard on another card: fine
  assert.equal(wouldLoop(found, {}, 'unknown', 'cin'), false);       // a device that is not there
});

test('loop guard: a chain of cards that comes back is flagged, a straight chain is not', () => {
  const found = {
    sources: [mk('a', 'A', 'in'), mk('b', 'B', 'in'), mk('c', 'C', 'in')],
    destinations: [mk('da', 'A', 'out', 'output'), mk('db', 'B', 'out', 'output'), mk('dc', 'C', 'out', 'output')],
  };
  assert.equal(wouldLoop(found, { db: 'a' }, 'dc', 'b'), false);                // A -> B, then B -> C
  assert.equal(wouldLoop(found, { db: 'a', dc: 'b' }, 'da', 'c'), true);        // A -> B -> C, and C -> A closes the circle
  assert.equal(wouldLoop(found, { db: 'a' }, 'db', 'c'), false);                // replacing the source of db: the old arrow does not count
});

test('settings: latency, channel buttons, signal, tray and login are cleaned and default as agreed', () => {
  const d = normalize({});
  assert.deepEqual([d.latency, d.showSignal, d.startAtLogin, d.closeToTray], ['normal', true, false, true]);
  const s = normalize({ latency: 'turbo', channels: { a: { muteLeft: true, mono: 'x' }, b: 3 }, showSignal: false, startAtLogin: 1, closeToTray: false });
  assert.equal(s.latency, 'normal');
  assert.deepEqual(s.channels, { a: { muteLeft: true, muteRight: false, mono: false } });
  assert.deepEqual([s.showSignal, s.startAtLogin, s.closeToTray], [false, false, false]);
  assert.equal(normalize({ latency: 'low' }).latency, 'low');
});
