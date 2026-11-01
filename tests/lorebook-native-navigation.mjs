import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LorebookManager } from '../src/lorebook-manager.js';
const classes = () => {
  const values = new Set();
  return { add: (...xs) => xs.forEach(x => values.add(x)), remove: (...xs) => xs.forEach(x => values.delete(x)), contains: x => values.has(x) };
};
let prepared = 0, restored = 0;
const manager = new LorebookManager({}, null, {
  openNativeWorldInfo: () => { prepared++; return true; },
  onShowGallery: () => { restored++; },
});
const nativeSelector = { id: 'world_info' };
manager.panel = { isConnected: true, querySelector: name => name === '#world_info' ? nativeSelector : null };
manager.root = { classList: classes() };
manager.gallery = { hidden: false };
manager.editorHeader = { querySelector: () => null };
manager.editorView = { hidden: true, classList: classes(), setAttribute() {}, querySelector: () => null };
manager.surface = { children: [manager.gallery, manager.editorView], get firstElementChild(){return this.children[0]}, get lastElementChild(){return this.children[1]} };
manager.scheduleRefresh = () => {};
assert.equal(await manager.showNativeWorldInfo(), true);
assert.equal(prepared, 1);
assert.equal(manager.view, 'native');
assert.equal(manager.editorView.hidden, false);
assert.equal(manager.gallery.hidden, true);
assert.equal(manager.root.classList.contains('is-native-view'), true);
assert.equal(manager.panel.querySelector('#world_info'), nativeSelector);
manager.showGallery();
assert.equal(restored, 1);
assert.equal(manager.view, 'gallery');
assert.equal(manager.root.classList.contains('is-native-view'), false);
assert.equal(manager.editorView.hidden, true);
assert.equal(manager.gallery.hidden, false);
assert.equal(manager.panel.querySelector('#world_info'), nativeSelector);
const css=readFileSync(new URL('../style.css',import.meta.url),'utf8');
assert.match(css, /\.nt-lorebook-library-header \{\s*justify-content: space-between;/);
assert.match(css, /\.nt-lorebook-open-native \{[^}]*margin-right: auto;/);
assert.match(css, /\.nt-lorebook-library-actions \{\s*margin-left: auto;/);
assert.match(css, /\.is-native-view \.nt-lorebook-native-host \{[^}]*overflow-y: auto;/);
assert.match(css, /\.menu_button:not\(:is\(\.fa, \.fas, \.far, \.fab, \.fa-solid/);
assert.match(css, /\.is-native-view #WorldInfo #world_popup > \.flex-container\.alignitemscenter:first-of-type \{[\s\S]*?display: flex!important;/);
const runtime=readFileSync(new URL('../src/runtime.js',import.meta.url),'utf8');
assert.match(runtime,/prepareLorebookNativeView\(\) \{[\s\S]*?restoreLorebookSplitView\(\);[\s\S]*?restoreLorebookSettingsLayout\(\)/);
assert.match(runtime,/prepareLorebookGalleryView\(\) \{[\s\S]*?prepareLorebookSettingsLayout\(panel\)/);
console.log('PASS: native view toggle preserves original global select and restored gallery/settings layout');
