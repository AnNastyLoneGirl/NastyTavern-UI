import { icons } from './icons.js';
import { adoptModalShell, showModalShell, hideModalShell, setModalShellCloseHandler } from './modal-shell.js';

function normalize(v) { return String(v || '').toLowerCase().replace(/\s+/g, ' ').trim(); }
function score(query, item) {
    if (!query) return 1;
    const q = normalize(query); const hay = normalize(`${item.label} ${item.keywords || ''}`);
    if (hay.startsWith(q)) return 100;
    if (hay.includes(q)) return 70;
    let pos = 0;
    for (const ch of q) { pos = hay.indexOf(ch, pos); if (pos === -1) return 0; pos++; }
    return 25;
}

export class CommandPalette {
    constructor(actionsProvider) {
        this.actionsProvider = actionsProvider;
        this.root = null;
        this.index = 0;
        this.results = [];
    }

    mount() {
        if (this.root) return;
        const root = document.createElement('div');
        root.id = 'mt-command-palette';
        root.hidden = true;
        root.innerHTML = `<div class="mt-command-backdrop"></div><div class="mt-command-dialog" role="dialog" aria-modal="true" aria-label="Command palette">
          <div class="mt-command-input-row">${icons.search}<input type="search" autocomplete="off" spellcheck="false" placeholder="Search SillyTavern…"><kbd>Esc</kbd></div>
          <div class="mt-command-results" role="listbox"></div>
          <div class="mt-command-footer"><span>↑↓ Navigate</span><span>Enter Open</span><span>Ctrl K Toggle</span></div>
        </div>`;
        adoptModalShell(root, { modalSelector: '.mt-command-dialog', backdropSelector: '.mt-command-backdrop', headerSelector: null, bodySelector: '.mt-command-results', footerSelector: '.mt-command-footer', size: 'compact' });
        setModalShellCloseHandler(root, () => this.close());
        document.body.append(root);
        this.root = root;
        this.input = root.querySelector('input');
        this.list = root.querySelector('.mt-command-results');
        root.querySelector('.mt-command-backdrop').addEventListener('click', () => this.close());
        this.input.addEventListener('input', () => this.render());
        this.input.addEventListener('keydown', e => this.onKeyDown(e));
        this.list.addEventListener('click', e => {
            const row = e.target.closest('[data-index]');
            if (row) this.run(Number(row.dataset.index));
        });
    }

    open() {
        this.mount();
        showModalShell(this.root);
        this.index = 0; this.input.value = '';
        this.render();
        requestAnimationFrame(() => this.input.focus());
    }
    close() { if (this.root) { hideModalShell(this.root); } }
    toggle() { this.root && !this.root.hidden ? this.close() : this.open(); }

    render() {
        const q = this.input.value;
        this.results = this.actionsProvider().map(a => ({...a, score: score(q, a)})).filter(a => a.score > 0).sort((a,b) => b.score-a.score).slice(0, 12);
        this.index = Math.min(this.index, Math.max(0, this.results.length - 1));
        this.list.innerHTML = this.results.length ? this.results.map((a, i) => `<button class="mt-command-item ${i === this.index ? 'is-selected' : ''}" data-index="${i}" role="option" aria-selected="${i===this.index}"><span class="mt-command-item-icon">${a.icon || icons.command}</span><span><b>${a.label}</b>${a.hint ? `<small>${a.hint}</small>` : ''}</span>${a.shortcut ? `<kbd>${a.shortcut}</kbd>` : ''}</button>`).join('') : `<div class="mt-command-empty">No matching action.</div>`;
    }

    onKeyDown(e) {
        if (e.key === 'ArrowDown') { e.preventDefault(); this.index = Math.min(this.index + 1, this.results.length - 1); this.render(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); this.index = Math.max(this.index - 1, 0); this.render(); }
        else if (e.key === 'Enter') { e.preventDefault(); this.run(this.index); }
    }

    run(index) {
        const action = this.results[index];
        if (!action) return;
        this.close();
        try { Promise.resolve(action.run()).catch(() => {}); } catch (error) {}
    }
}
