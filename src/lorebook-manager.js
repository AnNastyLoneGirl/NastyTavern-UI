import { icons } from './icons.js';
import { saveSettings } from './settings.js';
import { t } from './i18n.js';

const clean = value => String(value ?? '').trim();
const esc = value => clean(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
const normalized = value => clean(value).toLocaleLowerCase();

function contextSafe() {
    try { return window.SillyTavern?.getContext?.() || {}; }
    catch { return {}; }
}

function asArray(value) {
    return Array.isArray(value) ? value : value == null ? [] : [value];
}

export class LorebookManager {
    constructor(settings, toast, hooks = {}) {
        this.settings = settings;
        this.toast = toast;
        this.hooks = hooks;
        this.root = null;
        this.panel = null;
        this.host = null;
        this.surface = null;
        this.gallery = null;
        this.editorView = null;
        this.editorHeader = null;
        this.nativeHost = null;
        this.search = '';
        this.filter = 'all';
        this.sort = this.settings?.lorebookStudio?.sort || 'az';
        this.page = 1;
        this.pageSize = 40;
        this.books = [];
        this.bindings = new Map();
        this.currentBook = '';
        this.currentEntryUid = '';
        this.view = 'gallery';
        this.currentBookData = null;
        this.renamePending = false;
        this.refreshQueued = false;
        this.selectObserver = null;
        this.boundClick = event => this.onClick(event);
        this.boundInput = event => this.onInput(event);
        this.boundChange = event => this.onChange(event);
        this.boundKeydown = event => this.onKeydown(event);
    }

    async mount(root, panel) {
        this.unmount({ keepNative: true });
        this.root = root;
        this.panel = panel;
        this.host = root?.querySelector?.('[data-nt-lorebook-host]') || null;
        if (!this.root || !this.panel || !this.host) return false;

        this.ensureSurface();
        this.view = 'gallery';
        this.root.classList.add('nt-lorebook-gallery-ready', 'is-gallery-view');
        this.root.classList.remove('is-editor-view');
        this.replaceSurfaceWith(this.gallery);
        this.gallery.hidden = false;
        this.editorView.hidden = true;
        this.editorView?.classList.remove('is-loading');
        this.editorView?.setAttribute('aria-busy', 'false');
        this.surface.addEventListener('click', this.boundClick);
        this.surface.addEventListener('input', this.boundInput);
        this.surface.addEventListener('change', this.boundChange);
        this.surface.addEventListener('keydown', this.boundKeydown);

        const select = this.panel.querySelector('#world_editor_select');
        if (select) {
            this.selectObserver = new MutationObserver(() => this.scheduleRefresh());
            this.selectObserver.observe(select, { childList: true });
        }

        await this.refresh();
        return true;
    }

    unmount({ keepNative = false } = {}) {
        this.selectObserver?.disconnect();
        this.selectObserver = null;
        if (this.surface) {
            this.surface.removeEventListener('click', this.boundClick);
            this.surface.removeEventListener('input', this.boundInput);
            this.surface.removeEventListener('change', this.boundChange);
            this.surface.removeEventListener('keydown', this.boundKeydown);
            // The editable Lorebook name belongs to NastyTavern. Put it back
            // in NastyTavern's header before returning the native World Info
            // panel to SillyTavern so no extension-owned input leaks into the
            // restored native surface.
            this.restoreNameInputToHeader();

            // The native World Info panel is mounted inside the active Lorebook
            // view so gallery/detail navigation replaces one body, like Persona.
            // Move it back out before removing the NastyTavern surface so the
            // runtime can restore SillyTavern's original DOM unchanged.
            if (this.panel && this.nativeHost?.contains(this.panel) && this.host?.isConnected) {
                if (this.surface?.parentNode === this.host) this.host.insertBefore(this.panel, this.surface);
                else this.host.append(this.panel);
            }
            this.surface.remove();
        }
        this.root?.classList.remove('nt-lorebook-gallery-ready', 'is-gallery-view', 'is-editor-view');
        if (!keepNative) {
            this.currentBook = '';
            this.currentEntryUid = '';
            this.currentBookData = null;
        }
        this.view = 'gallery';
        this.surface = null;
        this.gallery = null;
        this.editorView = null;
        this.editorHeader = null;
        this.nativeHost = null;
        this.root = null;
        this.panel = null;
        this.host = null;
    }

    ensureSurface() {
        let surface = this.host.querySelector(':scope > .nt-lorebook-library-surface');
        if (!surface) {
            surface = document.createElement('div');
            surface.className = 'nt-lorebook-library-surface';
            surface.innerHTML = `
                <section class="nt-lorebook-library" data-nt-lorebook-gallery aria-label="${esc(t('Lorebooks'))}"></section>
                <section class="nt-lorebook-editor-view" data-nt-lorebook-editor-view aria-label="${esc(t('Lorebook editor'))}" hidden>
                    <header class="nt-lorebook-editor-bar" data-nt-lorebook-editor-bar>
                        <button type="button" class="nt-control-btn nt-lorebook-back" data-nt-lorebook-back>${icons.arrowLeft}<span>${esc(t('Lorebooks'))}</span></button>
                        <div class="nt-lorebook-editor-heading">
                            <input type="text" class="text_pole nt-lorebook-name-input" data-nt-lorebook-name aria-label="${esc(t('Lorebook name'))}" autocomplete="off" spellcheck="false">
                        </div>
                    </header>
                    <div class="nt-lorebook-native-host" data-nt-lorebook-native-host></div>
                </section>`;
            this.host.insertBefore(surface, this.panel);
        }
        this.surface = surface;
        this.gallery = surface.querySelector('[data-nt-lorebook-gallery]');
        this.editorView = surface.querySelector('[data-nt-lorebook-editor-view]');
        this.editorHeader = surface.querySelector('[data-nt-lorebook-editor-bar]');
        this.nativeHost = surface.querySelector('[data-nt-lorebook-native-host]');
        if (this.nativeHost && this.panel.parentElement !== this.nativeHost) this.nativeHost.append(this.panel);
    }

    replaceSurfaceWith(node) {
        if (!this.surface || !node) return false;
        // Lorebook has one body and one active view. Never append gallery and
        // editor side by side: the active node physically replaces the previous
        // one, matching Persona gallery -> detail navigation.
        if (this.surface.childNodes.length !== 1 || this.surface.firstChild !== node) {
            this.surface.replaceChildren(node);
        }
        return true;
    }

    scheduleRefresh() {
        if (this.refreshQueued) return;
        this.refreshQueued = true;
        requestAnimationFrame(() => {
            this.refreshQueued = false;
            void this.refresh();
        });
    }

    async refresh() {
        if (!this.gallery || !this.panel) return;
        this.bindings = await this.buildBindingIndex();
        this.books = this.readBooks();
        const pages = Math.max(1, Math.ceil(this.filteredBooks().length / this.pageSize));
        this.page = Math.max(1, Math.min(this.page, pages));
        this.renderGallery();
    }

    readBooks() {
        const select = this.panel?.querySelector('#world_editor_select');
        if (!select) return [];
        const seen = new Set();
        const books = [];
        for (const option of select.options || []) {
            const nativeValue = clean(option.value);
            const name = clean(option.textContent) || nativeValue;
            if (!name || seen.has(name)) continue;
            seen.add(name);
            const binding = this.bindings.get(name) || this.emptyBinding();
            // SillyTavern may use an option index/value internally while the
            // actual Lorebook identity is the visible World Info name. Keep
            // both so NastyTavern can select the native option without leaking
            // values such as "0" into headings, bindings or save/load calls.
            books.push({ id: name, name, nativeValue: nativeValue || name, binding });
        }
        return books;
    }

    emptyBinding() {
        return { global: false, chat: false, characters: [], personas: [], cover: '', labels: [] };
    }

    bindingFor(map, name) {
        const key = clean(name);
        if (!key) return null;
        if (!map.has(key)) map.set(key, this.emptyBinding());
        return map.get(key);
    }

    characterAvatarUrl(avatar) {
        const file = clean(avatar);
        if (!file) return '';
        const context = contextSafe();
        try {
            const url = context?.getThumbnailUrl?.('avatar', file);
            if (url) return String(url);
        } catch (_) {}
        return `/thumbnail?type=avatar&file=${encodeURIComponent(file)}`;
    }

    personaAvatarUrl(id) {
        const file = clean(id);
        return file ? `/User Avatars/${encodeURIComponent(file)}` : '';
    }

    async buildBindingIndex() {
        const map = new Map();
        const context = contextSafe();
        const activeSelect = this.panel?.querySelector('#world_info');
        const selectedGlobal = new Set(
            activeSelect ? Array.from(activeSelect.selectedOptions || [])
                .map(option => clean(option.textContent) || clean(option.value))
                .filter(Boolean) : []
        );

        try {
            const module = await import('/scripts/world-info.js');
            for (const name of asArray(module?.selected_world_info).map(clean).filter(Boolean)) selectedGlobal.add(name);
            const charLore = module?.world_info?.charLore || module?.worldInfo?.charLore || [];
            const characters = Array.isArray(context.characters) ? context.characters : [];
            for (const item of asArray(charLore)) {
                const target = clean(item?.name);
                const char = characters.find(character => clean(character?.avatar) === target || clean(character?.name) === target);
                const label = clean(char?.name) || target || t('Character');
                const cover = this.characterAvatarUrl(char?.avatar);
                for (const name of asArray(item?.extraBooks).map(clean).filter(Boolean)) {
                    const binding = this.bindingFor(map, name);
                    if (!binding.characters.includes(label)) binding.characters.push(label);
                    if (!binding.cover && cover) binding.cover = cover;
                }
            }
        } catch (_) {}

        for (const name of selectedGlobal) {
            const binding = this.bindingFor(map, name);
            if (binding) binding.global = true;
        }

        const characters = Array.isArray(context.characters) ? context.characters : [];
        for (const character of characters) {
            const name = clean(character?.data?.extensions?.world || character?.extensions?.world || character?.world);
            if (!name) continue;
            const binding = this.bindingFor(map, name);
            const label = clean(character?.name) || t('Character');
            if (!binding.characters.includes(label)) binding.characters.push(label);
            const cover = this.characterAvatarUrl(character?.avatar);
            if (!binding.cover && cover) binding.cover = cover;
        }

        const power = context.powerUserSettings || context.power_user || window.power_user || {};
        const descriptions = power.persona_descriptions || {};
        const personas = power.personas || {};
        for (const [id, descriptor] of Object.entries(descriptions)) {
            const name = clean(descriptor?.lorebook);
            if (!name) continue;
            const binding = this.bindingFor(map, name);
            const label = clean(personas?.[id]) || clean(descriptor?.title) || clean(id.replace(/\.[^.]+$/, '')) || t('Persona');
            if (!binding.personas.includes(label)) binding.personas.push(label);
            const cover = this.personaAvatarUrl(id);
            if (!binding.cover && cover) binding.cover = cover;
        }

        const chatMetadata = context.chatMetadata || context.chat_metadata || {};
        const chatBook = clean(chatMetadata.world_info);
        if (chatBook) {
            const binding = this.bindingFor(map, chatBook);
            binding.chat = true;
        }

        for (const binding of map.values()) {
            binding.labels = [];
            if (binding.global) binding.labels.push(t('Global'));
            if (binding.chat) binding.labels.push(t('Chat'));
            if (binding.characters.length) binding.labels.push(t('Character'));
            if (binding.personas.length) binding.labels.push(t('Persona'));
        }
        return map;
    }

    filteredBooks() {
        const query = normalized(this.search);
        let books = this.books.filter(book => {
            const binding = book.binding || this.emptyBinding();
            if (query) {
                const haystack = normalized([book.name, ...binding.characters, ...binding.personas, ...binding.labels].join('\n'));
                if (!haystack.includes(query)) return false;
            }
            if (this.filter === 'global') return binding.global;
            if (this.filter === 'character') return binding.characters.length > 0;
            if (this.filter === 'persona') return binding.personas.length > 0;
            if (this.filter === 'chat') return binding.chat;
            if (this.filter === 'unbound') return !binding.global && !binding.chat && !binding.characters.length && !binding.personas.length;
            return true;
        });
        const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });
        books.sort((a, b) => this.sort === 'za' ? collator.compare(b.name, a.name) : collator.compare(a.name, b.name));
        return books;
    }

    cardMarkup(book) {
        const binding = book.binding || this.emptyBinding();
        const cover = clean(binding.cover);
        const words = book.name.split(/\s+/).filter(Boolean);
        const initials = (words.slice(0, 3).map(word => word[0]).join('') || book.name[0] || '?').toLocaleUpperCase();
        const badges = [];
        if (binding.global) badges.push(`<span>${esc(t('Global'))}</span>`);
        if (binding.chat) badges.push(`<span>${esc(t('Chat'))}</span>`);
        if (binding.characters.length) badges.push(`<span title="${esc(binding.characters.join(', '))}">${esc(t('Character'))}</span>`);
        if (binding.personas.length) badges.push(`<span title="${esc(binding.personas.join(', '))}">${esc(t('Persona'))}</span>`);
        if (!badges.length) badges.push(`<span class="is-muted">${esc(t('Unbound'))}</span>`);
        return `
            <article class="nt-lorebook-card" data-nt-lorebook-card="${esc(book.id)}">
                <button type="button" class="nt-lorebook-card-open" data-nt-lorebook-open="${esc(book.id)}" aria-label="${esc(t('Open {name}', { name: book.name }))}">
                    <span class="nt-lorebook-cover${cover ? ' has-image' : ''}">
                        ${cover ? `<img src="${esc(cover)}" alt="" loading="lazy" decoding="async">` : `<span>${esc(initials)}</span>${icons.lore}`}
                    </span>
                    <span class="nt-lorebook-card-copy">
                        <strong title="${esc(book.name)}">${esc(book.name)}</strong>
                        <span class="nt-lorebook-bindings">${badges.join('')}</span>
                    </span>
                </button>
                <button type="button" class="nt-lorebook-global-toggle${binding.global ? ' is-active' : ''}" data-nt-lorebook-global="${esc(book.name)}" aria-pressed="${binding.global ? 'true' : 'false'}" title="${esc(binding.global ? t('Remove from active global Lorebooks') : t('Add to active global Lorebooks'))}">
                    <i class="fa-solid fa-globe" aria-hidden="true"></i>
                </button>
            </article>`;
    }

    renderGallery() {
        if (!this.gallery) return;
        const rows = this.filteredBooks();
        const pages = Math.max(1, Math.ceil(rows.length / this.pageSize));
        this.page = Math.max(1, Math.min(this.page, pages));
        const start = (this.page - 1) * this.pageSize;
        const visible = rows.slice(start, start + this.pageSize);
        const filter = (value, label) => `<button type="button" class="nt-lorebook-filter${this.filter === value ? ' is-active' : ''}" data-nt-lorebook-filter="${value}" aria-pressed="${this.filter === value ? 'true' : 'false'}">${esc(t(label))}</button>`;
        this.gallery.innerHTML = `
            <header class="nt-lorebook-library-header">
                <div class="nt-lorebook-library-actions">
                    <button type="button" class="nt-control-btn is-primary" data-nt-lorebook-create>${icons.plus}<span>${esc(t('New'))}</span></button>
                    <button type="button" class="nt-control-btn" data-nt-lorebook-import>${icons.upload}<span>${esc(t('Import'))}</span></button>
                    <button type="button" class="nt-icon-btn" data-nt-lorebook-settings title="${esc(t('Lorebook settings'))}" aria-label="${esc(t('Lorebook settings'))}">${icons.settings}</button>
                    <button type="button" class="nt-icon-btn" data-nt-lorebook-refresh title="${esc(t('Refresh'))}" aria-label="${esc(t('Refresh'))}">${icons.refresh}</button>
                </div>
            </header>
            <div class="nt-lorebook-library-toolbar">
                <label class="nt-lorebook-search">${icons.search}<input type="search" class="text_pole" data-nt-lorebook-search value="${esc(this.search)}" placeholder="${esc(t('Search Lorebooks…'))}"></label>
                <div class="nt-lorebook-filters" role="group" aria-label="${esc(t('Filter Lorebooks'))}">
                    ${filter('all', 'All')}${filter('global', 'Global')}${filter('character', 'Character')}${filter('persona', 'Persona')}${filter('chat', 'Chat')}${filter('unbound', 'Unbound')}
                </div>
                <select class="text_pole nt-lorebook-sort" data-nt-lorebook-sort aria-label="${esc(t('Sort Lorebooks'))}">
                    <option value="az" ${this.sort === 'az' ? 'selected' : ''}>${esc(t('A → Z'))}</option>
                    <option value="za" ${this.sort === 'za' ? 'selected' : ''}>${esc(t('Z → A'))}</option>
                </select>
            </div>
            <div class="nt-lorebook-library-body">
                ${visible.length ? `<div class="nt-lorebook-grid">${visible.map(book => this.cardMarkup(book)).join('')}</div>` : `<div class="nt-lorebook-library-empty">${icons.lore}<strong>${esc(t('No Lorebooks found'))}</strong><span>${esc(t('Try another filter or create a new Lorebook.'))}</span></div>`}
            </div>
            <footer class="nt-lorebook-library-footer">
                <span>${rows.length} ${esc(rows.length === 1 ? t('Lorebook') : t('Lorebooks'))}</span>
                <div class="nt-lorebook-pager">
                    <button type="button" class="nt-icon-btn" data-nt-lorebook-page="prev" ${this.page <= 1 ? 'disabled' : ''} aria-label="${esc(t('Previous page'))}">‹</button>
                    <span><strong>${this.page}</strong> / ${pages}</span>
                    <button type="button" class="nt-icon-btn" data-nt-lorebook-page="next" ${this.page >= pages ? 'disabled' : ''} aria-label="${esc(t('Next page'))}">›</button>
                </div>
            </footer>`;
    }

    async openBook(name) {
        const requested = clean(name);
        if (!requested) return;
        const book = this.books.find(item => item.id === requested || item.name === requested || item.nativeValue === requested);
        const bookName = clean(book?.name) || requested;
        const nativeValue = clean(book?.nativeValue) || requested;

        this.currentBook = bookName;
        this.currentEntryUid = '';
        this.currentBookData = null;

        // Replace the gallery *before* asking SillyTavern to change World Info.
        // The previous implementation appended editorView so the native selector
        // stayed connected while loading; that temporarily (or, on a slow/failed
        // native update, permanently) produced gallery + editor stacked vertically.
        // editorView already owns the native panel, so making it the sole surface
        // child first keeps the panel connected without ever rendering two views.
        this.showEditor(bookName, { loading: true });

        let ok = false;
        try {
            ok = await this.hooks.openBook?.(nativeValue);
        } catch (error) {
            ok = false;
        }
        if (ok === false) {
            this.showGallery();
            return;
        }

        // Native World Info has finished selecting/rendering this book inside the
        // already-active detail body; finish the header synchronization.
        this.showEditor(bookName, { loading: false });
        await this.loadCurrentBookData();
        this.syncEditorHeader();
        this.hooks.syncEntryFolders?.();
    }

    showGallery() {
        // Restore any split DOM while the native editor is still connected, then
        // make the gallery the sole child of the Lorebook body.
        this.hooks.onShowGallery?.();
        this.view = 'gallery';
        this.root?.classList.add('is-gallery-view');
        this.root?.classList.remove('is-editor-view', 'is-sidebar-hidden');
        if (this.editorView) {
            this.editorView.hidden = true;
            this.editorView.classList.remove('is-loading');
            this.editorView.setAttribute('aria-busy', 'false');
        }
        if (this.gallery) this.gallery.hidden = false;
        this.replaceSurfaceWith(this.gallery);
        this.currentEntryUid = '';
        this.scheduleRefresh();
    }

    showEditor(name, { loading = false } = {}) {
        this.currentBook = clean(name) || this.currentBook;
        this.view = 'editor';
        this.root?.classList.remove('is-gallery-view');
        this.root?.classList.add('is-editor-view');
        if (this.gallery) this.gallery.hidden = true;
        if (this.editorView) {
            this.editorView.hidden = false;
            this.editorView.classList.toggle('is-loading', Boolean(loading));
            this.editorView.setAttribute('aria-busy', loading ? 'true' : 'false');
        }
        this.replaceSurfaceWith(this.editorView);
        this.syncEditorHeader();
    }

    moveNameInputToFileRow() {
        const nameInput = this.editorView?.querySelector?.('[data-nt-lorebook-name]') || null;
        const select = this.panel?.querySelector?.('#world_editor_select') || null;
        const row = select?.closest?.('.flex-container.alignitemscenter') || null;
        if (!nameInput || !row) return nameInput;

        row.classList.add('nt-lorebook-file-actions-row');
        if (nameInput.parentElement !== row) {
            const anchor = row.querySelector('#world_popup_export, #world_duplicate, #world_popup_delete, .nt-native-community-share-lorebook');
            row.insertBefore(nameInput, anchor || row.firstChild);
        }
        return nameInput;
    }

    restoreNameInputToHeader() {
        const nameInput = this.panel?.querySelector?.('[data-nt-lorebook-name]')
            || this.editorView?.querySelector?.('[data-nt-lorebook-name]')
            || null;
        const heading = this.editorHeader?.querySelector?.('.nt-lorebook-editor-heading') || null;
        if (nameInput && heading && nameInput.parentElement !== heading) heading.prepend(nameInput);
        this.panel?.querySelector?.('.nt-lorebook-file-actions-row')?.classList.remove('nt-lorebook-file-actions-row');
    }

    syncEditorHeader() {
        if (!this.editorHeader) return;
        const nameInput = this.moveNameInputToFileRow();
        if (nameInput && document.activeElement !== nameInput && !this.renamePending) nameInput.value = this.currentBook || '';
    }

    async renameCurrentBook(nextName, input = null) {
        const previousName = clean(this.currentBook);
        const requestedName = clean(nextName);
        const field = input || this.editorView?.querySelector?.('[data-nt-lorebook-name]') || null;

        if (!previousName || this.renamePending) return false;
        if (!requestedName) {
            if (field) field.value = previousName;
            this.toast?.(t('Lorebook name cannot be empty.'));
            return false;
        }
        if (requestedName === previousName) {
            if (field) field.value = previousName;
            return true;
        }

        this.renamePending = true;
        if (field) {
            field.disabled = true;
            field.setAttribute('aria-busy', 'true');
        }

        try {
            const renamed = await this.hooks.renameBook?.(previousName, requestedName);
            if (!renamed) {
                if (field) field.value = previousName;
                this.toast?.(t('Could not rename this Lorebook.'));
                return false;
            }

            this.currentBook = clean(renamed) || requestedName;
            this.currentBookData = null;
            await this.loadCurrentBookData();
            this.bindings = await this.buildBindingIndex();
            this.syncEditorHeader();
            this.scheduleRefresh();
            return true;
        } catch (error) {
            if (field) field.value = previousName;
            this.toast?.(t('Could not rename this Lorebook.'));
            return false;
        } finally {
            this.renamePending = false;
            if (field) {
                field.disabled = false;
                field.removeAttribute('aria-busy');
                if (document.activeElement !== field) field.value = this.currentBook || previousName;
            }
        }
    }

    async loadCurrentBookData() {
        if (!this.currentBook) {
            this.currentBookData = null;
            return null;
        }
        try {
            const module = await import('/scripts/world-info.js');
            this.currentBookData = await module.loadWorldInfo?.(this.currentBook) || null;
        } catch (error) {
            this.currentBookData = null;
        }
        return this.currentBookData;
    }

    getEntryData(uid) {
        const entries = this.currentBookData?.entries || {};
        return entries?.[uid] || entries?.[Number(uid)] || Object.values(entries).find(entry => clean(entry?.uid) === clean(uid)) || null;
    }

    entryFolder(entry) {
        return clean(
            entry?.extensions?.nastyTavern?.folder
            || entry?.extensions?.worldInfoGallery?.folder
            || entry?.extensions?.world_info_gallery?.folder
            || entry?.extensions?.folder
            || ''
        );
    }

    folderForUid(uid) {
        return this.entryFolder(this.getEntryData(uid));
    }

    syncSelectedEntry(uid) {
        this.currentEntryUid = clean(uid);
        this.syncEditorHeader();
    }

    decorateEntrySidebar(sidebar) {
        if (!sidebar || !this.currentBookData) return;
        const rows = Array.from(sidebar.querySelectorAll(':scope > .nt-lorebook-entry-row'));
        if (!rows.length) return;
        const groups = new Map();
        for (const row of rows) {
            const folder = this.folderForUid(row.dataset.ntLorebookEntryUid) || '';
            if (!groups.has(folder)) groups.set(folder, []);
            groups.get(folder).push(row);
        }
        if (groups.size === 1 && groups.has('')) return;
        sidebar.replaceChildren();
        const ordered = [...groups.entries()].sort(([a], [b]) => {
            if (!a) return 1;
            if (!b) return -1;
            return a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true });
        });
        for (const [folder, folderRows] of ordered) {
            const heading = document.createElement('div');
            heading.className = 'nt-lorebook-folder-heading';
            heading.innerHTML = `${icons.folder}<span>${esc(folder || t('Unfiled'))}</span><small>${folderRows.length}</small>`;
            sidebar.append(heading, ...folderRows);
        }
    }

    async toggleGlobal(name) {
        const select = this.panel?.querySelector('#world_info');
        if (!select) {
            this.toast?.(t('Could not change active Lorebooks.'));
            return;
        }
        const option = Array.from(select.options || []).find(item => {
            const target = clean(name);
            return clean(item.value) === target || clean(item.textContent) === target;
        });
        if (!option) return;
        option.selected = !option.selected;
        const jq = window.jQuery || window.$;
        if (jq?.fn?.select2 && jq(select).data('select2')) jq(select).trigger('change');
        else select.dispatchEvent(new Event('change', { bubbles: true }));
        await this.refresh();
    }

    onClick(event) {
        const open = event.target.closest('[data-nt-lorebook-open]');
        if (open) {
            event.preventDefault();
            void this.openBook(open.dataset.ntLorebookOpen);
            return;
        }
        const filter = event.target.closest('[data-nt-lorebook-filter]');
        if (filter) {
            event.preventDefault();
            this.filter = filter.dataset.ntLorebookFilter || 'all';
            this.page = 1;
            this.renderGallery();
            return;
        }
        const page = event.target.closest('[data-nt-lorebook-page]');
        if (page) {
            event.preventDefault();
            const pages = Math.max(1, Math.ceil(this.filteredBooks().length / this.pageSize));
            this.page = page.dataset.ntLorebookPage === 'prev' ? Math.max(1, this.page - 1) : Math.min(pages, this.page + 1);
            this.renderGallery();
            return;
        }
        const globalToggle = event.target.closest('[data-nt-lorebook-global]');
        if (globalToggle) {
            event.preventDefault();
            event.stopPropagation();
            void this.toggleGlobal(globalToggle.dataset.ntLorebookGlobal);
            return;
        }
        if (event.target.closest('[data-nt-lorebook-back]')) {
            event.preventDefault();
            this.showGallery();
            return;
        }
        if (event.target.closest('[data-nt-lorebook-create]')) {
            event.preventDefault();
            this.panel?.querySelector('#world_create_button')?.click();
            setTimeout(() => this.scheduleRefresh(), 100);
            return;
        }
        if (event.target.closest('[data-nt-lorebook-import]')) {
            event.preventDefault();
            this.panel?.querySelector('#world_import_button')?.click();
            return;
        }
        if (event.target.closest('[data-nt-lorebook-settings]')) {
            event.preventDefault();
            void this.hooks.openSettings?.();
            return;
        }
        if (event.target.closest('[data-nt-lorebook-refresh]')) {
            event.preventDefault();
            void this.refresh();
        }
    }

    onInput(event) {
        const search = event.target.closest('[data-nt-lorebook-search]');
        if (search) {
            this.search = search.value;
            this.page = 1;
            this.renderGallery();
        }
    }

    onChange(event) {
        const sort = event.target.closest('[data-nt-lorebook-sort]');
        if (sort) {
            this.sort = sort.value === 'za' ? 'za' : 'az';
            this.settings.lorebookStudio ||= {};
            this.settings.lorebookStudio.sort = this.sort;
            saveSettings();
            this.page = 1;
            this.renderGallery();
            return;
        }
        const nameInput = event.target.closest('[data-nt-lorebook-name]');
        if (nameInput) {
            void this.renameCurrentBook(nameInput.value, nameInput);
            return;
        }
    }

    onKeydown(event) {
        const nameInput = event.target.closest?.('[data-nt-lorebook-name]');
        if (!nameInput) return;
        if (event.key === 'Enter' && !event.isComposing) {
            event.preventDefault();
            nameInput.blur();
            return;
        }
        if (event.key === 'Escape') {
            event.preventDefault();
            nameInput.value = this.currentBook || '';
            nameInput.blur();
        }
    }
}
