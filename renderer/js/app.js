import { t as tr } from './i18n.js';
import { buildMatrix, setRoute, syncPlan, gainFromVolume, wouldLoop, DEFAULT_VOLUME } from './matrix.js';
import { createSignalTracker } from './signal.js';
import { renderSettings } from './settings-view.js';

const api = window.api;
const $ = (id) => document.getElementById(id);
export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v == null) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid);
  return el;
}

const state = { settings: null, found: { sources: [], destinations: [] }, running: {}, meters: new Map(), tracker: createSignalTracker(), sigEls: new Map(), watched: '', armed: null };
const t = (key, vars) => tr(state.settings?.language || 'en', key, vars);
const portName = (p) => state.settings.labels[p.id] || p.name;
const findPort = (id) => [...state.found.sources, ...state.found.destinations].find((p) => p.id === id);

function applyTheme() {
  const pick = state.settings.theme;
  const dark = pick === 'dark' || (pick === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.documentElement.lang = state.settings.language;
}

async function save(patch) {
  state.settings = await api.settings.update(patch);
  applyTheme();
  return state.settings;
}

function showStatus(text, isError = false) {
  const el = $('status');
  el.hidden = !text;
  el.textContent = text || '';
  el.classList.toggle('error', isError);
}

// ---- keep the engine in line with the wanted routes ----
function sync() {
  const m = buildMatrix(state.found, state.settings);
  const plan = syncPlan(state.running, m.active);
  for (const r of plan.start) {
    state.running[r.destination] = r.source;
    const ch = state.settings.channels[r.destination] || {};
    api.engine.send({ cmd: 'start_route', route_id: r.destination, source: r.source, destination: r.destination, gain: gainFromVolume(state.settings.volumes[r.destination] ?? DEFAULT_VOLUME), mute_left: !!ch.muteLeft, mute_right: !!ch.muteRight, mono: !!ch.mono });
  }
  for (const d of plan.stop) {
    delete state.running[d];
    api.engine.send({ cmd: 'stop_route', route_id: d });
  }
}

// ---- matrix ----
function nameCell(port) {
  const label = state.settings.labels[port.id];
  const wrap = h('span', { class: 'nm', title: label ? `${label} (${port.name})` : port.name, ondblclick: () => rename(wrap, port) },
    h('span', { class: 'name' }, label || port.name), label ? h('small', { class: 'orig' }, port.name) : null);
  return wrap;
}

/** A label that needs two lines leaves no room for the original name: it is then only in the tooltip. */
function markLongNames(root) {
  for (const nm of root.querySelectorAll('.nm')) {
    const n = nm.querySelector('.name');
    nm.classList.toggle('long', n.scrollHeight > 20);
  }
}

function rename(span, port) {
  const input = h('input', { class: 'name-input', type: 'text', value: state.settings.labels[port.id] || '', placeholder: t('matrix.namePlaceholder'), 'aria-label': t('matrix.rename') });
  let done = false;
  const finish = async (commit) => {
    if (done) return;
    done = true;
    if (commit) {
      const labels = { ...state.settings.labels };
      const v = input.value.trim();
      if (v) labels[port.id] = v; else delete labels[port.id];
      await save({ labels });
    }
    render();
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') finish(true); if (e.key === 'Escape') finish(false); });
  input.addEventListener('blur', () => finish(true));
  span.replaceWith(input);
  input.focus();
  input.select();
}

function hideButton(port) {
  return h('button', { class: 'hide-btn', type: 'button', title: t('matrix.hide'), 'aria-label': `${t('matrix.hide')}: ${portName(port)}`, onclick: async () => { await save({ hidden: [...state.settings.hidden, port.id] }); render(); } }, '×');
}

const ARM_MS = 5000;

async function toggle(srcId, dstId) {
  const on = state.settings.routes[dstId] === srcId;
  if (!on && wouldLoop(state.found, state.settings.routes, dstId, srcId)) {
    // a possible loop needs a second click: the first one only warns
    const a = state.armed;
    if (!a || a.src !== srcId || a.dst !== dstId || Date.now() > a.until) {
      state.armed = { src: srcId, dst: dstId, until: Date.now() + ARM_MS };
      showStatus(t('loop.confirm', { src: portName(findPort(srcId)), dst: portName(findPort(dstId)) }));
      setTimeout(() => { if (state.armed && Date.now() > state.armed.until - 1) { state.armed = null; showStatus(''); render(); } }, ARM_MS + 50);
      render();
      return;
    }
    showStatus('');
  }
  state.armed = null;
  await save({ routes: setRoute(state.settings, dstId, on ? null : srcId).routes });
  render();
  sync();
}

function defaultMark(port) {
  return port.default ? h('span', { class: 'def', title: t('matrix.default'), 'aria-label': t('matrix.default') }, t('matrix.defaultBadge')) : null;
}

const SVG = 'http://www.w3.org/2000/svg';
function speakerIcon(port) {
  const el = (tag, attrs) => { const e = document.createElementNS(SVG, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };
  const svg = el('svg', { viewBox: '0 0 24 24', class: 'sig', role: 'img', 'aria-label': t('signal.off') });
  svg.append(el('path', { class: 'spk', d: 'M4 9v6h4l5 4V5L8 9H4z' }), el('path', { class: 'wave', d: 'M16 9a4 4 0 0 1 0 6' }), el('path', { class: 'wave', d: 'M18.5 6.5a8 8 0 0 1 0 11' }));
  state.sigEls.set(port.id, svg);
  paintSignal(port.id, svg, Date.now());
  return svg;
}

function paintSignal(id, svg, now) {
  const on = state.tracker.state(id, now);
  svg.classList.toggle('on', on === true);
  svg.classList.toggle('na', on === null);
  const label = on ? t('signal.on') : t('signal.off');
  svg.setAttribute('aria-label', label);
  let title = svg.querySelector('title');
  if (!title) { title = document.createElementNS(SVG, 'title'); svg.prepend(title); }
  title.textContent = label;
}

setInterval(() => { const now = Date.now(); for (const [id, svg] of state.sigEls) paintSignal(id, svg, now); }, 250);

/** Tells the engine which sources to watch (the visible ones), only when the list changes. */
function syncMonitor(rows, columns) {
  const ids = state.settings.showSignal ? [...rows, ...columns].flatMap((g) => g.ports.map((p) => p.id)) : [];
  const key = ids.join('|');
  if (key === state.watched) return;
  state.watched = key;
  state.tracker.keepOnly(ids);
  api.engine.send({ cmd: 'monitor_ports', ports: ids });
}

function render() {
  const root = $('matrix');
  const m = buildMatrix(state.found, state.settings);
  state.meters.clear();
  state.sigEls.clear();
  $('btnRefresh').textContent = t('matrix.refresh');
  $('btnSettings').textContent = t('settings.open');
  if (!m.rows.length && !m.columns.length) {
    root.replaceChildren(h('p', { class: 'empty' }, t('matrix.empty')));
    return;
  }
  const cols = m.columns.flatMap((g) => g.ports.map((p) => ({ ...p, group: g.group })));
  const head = h('tr', {}, h('th', { class: 'corner', scope: 'col' }, h('span', { class: 'ell' }, t('matrix.corner'))),
    cols.map((c) => h('th', { class: 'colhead', scope: 'col' }, h('div', { class: 'grprow' }, h('span', { class: 'grp', title: c.group }, c.group), defaultMark(c), state.settings.showSignal ? speakerIcon(c) : null), h('div', { class: 'rowflex' }, h('span', { class: 'rowname' }, nameCell(c)), hideButton(c)))));
  const body = [];
  for (const g of m.rows) {
    body.push(h('tr', { class: 'grouprow' }, h('th', { class: 'grp-label', scope: 'rowgroup' }, h('span', { class: 'ell', title: g.group }, g.group)), h('td', { colspan: cols.length })));
    for (const s of g.ports) {
      body.push(h('tr', {}, h('th', { class: 'rowhead', scope: 'row' }, h('div', { class: 'rowflex' }, h('span', { class: 'rowname' }, nameCell(s), defaultMark(s)), state.settings.showSignal ? speakerIcon(s) : null, hideButton(s))),
        cols.map((c) => {
          const on = state.settings.routes[c.id] === s.id;
          const armed = state.armed && state.armed.src === s.id && state.armed.dst === c.id && Date.now() <= state.armed.until;
          return h('td', {}, h('button', { class: `cell${armed ? ' warn' : ''}`, type: 'button', 'aria-pressed': String(on), 'aria-label': t('matrix.cell', { src: portName(s), dst: portName(c) }), title: armed ? t('loop.cell') : null, onclick: () => toggle(s.id, c.id) }, armed ? '⚠ ?' : t('matrix.listen')));
        })));
    }
  }
  const vol = h('tr', { class: 'vol-row' }, h('th', { class: 'ctl-label' }, t('matrix.volume')), cols.map((c) => {
    const slider = h('input', { class: 'vol', type: 'range', min: '0', max: '100', value: String(state.settings.volumes[c.id] ?? DEFAULT_VOLUME), 'aria-label': `${t('matrix.volume')}: ${portName(c)}` });
    let timer;
    slider.addEventListener('input', () => {
      api.engine.send({ cmd: 'set_gain', route_id: c.id, gain: gainFromVolume(Number(slider.value)) });
      clearTimeout(timer);
      timer = setTimeout(() => save({ volumes: { ...state.settings.volumes, [c.id]: Number(slider.value) } }), 300);
    });
    return h('td', {}, slider);
  }));
  const setChan = async (id, patch) => {
    const cur = state.settings.channels[id] || { muteLeft: false, muteRight: false, mono: false };
    const next = { ...cur, ...patch };
    await save({ channels: { ...state.settings.channels, [id]: next } });
    api.engine.send({ cmd: 'set_channels', route_id: id, mute_left: next.muteLeft, mute_right: next.muteRight, mono: next.mono });
    render();
  };
  const chan = h('tr', { class: 'chan-row' }, h('th', { class: 'ctl-label' }, t('matrix.channels')), cols.map((c) => {
    const cur = state.settings.channels[c.id] || {};
    // L and R are lit while that channel is heard; pressing one leaves it out. MONO is lit while left and right are summed.
    const btn = (cls, text, title, pressed, patch) => h('button', { class: `tog ${cls}`, type: 'button', 'aria-pressed': String(pressed), title, 'aria-label': `${title}: ${portName(c)}`, onclick: () => setChan(c.id, patch) }, text);
    return h('td', {}, h('div', { class: 'togs' },
      btn('lr', 'L', t('chan.left'), !cur.muteLeft, { muteLeft: !cur.muteLeft }),
      btn('lr', 'R', t('chan.right'), !cur.muteRight, { muteRight: !cur.muteRight }),
      btn('mono', 'MONO', t('chan.mono'), !!cur.mono, { mono: !cur.mono })));
  }));
  const lvl = h('tr', { class: 'lvl-row' }, h('th', { class: 'ctl-label' }, t('matrix.level')), cols.map((c) => {
    const bar = h('i');
    state.meters.set(c.id, bar);
    return h('td', {}, h('div', { class: 'meter' }, bar));
  }));
  const kids = [h('table', { class: 'grid' }, h('thead', {}, head), h('tbody', {}, body), h('tfoot', {}, vol, chan, lvl))];
  if (m.dormant.length) kids.push(h('p', { class: 'note' }, t('matrix.dormant', { n: m.dormant.length })));
  root.replaceChildren(...kids);
  markLongNames(root);
  syncMonitor(m.rows, m.columns);
}

// ---- events from the engine ----
function onEngine(ev) {
  switch (ev.event) {
    case 'devices':
      state.found = { sources: ev.sources, destinations: ev.destinations };
      showStatus('');
      render();
      sync();
      break;
    case 'route_stopped':
      delete state.running[ev.route_id];
      if (ev.reason === 'device_gone') showStatus(t('status.routeGone', { dst: findPort(ev.route_id) ? portName(findPort(ev.route_id)) : '' }));
      render();
      break;
    case 'route_error': {
      delete state.running[ev.route_id];
      const dst = findPort(ev.route_id);
      const src = findPort(state.settings.routes[ev.route_id]);
      save({ routes: setRoute(state.settings, ev.route_id, null).routes }).then(render);
      showStatus(t('status.routeError', { src: src ? portName(src) : '?', dst: dst ? portName(dst) : '?', msg: ev.message }), true);
      break;
    }
    case 'signal':
      state.tracker.update(ev.levels, Date.now());
      break;
    case 'ready':       // the engine (re)started: it knows nothing yet
      state.watched = '';
      api.engine.send({ cmd: 'set_latency', latency: state.settings.latency });
      api.engine.send({ cmd: 'list_devices' });
      break;
    case 'meters':
      for (const [id, bar] of state.meters) {
        const db = ev.levels[id];
        bar.style.width = db === undefined ? '0%' : `${Math.max(0, Math.min(100, ((db + 60) / 60) * 100))}%`;
      }
      break;
    case 'engine_down':
      state.running = {};
      showStatus(ev.reason === 'exit' ? t('status.engineStopped') : t('status.engineMissing', { detail: ev.detail || '' }), ev.reason !== 'exit');
      break;
    default:
  }
}

// ---- settings overlay ----
function openSettings() {
  const box = $('settings');
  const draw = (tab) => renderSettings(box, { state, t, h, api, tab, save, redraw: draw, close: () => { box.hidden = true; render(); }, found: state.found });
  box.hidden = false;
  draw('general');
  box.querySelector('.tab[aria-selected="true"]')?.focus();
}

async function init() {
  state.settings = await api.settings.get();
  applyTheme();
  $('btnRefresh').addEventListener('click', () => api.engine.send({ cmd: 'list_devices' }));
  $('btnSettings').addEventListener('click', openSettings);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('settings').hidden) { $('settings').hidden = true; render(); } });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
  api.engine.onEvent(onEngine);
  render();
  api.engine.send({ cmd: 'set_latency', latency: state.settings.latency });
  api.engine.send({ cmd: 'list_devices' });
}
init();
