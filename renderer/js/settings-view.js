// The settings overlay: General, Devices, Help & About.
import { LANGS } from './i18n.js';
import { SUPPORT_URLS } from './links.js';
import { describe, moveGroup, movePort } from './matrix.js';

export function renderSettings(box, ctx) {
  const { state, t, h, api, tab, save, redraw, close, found } = ctx;
  const s = state.settings;
  const portById = new Map([...found.sources, ...found.destinations].map((p) => [p.id, p]));

  const tabs = ['general', 'devices', 'about'].map((k) =>
    h('button', { class: 'tab', type: 'button', role: 'tab', 'aria-selected': String(k === tab), onclick: () => redraw(k) }, t(`tab.${k}`)));

  let content;
  if (tab === 'general') {
    const lang = h('select', { id: 'selLang', onchange: async (e) => { await save({ language: e.target.value }); redraw('general'); } },
      LANGS.map((l) => h('option', { value: l, selected: l === s.language }, { en: 'English', it: 'Italiano', es: 'Español' }[l])));
    const theme = h('select', { id: 'selTheme', onchange: async (e) => { await save({ theme: e.target.value }); redraw('general'); } },
      ['dark', 'light', 'system'].map((k) => h('option', { value: k, selected: k === s.theme }, t(`theme.${k}`))));
    const lat = h('select', { id: 'selLat', onchange: async (e) => { await save({ latency: e.target.value }); api.engine.send({ cmd: 'set_latency', latency: e.target.value }); redraw('general'); } },
      ['low', 'normal', 'safe'].map((k) => h('option', { value: k, selected: k === s.latency }, t(`latency.${k}`))));
    const check = (key, textKey, after) => h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: !!s[key], onchange: async (e) => { await save({ [key]: e.target.checked }); if (after) after(); redraw('general'); } }), h('span', {}, t(textKey)));
    content = [h('div', { class: 'field' }, h('label', { for: 'selLang' }, t('general.language')), lang),
      h('div', { class: 'field' }, h('label', { for: 'selTheme' }, t('general.theme')), theme),
      h('div', { class: 'field' }, h('label', { for: 'selLat' }, t('general.latency')), lat),
      h('p', { class: 'hint' }, t('latency.help')),
      check('showSignal', 'general.showSignal', () => { state.watched = '\0'; }),
      check('startAtLogin', 'general.startAtLogin'),
      check('closeToTray', 'general.closeToTray')];
  } else if (tab === 'devices') {
    const d = describe(found, s);
    const arrows = (onUp, onDown, upOff, downOff) => h('span', { class: 'arrows' },
      h('button', { class: 'arrow', type: 'button', title: t('devices.moveUp'), 'aria-label': t('devices.moveUp'), disabled: upOff, onclick: onUp }, '↑'),
      h('button', { class: 'arrow', type: 'button', title: t('devices.moveDown'), 'aria-label': t('devices.moveDown'), disabled: downOff, onclick: onDown }, '↓'));
    const setHidden = async (ids, hide) => {
      const rest = s.hidden.filter((x) => !ids.includes(x));
      await save({ hidden: hide ? [...rest, ...ids] : rest });
      redraw('devices');
    };
    const side = (key, title) => {
      const groups = d[key];
      const blocks = groups.map((g, gi) => {
        const shown = g.ports.filter((p) => !p.hiddenByUser && !p.hiddenByCategory).length;
        const eligible = g.ports.filter((p) => !p.hiddenByCategory);
        const gbox = h('input', { type: 'checkbox', 'aria-label': t('devices.showGroup'), title: t('devices.showGroup'), disabled: !eligible.length, checked: shown === eligible.length && eligible.length > 0,
          onchange: (e) => setHidden(eligible.map((p) => p.id), !e.target.checked) });
        gbox.indeterminate = shown > 0 && shown < eligible.length;
        const head = h('div', { class: 'dev-group' }, gbox, h('span', {}, g.group),
          arrows(async () => { await save({ order: moveGroup(found, s, key, g.group, -1) }); redraw('devices'); },
            async () => { await save({ order: moveGroup(found, s, key, g.group, +1) }); redraw('devices'); }, gi === 0, gi === groups.length - 1));
        const ports = g.ports.map((p, pi) => h('div', { class: `dev-port${p.hiddenByUser || p.hiddenByCategory ? ' off' : ''}` },
          h('input', { type: 'checkbox', 'aria-label': `${t('devices.show')}: ${p.label || p.name}`, disabled: p.hiddenByCategory, checked: !p.hiddenByUser && !p.hiddenByCategory,
            onchange: (e) => setHidden([p.id], !e.target.checked) }),
          h('span', {}, p.label ? `${p.label} (${p.name})` : p.name, p.default ? ' ●' : '', p.hiddenByCategory ? ` · ${t('devices.hiddenTransmit')}` : ''),
          arrows(async () => { await save({ order: movePort(found, s, key, p.id, -1) }); redraw('devices'); },
            async () => { await save({ order: movePort(found, s, key, p.id, +1) }); redraw('devices'); }, pi === 0, pi === g.ports.length - 1)));
        return h('div', {}, head, ports);
      });
      return [h('h3', {}, title), ...blocks];
    };
    const labels = Object.entries(s.labels);
    const nameOf = (id) => { const p = portById.get(id); return p ? `${p.group} · ${p.name}` : id; };
    content = [h('p', { class: 'dim' }, t('devices.intro')),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: s.showNetworkTransmit, onchange: async (e) => { await save({ showNetworkTransmit: e.target.checked }); redraw('devices'); } }), h('span', {}, t('devices.showTransmit'))),
      h('p', { class: 'dim' }, t('devices.orderHelp')),
      ...side('sources', t('devices.sources')), ...side('destinations', t('devices.outputs')),
      h('h3', {}, t('devices.labelsTitle')),
      labels.length ? h('ul', { class: 'list' }, labels.map(([id, name]) => h('li', {}, h('span', {}, `${nameOf(id)} → ${name}`)))) : h('p', { class: 'dim' }, t('devices.noLabels')),
      labels.length ? h('button', { class: 'btn', type: 'button', onclick: async () => { await save({ labels: {} }); redraw('devices'); } }, t('devices.clearLabels')) : null];
  } else {
    const info = h('dl', { class: 'kv' });
    const link = (key, url) => h('button', { class: 'btn', type: 'button', onclick: () => api.links.open(url) }, t(key));
    const copied = h('span', { class: 'dim', role: 'status' });
    const tip = () => api.links.open(SUPPORT_URLS[s.language] || SUPPORT_URLS.en);
    content = [info,
      h('p', { class: 'dim' }, t('about.privacy')),
      h('div', { class: 'row-actions' },
        h('button', { class: 'btn', type: 'button', onclick: async () => { await api.clipboard.write(await api.app.supportInfo()); copied.textContent = t('about.copied'); } }, t('about.copySupport')),
        h('button', { class: 'btn', type: 'button', onclick: () => api.app.openLogs() }, t('about.openLogs')), copied),
      h('h3', {}, t('about.links')),
      h('div', { class: 'row-actions' }, link('about.toolPage', 'https://onairgarage.com/tools/audio-monitor-router/'),
        link('about.releases', 'https://github.com/djgragra/audio-monitor-router/releases'), link('about.mail', 'mailto:hello@onairgarage.com')),
      h('p', { class: 'dim' }, t('about.unsigned')), h('p', { class: 'dim' }, t('about.credits')),
      h('aside', { class: 'tip-card' }, h('img', { class: 'tip-jar', src: 'img/tip-jar.png', alt: '', 'aria-hidden': 'true', onclick: tip }),
        h('div', { class: 'tip-body' }, h('p', { class: 'tip-text' }, t('tip.text')), h('button', { class: 'tip-pill', type: 'button', onclick: tip }, t('tip.btn'))))];
    api.app.info().then((i) => {
      info.replaceChildren(h('dt', {}, t('about.version')), h('dd', {}, i.version), h('dt', {}, t('about.system')), h('dd', {}, i.system), h('dt', {}, t('about.license')), h('dd', {}, t('about.licenseValue')));
    });
  }

  box.replaceChildren(h('div', { class: 'panel' }, h('h2', { id: 'settingsTitle' }, t('settings.title')),
    h('div', { class: 'tabs', role: 'tablist' }, tabs), ...content,
    h('div', { class: 'row-actions' }, h('button', { class: 'btn', type: 'button', onclick: close }, t('settings.close')))));
}
