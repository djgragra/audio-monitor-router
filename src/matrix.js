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

/** What to tell the engine so that it matches the wanted routes. */
export function diffRoutes(running, wanted) {
  const key = (r) => `${r.destination}\u0000${r.source}`;
  const have = new Set(running.map(key));
  const want = new Set(wanted.map(key));
  return {
    start: wanted.filter((r) => !have.has(key(r))),
    stop: running.filter((r) => !want.has(key(r))),
  };
}
