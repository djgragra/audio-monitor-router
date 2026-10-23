// User settings. Everything here is the user's choice: nothing comes from a default machine.
export const DEFAULTS = Object.freeze({
  version: 1,
  language: 'en',      // the app always opens in English until the user chooses
  theme: 'dark',
  labels: {},          // port id -> custom name
  hidden: [],          // port ids the user does not want to see
  routes: {},          // destination port id -> source port id
  volumes: {},         // destination port id -> 0..100
  latency: 'normal',   // buffer between two sound cards: 'low' 30 ms, 'normal' 60 ms, 'safe' 120 ms
  channels: {},        // destination port id -> { muteLeft, muteRight, mono }
  showSignal: true,    // light a speaker next to the sources that have audio
  startAtLogin: false, // start hidden when the user signs in
  closeToTray: true,   // closing the window keeps the app running in the notification area
  trayNoticeShown: false,
  showNetworkTransmit: false, // show the outputs that only send audio to the network (Dante transmit pairs)
  order: { sources: { groups: [], ports: [] }, destinations: { groups: [], ports: [] } }, // the user's order
});

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

const strings = (a) => (Array.isArray(a) ? [...new Set(a.filter((x) => typeof x === 'string'))] : []);
const order = (o) => ({ groups: strings(o?.groups), ports: strings(o?.ports) });

/** Accepts anything read from disk or from a backup and returns valid settings. */
export function normalize(raw) {
  const s = isObj(raw) ? raw : {};
  const pick = (o, test) => Object.fromEntries(Object.entries(isObj(o) ? o : {}).filter(([k, v]) => test(k, v)));
  return {
    version: 1,
    language: ['en', 'it', 'es'].includes(s.language) ? s.language : DEFAULTS.language,
    theme: ['dark', 'light', 'system'].includes(s.theme) ? s.theme : DEFAULTS.theme,
    labels: pick(s.labels, (k, v) => typeof v === 'string' && v.trim() !== ''),
    hidden: Array.isArray(s.hidden) ? [...new Set(s.hidden.filter((x) => typeof x === 'string'))] : [],
    routes: pick(s.routes, (k, v) => typeof v === 'string'),
    volumes: pick(s.volumes, (k, v) => Number.isFinite(v) && v >= 0 && v <= 100),
    latency: ['low', 'normal', 'safe'].includes(s.latency) ? s.latency : DEFAULTS.latency,
    channels: Object.fromEntries(Object.entries(isObj(s.channels) ? s.channels : {}).filter(([, v]) => isObj(v)).map(([k, v]) => [k, { muteLeft: v.muteLeft === true, muteRight: v.muteRight === true, mono: v.mono === true }])),
    showSignal: s.showSignal !== false,
    startAtLogin: s.startAtLogin === true,
    closeToTray: s.closeToTray !== false,
    trayNoticeShown: s.trayNoticeShown === true,
    showNetworkTransmit: s.showNetworkTransmit === true,
    order: { sources: order(s.order?.sources), destinations: order(s.order?.destinations) },
  };
}
