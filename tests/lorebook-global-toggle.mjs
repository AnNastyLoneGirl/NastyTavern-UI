import assert from 'node:assert/strict';
import { LorebookManager } from '../src/lorebook-manager.js';

const selected = (name, on) => ({ value: name === 'Alpha' ? '0' : name === 'Beta' ? '1' : '2', textContent: name, selected: on });
const options = [selected('Alpha', true), selected('Beta', false), selected('Gamma', true)];
const events = [];
const native = {
    world_names: ['Alpha', 'Beta', 'Gamma'],
    selected_world_info: ['Alpha', 'Gamma'],
    world_info: { globalSelect: ['Alpha', 'Gamma'] },
    onWorldInfoChange() { this.selected_world_info = options.filter(item => item.selected).map(item => item.textContent); },
};
const select = {
    isConnected: true,
    options,
    get selectedOptions() { return options.filter(option => option.selected); },
    dispatchEvent(event) { events.push(event.type); native.onWorldInfoChange(); return true; },
};
const panel = { querySelector: selector => selector === '#world_info' ? select : null };
const toastMessages = [];
const disabled = new Set(['Gamma']);
let persisted = [...native.world_info.globalSelect];
let writes = 0;
const manager = new LorebookManager({}, message => toastMessages.push(message), {
    isBookEnabled: name => !disabled.has(name),
    setBookEnabled: (name, enabled) => { if (enabled) disabled.delete(name); else disabled.add(name); return true; },
    loadNativeWorldInfo: async () => native,
    saveNativeWorldInfo: async () => { writes++; persisted = [...native.world_info.globalSelect]; },
});
let buttons = [];
let lastFocus = null;
let refreshCount = 0;
const makeButton = name => ({
    dataset: { ntLorebookGlobal: name, ntLorebookEnabled: name },
    focus(options) { lastFocus = { name, options }; globalThis.document.activeElement = this; },
});
buttons = ['Alpha', 'Beta', 'Gamma'].map(makeButton);
manager.panel = panel;
manager.books = ['Alpha', 'Beta', 'Gamma'].map(name => ({ id: name, name }));
manager.gallery = { querySelectorAll: selector => selector === '[data-nt-lorebook-global]' || selector === '[data-nt-lorebook-enabled]' ? buttons : [] };
manager.refresh = async () => { refreshCount++; buttons = ['Alpha', 'Beta', 'Gamma'].map(makeButton); };
globalThis.document = { activeElement: null, querySelector: selector => selector === '#world_info' ? select : null };
globalThis.window = {};

const book = (name, global) => ({ name, id: name, binding: {
    global, chat: false, characters: [], personas: [], cover: '', labels: [],
} });
const unbound = manager.cardMarkup(book('Beta', false));
const globallyBound = manager.cardMarkup(book('Alpha', true));
const off = manager.cardMarkup(book('Gamma', false));
assert.match(unbound, /role="switch" aria-checked="true"/, 'Unbound book is enabled by default');
assert.match(globallyBound, /role="switch" aria-checked="true"/, 'Globally linked book is enabled by default');
assert.match(off, /role="switch" aria-checked="false"/, 'Master OFF independent of Global membership');
assert.match(off, /nt-lorebook-enabled-state">Off<\/span>/);
assert.match(globallyBound, /nt-lorebook-enabled-state">On<\/span>/);
assert.match(unbound, /Add to active global Lorebooks/);
assert.match(globallyBound, /Remove from active global Lorebooks/);
assert.match(unbound, /data-nt-lorebook-global="Beta"/);
assert.match(globallyBound, /aria-pressed="true"/);
assert.match(off, /data-nt-lorebook-enabled="Gamma"/);
assert.match(off, /Enable Lorebook everywhere: Gamma/);
assert.match(manager.cardMarkup(book('<script>', false)), /Enable Lorebook everywhere: &lt;script&gt;/);

assert.equal(await manager.toggleGlobal('Beta'), true);
assert.deepEqual(native.selected_world_info, ['Alpha', 'Beta', 'Gamma']);
assert.deepEqual(persisted, ['Alpha', 'Beta', 'Gamma'], 'Entire selection is durably saved, not only newly added book');
assert.deepEqual(native.world_info.globalSelect, persisted, 'Native settings updated before save');
assert.equal(options[0].selected, true);
assert.equal(options[1].selected, true);
assert.equal(options[2].selected, true);
assert.deepEqual(events, ['change']);

globalThis.document.activeElement = buttons[1];
assert.equal(await manager.toggleGlobal('Beta'), true);
assert.deepEqual(native.selected_world_info, ['Alpha', 'Gamma']);
assert.deepEqual(persisted, ['Alpha', 'Gamma'], 'Removing one book preserves other two in persisted settings');
assert.equal(options[1].selected, false);
assert.equal(lastFocus.name, 'Beta');
assert.equal(lastFocus.options.preventScroll, true);
assert.deepEqual(events, ['change', 'change']);
assert.equal(refreshCount, 2);
assert.equal(writes, 2, 'Every Global action saves immediately');

assert.equal(await manager.toggleEnabled('Gamma'), true);
assert.equal(disabled.has('Gamma'), false);
assert.equal(options[2].selected, true);
globalThis.document.activeElement = buttons[0];
assert.equal(await manager.toggleEnabled('Alpha'), true);
assert.equal(disabled.has('Alpha'), true);
assert.equal(options[0].selected, true);
assert.equal(lastFocus.name, 'Alpha');
assert.equal(lastFocus.options.preventScroll, true);
assert.deepEqual(events, ['change', 'change'], 'Universal switches never call native change');

// If the original native select is detached, reject instead of clearing all worlds.
select.isConnected = false;
assert.equal(await manager.toggleGlobal('Beta'), false);
assert.deepEqual(native.selected_world_info, ['Alpha', 'Gamma']);
assert.deepEqual(persisted, ['Alpha', 'Gamma']);
select.isConnected = true;

const bindings = await manager.buildBindingIndex();
assert.equal(bindings.get('Alpha')?.global, true);
assert.equal(bindings.get('Gamma')?.global, true);
assert.equal(bindings.get('Beta')?.global, undefined);
const before = refreshCount;
assert.equal(await manager.toggleGlobal('Missing'), false);
assert.equal(await manager.toggleEnabled('Missing'), false);
assert.equal(refreshCount, before);
assert.equal(toastMessages.length, 3);
console.log('PASS: universal toggle independent of Global, saves both Global actions, preserves other books, detects detached native select');
