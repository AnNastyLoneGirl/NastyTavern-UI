import assert from 'node:assert/strict';
import { LorebookManager } from '../src/lorebook-manager.js';
const cls = () => ({ add() {}, remove() {}, toggle() {} });
const originalSelect = { id: 'world_info' };
const native = { querySelector: id => id === '#world_info' ? originalSelect : null };
const manager = new LorebookManager({}, null, { onShowGallery: () => {} });
const gallery = { hidden: false, classList: cls() };
const editorView = {
    hidden: true, classList: cls(), setAttribute() {},
    querySelector: () => null,
};
const surface = {
    children: [gallery, editorView],
    get firstElementChild() { return this.children[0] ?? null; },
    get lastElementChild() { return this.children.at(-1) ?? null; },
    replaceChildren(...elements) { this.children = elements; this.replacements++; },
    replacements: 0,
};
manager.root = {classList:cls()};
manager.gallery = gallery;
manager.editorView = editorView;
manager.surface = surface;
manager.panel = native;
manager.scheduleRefresh = () => {};
assert.equal(manager.replaceSurfaceWith(gallery), true);
assert.equal(surface.replacements, 0, 'Already attached gallery and editor must not be moved');
manager.showEditor('Alpha');
assert.equal(editorView.hidden, false);
assert.equal(gallery.hidden, true);
assert.deepEqual(surface.children, [gallery, editorView], 'Changing view keeps both mounted');
assert.equal(surface.replacements, 0, 'Editor is not detached/reinserted');
assert.equal(manager.panel.querySelector('#world_info'), originalSelect, 'Original native selector stays available');
manager.showGallery();
assert.equal(editorView.hidden, true);
assert.equal(gallery.hidden, false);
assert.deepEqual(surface.children, [gallery, editorView], 'Native editor remains in hidden branch');
assert.equal(surface.replacements, 0);
assert.equal(manager.panel.querySelector('#world_info'), originalSelect);
console.log('PASS: gallery/editor navigation hides inactive view without detaching native World Info controls');
