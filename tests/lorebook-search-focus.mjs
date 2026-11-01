import assert from 'node:assert/strict';
import { LorebookManager } from '../src/lorebook-manager.js';

// Minimal DOM stand-in: replacing the gallery's innerHTML simulates losing
// the original search input (and its focus), just like a real browser.
const document = { activeElement: null };
const buttons = ['all', 'global', 'character', 'persona', 'chat', 'unbound'].map(value => ({
    dataset: { ntLorebookFilter: value },
    attrs: {},
    classList: {
        active: false,
        toggle(name, active) { if (name === 'is-active') this.active = active; },
    },
    setAttribute(name, value) { this.attrs[name] = value; },
}));

const gallery = {
    renders: 0,
    body: null,
    footer: null,
    search: null,
    sort: null,
    querySelector(selector) {
        if (selector === ':scope > .nt-lorebook-library-body') return this.body;
        if (selector === ':scope > .nt-lorebook-library-footer') return this.footer;
        if (selector === '[data-nt-lorebook-search]') return this.search;
        if (selector === '[data-nt-lorebook-sort]') return this.sort;
        return null;
    },
    querySelectorAll(selector) { return selector === '[data-nt-lorebook-filter]' ? buttons : []; },
    set innerHTML(html) {
        this.renders++;
        if (document.activeElement === this.search) document.activeElement = null;
        this.body = { innerHTML: '' };
        this.footer = { innerHTML: '' };
        this.search = {
            value: '', ownerDocument: document, selectionStart: 0,
            closest(selector) { return selector === '[data-nt-lorebook-search]' ? this : null; },
            focus() { document.activeElement = this; },
        };
        this.sort = { value: 'az' };
        this.fullMarkup = html;
    },
};

const manager = new LorebookManager({ lorebookStudio: { sort: 'az' } }, () => {});
manager.gallery = gallery;
manager.pageSize = 2;
const book = (id, name, global = false) => ({
    id, name, binding: { global, chat: false, cover: '', characters: [], personas: [], labels: global ? ['Global'] : [] },
});
manager.books = [book('a', 'Apple'), book('b', 'Apricot', true), book('c', 'Banana'), book('d', 'Berry')];
manager.renderGallery();
assert.equal(gallery.renders, 1, 'initial render builds toolbar');
assert.match(gallery.fullMarkup, /data-nt-lorebook-search/, 'initial markup includes search input');
const input = gallery.search;
input.focus();
for (const query of ['a', 'ap', 'app', 'apple']) {
    input.value = query;
    input.selectionStart = query.length;
    manager.onInput({ target: input });
    assert.equal(manager.search, query, 'search state tracks each keystroke');
    assert.equal(gallery.renders, 1, 'toolbar must never be reconstructed while typing');
    assert.equal(gallery.search, input, 'input node stays identical');
    assert.equal(document.activeElement, input, 'focus stays on original input');
    assert.equal(input.selectionStart, query.length, 'caret position is untouched');
}
assert.match(gallery.body.innerHTML, /data-nt-lorebook-card="a"/);
assert.doesNotMatch(gallery.body.innerHTML, /data-nt-lorebook-card="b"/);
assert.match(gallery.footer.innerHTML, /<span>1 Lorebook<\/span>/);

input.value = 'nothing';
manager.onInput({ target: input });
assert.match(gallery.body.innerHTML, /No Lorebooks found/);
assert.equal(document.activeElement, input, 'focus stays on empty results');

input.value = '';
manager.onInput({ target: input });
assert.match(gallery.footer.innerHTML, /<span>4 Lorebooks<\/span>/);
assert.equal(manager.page, 1);
manager.filter = 'global';
manager.renderGallery();
assert.equal(buttons[1].attrs['aria-pressed'], 'true', 'filter aria state updates');
assert.equal(buttons[1].classList.active, true, 'filter visual state updates');
assert.equal(buttons[0].classList.active, false, 'previous filter no longer active');
assert.match(gallery.body.innerHTML, /data-nt-lorebook-card="b"/);
assert.doesNotMatch(gallery.body.innerHTML, /data-nt-lorebook-card="a"/);
assert.equal(document.activeElement, input);
manager.filter = 'all';
manager.sort = 'za';
manager.renderGallery();
assert.equal(gallery.sort.value, 'za', 'sort select stays synchronized');
assert.ok(gallery.body.innerHTML.indexOf('data-nt-lorebook-card="d"') < gallery.body.innerHTML.indexOf('data-nt-lorebook-card="c"'), 'reverse alphabetical sort updates results');
manager.books.push(book('e', 'Cherry'));
manager.renderGallery();
assert.match(gallery.footer.innerHTML, /<span>5 Lorebooks<\/span>/, 'refresh updates total');
assert.equal(document.activeElement, input, 'refresh does not steal focus');
assert.equal(gallery.renders, 1, 'no full rerender after initial mount');
console.log('PASS: lorebook search retains input/focus/caret, results, zero matches, filter, sort, pagination and refresh');
