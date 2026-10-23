// Builds what the interface shows from what the engine found on this machine plus the user's settings.
// A device that is not there is not shown; its settings are kept and apply again if it comes back.

const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

/**
 * Outputs of a network audio card that only SEND audio to the network (Dante Virtual Soundcard "Transmit" pairs):
 * there is nothing to listen to there. Known product behaviour, not a device of one machine: hidden by default,
 * the user can show them in Settings.
 */
export const isNetworkTransmit = (p) => p.kind === 'output' && /dante virtual soundcard/i.test(p.group || '');

const emptyOrder = () => ({ groups: [], ports: [] });

/** Groups in the user's order (the others after, in the order the system listed them); ports likewise, then by name with numbers in numeric order. */
function arrange(ports, order = emptyOrder()) {
  const firstSeen = [];
  for (const p of ports) if (!firstSeen.includes(p.group)) firstSeen.push(p.group);
  const rank = (list, key, fallback) => (list.includes(key) ? list.indexOf(key) : list.length + fallback);
  const groups = [...firstSeen].sort((a, b) => rank(order.groups, a, firstSeen.indexOf(a)) - rank(order.groups, b, firstSeen.indexOf(b)));
  return groups.map((group) => {
    const own = ports.filter((p) => p.group === group);
    own.sort((a, b) => {
      const ia = order.ports.indexOf(a.id);
      const ib = order.ports.indexOf(b.id);
      if (ia >= 0 && ib >= 0) return ia - ib;
      if (ia >= 0) return -1;
      if (ib >= 0) return 1;
      return collator.compare(a.name, b.name);
    });
    return { group, ports: own };
  });
}

/** Every port with its visibility, in display order. Used by the matrix and by Settings → Devices. */
export function describe(found, settings) {
  const used = new Set(Object.entries(settings.routes).flatMap(([d, s]) => [d, s]));
  const side = (ports, order) => arrange(ports, order).map((g) => ({
    group: g.group,
    ports: g.ports.map((p) => {
      const byUser = settings.hidden.includes(p.id);
      const byCategory = isNetworkTransmit(p) && !settings.showNetworkTransmit;
      return {
        id: p.id, name: p.name, group: p.group, kind: p.kind, channels: p.channels, default: !!p.default,
        label: settings.labels[p.id] || '',
        hiddenByUser: byUser, hiddenByCategory: byCategory,
        // a port a route is using stays visible, so the user can see what is playing
        visible: used.has(p.id) || (!byUser && !byCategory),
      };
    }),
  }));
  return { sources: side(found.sources, settings.order.sources), destinations: side(found.destinations, settings.order.destinations) };
}

const visibleOnly = (groups) => groups.map((g) => ({ group: g.group, ports: g.ports.filter((p) => p.visible) })).filter((g) => g.ports.length);

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
  const d = describe(found, settings);
  return { rows: visibleOnly(d.sources), columns: visibleOnly(d.destinations), active, dormant };
}

/** One source per destination: choosing a source for a destination replaces the old one. */
export function setRoute(settings, destination, source) {
  const routes = { ...settings.routes };
  if (source == null) delete routes[destination];
  else routes[destination] = source;
  return { ...settings, routes };
}

// ---- the user's order: always saved in full, so it does not change when a device comes or goes ----
function withFullOrder(found, settings, side) {
  const g = describe(found, settings)[side];
  return { groups: g.map((x) => x.group), ports: g.flatMap((x) => x.ports.map((p) => p.id)) };
}

function swap(list, i, delta) {
  const j = i + delta;
  if (i < 0 || j < 0 || j >= list.length) return list;
  const out = [...list];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

/** Moves a whole card up (-1) or down (+1). `side` is 'sources' or 'destinations'. Returns the new `order` setting. */
export function moveGroup(found, settings, side, group, delta) {
  const full = withFullOrder(found, settings, side);
  return { ...settings.order, [side]: { ...full, groups: swap(full.groups, full.groups.indexOf(group), delta) } };
}

/** Moves one port inside its card. */
export function movePort(found, settings, side, portId, delta) {
  const full = withFullOrder(found, settings, side);
  const g = describe(found, settings)[side].find((x) => x.ports.some((p) => p.id === portId));
  if (!g) return settings.order;
  const ids = g.ports.map((p) => p.id);
  const moved = swap(ids, ids.indexOf(portId), delta);
  const others = full.ports.filter((id) => !ids.includes(id));
  return { ...settings.order, [side]: { groups: full.groups, ports: [...others, ...moved] } };
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

/**
 * Could routing `src` to `dst` send audio back into where it came from? Cards are the nodes and every route is an
 * arrow from the card of its source to the card of its destination; a closed circle (an input of a card fed by an
 * output of the same card, or by a chain that comes back to it) can make a loop, for example through a virtual cable.
 * It is only a warning: an interface that monitors its own inputs is fine, so the user decides.
 */
export function wouldLoop(found, routes, destination, source) {
  const group = new Map([...found.sources, ...found.destinations].map((p) => [p.id, p.group]));
  const from = group.get(source);
  const to = group.get(destination);
  if (from === undefined || to === undefined) return false;
  if (from === to) return true;
  const edges = new Map();
  for (const [d, sId] of Object.entries(routes)) {
    if (d === destination) continue;                      // this destination is about to change source
    const a = group.get(sId);
    const b = group.get(d);
    if (a === undefined || b === undefined) continue;
    if (!edges.has(a)) edges.set(a, new Set());
    edges.get(a).add(b);
  }
  const seen = new Set();
  const stack = [to];                                     // is there a way back from the destination card to the source card?
  while (stack.length) {
    const g = stack.pop();
    if (g === from) return true;
    if (seen.has(g)) continue;
    seen.add(g);
    for (const next of edges.get(g) || []) stack.push(next);
  }
  return false;
}
