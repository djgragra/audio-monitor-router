import { t as tr } from './i18n.js';
import { buildMatrix, setRoute, syncPlan, gainFromVolume, DEFAULT_VOLUME } from './matrix.js';
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

const state = { settings: null, found: { sources: [], destinations: [] }, running: {}, meters: new Map() };
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
    api.engine.send({ cmd: 'start_route', route_id: r.destination, source: r.source, destination: r.destination, gain: gainFromVolume(state.settings.volumes[r.destination] ?? DEFAULT_VOLUME) });
  }
  for (const d of plan.stop) {
    delete state.running[d];
    api.engine.send({ cmd: 'stop_route', route_id: d });
  }
}

// ---- matrix ----
function nameCell(port, tag) {
  const label = state.settings.labels[port.id];
  const span = h(tag === 'th' ? 'span' : 'span', { class: 'name', title: t('matrix.rename'), ondblclick: () => rename(span, port) },
    label || port.name, label ? h('small', {}, port.name) : null);
  return span;
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

async function toggle(srcId, dstId) {
  const on = state.settings.routes[dstId] === srcId;
  await save({ routes: setRoute(state.settings, dstId, on ? null : srcId).routes });
  render();
  sync();
}

function defaultMark(port) {
  return port.default ? h('span', { class: 'def', title: t('matrix.default'), 'aria-label': t('matrix.default') }, '●') : null;
}

function render() {
  const root = $('matrix');
  const m = buildMatrix(state.found, state.settings);
  state.meters.clear();
  $('btnRefresh').textContent = t('matrix.refresh');
  $('btnSettings').textContent = t('settings.open');
  if (!m.rows.length && !m.columns.length) {
    root.replaceChildren(h('p', { class: 'empty' }, t('matrix.empty')));
    return;
  }
  const cols = m.columns.flatMap((g) => g.ports.map((p) => ({ ...p, group: g.group })));
  const head = h('tr', {}, h('th', { class: 'corner', scope: 'col' }, h('span', { class: 'ell' }, t('matrix.corner'))),
    cols.map((c) => h('th', { class: 'colhead', scope: 'col' }, h('span', { class: 'grp', title: c.group }, c.group), nameCell(c, 'th'), defaultMark(c), hideButton(c))));
  const body = [];
  for (const g of m.rows) {
    body.push(h('tr', { class: 'grouprow' }, h('th', { class: 'grp-label', scope: 'rowgroup' }, h('span', { class: 'ell', title: g.group }, g.group)), h('td', { colspan: cols.length })));
    for (const s of g.ports) {
      body.push(h('tr', {}, h('th', { class: 'rowhead', scope: 'row' }, nameCell(s, 'th'), defaultMark(s), hideButton(s)),
        cols.map((c) => {
          const on = state.settings.routes[c.id] === s.id;
          return h('td', {}, h('button', { class: 'cell', type: 'button', 'aria-pressed': String(on), 'aria-label': t('matrix.cell', { src: portName(s), dst: portName(c) }), onclick: () => toggle(s.id, c.id) }, on ? t('matrix.listen') : ''));
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
  const lvl = h('tr', { class: 'lvl-row' }, h('th', { class: 'ctl-label' }, t('matrix.level')), cols.map((c) => {
    const bar = h('i');
    state.meters.set(c.id, bar);
    return h('td', {}, h('div', { class: 'meter' }, bar));
  }));
  const kids = [h('table', { class: 'grid' }, h('thead', {}, head), h('tbody', {}, body), h('tfoot', {}, vol, lvl))];
  if (m.dormant.length) kids.push(h('p', { class: 'note' }, t('matrix.dormant', { n: m.dormant.length })));
  root.replaceChildren(...kids);
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
  api.engine.send({ cmd: 'list_devices' });
}
init();
