import { icons } from './icons.js';
import { t } from './i18n.js';
import { getContextSafe as getContext, escapeHtml } from './utils.js';
import { createModalShell, showModalShell, hideModalShell } from './modal-shell.js';


const normalizeValue = value => value === undefined || value === null ? '' : String(value);

const getValueType = value => {
    const text = normalizeValue(value).trim();
    if (text === '') return 'empty';
    if (!Number.isNaN(Number(text))) return 'number';
    if (text === 'true' || text === 'false') return 'boolean';
    try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) return 'array';
        if (parsed && typeof parsed === 'object') return 'object';
    } catch (_) {}
    return 'text';
};


export class VariableManager {
    constructor(toast) {
        this.toast = toast;
        this.root = null;
        this.quickButton = null;
        this.opened = false;
        this.scope = 'local';
        this.view = 'variables';
        this.query = '';
        this.snapshot = '';
        this.interval = null;
        this.events = [];
        this.deleteTimers = new Map();
        this.boundChatChange = () => {
            this.snapshot = '';
            this.refresh(true);
        };
    }

    mount() {
        document.querySelector('#nt-variable-manager-button')?.remove();
        this.ensureQuickButton();
        this.ensurePanel();
        this.bindAppEvents();
        if (!this.interval) this.interval = setInterval(() => this.tick(), 500);
    }

    unmount() {
        this.events.forEach(({ source, type, handler }) => {
            try { source?.removeListener?.(type, handler); } catch (_) {}
        });
        this.events = [];
        clearInterval(this.interval);
        this.interval = null;
        this.deleteTimers.forEach(timer => clearTimeout(timer));
        this.deleteTimers.clear();
        this.root?.remove();
        document.querySelector('#nt-variable-manager-button')?.remove();
        this.quickButton?.remove();
        this.root = null;
        this.quickButton = null;
        this.opened = false;
    }

    bindAppEvents() {
        if (this.events.length) return;
        const context = getContext();
        const source = context?.eventSource;
        const types = context?.eventTypes || context?.event_types;
        if (!source || !types) return;
        for (const key of ['CHAT_CHANGED', 'CHAT_CREATED', 'GROUP_UPDATED']) {
            if (!types[key]) continue;
            try {
                source.on(types[key], this.boundChatChange);
                this.events.push({ source, type: types[key], handler: this.boundChatChange });
            } catch (_) {}
        }
    }

