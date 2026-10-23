// Settings file: written under a temporary name and renamed, so a crash never leaves half a file.
import fs from 'node:fs';
import path from 'node:path';
import { normalize } from './settings.js';

export function createStore(file) {
  let data;
  try {
    data = normalize(JSON.parse(fs.readFileSync(file, 'utf8')));
  } catch {
    data = normalize({});
  }

  function save() {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, file);
  }

  return {
    get: () => data,
    /** Merges the given keys, cleans the result and writes it only if something changed. */
    update(patch) {
      const next = normalize({ ...data, ...patch });
      if (JSON.stringify(next) !== JSON.stringify(data)) {
        data = next;
        save();
      }
      return data;
    },
    file,
  };
}
