// The settings overlay: General, Devices, Help & About.
import { LANGS } from './i18n.js';
import { SUPPORT_URLS } from './links.js';

export function renderSettings(box, ctx) {
  const { state, t, h, api, tab, save, redraw, close, found } = ctx;
  const s = state.settings;
  const portById = new Map([...found.sources, ...found.destinations].map((p) => [p.id, p]));
  const nameOf = (id) => (portById.get(id) ? `${portById.get(id).group} · ${portById.get(id).name}` : id);

  const tabs = ['general', 'devices', 'about'].map((k) =>
    h('button', { class: 'tab', type: 'button', role: 'tab', 'aria-selected': String(k === tab), onclick: () => redraw(k) }, t(`tab.${k}`)));

  let content;
  if (tab === 'general') {
    const lang = h('select', { id: 'selLang', onchange: async (e) => { await save({ language: e.target.value }); redraw('general'); } },
      LANGS.map((l) => h('option', { value: l, selected: l === s.language }, { en: 'English', it: 'Italiano', es: 'Español' }[l])));
    const theme = h('select', { id: 'selTheme', onchange: async (e) => { await save({ theme: e.target.value }); redraw('general'); } },
      ['dark', 'light', 'system'].map((k) => h('option', { value: k, selected: k === s.theme }, t(`theme.${k}`))));
    content = [h('div', { class: 'field' }, h('label', { for: 'selLang' }, t('general.language')), lang),
      h('div', { class: 'field' }, h('label', { for: 'selTheme' }, t('general.theme')), theme)];
  } else if (tab === 'devices') {
    const hidden = s.hidden.map((id) => h('li', {}, h('span', {}, nameOf(id)),
      h('button', { class: 'btn', type: 'button', onclick: async () => { await save({ hidden: s.hidden.filter((x) => x !== id) }); redraw('devices'); } }, t('devices.show'))));
    const labels = Object.entries(s.labels);
    content = [h('p', { class: 'dim' }, t('devices.intro')),
      h('h3', {}, t('devices.hiddenTitle')), hidden.length ? h('ul', { class: 'list' }, hidden) : h('p', { class: 'dim' }, t('devices.none')),
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
