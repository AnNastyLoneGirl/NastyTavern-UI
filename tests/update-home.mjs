import assert from 'node:assert/strict';
import { HomeDashboard } from '../src/home-dashboard.js';
const home = new HomeDashboard();
assert.equal(home.updateChecking, false);
const noUpdate = home.renderUpdateNotice({ state: 'current', localVersion: '0.1.13', latestVersion: '0.1.13', nativeManaged: true, changes: [] });
assert.match(noUpdate, /data-nt-home-action="check-update"/);
assert.doesNotMatch(noUpdate, /data-nt-home-action="update-now"/);
const available = home.renderUpdateNotice({ state: 'available', localVersion: '0.1.12', latestVersion: '0.1.13', nativeManaged: true, changes: [] });
assert.match(available, /data-nt-home-action="update-now"/);
assert.match(available, /data-nt-home-action="check-update"/);
const manual = home.renderUpdateNotice({ state: 'available', localVersion: '0.1.12', latestVersion: '0.1.13', nativeManaged: false, changes: [] });
assert.match(manual, /Download update/);
assert.doesNotMatch(manual, /data-nt-home-action="update-now"/);
home.updateChecking = true;
const busy = home.renderUpdateNotice({ state: 'current', localVersion: '0.1.12', latestVersion: '0.1.12', changes: [] });
assert.match(busy, /data-nt-home-action="check-update" disabled aria-busy="true"/);
console.log('PASS: Home check-again action, Git update, manual download, busy state');

home.updateChecking = false;
const outdatedSnapshot = home.renderUpdateNotice({
  state: 'remote-behind', localVersion: '0.1.14', latestVersion: '0.1.14',
  remoteVersion: '0.1.13', changes: [{ category: 'Revision 112', text: 'Native icons restored' }],
});
assert.match(outdatedSnapshot, /NastyTavern v0\.1\.14/);
assert.match(outdatedSnapshot, /GitHub returned an older build/);
assert.doesNotMatch(outdatedSnapshot, /Latest on GitHub/);
assert.match(outdatedSnapshot, /Native icons restored/);
console.log('PASS: older raw GitHub snapshots are never labelled as up to date');
