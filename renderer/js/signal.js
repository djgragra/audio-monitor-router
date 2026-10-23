// Which sources have audio: the engine sends the peak level of every watched source; a source counts as "on" while
// it has been above the threshold within the last `holdMs` (a speech pause or a flicker must not blink the icon).
export const THRESHOLD_DB = -60;
export const HOLD_MS = 800;

export function createSignalTracker({ threshold = THRESHOLD_DB, holdMs = HOLD_MS } = {}) {
  const lastAbove = new Map();   // port id -> time of the last level above the threshold
  const known = new Set();       // ports the engine has reported at least once

  return {
    update(levels, now) {
      for (const [id, db] of Object.entries(levels)) {
        known.add(id);
        if (db > threshold) lastAbove.set(id, now);
      }
    },
    /** true: audio, false: silence, null: the engine has not reported this source (not watched, or the device refuses). */
    state(id, now) {
      if (!known.has(id)) return null;
      return lastAbove.has(id) && now - lastAbove.get(id) <= holdMs;
    },
    /** The engine restarted or the list of watched sources changed: forget what is no longer watched. */
    keepOnly(ids) {
      const keep = new Set(ids);
      for (const id of [...known]) if (!keep.has(id)) { known.delete(id); lastAbove.delete(id); }
    },
  };
}
