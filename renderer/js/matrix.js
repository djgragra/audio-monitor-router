// Builds what the interface shows from what the engine found on this machine plus the user's settings.
// A device that is not there is not shown; its settings are kept and apply again if it comes back.

function groupPorts(ports, settings, activeIds) {
  const groups = new Map();
  for (const p of ports) {
    // A hidden port stays visible while a route uses it, so the user can see what is playing.
    if (settings.hidden.includes(p.id) && !activeIds.has(p.id)) continue;
    if (!groups.has(p.group)) groups.set(p.group, []);
    groups.get(p.group).push({
      id: p.id,
      name: p.name,
      label: settings.labels[p.id] || '',
      channels: p.channels,
    });
  }
  return [...groups].map(([group, list]) => ({ group, ports: list }));
}

/**
 * @param {{sources: object[], destinations: object[]}} found  ports from the engine
 * @param {object} settings  normalized settings
 * @returns rows (sources), columns (destinations), active routes, dormant routes
 */
export function buildMatrix(found, settings) {
  const srcIds = new Set(found.sources.map((p) => p.id));
  const dstIds = new Set(found.destinations.map((p) => p.id));
  const active = [];
  const dormant = [];
  for (const [dst, src] of Object.entries(settings.routes)) {
    (srcIds.has(src) && dstIds.has(dst) ? active : dormant).push({ destination: dst, source: src });
  }
  const usedSrc = new Set(active.map((r) => r.source));
  const usedDst = new Set(active.map((r) => r.destination));
  return {
    rows: groupPorts(found.sources, settings, usedSrc),
    columns: groupPorts(found.destinations, settings, usedDst),
    active,
    dormant,
  };
}

/** One source per destination: choosing a source for a destination replaces the old one. */
export function setRoute(settings, destination, source) {
  const routes = { ...settings.routes };
  if (source == null) delete routes[destination];
  else routes[destination] = source;
  return { ...settings, routes };
}

/** Volume slider (0..100) to linear gain: a squared curve feels more natural than a straight one. */
export const DEFAULT_VOLUME = 80;
export const gainFromVolume = (v) => ((Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : DEFAULT_VOLUME) / 100) ** 2;

/**
 * What to tell the engine so that it matches the wanted routes.
 * running: { destination: source } as the engine reports; active: [{destination, source}].
 * A destination that already plays another source is started again (the engine replaces it).
 */
export function syncPlan(running, active) {
  const want = new Map(active.map((r) => [r.destination, r.source]));
  return {
    start: active.filter((r) => running[r.destination] !== r.source),
    stop: Object.keys(running).filter((d) => !want.has(d)),
  };
}
