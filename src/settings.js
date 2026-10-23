// User settings. Everything here is the user's choice: nothing comes from a default machine.
export const DEFAULTS = Object.freeze({
  version: 1,
  language: 'en',      // the app always opens in English until the user chooses
  theme: 'dark',
  labels: {},          // port id -> custom name
  hidden: [],          // port ids the user does not want to see
  routes: {},          // destination port id -> source port id
  volumes: {},         // destination port id -> 0..100
});

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

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
  };
}
