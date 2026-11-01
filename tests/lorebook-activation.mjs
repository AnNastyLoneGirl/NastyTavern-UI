import assert from 'node:assert/strict';
import { LorebookActivation } from '../src/lorebook-activation.js';

const settings = { lorebookStudio: { disabledBooks: [] } };
let listener = null;
let registered = 0;
let unregistered = 0;
let savedSettings = 0;
globalThis.window = { SillyTavern: { getContext: () => ({
    eventTypes: { WORLDINFO_ENTRIES_LOADED: 'world-info:loaded' },
    saveSettingsDebounced() { savedSettings++; },
    eventSource: {
        on(type, handler) { assert.equal(type, 'world-info:loaded'); listener = handler; registered++; },
        removeListener(type, handler) { assert.equal(type, 'world-info:loaded'); assert.equal(handler, listener); listener = null; unregistered++; },
    },
}) } };
const activation = new LorebookActivation(settings);
assert.equal(activation.isEnabled('A'), true);
assert.equal(activation.isEnabled('B'), true);
activation.mount();
activation.mount();
assert.equal(registered, 1, 'single global listener even when gallery unopened or mounted repeatedly');
assert.equal(typeof listener, 'function');
assert.equal(activation.setEnabled('A', false), true);
assert.deepEqual(settings.lorebookStudio.disabledBooks, ['A'], 'OFF persisted in NastyTavern settings');
assert.equal(savedSettings, 1, 'native SillyTavern settings save scheduled');
assert.equal(activation.isEnabled('A'), false);
const entries = {
    globalLore: [{ world: 'A', uid: 1, disable: false }, { world: 'B', uid: 2 }],
    characterLore: [{ world: 'A', uid: 3 }, { world: 'C', uid: 4 }],
    chatLore: [{ world: 'A', uid: 5 }, { world: 'C', uid: 6 }],
    personaLore: [{ world: 'A', uid: 7 }, { world: 'D', uid: 8 }],
};
const same = Object.fromEntries(Object.entries(entries).map(([key, value]) => [key, value]));
listener(entries);
assert.deepEqual(entries, {
    globalLore: [{ world: 'B', uid: 2 }],
    characterLore: [{ world: 'C', uid: 4 }],
    chatLore: [{ world: 'C', uid: 6 }],
    personaLore: [{ world: 'D', uid: 8 }],
}, 'all four World Info sources are filtered');
for (const key of Object.keys(entries)) assert.equal(entries[key], same[key], 'source arrays retain identity');
assert.equal(activation.isEnabled('B'), true);
activation.rename('A', 'A Renamed');
assert.deepEqual(settings.lorebookStudio.disabledBooks, ['A Renamed']);
assert.equal(activation.isEnabled('A'), true);
activation.forget('A Renamed');
assert.deepEqual(settings.lorebookStudio.disabledBooks, []);
activation.setEnabled('C', false);
activation.setEnabled('D', false);
assert.deepEqual(settings.lorebookStudio.disabledBooks, ['C', 'D']);
activation.setEnabled('C', true);
assert.deepEqual(settings.lorebookStudio.disabledBooks, ['D']);
activation.unmount();
activation.unmount();
assert.equal(unregistered, 1);
assert.equal(listener, null, 'disabling extension releases listener');
const again = new LorebookActivation(settings);
assert.equal(again.isEnabled('D'), false, 'disabled state survives manager recreation');
assert.equal(again.isEnabled('C'), true);
console.log('PASS: world info prompt filter covers all bindings without touching source files, persistence, renames, cleanups and lifecycle');
