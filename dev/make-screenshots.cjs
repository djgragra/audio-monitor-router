// Takes the screenshots in docs/screenshots with the interface in Chromium and a stand-in engine: invented devices only.
// Run: node dev/make-screenshots.cjs   (needs Playwright with a Chromium; set CHROMIUM to its path if not found)
const path = require('path');
const root = path.resolve(__dirname, '..');
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const mk = (id, group, name, kind, def = false) => ({ id, group, name, kind, channels: [0, 1], device_channels: 2, default: def });
const sources = [
  mk('n1', 'Network Card', 'Network Receive 1-2', 'input'), mk('n2', 'Network Card', 'Network Receive 3-4', 'input'),
  mk('n3', 'Network Card', 'Network Receive 5-6', 'input'), mk('n4', 'Network Card', 'Network Receive 7-8', 'input'),
  mk('s1', 'Studio Interface', 'IN 1-2', 'input', true), mk('s2', 'Studio Interface', 'IN 3-4', 'input'),
  mk('m1', 'USB Microphone', 'Microphone', 'input'),
];
const dests = [
  mk('o1', 'Studio Interface', 'OUT 1-2', 'output', true), mk('o2', 'Studio Interface', 'OUT 3-4', 'output'),
  mk('h1', 'Monitor Display', 'Display Audio', 'output'), mk('h2', 'Onboard Audio', 'Speakers', 'output'),
  mk('h3', 'Onboard Audio', 'Headphones', 'output'),
];
const labels = { n1: 'News desk', n2: 'Talk studio', n3: 'Music mix', n4: 'Phone line', s1: 'Console', m1: 'Guest mic', o1: 'Control room', o2: 'Cue speakers', h2: 'Desk speakers', h3: 'Producer headphones' };
const levels = { n1: -18, n2: -90, n3: -24, n4: -90, s1: -30, s2: -90, m1: -90, o1: -16, o2: -90, h1: -90, h2: -22, h3: -90 };

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM, args: ['--no-sandbox', '--allow-file-access-from-files'] });
  const shot = async (name, { theme = 'dark', lang = 'en', action, width = 1280, height = 800 } = {}) => {
    const p = await b.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    await p.addInitScript(({ sources, dests, labels, theme, lang }) => {
      let settings = { version: 1, language: lang, theme, labels, hidden: [], routes: { o1: 'n1', h2: 'n3', o2: 's1' }, volumes: { o1: 80, h2: 60 },
        channels: { h2: { muteLeft: false, muteRight: true, mono: false }, o2: { muteLeft: false, muteRight: false, mono: true } },
        latency: 'normal', showSignal: true, startAtLogin: false, closeToTray: true, trayNoticeShown: true, showNetworkTransmit: false,
        order: { sources: { groups: [], ports: [] }, destinations: { groups: [], ports: [] } } };
      let cb = () => {};
      window.__emit = (e) => cb(e);
      window.api = {
        settings: { get: async () => settings, update: async (patch) => (settings = { ...settings, ...patch }) },
        engine: { send: (c) => { if (c.cmd === 'list_devices') setTimeout(() => cb({ event: 'devices', sources, destinations: dests }), 20); }, onEvent: (f) => { cb = f; } },
        links: { open: async () => true }, clipboard: { write: async () => true },
        app: { info: async () => ({ version: '1.0.0', system: 'win32 x64' }), supportInfo: async () => '', openLogs: async () => {} },
      };
    }, { sources, dests, labels, theme, lang });
    await p.goto('file://' + path.join(root, 'renderer/index.html'));
    await p.waitForSelector('.cell');
    await p.evaluate((lv) => window.__emit({ event: 'signal', levels: lv }), levels);
    if (action) await action(p);
    await p.waitForTimeout(400);
    await p.screenshot({ path: path.join(root, 'docs/screenshots', name) });
    await p.close();
  };
  await shot('01-matrix.png', {});
  await shot('02-matrix-light-it.png', { theme: 'light', lang: 'it' });
  await shot('03-settings-devices.png', { action: async (p) => { await p.click('#btnSettings'); await p.click('button.tab:nth-child(2)'); } });
  await shot('04-settings-general.png', { action: async (p) => { await p.click('#btnSettings'); } });
  await b.close();
})();