    ensureQuickButton() {
        const existing = document.querySelector('#nt-variable-manager-quick-button');
        if (existing) {
            this.quickButton = existing;
            return existing;
        }
        const button = document.createElement('button');
        button.id = 'nt-variable-manager-quick-button';
        button.type = 'button';
        button.title = 'Variables';
        button.setAttribute('aria-label', 'Open variable manager');
        button.innerHTML = `<span class="nt-var-quick-icon">${icons.variables}</span>`;
        button.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            this.toggle();
        });
        document.body.append(button);
        this.quickButton = button;
        return button;
    }

    ensurePanel() {
        const existing = document.querySelector('#nt-variable-manager');
        if (existing) {
            this.root = existing;
            return existing;
        }
        const { root, header, body, footer } = createModalShell({
            id: 'nt-variable-manager',
            title: 'Variables',
            subtitle: 'Current chat',
            icon: icons.variables,
            size: 'large',
            modalClass: 'nt-var-panel',
            backdropClass: 'nt-var-backdrop',
            headerClass: 'nt-var-header',
            headingClass: 'nt-var-title',
            iconClass: 'nt-var-title-icon',
            copyClass: 'nt-var-title-copy',
            closeClass: 'nt-var-close',
            closeLabel: 'Close',
            closeAttrs: { 'data-nt-var-close': '' },
            bodyClass: 'nt-var-list',
            bodyAttrs: { 'data-nt-var-list': '' },
            footerClass: 'nt-var-footer',
            footerHtml: 'Local variables are stored in the current chat only.',
        });
        header?.querySelector('.nt-modal-heading-copy > small')?.setAttribute('data-nt-var-chat', '');
        footer?.setAttribute('data-nt-var-footer', '');
        body.insertAdjacentHTML('beforebegin', `
            <div class="nt-var-tabs" role="tablist">
              <button type="button" class="is-active" data-nt-var-scope="local" role="tab"><span>Local</span><small>Current chat</small><b data-nt-var-local-count>0</b></button>
              <button type="button" data-nt-var-scope="global" role="tab"><span>Global</span><small>All chats</small><b data-nt-var-global-count>0</b></button>
              <button type="button" data-nt-var-view="history" role="tab"><span>History</span><small>Undo changes</small><b>${icons.undo}</b></button>
            </div>
            <div class="nt-var-toolbar">
              <label class="nt-var-search">${icons.search}<input type="search" placeholder="Search variables…" data-nt-var-search></label>
              <button type="button" class="nt-var-add" data-nt-var-add>${icons.plus}<span>Add variable</span></button>
            </div>
            <form class="nt-var-create" data-nt-var-create hidden>
              <div class="nt-var-create-top">
                <label><span>Scope</span><select data-nt-var-create-scope><option value="local">Local · current chat</option><option value="global">Global · all chats</option></select></label>
                <label><span>Name</span><input type="text" autocomplete="off" spellcheck="false" placeholder="variable_name" data-nt-var-create-name></label>
              </div>
              <label class="nt-var-create-value"><span>Value</span><textarea rows="3" placeholder="Value…" data-nt-var-create-value></textarea></label>
              <div class="nt-var-create-actions"><button type="button" data-nt-var-create-cancel>Cancel</button><button type="submit" class="is-primary">Create</button></div>
            </form>`);
        document.body.append(root);
        root.addEventListener('click', event => this.onClick(event));
        root.addEventListener('submit', event => this.onSubmit(event));
        root.addEventListener('input', event => this.onInput(event));
        root.addEventListener('keydown', event => this.onKeyDown(event));
        this.root = root;
        return root;
    }

    toggle() {
        this.opened ? this.close() : this.open();
    }

    open(scope = null) {
        this.ensureQuickButton();
        this.ensurePanel();
        if (!this.root) return;
        if (scope === 'local' || scope === 'global') this.scope = scope;
        this.opened = true;
        showModalShell(this.root);
        document.body.classList.add('nt-variables-open');
        this.snapshot = '';
        this.syncScopeUI();
        this.refresh(true);
    }

    close() {
        if (!this.root) return;
        this.opened = false;
        hideModalShell(this.root, { immediate: false, duration: 180 });
        document.body.classList.remove('nt-variables-open');
    }

    tick() {
        document.querySelector('#nt-variable-manager-button')?.remove();
        this.ensureQuickButton();
        if (!this.opened || !this.root) return;
        const active = document.activeElement;
        if (active?.closest?.('#nt-variable-manager .nt-var-row, #nt-variable-manager .nt-var-create')) return;
        this.refresh();
    }

    getStores() {
        const context = getContext();
        if (!context) return { context: null, local: {}, global: {} };
        if (!context.chatMetadata.variables) context.chatMetadata.variables = {};
        if (!context.extensionSettings.variables) context.extensionSettings.variables = {};
        if (!context.extensionSettings.variables.global) context.extensionSettings.variables.global = {};
        return {
            context,
            local: context.chatMetadata.variables,
            global: context.extensionSettings.variables.global,
        };
    }

    getChatId(context) {
        try {
            return context?.getCurrentChatId?.() || context?.chatId || '';
        } catch (_) {
            return context?.chatId || '';
        }
    }

    getChatName(context) {
        return this.getChatId(context) || t('No active chat');
    }

    refresh(force = false) {
        if (!this.root) return;
        const { context, local, global } = this.getStores();
        const snapshot = JSON.stringify({ chat: this.getChatName(context), local, global, scope: this.scope, query: this.query });
        if (!force && snapshot === this.snapshot) return;
        this.snapshot = snapshot;
        this.root.querySelector('[data-nt-var-chat]').textContent = this.getChatName(context);
        this.root.querySelector('[data-nt-var-local-count]').textContent = Object.keys(local).length;
        this.root.querySelector('[data-nt-var-global-count]').textContent = Object.keys(global).length;
        const values = this.scope === 'local' ? local : global;
        if (this.view === 'history') this.renderHistory();
        else this.renderList(values);
        this.syncScopeUI();
    }

    renderList(values) {
        const list = this.root?.querySelector('[data-nt-var-list]');
        if (!list) return;
        const query = this.query.trim().toLowerCase();
        const entries = Object.entries(values)
            .filter(([name, value]) => !query || name.toLowerCase().includes(query) || normalizeValue(value).toLowerCase().includes(query))
            .sort(([a], [b]) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
        if (!entries.length) {
            const scopeText = this.scope === 'local' ? 'this chat' : 'global scope';
            list.innerHTML = `<div class="nt-var-empty"><span>${icons.variables}</span><b>${query ? 'No matching variables' : 'No variables yet'}</b><small>${query ? 'Try another search.' : `Add a variable to ${scopeText}.`}</small></div>`;
            return;
        }
        list.innerHTML = entries.map(([name, value]) => {
            const type = getValueType(value);
            const macro = this.scope === 'local' ? `{{getvar::${name}}}` : `{{getglobalvar::${name}}}`;
            return `<article class="nt-var-row" data-nt-var-name="${escapeHtml(name)}" data-nt-var-original="${escapeHtml(name)}">
              <div class="nt-var-row-head">
                <label class="nt-var-name-wrap"><input class="nt-var-name" type="text" value="${escapeHtml(name)}" spellcheck="false" aria-label="Variable name"><span class="nt-var-type">${type}</span></label>
                <div class="nt-var-row-actions">
                  <button type="button" data-nt-var-copy="${escapeHtml(macro)}" title="Copy macro">${icons.copy}</button>
                  <button type="button" data-nt-var-delete title="Delete variable">${icons.trash}<span>Delete</span></button>
                </div>
              </div>
              <textarea class="nt-var-value" rows="2" spellcheck="false" aria-label="Variable value">${escapeHtml(normalizeValue(value))}</textarea>
              <div class="nt-var-row-foot"><code>${escapeHtml(macro)}</code><button type="button" class="nt-var-save" data-nt-var-save>${icons.check}<span>Save</span></button></div>
            </article>`;
        }).join('');
    }

    syncScopeUI() {
        if (!this.root) return;
        this.root.querySelectorAll('[data-nt-var-scope]').forEach(button => button.classList.toggle('is-active', this.view === 'variables' && button.dataset.ntVarScope === this.scope));
        this.root.querySelectorAll('[data-nt-var-view]').forEach(button => button.classList.toggle('is-active', this.view === button.dataset.ntVarView));
        const select = this.root.querySelector('[data-nt-var-create-scope]');
        if (select && !this.root.querySelector('[data-nt-var-create]')?.hidden) select.value = this.scope;
        const footer = this.root.querySelector('[data-nt-var-footer]');
        if (footer) footer.textContent = this.scope === 'local'
            ? 'Local variables are stored in the current chat only and switch automatically with the conversation.'
            : 'Global variables are shared across every chat in SillyTavern.';
    }

    onClick(event) {
        if (event.target.closest('[data-nt-var-close]')) {
            this.close();
            return;
        }
        const view = event.target.closest('[data-nt-var-view]')?.dataset.ntVarView;
        if (view) {
            this.view = view;
            this.snapshot = '';
            this.refresh(true);
            return;
        }
        const scope = event.target.closest('[data-nt-var-scope]')?.dataset.ntVarScope;
        if (scope) {
            this.view = 'variables';
            this.scope = scope;
            this.snapshot = '';
            this.query = '';
            const search = this.root.querySelector('[data-nt-var-search]');
            if (search) search.value = '';
            this.refresh(true);
            return;
        }
        if (event.target.closest('[data-nt-var-add]')) {
            this.showCreateForm();
            return;
        }
        if (event.target.closest('[data-nt-var-create-cancel]')) {
            this.hideCreateForm();
            return;
        }
        const copy = event.target.closest('[data-nt-var-copy]');
        if (copy) {
            this.copyText(copy.dataset.ntVarCopy || '');
            return;
        }
        const save = event.target.closest('[data-nt-var-save]');
        if (save) {
            this.saveRow(save.closest('.nt-var-row'));
            return;
        }
        const restore = event.target.closest('[data-nt-var-restore]');
        if (restore) { this.restoreHistory(Number(restore.dataset.ntVarRestore)); return; }
        const del = event.target.closest('[data-nt-var-delete]');
        if (del) this.handleDelete(del.closest('.nt-var-row'), del);
    }

    onInput(event) {
        if (event.target.matches('[data-nt-var-search]')) {
            this.query = event.target.value;
            this.snapshot = '';
            const { local, global } = this.getStores();
            if (this.view === 'history') this.renderHistory();
            else this.renderList(this.scope === 'local' ? local : global);
        }
    }

    onSubmit(event) {
        const form = event.target.closest('[data-nt-var-create]');
        if (!form) return;
        event.preventDefault();
        this.createVariable(form);
    }

    onKeyDown(event) {
        if (event.key === 'Escape') {
            const create = this.root?.querySelector('[data-nt-var-create]');
            if (create && !create.hidden) {
                event.preventDefault();
                this.hideCreateForm();
            }
            return;
        }
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
            const row = event.target.closest('.nt-var-row');
            if (row) {
                event.preventDefault();
                this.saveRow(row);
            }
        }
    }

    showCreateForm() {
        const form = this.root?.querySelector('[data-nt-var-create]');
        if (!form) return;
        form.hidden = false;
        form.querySelector('[data-nt-var-create-scope]').value = this.scope;
        form.querySelector('[data-nt-var-create-name]').value = '';
        form.querySelector('[data-nt-var-create-value]').value = '';
        requestAnimationFrame(() => form.querySelector('[data-nt-var-create-name]')?.focus());
    }

    hideCreateForm() {
        const form = this.root?.querySelector('[data-nt-var-create]');
        if (form) form.hidden = true;
    }

    async createVariable(form) {
        const scope = form.querySelector('[data-nt-var-create-scope]').value;
        const name = form.querySelector('[data-nt-var-create-name]').value.trim();
        const value = form.querySelector('[data-nt-var-create-value]').value;
        if (!name) {
            this.toast?.('Variable name cannot be empty.');
            return;
        }
        const { context } = this.getStores();
        if (scope === 'local' && !this.getChatId(context)) {
            this.toast?.('Open a chat before creating a local variable.');
            return;
        }
        if (this.has(scope, name)) {
            this.toast?.(`Variable “${name}” already exists in ${scope} scope.`);
            return;
        }
        this.recordHistory(scope, name, undefined, value, 'create');
        this.set(scope, name, value);
        this.scope = scope;
        this.hideCreateForm();
        this.snapshot = '';
        this.refresh(true);
        this.toast?.(`Created ${scope} variable “${name}”.`);
    }

    saveRow(row) {
        if (!row) return;
        const oldName = row.dataset.ntVarOriginal || '';
        const newName = row.querySelector('.nt-var-name')?.value.trim() || '';
        const value = row.querySelector('.nt-var-value')?.value ?? '';
        if (!newName) {
            this.toast?.('Variable name cannot be empty.');
            return;
        }
        if (newName !== oldName && this.has(this.scope, newName)) {
            this.toast?.(`Variable “${newName}” already exists in ${this.scope} scope.`);
            return;
        }
        const storesBefore = this.getStores();
        const beforeValue = (this.scope === 'local' ? storesBefore.local : storesBefore.global)[oldName];
        this.recordHistory(this.scope, oldName, beforeValue, newName === oldName ? value : undefined, newName === oldName ? 'update' : 'rename');
        if (newName !== oldName) {
            this.recordHistory(this.scope, newName, undefined, value, 'rename');
            this.set(this.scope, newName, value);
            this.del(this.scope, oldName);
        } else {
            this.set(this.scope, newName, value);
        }
        this.snapshot = '';
        this.refresh(true);
        this.toast?.(`Saved “${newName}”.`);
    }

    handleDelete(row, button) {
        if (!row || !button) return;
        const name = row.dataset.ntVarOriginal;
        if (!button.classList.contains('is-confirming')) {
            button.classList.add('is-confirming');
            const label = button.querySelector('span');
            if (label) label.textContent = 'Confirm';
            const timer = setTimeout(() => {
                button.classList.remove('is-confirming');
                if (label) label.textContent = 'Delete';
                this.deleteTimers.delete(button);
            }, 3000);
            this.deleteTimers.set(button, timer);
            return;
        }
        clearTimeout(this.deleteTimers.get(button));
        this.deleteTimers.delete(button);
        const storesBefore = this.getStores();
        const beforeValue = (this.scope === 'local' ? storesBefore.local : storesBefore.global)[name];
        this.recordHistory(this.scope, name, beforeValue, undefined, 'delete');
        this.del(this.scope, name);
        this.snapshot = '';
        this.refresh(true);
        this.toast?.(`Deleted “${name}”.`);
    }


    getHistoryStore(scope = this.scope) {
        const stores = this.getStores();
        if (!stores.context) return [];
        if (scope === 'local') {
            stores.context.chatMetadata.nastyTavernVariableHistory ??= [];
            return stores.context.chatMetadata.nastyTavernVariableHistory;
        }
        stores.context.extensionSettings.modern_tavern_ui ??= {};
        stores.context.extensionSettings.modern_tavern_ui.variableHistory ??= [];
        return stores.context.extensionSettings.modern_tavern_ui.variableHistory;
    }

    recordHistory(scope, name, before, after, action) {
        if (before === after) return;
        const history = this.getHistoryStore(scope);
        history.unshift({ scope, name, before, after, action, at: Date.now() });
        const limit = Number(this.getStores().context?.extensionSettings?.modern_tavern_ui?.historyLimit) || 50;
        history.splice(limit);
        if (scope === 'local') this.getStores().context?.saveMetadataDebounced?.();
        else this.getStores().context?.saveSettingsDebounced?.();
    }

    renderHistory() {
        const list = this.root?.querySelector('[data-nt-var-list]');
        if (!list) return;
        const history = this.getHistoryStore(this.scope);
        if (!history.length) {
            list.innerHTML = `<div class="nt-var-empty"><span>${icons.undo}</span><b>No variable history yet</b><small>Changes made in the Variable Manager will appear here.</small></div>`;
            return;
        }
        list.innerHTML = history.map((item, index) => `<article class="nt-var-history-row"><div><b>${escapeHtml(item.name)}</b><small>${escapeHtml(item.action)} · ${new Date(item.at).toLocaleString()}</small><p><code>${escapeHtml(normalizeValue(item.before))}</code><span>→</span><code>${escapeHtml(normalizeValue(item.after))}</code></p></div><button type="button" class="menu_button" data-nt-var-restore="${index}">${icons.undo}<span>Restore</span></button></article>`).join('');
    }

    restoreHistory(index) {
        const history = this.getHistoryStore(this.scope);
        const item = history[index];
        if (!item) return;
        if (item.before === undefined) this.del(item.scope, item.name);
        else this.set(item.scope, item.name, item.before);
        this.recordHistory(item.scope, item.name, item.after, item.before, 'restore');
        this.snapshot = '';
        this.refresh(true);
        this.toast?.(`Restored “${item.name}”.`);
    }

    getApi(scope) {
        const context = getContext();
        return context?.variables?.[scope] || null;
    }

    has(scope, name) {
        const api = this.getApi(scope);
        if (api?.has) return !!api.has(name);
        const stores = this.getStores();
        return Object.hasOwn(scope === 'local' ? stores.local : stores.global, name);
    }

    set(scope, name, value) {
        const api = this.getApi(scope);
        if (api?.set) return api.set(name, value);
        const stores = this.getStores();
        if (scope === 'local') {
            stores.local[name] = value;
            stores.context?.saveMetadataDebounced?.();
        } else {
            stores.global[name] = value;
            stores.context?.saveSettingsDebounced?.();
        }
        return value;
    }

    del(scope, name) {
        const api = this.getApi(scope);
        if (api?.del) return api.del(name);
        const stores = this.getStores();
        if (scope === 'local') {
            delete stores.local[name];
            stores.context?.saveMetadataDebounced?.();
        } else {
            delete stores.global[name];
            stores.context?.saveSettingsDebounced?.();
        }
        return '';
    }

    async copyText(text) {
        try {
            await navigator.clipboard.writeText(text);
            this.toast?.('Variable macro copied.');
        } catch (_) {
            const area = document.createElement('textarea');
            area.value = text;
            area.style.position = 'fixed';
            area.style.opacity = '0';
            document.body.append(area);
            area.select();
            try { document.execCommand('copy'); } catch (_) {}
            area.remove();
            this.toast?.('Variable macro copied.');
        }
    }
}
