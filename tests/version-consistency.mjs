import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(resolve(root, 'manifest.json'), 'utf8'));
const uiVersion = readFileSync(resolve(root, 'src/version.js'), 'utf8');
const match = uiVersion.match(/export const NASTYTAVERN_VERSION = '([^']+)'/);
assert.ok(match, 'UI version constant is missing');
assert.equal(match[1], manifest.version, 'UI version must match installed manifest');
for (const file of ['home-dashboard.js', 'about-panel.js', 'health-panel.js']) {
    const source = readFileSync(resolve(root, 'src', file), 'utf8');
    assert.match(source, /NASTYTAVERN_VERSION/, `${file} must use the shared version`);
    assert.doesNotMatch(source, /v?0\.1\.12/, `${file} must not hard-code the previous version`);
}
const shell = readFileSync(resolve(root, 'src/shell.js'), 'utf8');
assert.doesNotMatch(shell, /mt-brand-version|NASTYTAVERN_VERSION/, 'Sidebar header must not show a version number');
assert.match(shell, /<span class="mt-brandmark">/, 'Sidebar logo must remain');
assert.match(shell, /<b>NastyTavern<\/b><small>SillyTavern UI<\/small>/, 'Sidebar title and subtitle must remain');
console.log(`PASS: UI version labels match manifest v${manifest.version} (revision ${manifest.revision}); sidebar header has no version`);
