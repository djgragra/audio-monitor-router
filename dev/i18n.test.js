import test from 'node:test';
import assert from 'node:assert/strict';
import { TEXT, LANGS, t } from '../renderer/js/i18n.js';
import { SUPPORT } from '../src/links.js';

const keys = (l) => Object.keys(TEXT[l]).sort();
const vars = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');

test('the three languages have exactly the same keys and the same {placeholders}', () => {
  for (const l of LANGS) assert.deepEqual(keys(l), keys('en'), `keys of ${l}`);
  for (const k of keys('en')) for (const l of LANGS) assert.equal(vars(TEXT[l][k]), vars(TEXT.en[k]), `${l} ${k}`);
});

test('no text is empty, and Italian keeps the agreed wording of the tip box', () => {
  for (const l of LANGS) for (const [k, v] of Object.entries(TEXT[l])) assert.ok(v.trim(), `${l} ${k}`);
  assert.equal(TEXT.en['tip.btn'], 'Tip jar');
  assert.equal(TEXT.it['tip.btn'], 'Salvadanaio');
  assert.equal(TEXT.es['tip.btn'], 'Hucha');
  assert.equal(TEXT.it['tip.text'], 'Ti è utile? Un caffè per i meccanici è sempre ben accetto.');
});

test('t() fills placeholders and falls back to English', () => {
  assert.equal(t('en', 'matrix.cell', { src: 'A', dst: 'B' }), 'Listen to A on B');
  assert.equal(t('xx', 'tip.btn'), 'Tip jar');
});

test('the tip box has a support page for every language', () => {
  for (const l of LANGS) assert.ok(SUPPORT[l]);
});

test('the page and the main process list the same support addresses', async () => {
  const { SUPPORT_URLS } = await import('../renderer/js/links.js');
  assert.deepEqual(SUPPORT_URLS, SUPPORT);
});
