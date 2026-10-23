// Window size and position, remembered between runs. A saved position is used only if it is still on a screen
// (a monitor may have been unplugged since).
import fs from 'node:fs';
import path from 'node:path';

const num = (v) => Number.isFinite(v);

export function loadBounds(file) {
  try {
    const b = JSON.parse(fs.readFileSync(file, 'utf8'));
    return num(b.width) && num(b.height) && b.width >= 300 && b.height >= 200 ? b : null;
  } catch {
    return null;
  }
}

export function saveBounds(file, b) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ x: b.x, y: b.y, width: b.width, height: b.height }));
    fs.renameSync(tmp, file);
  } catch { /* remembering the window is a convenience */ }
}

/** displays: [{x, y, width, height}] work areas. Returns the bounds to use, without a position if it is off screen. */
export function fitBounds(b, displays) {
  if (!b) return null;
  const size = { width: b.width, height: b.height };
  if (!num(b.x) || !num(b.y)) return size;
  const cx = b.x + b.width / 2;
  const cy = b.y + Math.min(b.height, 80) / 2;           // the title bar is what the user needs to be able to reach
  const visible = displays.some((d) => cx >= d.x && cx < d.x + d.width && cy >= d.y && cy < d.y + d.height);
  return visible ? { ...size, x: b.x, y: b.y } : size;
}
