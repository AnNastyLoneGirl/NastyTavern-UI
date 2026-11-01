import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const actualManifest = JSON.parse(readFileSync(resolve(root, 'manifest.json'), 'utf8'));
let localManifest = { ...actualManifest, version: '0.1.12', revision: 102 };
let publishedManifest = { ...actualManifest, version: '0.1.13', revision: 106 };
let firstResultManifest = { ...actualManifest, version: '0.1.12', revision: 102 };
const requests = [];
let remoteIsNew = false;
let localChangelogText = '## v0.1.12\n### Fixed\n- Earlier release';
let remoteChangelogText = '## v0.1.13\n### Fixed\n- New update detection';
let nativeManaged = true;
const cache = new Map();
globalThis.sessionStorage = {
  getItem: key => cache.get(key) ?? null,
  setItem: (key, value) => cache.set(key, value),
};
globalThis.window = { SillyTavern: { getContext: () => ({ getRequestHeaders: () => ({ 'Content-Type': 'application/json' }) }) } };
const response = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: new Headers({ 'content-type': typeof body === 'string' ? 'text/plain' : 'application/json' }),
  json: async () => body,
  text: async () => typeof body === 'string' ? body : JSON.stringify(body),
});
globalThis.fetch = async (url, options = {}) => {
  const target = String(url);
  requests.push({ target, options });
  if (target.includes('/api/extensions/version')) return nativeManaged ? response({ isUpToDate: false }) : response('missing', 404);
  if (target.includes('raw.githubusercontent.com') && target.includes('/manifest.json')) {
    assert.match(target, /[?&]nt_check=/, 'remote manifest requires a cache-busting query parameter');
    assert.equal(options.cache, 'no-store');
    return response(remoteIsNew ? publishedManifest : firstResultManifest);
  }
  if (target.includes('raw.githubusercontent.com') && target.includes('/CHANGELOG.md')) {
    assert.match(target, /[?&]nt_check=/, 'remote changelog requires a cache-busting query parameter');
    return response(remoteIsNew ? remoteChangelogText : '## v0.1.12\n### Fixed\n- Earlier release');
  }
  if (target.endsWith('/manifest.json')) return response(localManifest);
  if (target.endsWith('/CHANGELOG.md')) return response(localChangelogText);
  throw new Error(`Unexpected request ${target}`);
};
const { getNastyTavernUpdateInfo, compareVersions } = await import('../src/update-checker.js');
assert.equal(compareVersions('0.1.13', '0.1.12'), 1);
assert.equal(compareVersions('0.1.12', '0.1.13'), -1);
assert.equal(compareVersions('0.1.13', '0.1.13'), 0);

const first = await getNastyTavernUpdateInfo();
assert.equal(first.state, 'current', 'initial published version is the same');
remoteIsNew = true;
const cached = await getNastyTavernUpdateInfo();
assert.equal(cached.state, 'current', 'automatic checks can reuse the 15-minute session cache');
const fresh = await getNastyTavernUpdateInfo({ force: true });
assert.equal(fresh.state, 'available', 'manual refresh must find the new GitHub version');
assert.equal(fresh.latestVersion, '0.1.13');
assert.equal(fresh.latestRevision, 106);
assert.equal(fresh.nativeManaged, true);
assert.equal(fresh.changes[0].text, 'New update detection');
const remoteRequests = requests.filter(item => item.target.includes('raw.githubusercontent.com'));
const urls = remoteRequests.map(item => item.target);
assert.equal(new Set(urls).size, urls.length, 'every network check uses a fresh remote URL');

nativeManaged = false;
const nongit = await getNastyTavernUpdateInfo({ force: true });
assert.equal(nongit.state, 'available', 'non-Git installs must still see the available release');
assert.equal(nongit.nativeManaged, false, 'the UI must avoid offering automatic Git update to manual installs');
console.log('PASS: v0.1.12 -> v0.1.13 detection, bypass cache, changelog, force refresh, non-Git installs');

// A recently published local build must not appear to be older than an
// out-of-date GitHub raw-content snapshot, nor show the old release notes.
localManifest = { ...actualManifest, version: '0.1.14', revision: 113 };
firstResultManifest = { ...actualManifest, version: '0.1.13', revision: 106 };
localChangelogText = [
  '# NastyTavern UI — Changelog',
  '## 0.1.14 — revision 113',
  '- New release-note parser',
  '## 0.1.14 — revision 112',
  '- Native icons restored',
  '## 0.1.14 — revision 111',
  '- Native World Info button',
  '## v0.1.14',
  '### Lorebooks',
  '- Global lorebook persistence',
  '## v0.1.13',
  '- Previous release',
].join('\n');
remoteIsNew = false;
const oldSnapshot = await getNastyTavernUpdateInfo({ force: true });
assert.equal(oldSnapshot.state, 'remote-behind');
assert.equal(oldSnapshot.remoteBehind, true);
assert.equal(oldSnapshot.remoteVersion, '0.1.13');
assert.equal(oldSnapshot.latestVersion, '0.1.14', 'display local build instead of older GitHub snapshot');
assert.equal(oldSnapshot.latestRevision, 113);
assert.equal(oldSnapshot.changes.length, 4, 'all local revision sections and standard release notes are visible');
assert.deepEqual(oldSnapshot.changes.map(item => item.category), ['Revision 113', 'Revision 112', 'Revision 111', 'Lorebooks']);

publishedManifest = localManifest;
remoteChangelogText = localChangelogText;
remoteIsNew = true;
const synchronized = await getNastyTavernUpdateInfo({ force: true });
assert.equal(synchronized.state, 'current');
assert.equal(synchronized.latestVersion, '0.1.14');
assert.equal(synchronized.changes.length, 4);
assert.equal(synchronized.changes[0].text, 'New release-note parser');
assert.equal(synchronized.changes[1].text, 'Native icons restored');
assert.equal(synchronized.changes[2].text, 'Native World Info button');
assert.equal(synchronized.changes[3].text, 'Global lorebook persistence');
console.log('PASS: v0.1.14 revision headings and older GitHub snapshot fallbacks');
