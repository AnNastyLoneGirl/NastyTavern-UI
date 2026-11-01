// Keep the published format compatible with update-checker.js shipped in v0.1.13.
// That already-installed code cannot be modified by a newer release.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(resolve(root, 'manifest.json'), 'utf8'));
const changelog = readFileSync(resolve(root, 'CHANGELOG.md'), 'utf8');
assert.equal(manifest.version, '0.1.14');
assert(manifest.revision >= 114);
const oldVersionParts = value => String(value).replace(/^v/i, '').split('.').map(Number);
const newer = (a, b) => oldVersionParts(a).some((part, i) => part !== oldVersionParts(b)[i] && part > oldVersionParts(b)[i] && oldVersionParts(a).slice(0,i).every((n,j) => n === oldVersionParts(b)[j]));
assert(newer(manifest.version, '0.1.13'), 'Older clients must see a newer semantic version');
let current = null, category = '', results = [];
for (const raw of changelog.replace(/\r\n?/g, '\n').split('\n')) {
  // The exact v0.1.13 release-header pattern (does not support revision suffixes).
  const header = raw.match(/^##\s+v?(\d+(?:\.\d+){1,2}(?:[-+][^\s]+)?)\s*$/i);
  if (header) { current = header[1]; category = ''; continue; }
  const sub = raw.match(/^###\s+(.+?)\s*$/);
  if (sub) { category = sub[1]; continue; }
  const bullet = raw.match(/^\s*-\s+(.+?)\s*$/);
  if (bullet && current === manifest.version) results.push({category, body: bullet[1]});
}
assert(results.length >= 18, `Legacy updater only found ${results.length} entries`);
for (const rev of [110,111,112,113,114]) {
  assert(results.some(x => x.category.includes(`revision ${rev}`)), `Legacy updater missed revision ${rev}`);
}
assert.equal((changelog.match(/^## v0\.1\.14\s*$/gm) || []).length, 1, 'Use exactly one v0.1.14 release heading');
console.log(`PASS: legacy 0.1.13 updater recognizes 0.1.14 rev${manifest.revision} and ${results.length} changelog entries`);
