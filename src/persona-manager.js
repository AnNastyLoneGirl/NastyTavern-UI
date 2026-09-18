import { icons } from './icons.js';
import { getContextSafe, escapeHtml, debounce } from './utils.js';
import { saveSettings } from './settings.js';

const DEFAULT_PAGE_SIZE = 48;
const DEFAULT_SECTIONS = [
    ['appearance', 'Appearance'],
    ['mentality', 'Mentality'],
    ['character-lore', 'Character Lore'],
    ['social-relationships', 'Social Relationships'],
];

const uuid = () => globalThis.crypto?.randomUUID?.() || `nt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
const asString = value => String(value ?? '');
const normalize = value => asString(value).trim().toLocaleLowerCase();
const uniqueStrings = values => [...new Set((Array.isArray(values) ? values : []).map(asString).filter(Boolean))];

function optionHtml(value, label, current) {
    return `<option value="${escapeHtml(value)}"${asString(value) === asString(current) ? ' selected' : ''}>${escapeHtml(label)}</option>`;
}

export class PersonaManager {
    constructor(settings, toast = () => {}, options = {}) {
        this.settings = settings;
        this.toast = toast;
        this.isExternalProviderActive = typeof options.isExternalProviderActive === 'function' ? options.isExternalProviderActive : () => false;
        this.workspaceRoot = null;
        this.host = null;
        this.studio = null;
        this.main = null;
        this.nativeBlock = null;
        this.personaApiPromise = null;
        this.scriptApiPromise = null;
        this.eventBindings = [];
        this.mounted = false;
        this.view = 'gallery';
        this.tab = 'details';
        this.activeId = '';
        this.search = '';
        this.filter = 'all';
        this.sort = 'az';
        this.page = 1;
        this.pageSize = DEFAULT_PAGE_SIZE;
        this.dragSectionId = '';
        this.lightbox = null;
        this.generationSnapshot = null;
        this.boundClick = event => this.onClick(event);
        this.boundInput = event => this.onInput(event);
        this.boundChange = event => this.onChange(event);
        this.boundDragStart = event => this.onDragStart(event);
        this.boundDragOver = event => this.onDragOver(event);
        this.boundDrop = event => this.onDrop(event);
        this.boundDragEnd = event => this.onDragEnd(event);
        this.persistExtraDebounced = debounce(() => {
            saveSettings();
            this.syncPromptInjection();
        }, 220);
        this.refreshDebounced = debounce(() => {
            if (!this.workspaceRoot || this.workspaceRoot.hidden) return;
            this.renderCurrentView();
        }, 120);
    }

    ensureStore() {
        if (!this.settings.personaStudio || typeof this.settings.personaStudio !== 'object') {
            this.settings.personaStudio = { personas: {} };
        }
        if (!this.settings.personaStudio.personas || typeof this.settings.personaStudio.personas !== 'object') {
            this.settings.personaStudio.personas = {};
        }
        return this.settings.personaStudio;
    }

    personaExtra(id, { create = true } = {}) {
        const store = this.ensureStore();
        let extra = store.personas[id];
        if (!extra && !create) return null;
        if (!extra || typeof extra !== 'object') {
            extra = { sections: [], variants: [] };
            store.personas[id] = extra;
        }
        if (!Array.isArray(extra.sections)) extra.sections = [];
        if (!Array.isArray(extra.variants)) extra.variants = [];
        if (!extra.sections.length) {
            extra.sections = DEFAULT_SECTIONS.map(([key, title]) => ({ id: uuid(), key, title, text: '', enabled: true }));
        }
        return extra;
    }

    async loadPersonaApi() {
        if (!this.personaApiPromise) {
            this.personaApiPromise = import('/scripts/personas.js').catch(error => {
                return {};
            });
        }
        return this.personaApiPromise;
    }

    async loadScriptApi() {
        if (!this.scriptApiPromise) {
            this.scriptApiPromise = import('/script.js').catch(error => {
                return {};
            });
        }
        return this.scriptApiPromise;
    }

    mount() {
        if (this.mounted) return;
        this.mounted = true;
        this.ensureStore();
        this.bindContextEvents();
        void this.syncPromptInjection();
    }

    unmount() {
        for (const binding of this.eventBindings) {
            try { binding.source?.off?.(binding.event, binding.handler); } catch (_) {}
            try { binding.source?.removeListener?.(binding.event, binding.handler); } catch (_) {}
        }
        this.eventBindings = [];
        this.mounted = false;
        this.restoreGenerationOverlay();
        this.closeLightbox();
        this.clearPromptInjection();
        this.workspaceRoot = null;
        this.host = null;
        this.studio = null;
        this.main = null;
        this.nativeBlock = null;
    }

    bindContextEvents() {
        const context = getContextSafe();
        const source = context?.eventSource;
        const types = context?.eventTypes || {};
        if (!source?.on) return;

        const bind = (key, handler) => {
            const event = types[key] || key;
            try {
                source.on(event, handler);
                this.eventBindings.push({ source, event, handler });
            } catch (_) {}
        };

        for (const key of ['PERSONA_CHANGED', 'PERSONA_UPDATED', 'PERSONA_RENAMED', 'PERSONA_CREATED', 'PERSONA_DELETED', 'CHAT_CHANGED', 'CHAT_CREATED', 'GROUP_UPDATED', 'CHARACTER_EDITED']) {
            bind(key, () => {
                if (key === 'PERSONA_CHANGED') this.restoreGenerationOverlay();
                this.refreshDebounced();
            });
        }

        // Persona Library-style variants are generation-scoped: extend the
        // active native persona description immediately before prompt assembly,
        // then restore it as soon as generation finishes/stops. Nothing is
        // persisted into SillyTavern's persona descriptor.
        bind('GENERATION_AFTER_COMMANDS', () => this.applyGenerationOverlay());
        bind('GENERATION_ENDED', () => this.restoreGenerationOverlay());
        bind('GENERATION_STOPPED', () => this.restoreGenerationOverlay());
    }

    open(workspaceRoot, nativeBlock = null) {
        this.workspaceRoot = workspaceRoot;
        this.host = workspaceRoot?.querySelector?.('[data-nt-persona-host]') || null;
        if (!this.host) return false;
        if (nativeBlock) this.nativeBlock = nativeBlock;
        this.ensureShell();
        this.view = 'gallery';
        this.tab = 'details';
        this.activeId = this.currentPersonaId() || this.personaIds()[0] || '';
        this.renderCurrentView();
        void this.syncPromptInjection();
        return true;
    }

    close() {
        this.closeLightbox();
    }

    ensureShell() {
        let studio = this.host.querySelector(':scope > .nt-persona-studio');
        if (!studio) {
            this.host.replaceChildren();
            studio = document.createElement('div');
            studio.className = 'nt-persona-studio';
            studio.innerHTML = `
                <div class="nt-persona-studio-main" data-nt-persona-main></div>
            `;
            studio.addEventListener('click', this.boundClick);
            studio.addEventListener('input', this.boundInput);
            studio.addEventListener('change', this.boundChange);
            studio.addEventListener('dragstart', this.boundDragStart);
            studio.addEventListener('dragover', this.boundDragOver);
            studio.addEventListener('drop', this.boundDrop);
            studio.addEventListener('dragend', this.boundDragEnd);
            this.host.append(studio);
        }
        this.studio = studio;
        this.main = studio.querySelector('[data-nt-persona-main]');
    }

    setNativeBlock(block) {
        this.nativeBlock = block || null;
        if (block) {
            block.classList.add('nt-persona-native-editor');
        }
    }

    renderCurrentView() {
        if (!this.main) return;
        if (this.view === 'detail' && this.activeId && this.personaExists(this.activeId)) {
            this.renderDetail();
        } else if (this.view === 'global') {
            this.renderGlobalSettings();
        } else {
            this.view = 'gallery';
            this.renderGallery();
        }
    }

    context() {
        return getContextSafe() || {};
    }

    power() {
        const context = this.context();
        return context.powerUserSettings || context.power_user || window.power_user || {};
    }

    personaIds() {
        const power = this.power();
        return [...new Set([
            ...Object.keys(power.personas || {}),
            ...Object.keys(power.persona_descriptions || {}),
        ])];
    }

    personaExists(id) {
        return this.personaIds().includes(id);
    }

    currentPersonaId() {
        const selected = document.querySelector('#user_avatar_block .avatar-container.selected, #user_avatar_block .avatar-container.current');
        const fromDom = selected?.dataset?.avatarId || selected?.getAttribute?.('imgfile');
        if (fromDom) return fromDom;
        const overwrite = document.querySelector('#avatar_upload_overwrite')?.value;
        const power = this.power();
        if (overwrite && (power.personas?.[overwrite] || power.persona_descriptions?.[overwrite])) return overwrite;
        return this._lastKnownPersonaId || '';
    }

    descriptor(id, { create = true } = {}) {
        const power = this.power();
        if (!power.persona_descriptions || typeof power.persona_descriptions !== 'object') {
            if (!create) return null;
            power.persona_descriptions = {};
        }
        let descriptor = power.persona_descriptions[id];
        if (!descriptor && create) {
            descriptor = {
                description: '',
                position: 0,
                depth: 2,
                role: 0,
                lorebook: '',
                connections: [],
                title: '',
            };
            power.persona_descriptions[id] = descriptor;
        }
        if (descriptor && !Array.isArray(descriptor.connections)) descriptor.connections = [];
        return descriptor || null;
    }

    personaName(id) {
        const power = this.power();
        return asString(power.personas?.[id] || id.replace(/\.[^.]+$/, '') || 'Persona');
    }


    avatarUrl(id) {
        try {
            const escaped = globalThis.CSS?.escape?.(id) || id.replace(/["\\]/g, '\\$&');
            const native = document.querySelector(`#user_avatar_block [data-avatar-id="${escaped}"] img, #user_avatar_block [imgfile="${escaped}"] img`);
            if (native?.src) return native.src;
        } catch (_) {}
        return `/User Avatars/${encodeURIComponent(id)}`;
    }

    currentContextIdentity() {
        const context = this.context();
        const characterId = context.characterId ?? context.character_id ?? null;
        const groupId = context.groupId ?? context.group_id ?? null;
        const characters = context.characters || [];
        const groups = context.groups || [];
        const character = characterId != null ? characters?.[characterId] : null;
        const group = groupId != null
            ? (Array.isArray(groups) ? groups.find(item => asString(item?.id) === asString(groupId)) : groups?.[groupId])
            : null;
        const targetId = group ? asString(group.id ?? groupId) : asString(character?.avatar || character?.name || (characterId ?? ''));
        const targetType = group ? 'group' : character ? 'character' : '';
        const targetName = group?.name || character?.name || '';
        const chatMetadata = context.chatMetadata || context.chat_metadata || {};
        const chatKey = asString(
            context.chatId ?? context.chat_id ?? chatMetadata.file_name ?? chatMetadata.chat_id ?? chatMetadata.id ?? ''
        );
        const searchableCharacter = [
            targetName,
            character?.description,
            character?.personality,
            character?.scenario,
            character?.creator_notes,
            character?.data?.description,
            character?.data?.personality,
            character?.data?.scenario,
        ].filter(Boolean).join('\n');
        return { targetId, targetType, targetName, chatKey, character, group, searchableCharacter };
    }


    bindingTargetLabel(id) {
        const targetId = asString(id);
        const context = this.context();
        const characters = Array.isArray(context.characters) ? context.characters : [];
        const character = characters.find((item, index) => {
            if (!item) return false;
            return [item.avatar, item.name, item.id, index].some(value => asString(value) === targetId);
        });
        if (character?.name) return character.name;
        const groups = Array.isArray(context.groups) ? context.groups : Object.values(context.groups || {});
        const group = groups.find(item => item && asString(item.id) === targetId);
        if (group?.name) return group.name;
        return targetId;
    }

    lockStates(id, identity = this.currentContextIdentity(), chatMetadata = null) {
        const power = this.power();
        const context = this.context();
        const descriptor = this.descriptor(id, { create: false }) || {};
        chatMetadata ||= context.chatMetadata || context.chat_metadata || {};
        const connected = (descriptor.connections || []).some(connection =>
            identity.targetId && asString(connection?.id) === identity.targetId && (!connection?.type || connection.type === identity.targetType)
        );
        return {
            default: asString(power.default_persona) === asString(id),
            chat: asString(chatMetadata.persona) === asString(id),
            character: connected,
        };
    }

    filteredPersonas() {
        const power = this.power();
        const query = normalize(this.search);
        const current = this.currentPersonaId();
        const identity = this.currentContextIdentity();
        const context = this.context();
        const chatMetadata = context.chatMetadata || context.chat_metadata || {};
        let rows = this.personaIds().map(id => {
            const descriptor = this.descriptor(id, { create: false }) || {};
            const extra = this.personaExtra(id, { create: false });
            const locks = this.lockStates(id, identity, chatMetadata);
            const name = this.personaName(id);
            const title = asString(descriptor.title || '');
            const description = asString(descriptor.description || '');
            const connectedCount = Array.isArray(descriptor.connections) ? descriptor.connections.length : 0;
            return { id, name, title, description, descriptor, extra, locks, current: asString(id) === asString(current), connectedCount };
        });
        if (query) {
            rows = rows.filter(row => normalize([row.name, row.title, row.description].join('\n')).includes(query));
        }
        if (this.filter === 'default') rows = rows.filter(row => row.locks.default);
        else if (this.filter === 'connected') rows = rows.filter(row => row.connectedCount > 0 || row.locks.chat || row.locks.character);
        else if (this.filter === 'current') rows = rows.filter(row => row.current);
        else if (this.filter === 'extended') rows = rows.filter(row => row.extra?.sections?.some(section => section.text?.trim()) || row.extra?.variants?.length);
        const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
        rows.sort((a, b) => this.sort === 'za' ? collator.compare(b.name, a.name) : collator.compare(a.name, b.name));
        return rows;
    }

    renderGallery() {
        this.main.hidden = false;
        this.main.innerHTML = `
            <section class="nt-persona-gallery" aria-label="Personas">
                <div class="nt-persona-gallery-toolbar">
                    <div class="nt-persona-toolbar-actions">
                        <button class="nt-control-btn is-primary" type="button" data-nt-persona-action="create">${icons.plus}<span>Create persona</span></button>
                        <button class="nt-control-btn" type="button" data-nt-persona-action="upload">${icons.upload}<span>Import image</span></button>
                        <button class="nt-control-btn" type="button" data-nt-persona-action="backup">${icons.download}<span>Backup</span></button>
                        <button class="nt-control-btn" type="button" data-nt-persona-action="restore">${icons.upload}<span>Restore</span></button>
                        <button class="nt-control-btn" type="button" data-nt-persona-action="global">${icons.settings}<span>Global settings</span></button>
                    </div>
                    <label class="nt-persona-search">
                        ${icons.search}
                        <input type="search" data-nt-persona-search placeholder="Search personas…" value="${escapeHtml(this.search)}" autocomplete="off">
                    </label>
                    <div class="nt-persona-gallery-filters" role="group" aria-label="Persona filters">
                        ${this.filterButton('all', 'All')}
                        ${this.filterButton('current', 'Current')}
                        ${this.filterButton('default', 'Default')}
                        ${this.filterButton('connected', 'Connected')}
                        ${this.filterButton('extended', 'Structured')}
                    </div>
                    <label class="nt-persona-sort-control">
                        <span>Sort</span>
                        <select data-nt-persona-sort>
                            ${optionHtml('az', 'A–Z', this.sort)}
                            ${optionHtml('za', 'Z–A', this.sort)}
                        </select>
                    </label>
                </div>
                <div class="nt-persona-gallery-results" data-nt-persona-results></div>
                <div class="nt-persona-gallery-pager" data-nt-persona-pager></div>
            </section>
        `;
        this.refreshGalleryList();
    }

    filterButton(value, label) {
        return `<button type="button" class="nt-persona-filter${this.filter === value ? ' is-active' : ''}" data-nt-persona-filter="${escapeHtml(value)}">${escapeHtml(label)}</button>`;
    }

    refreshGalleryList() {
        const results = this.main?.querySelector('[data-nt-persona-results]');
        const pager = this.main?.querySelector('[data-nt-persona-pager]');
        if (!results || !pager) return;
        const rows = this.filteredPersonas();
        const pages = Math.max(1, Math.ceil(rows.length / this.pageSize));
        this.page = Math.max(1, Math.min(this.page, pages));
        const start = (this.page - 1) * this.pageSize;
        const visible = rows.slice(start, start + this.pageSize);
        results.innerHTML = visible.length
            ? `<div class="nt-persona-grid">${visible.map(row => this.personaCardHtml(row)).join('')}</div>`
            : `<div class="nt-persona-empty"><strong>No personas found</strong><span>Try another search or create a new persona.</span></div>`;
        pager.innerHTML = `
            <div class="nt-persona-result-count">${rows.length} persona${rows.length === 1 ? '' : 's'}</div>
            <div class="nt-persona-pager-controls">
                <button type="button" class="nt-icon-btn" data-nt-persona-page="first" ${this.page <= 1 ? 'disabled' : ''} aria-label="First page">«</button>
                <button type="button" class="nt-icon-btn" data-nt-persona-page="prev" ${this.page <= 1 ? 'disabled' : ''} aria-label="Previous page">‹</button>
                <span><strong>${this.page}</strong> / ${pages}</span>
                <button type="button" class="nt-icon-btn" data-nt-persona-page="next" ${this.page >= pages ? 'disabled' : ''} aria-label="Next page">›</button>
                <button type="button" class="nt-icon-btn" data-nt-persona-page="last" ${this.page >= pages ? 'disabled' : ''} aria-label="Last page">»</button>
            </div>
        `;
    }

    personaCardHtml(row) {
        const status = [];
        if (row.current) status.push('<span class="nt-persona-badge is-current">Current</span>');
        if (row.locks.default) status.push('<span class="nt-persona-badge">Default</span>');
        if (row.connectedCount) status.push(`<span class="nt-persona-badge">${row.connectedCount} linked</span>`);
        if (row.extra?.variants?.length) status.push(`<span class="nt-persona-badge">${row.extra.variants.length} variant${row.extra.variants.length === 1 ? '' : 's'}</span>`);
        const summary = row.title || row.description;
        return `
            <button type="button" class="nt-persona-card${row.current ? ' is-current' : ''}${row.locks.default ? ' is-default' : ''}" data-nt-persona-open="${escapeHtml(row.id)}">
                <span class="nt-persona-card-image"><img src="${escapeHtml(this.avatarUrl(row.id))}" alt="" loading="lazy" decoding="async"></span>
                <span class="nt-persona-card-body">
                    <strong title="${escapeHtml(row.name)}">${escapeHtml(row.name)}</strong>
                    ${summary ? `<span class="nt-persona-card-summary">${escapeHtml(summary)}</span>` : ''}
                    ${status.length ? `<span class="nt-persona-card-badges">${status.join('')}</span>` : ''}
                </span>
            </button>
        `;
    }

    renderGlobalSettings() {
        if (!this.main) return;
        this.main.hidden = false;
        const power = this.power();
        this.main.innerHTML = `
            <section class="nt-persona-global">
                <div class="nt-persona-detail-toolbar">
                    <button type="button" class="nt-control-btn" data-nt-persona-action="back">${icons.arrowLeft}<span>Personas</span></button>
                    <div class="nt-persona-detail-heading"><strong>Global Persona Settings</strong><span>Uses SillyTavern's native persona settings as the source of truth.</span></div>
                </div>
                <div class="nt-persona-global-list">
                    <label class="nt-persona-setting-row"><span><strong>Switch notifications</strong><small>Show persona selection and lock notifications.</small></span><input type="checkbox" data-nt-persona-global="persona_show_notifications" ${power.persona_show_notifications !== false ? 'checked' : ''}></label>
                    <label class="nt-persona-setting-row"><span><strong>Allow multiple character connections</strong><small>Permit more than one persona to be connected to the same character.</small></span><input type="checkbox" data-nt-persona-global="persona_allow_multi_connections" ${power.persona_allow_multi_connections ? 'checked' : ''}></label>
                    <label class="nt-persona-setting-row"><span><strong>Auto-lock selected persona to chat</strong><small>Automatically bind a chosen persona to the active chat.</small></span><input type="checkbox" data-nt-persona-global="persona_auto_lock" ${power.persona_auto_lock ? 'checked' : ''}></label>
                </div>
            </section>
        `;
    }

    renderDetail() {
        if (!this.activeId || !this.personaExists(this.activeId)) {
            this.view = 'gallery';
            this.renderGallery();
            return;
        }
        const id = this.activeId;
        const descriptor = this.descriptor(id);
        const name = this.personaName(id);
        const title = asString(descriptor.title || '');
        const locks = this.lockStates(id);
        const current = asString(this.currentPersonaId()) === asString(id);
        const tabs = [
            ['details', 'Details'],
            ['structured', 'Structured'],
            ['variants', 'Variants'],
            ['preview', 'Preview'],
        ];
        this.main.hidden = false;
        this.main.innerHTML = `
            <section class="nt-persona-detail">
                <div class="nt-persona-detail-toolbar">
                    <button type="button" class="nt-control-btn" data-nt-persona-action="back">${icons.arrowLeft}<span>Personas</span></button>
                    <div class="nt-persona-detail-heading">
                        <strong>${escapeHtml(name)}</strong>
                        ${title ? `<span>${escapeHtml(title)}</span>` : ''}
                    </div>
                    <div class="nt-persona-detail-actions">
                        <button type="button" class="nt-control-btn${current ? ' is-active' : ''}" data-nt-persona-action="use">${icons.check}<span>${current ? 'In use' : 'Use persona'}</span></button>
                        <button type="button" class="nt-control-btn${locks.default ? ' is-active' : ''}" data-nt-persona-lock="default">Default</button>
                        <button type="button" class="nt-control-btn${locks.chat ? ' is-active' : ''}" data-nt-persona-lock="chat">Chat</button>
                        <button type="button" class="nt-control-btn${locks.character ? ' is-active' : ''}" data-nt-persona-lock="character">Character</button>
                    </div>
                </div>
                <div class="nt-persona-detail-layout">
                    <aside class="nt-persona-detail-aside">
                        <button class="nt-persona-portrait" type="button" data-nt-persona-action="lightbox" title="View full image">
                            <img src="${escapeHtml(this.avatarUrl(id))}" alt="${escapeHtml(name)}" decoding="async">
                        </button>
                        <div class="nt-persona-aside-meta">
                            <strong>${escapeHtml(name)}</strong>
                            ${title ? `<span>${escapeHtml(title)}</span>` : ''}
                        </div>
                        <button type="button" class="nt-control-btn" data-nt-persona-action="change-image">${icons.image}<span>Change image</span></button>
                        <button type="button" class="nt-control-btn" data-nt-persona-action="connections"><span>Connections</span></button>
                        <button type="button" class="nt-control-btn" data-nt-persona-action="sync"><span>Sync chat messages</span></button>
                        <button type="button" class="nt-control-btn" data-nt-persona-action="duplicate"><span>Duplicate</span></button>
                        <button type="button" class="nt-control-btn is-danger" data-nt-persona-action="delete">${icons.trash}<span>Delete</span></button>
                        <div class="nt-persona-aside-status">
                            ${locks.default ? '<span>Default persona</span>' : ''}
                            ${locks.chat ? '<span>Locked to chat</span>' : ''}
                            ${locks.character ? '<span>Linked to current character</span>' : ''}
                            ${descriptor.lorebook ? `<span>Lorebook: ${escapeHtml(descriptor.lorebook)}</span>` : ''}
                        </div>
                    </aside>
                    <div class="nt-persona-detail-main">
                        <nav class="nt-persona-tabs" role="tablist">
                            ${tabs.map(([value, label]) => `<button type="button" role="tab" aria-selected="${this.tab === value}" class="${this.tab === value ? 'is-active' : ''}" data-nt-persona-tab="${value}">${escapeHtml(label)}</button>`).join('')}
                        </nav>
                        <div class="nt-persona-tab-content" data-nt-persona-tab-content>
                            ${this.renderTabHtml()}
                        </div>
                    </div>
                </div>
            </section>
        `;
    }

    renderTabHtml() {
        if (this.tab === 'structured') return this.structuredTabHtml();
        if (this.tab === 'variants') return this.variantsTabHtml();
        if (this.tab === 'preview') return this.previewTabHtml();
        return this.detailsTabHtml();
    }

    nativeOptions(selector, fallback, current) {
        const select = document.querySelector(selector);
        if (select instanceof HTMLSelectElement && select.options.length) {
            return [...select.options].map(option => optionHtml(option.value, option.textContent || option.value, current)).join('');
        }
        return fallback.map(([value, label]) => optionHtml(value, label, current)).join('');
    }

    detailsTabHtml() {
        const id = this.activeId;
        const descriptor = this.descriptor(id);
        const identity = this.currentContextIdentity();
        const connections = Array.isArray(descriptor.connections) ? descriptor.connections : [];
        const positionOptions = this.nativeOptions('#persona_description_position', [
            [0, 'In Story String / Prompt Manager'],
            [2, "Top of Author's Note"],
            [3, "Bottom of Author's Note"],
            [4, 'In Chat @ Depth'],
            [9, 'None (disabled)'],
        ], descriptor.position ?? 0);
        const roleOptions = this.nativeOptions('#persona_depth_role', [[0, 'System'], [1, 'User'], [2, 'Assistant']], descriptor.role ?? 0);
        return `
            <div class="nt-persona-form-grid">
                <label class="nt-field"><span>Name</span><input type="text" data-nt-persona-field="name" value="${escapeHtml(this.personaName(id))}"></label>
                <label class="nt-field"><span>Title <small>not sent to the model</small></span><input type="text" data-nt-persona-field="title" value="${escapeHtml(descriptor.title || '')}"></label>
                <label class="nt-field nt-span-2"><span>Description</span><textarea rows="10" data-nt-persona-field="description">${escapeHtml(descriptor.description || '')}</textarea></label>
                <label class="nt-field"><span>Injection position</span><select data-nt-persona-field="position">${positionOptions}</select></label>
                <label class="nt-field${Number(descriptor.position) === 4 ? '' : ' is-muted'}"><span>Depth</span><input type="number" min="0" max="999" step="1" data-nt-persona-field="depth" value="${escapeHtml(descriptor.depth ?? 2)}" ${Number(descriptor.position) === 4 ? '' : 'disabled'}></label>
                <label class="nt-field${Number(descriptor.position) === 4 ? '' : ' is-muted'}"><span>Role</span><select data-nt-persona-field="role" ${Number(descriptor.position) === 4 ? '' : 'disabled'}>${roleOptions}</select></label>
                <div class="nt-persona-form-actions nt-span-2">
                    <button type="button" class="nt-control-btn" data-nt-persona-action="lorebook">${icons.lore}<span>${descriptor.lorebook ? 'Change persona lorebook' : 'Bind persona lorebook'}</span></button>
                </div>
            </div>
            <section class="nt-persona-connections-section">
                <div class="nt-section-heading"><div><strong>Connections</strong><span>Native SillyTavern persona locks remain the source of truth.</span></div></div>
                <div class="nt-persona-connection-summary">
                    ${identity.targetName ? `<span>Current: ${escapeHtml(identity.targetName)}</span>` : '<span>No character or group selected</span>'}
                    <span>${connections.length} saved connection${connections.length === 1 ? '' : 's'}</span>
                </div>
                ${connections.length ? `<div class="nt-persona-connection-list">${connections.map(connection => `<span>${escapeHtml(connection.type || 'character')}: ${escapeHtml(connection.id)}</span>`).join('')}</div>` : ''}
            </section>
        `;
    }

    structuredTabHtml() {
        const extra = this.personaExtra(this.activeId);
        return `
            <div class="nt-persona-tab-intro">
                <div><strong>Structured persona sheet</strong><span>Optional sections are appended in this exact order. Drag rows to change the prompt order.</span></div>
                <button type="button" class="nt-control-btn" data-nt-persona-action="add-section">${icons.plus}<span>Add section</span></button>
            </div>
            <div class="nt-persona-section-list">
                ${extra.sections.map(section => this.sectionHtml(section)).join('')}
            </div>
        `;
    }

    sectionHtml(section) {
        return `
            <article class="nt-persona-structured-row" draggable="true" data-nt-persona-section="${escapeHtml(section.id)}">
                <div class="nt-persona-row-head">
                    <span class="nt-persona-drag-handle" title="Drag to reorder">⋮⋮</span>
                    <input type="checkbox" data-nt-section-enabled="${escapeHtml(section.id)}" ${section.enabled !== false ? 'checked' : ''} aria-label="Enable section">
                    <input class="nt-persona-row-title" type="text" data-nt-section-title="${escapeHtml(section.id)}" value="${escapeHtml(section.title || '')}" aria-label="Section title">
                    <button type="button" class="nt-icon-btn" data-nt-delete-section="${escapeHtml(section.id)}" aria-label="Delete section">${icons.trash}</button>
                </div>
                <textarea rows="5" data-nt-section-text="${escapeHtml(section.id)}" placeholder="Write this part of the persona…">${escapeHtml(section.text || '')}</textarea>
            </article>
        `;
    }

    variantsTabHtml() {
        const extra = this.personaExtra(this.activeId);
        const identity = this.currentContextIdentity();
        return `
            <div class="nt-persona-tab-intro">
                <div><strong>Variants</strong><span>Dynamic description blocks. They are never written into the permanent persona description.</span></div>
                <button type="button" class="nt-control-btn" data-nt-persona-action="add-variant">${icons.plus}<span>Add variant</span></button>
            </div>
            ${identity.targetName || identity.chatKey ? `<div class="nt-persona-context-line">Current context: ${escapeHtml(identity.targetName || 'No character')}${identity.chatKey ? ` · chat ${escapeHtml(identity.chatKey)}` : ''}</div>` : ''}
            <div class="nt-persona-variant-list">
                ${extra.variants.length ? extra.variants.map(variant => this.variantHtml(variant, identity)).join('') : '<div class="nt-persona-empty is-compact"><strong>No variants yet</strong><span>Add a block and bind it manually, to a character, a chat, or a text/regex match.</span></div>'}
            </div>
        `;
    }

    variantHtml(variant, identity) {
        const activation = this.variantActivation(variant, identity);
        const characterBound = identity.targetId && uniqueStrings(variant.characterIds).includes(identity.targetId);
        const chatBound = identity.chatKey && uniqueStrings(variant.chatIds).includes(identity.chatKey);
        return `
            <article class="nt-persona-variant${activation.active ? ' is-active' : ''}" data-nt-persona-variant="${escapeHtml(variant.id)}">
                <div class="nt-persona-row-head">
                    <span class="nt-persona-variant-state" title="${escapeHtml(activation.reasons.join(', ') || 'Inactive')}"></span>
                    <input class="nt-persona-row-title" type="text" data-nt-variant-name="${escapeHtml(variant.id)}" value="${escapeHtml(variant.name || 'Variant')}" aria-label="Variant name">
                    <button type="button" class="nt-icon-btn" data-nt-delete-variant="${escapeHtml(variant.id)}" aria-label="Delete variant">${icons.trash}</button>
                </div>
                <textarea rows="5" data-nt-variant-text="${escapeHtml(variant.id)}" placeholder="Description added when this variant is active…">${escapeHtml(variant.text || '')}</textarea>
                <div class="nt-persona-binding-grid">
                    <label class="nt-check-row"><input type="checkbox" data-nt-variant-manual="${escapeHtml(variant.id)}" ${variant.manual ? 'checked' : ''}><span>Manual</span></label>
                    <button type="button" class="nt-control-btn${characterBound ? ' is-active' : ''}" data-nt-variant-bind-character="${escapeHtml(variant.id)}" ${identity.targetId ? '' : 'disabled'}>${characterBound ? 'Unbind character' : 'Bind current character'}</button>
                    <button type="button" class="nt-control-btn${chatBound ? ' is-active' : ''}" data-nt-variant-bind-chat="${escapeHtml(variant.id)}" ${identity.chatKey ? '' : 'disabled'}>${chatBound ? 'Unbind chat' : 'Bind current chat'}</button>
                    <label class="nt-field nt-persona-regex-field"><span>Text / RegExp match against current character</span><input type="text" data-nt-variant-pattern="${escapeHtml(variant.id)}" value="${escapeHtml(variant.pattern || '')}" placeholder="e.g. cyberpunk|hacker"></label>
                    <label class="nt-check-row"><input type="checkbox" data-nt-variant-regex="${escapeHtml(variant.id)}" ${variant.regex !== false ? 'checked' : ''}><span>Interpret as RegExp</span></label>
                </div>
                ${(variant.characterIds?.length || variant.chatIds?.length) ? `<div class="nt-persona-binding-summary">${variant.characterIds?.length ? `${variant.characterIds.length} character binding${variant.characterIds.length === 1 ? '' : 's'}` : ''}${variant.characterIds?.length && variant.chatIds?.length ? ' · ' : ''}${variant.chatIds?.length ? `${variant.chatIds.length} chat binding${variant.chatIds.length === 1 ? '' : 's'}` : ''}</div>` : ''}
            </article>
        `;
    }

    previewTabHtml() {
        const id = this.activeId;
        const descriptor = this.descriptor(id);
        const extra = this.personaExtra(id);
        const identity = this.currentContextIdentity();
        const variants = extra.variants.map(variant => ({ variant, state: this.variantActivation(variant, identity) }));
        const activeVariants = variants.filter(item => item.state.active);
        const structured = this.structuredText(id);
        const variantText = activeVariants.map(item => item.variant.text?.trim()).filter(Boolean).join('\n\n');
        const compiled = [descriptor.description?.trim(), structured, variantText].filter(Boolean).join('\n\n');
        const bindingRows = variants.map(({ variant, state }) => {
            const bindings = [];
            if (variant.manual) bindings.push('manual');
            const characters = uniqueStrings(variant.characterIds);
            const chats = uniqueStrings(variant.chatIds);
            if (characters.length) bindings.push(`character: ${characters.map(value => this.bindingTargetLabel(value)).join(', ')}`);
            if (chats.length) bindings.push(`chat: ${chats.join(', ')}`);
            if (asString(variant.pattern).trim()) bindings.push(`${variant.regex === false ? 'text' : 'regex'}: ${asString(variant.pattern).trim()}`);
            return `<div class="${state.active ? 'is-active' : ''}"><strong>${escapeHtml(variant.name || 'Variant')}</strong><span>${escapeHtml(bindings.join(' · ') || 'No binding')}</span></div>`;
        }).join('');
        return `
            <div class="nt-persona-preview-head">
                <div><strong>Compiled preview</strong><span>Exact persona text resolved for the current character/chat before generation.</span></div>
                <span class="nt-persona-preview-position">${Number(descriptor.position) === 9 ? 'Injection disabled' : 'Uses native persona injection position'}</span>
            </div>
            <div class="nt-persona-preview-layout">
                <div class="nt-persona-preview-side">
                    <section class="nt-persona-preview-block">
                        <h4>Active now</h4>
                        ${activeVariants.length ? `<div class="nt-persona-preview-bindings">${activeVariants.map(({ variant, state }) => `<div class="is-active"><strong>${escapeHtml(variant.name || 'Variant')}</strong><span>${escapeHtml(state.reasons.join(' + '))}</span></div>`).join('')}</div>` : '<p class="nt-muted">No dynamic variants are active in this context.</p>'}
                    </section>
                    <section class="nt-persona-preview-block">
                        <h4>All bindings</h4>
                        ${bindingRows ? `<div class="nt-persona-preview-bindings">${bindingRows}</div>` : '<p class="nt-muted">No variants have been created.</p>'}
                    </section>
                </div>
                <section class="nt-persona-preview-block nt-persona-preview-output">
                    <h4>Full persona text</h4>
                    <pre>${escapeHtml(compiled || '(empty)')}</pre>
                </section>
            </div>
        `;
    }

    structuredText(id) {
        const extra = this.personaExtra(id, { create: false });
        if (!extra) return '';
        return extra.sections
            .filter(section => section.enabled !== false && section.text?.trim())
            .map(section => section.title?.trim() ? `${section.title.trim()}:\n${section.text.trim()}` : section.text.trim())
            .join('\n\n');
    }

    variantActivation(variant, identity = this.currentContextIdentity()) {
        const reasons = [];
        if (variant.manual) reasons.push('manual');
        const characters = uniqueStrings(variant.characterIds);
        const chats = uniqueStrings(variant.chatIds);
        if (identity.targetId && characters.includes(identity.targetId)) reasons.push(`character: ${identity.targetName || identity.targetId}`);
        if (identity.chatKey && chats.includes(identity.chatKey)) reasons.push(`chat: ${identity.chatKey}`);
        const pattern = asString(variant.pattern).trim();
        if (pattern && identity.searchableCharacter) {
            let matched = false;
            if (variant.regex === false) {
                matched = normalize(identity.searchableCharacter).includes(normalize(pattern));
            } else {
                try { matched = new RegExp(pattern, 'i').test(identity.searchableCharacter); } catch (_) { matched = false; }
            }
            if (matched) reasons.push(variant.regex === false ? `text: ${pattern}` : `regex: ${pattern}`);
        }
        return { active: reasons.length > 0, reasons };
    }

    compiledExtraText(id) {
        const extra = this.personaExtra(id, { create: false });
        if (!extra) return '';
        const identity = this.currentContextIdentity();
        const structured = this.structuredText(id);
        const variants = extra.variants
            .filter(variant => this.variantActivation(variant, identity).active && variant.text?.trim())
            .map(variant => variant.text.trim())
            .join('\n\n');
        return [structured, variants].filter(Boolean).join('\n\n');
    }

    async syncPromptInjection() {
        // Kept as a compatibility hook for callers. Structured sections and
        // variants are intentionally generation-scoped and are applied by
        // applyGenerationOverlay() instead of creating a permanent extension prompt.
    }

    clearPromptInjection() {
        this.restoreGenerationOverlay();
    }

    applyGenerationOverlay() {
        this.restoreGenerationOverlay();
        if (this.isExternalProviderActive()) return;
        // Keep this path synchronous: GENERATION_AFTER_COMMANDS runs immediately
        // before SillyTavern assembles persona fields. The native selected avatar
        // remains in the DOM even while NastyTavern owns the Persona workspace.
        const currentId = this.currentPersonaId();
        if (!currentId) return;
        this._lastKnownPersonaId = currentId;
        const descriptor = this.descriptor(currentId, { create: false });
        const extra = this.compiledExtraText(currentId).trim();
        if (!descriptor || Number(descriptor.position) === 9 || !extra) return;
        const power = this.power();
        const base = asString(power.persona_description ?? descriptor.description ?? '');
        this.generationSnapshot = { personaId: currentId, base };
        power.persona_description = [base.trim(), extra].filter(Boolean).join('\n\n');
    }

    restoreGenerationOverlay() {
        const snapshot = this.generationSnapshot;
        if (!snapshot) return;
        const power = this.power();
        const currentId = this.currentPersonaId() || this._lastKnownPersonaId;
        if (asString(currentId) === asString(snapshot.personaId)) {
            power.persona_description = snapshot.base;
        } else if (currentId) {
            power.persona_description = asString(this.descriptor(currentId, { create: false })?.description || '');
        }
        this.generationSnapshot = null;
    }

    async selectPersona(id) {
        this.restoreGenerationOverlay();
        const api = await this.loadPersonaApi();
        try {
            if (typeof api.setUserAvatar === 'function') await api.setUserAvatar(id);
            else {
                const native = document.querySelector(`#user_avatar_block [data-avatar-id="${globalThis.CSS?.escape?.(id) || id}"]`);
                native?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
            }
            this._lastKnownPersonaId = id;
            this.activeId = id;
            await this.syncPromptInjection();
            this.renderCurrentView();
        } catch (error) {
            this.toast('Could not select persona.');
        }
    }

    async toggleLock(type) {
        if (!this.activeId) return;
        await this.selectPersona(this.activeId);
        const current = this.lockStates(this.activeId)[type];
        const api = await this.loadPersonaApi();
        try {
            if (typeof api.setPersonaLockState === 'function') await api.setPersonaLockState(!current, type);
            else this.proxyNativeLock(type);
            this.renderCurrentView();
        } catch (error) {
            this.toast('Could not update persona connection.');
        }
    }

    proxyNativeLock(type) {
        const selectors = {
            default: '#persona_lock_default, [data-persona-lock="default"]',
            chat: '#persona_lock_chat, [data-persona-lock="chat"]',
            character: '#persona_lock_character, [data-persona-lock="character"]',
        };
        document.querySelector(selectors[type])?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    }

    emitPersonaEvent(key, payload = this.activeId) {
        const context = this.context();
        const source = context?.eventSource;
        const types = context?.eventTypes || {};
        const event = types[key] || key;
        try { source?.emit?.(event, payload); } catch (_) {}
    }

    updateNativeField(field, rawValue, { emit = true } = {}) {
        if (!this.activeId) return;
        const id = this.activeId;
        const power = this.power();
        const descriptor = this.descriptor(id);
        let value = rawValue;
        if (['position', 'depth', 'role'].includes(field)) value = Number(rawValue || 0);
        const currentId = this._lastKnownPersonaId || this.currentPersonaId();
        const isCurrent = asString(currentId) === asString(id);

        if (field === 'name') {
            power.personas ||= {};
            const oldName = asString(power.personas[id] || this.personaName(id));
            const newName = asString(value).trim() || oldName;
            power.personas[id] = newName;
            this.nativeBlock?.querySelector?.(`[data-avatar-id="${globalThis.CSS?.escape?.(id) || id}"] .ch_name`)?.replaceChildren(document.createTextNode(newName));
            if (emit && isCurrent && newName !== oldName) {
                void this.loadScriptApi().then(api => api.setUserName?.(newName, { toastPersonaNameChange: false }));
            }
            if (emit && newName !== oldName) this.emitPersonaEvent('PERSONA_RENAMED', { avatarId: id, oldName, newName });
        } else {
            descriptor[field] = value;
            if (isCurrent) {
                if (field === 'description') power.persona_description = asString(value);
                if (field === 'position') power.persona_description_position = Number(value);
                if (field === 'depth') power.persona_description_depth = Number(value);
                if (field === 'role') power.persona_description_role = Number(value);
            }
            if (emit) this.emitPersonaEvent('PERSONA_UPDATED', id);
        }

        const controlMap = {
            description: '#persona_description',
            position: '#persona_description_position',
            depth: '#persona_depth_value',
            role: '#persona_depth_role',
        };
        const native = controlMap[field] ? document.querySelector(controlMap[field]) : null;
        if (native && 'value' in native) native.value = asString(value);
        this.context()?.saveSettingsDebounced?.();
        void this.syncPromptInjection();
    }

    proxyNativeAction(action) {
        const selectors = {
            create: ['#create_dummy_persona', '[data-action="create-persona"]'],
            backup: ['#personas_backup', '#backup_personas'],
            restore: ['#personas_restore', '#restore_personas'],
            duplicate: ['#persona_duplicate_button'],
            delete: ['#persona_delete_button'],
            sync: ['#sync_name_button'],
            connections: ['#char_connections_button'],
        };
        const element = selectors[action]?.map(selector => document.querySelector(selector)).find(Boolean);
        if (element instanceof HTMLElement) {
            element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
            setTimeout(() => this.renderCurrentView(), 250);
            return true;
        }
        return false;
    }

    uploadPersonaImage(overwriteId = '') {
        const overwrite = document.querySelector('#avatar_upload_overwrite');
        if (overwrite && 'value' in overwrite) overwrite.value = overwriteId;
        const input = document.querySelector('#avatar_upload_file');
        if (input instanceof HTMLInputElement) {
            input.click();
            return true;
        }
        return false;
    }

    async onClick(event) {
        const action = event.target.closest?.('[data-nt-persona-action]')?.dataset?.ntPersonaAction;
        if (action) {
            if (action === 'back') {
                this.view = 'gallery';
                this.tab = 'details';
                this.renderGallery();
                return;
            }
            if (action === 'global') {
                this.view = 'global';
                this.renderCurrentView();
                return;
            }
            if (action === 'create') {
                if (!this.proxyNativeAction('create')) this.toast('Native persona creation is unavailable.');
                return;
            }
            if (action === 'upload') {
                if (!this.uploadPersonaImage('')) this.toast('Native persona import is unavailable.');
                return;
            }
            if (['backup', 'restore', 'duplicate', 'delete', 'sync', 'connections'].includes(action)) {
                if (['duplicate', 'delete', 'sync', 'connections'].includes(action)) await this.selectPersona(this.activeId);
                if (!this.proxyNativeAction(action)) this.toast(`Native ${action} is unavailable.`);
                if (action === 'delete') {
                    setTimeout(() => { this.view = 'gallery'; this.activeId = this.currentPersonaId() || ''; this.renderCurrentView(); }, 350);
                }
                return;
            }
            if (action === 'use') return this.selectPersona(this.activeId);
            if (action === 'change-image') {
                await this.selectPersona(this.activeId);
                if (!this.uploadPersonaImage(this.activeId)) this.toast('Native image picker is unavailable.');
                return;
            }
            if (action === 'lorebook') {
                await this.selectPersona(this.activeId);
                const button = document.querySelector('#persona_lore_button');
                if (button instanceof HTMLElement) button.click();
                else this.toast('Persona lorebook control is unavailable in this SillyTavern build.');
                return;
            }
            if (action === 'lightbox') return this.openLightbox();
            if (action === 'add-section') {
                const extra = this.personaExtra(this.activeId);
                extra.sections.push({ id: uuid(), title: 'Custom section', text: '', enabled: true });
                saveSettings();
                this.renderCurrentView();
                return;
            }
            if (action === 'add-variant') {
                const extra = this.personaExtra(this.activeId);
                extra.variants.push({ id: uuid(), name: 'Variant', text: '', manual: false, characterIds: [], chatIds: [], pattern: '', regex: true });
                saveSettings();
                this.renderCurrentView();
                return;
            }
        }

        const opener = event.target.closest?.('[data-nt-persona-open]');
        if (opener) {
            const id = opener.dataset.ntPersonaOpen;
            this.activeId = id;
            this.view = 'detail';
            this.tab = 'details';
            await this.selectPersona(id);
            return;
        }

        const filter = event.target.closest?.('[data-nt-persona-filter]');
        if (filter) {
            this.filter = filter.dataset.ntPersonaFilter || 'all';
            this.page = 1;
            this.renderGallery();
            return;
        }

        const page = event.target.closest?.('[data-nt-persona-page]')?.dataset?.ntPersonaPage;
        if (page) {
            const pages = Math.max(1, Math.ceil(this.filteredPersonas().length / this.pageSize));
            if (page === 'first') this.page = 1;
            if (page === 'prev') this.page = Math.max(1, this.page - 1);
            if (page === 'next') this.page = Math.min(pages, this.page + 1);
            if (page === 'last') this.page = pages;
            this.refreshGalleryList();
            return;
        }

        const tab = event.target.closest?.('[data-nt-persona-tab]')?.dataset?.ntPersonaTab;
        if (tab) {
            this.tab = tab;
                this.renderDetail();
            return;
        }

        const lock = event.target.closest?.('[data-nt-persona-lock]')?.dataset?.ntPersonaLock;
        if (lock) return this.toggleLock(lock);

        const deleteSection = event.target.closest?.('[data-nt-delete-section]')?.dataset?.ntDeleteSection;
        if (deleteSection) {
            const extra = this.personaExtra(this.activeId);
            extra.sections = extra.sections.filter(section => section.id !== deleteSection);
            saveSettings();
            void this.syncPromptInjection();
            this.renderCurrentView();
            return;
        }

        const deleteVariant = event.target.closest?.('[data-nt-delete-variant]')?.dataset?.ntDeleteVariant;
        if (deleteVariant) {
            const extra = this.personaExtra(this.activeId);
            extra.variants = extra.variants.filter(variant => variant.id !== deleteVariant);
            saveSettings();
            void this.syncPromptInjection();
            this.renderCurrentView();
            return;
        }

        const bindCharacter = event.target.closest?.('[data-nt-variant-bind-character]')?.dataset?.ntVariantBindCharacter;
        if (bindCharacter) {
            const identity = this.currentContextIdentity();
            if (!identity.targetId) return;
            const variant = this.findVariant(bindCharacter);
            if (!variant) return;
            const ids = uniqueStrings(variant.characterIds);
            variant.characterIds = ids.includes(identity.targetId) ? ids.filter(id => id !== identity.targetId) : [...ids, identity.targetId];
            saveSettings();
            void this.syncPromptInjection();
            this.renderCurrentView();
            return;
        }

        const bindChat = event.target.closest?.('[data-nt-variant-bind-chat]')?.dataset?.ntVariantBindChat;
        if (bindChat) {
            const identity = this.currentContextIdentity();
            if (!identity.chatKey) return;
            const variant = this.findVariant(bindChat);
            if (!variant) return;
            const ids = uniqueStrings(variant.chatIds);
            variant.chatIds = ids.includes(identity.chatKey) ? ids.filter(id => id !== identity.chatKey) : [...ids, identity.chatKey];
            saveSettings();
            void this.syncPromptInjection();
            this.renderCurrentView();
        }
    }

    onInput(event) {
        const target = event.target;
        if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)) return;
        if (target.matches('[data-nt-persona-search]')) {
            this.search = target.value;
            this.page = 1;
            this.refreshGalleryList();
            return;
        }
        const field = target.dataset.ntPersonaField;
        if (field && !(target instanceof HTMLSelectElement)) {
            // Keep description/title/depth editing live without broadcasting native
            // persona events on every keystroke. Persona names commit on change so
            // SillyTavern still receives the real old/new name pair once.
            if (field !== 'name') this.updateNativeField(field, target.value, { emit: false });
            return;
        }
        const sectionText = target.dataset.ntSectionText;
        const sectionTitle = target.dataset.ntSectionTitle;
        if (sectionText || sectionTitle) {
            const section = this.findSection(sectionText || sectionTitle);
            if (!section) return;
            if (sectionText) section.text = target.value;
            else section.title = target.value;
            this.persistExtraDebounced();
            return;
        }
        const variantText = target.dataset.ntVariantText;
        const variantName = target.dataset.ntVariantName;
        const variantPattern = target.dataset.ntVariantPattern;
        if (variantText || variantName || variantPattern) {
            const variant = this.findVariant(variantText || variantName || variantPattern);
            if (!variant) return;
            if (variantText) variant.text = target.value;
            else if (variantName) variant.name = target.value;
            else variant.pattern = target.value;
            this.persistExtraDebounced();
        }
    }

    onChange(event) {
        const target = event.target;
        if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;
        const globalSetting = target.dataset.ntPersonaGlobal;
        if (globalSetting) {
            const power = this.power();
            power[globalSetting] = target.checked;
            this.context()?.saveSettingsDebounced?.();
            return;
        }
        if (target.matches('[data-nt-persona-sort]')) {
            this.sort = target.value || 'az';
            this.page = 1;
            this.renderGallery();
            return;
        }
        const field = target.dataset.ntPersonaField;
        if (field) {
            this.updateNativeField(field, target.value);
            if (field === 'position') this.renderDetail();
            return;
        }
        const sectionEnabled = target.dataset.ntSectionEnabled;
        if (sectionEnabled) {
            const section = this.findSection(sectionEnabled);
            if (section) section.enabled = target.checked;
            saveSettings();
            void this.syncPromptInjection();
            return;
        }
        const manual = target.dataset.ntVariantManual;
        const regex = target.dataset.ntVariantRegex;
        if (manual || regex) {
            const variant = this.findVariant(manual || regex);
            if (!variant) return;
            if (manual) variant.manual = target.checked;
            else variant.regex = target.checked;
            saveSettings();
            void this.syncPromptInjection();
            this.renderCurrentView();
        }
    }

    findSection(id) {
        return this.personaExtra(this.activeId).sections.find(section => section.id === id) || null;
    }

    findVariant(id) {
        return this.personaExtra(this.activeId).variants.find(variant => variant.id === id) || null;
    }

    onDragStart(event) {
        const row = event.target.closest?.('[data-nt-persona-section]');
        if (!row) return;
        this.dragSectionId = row.dataset.ntPersonaSection || '';
        event.dataTransfer?.setData('text/plain', this.dragSectionId);
        if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
        row.classList.add('is-dragging');
    }

    onDragOver(event) {
        if (!this.dragSectionId || !event.target.closest?.('[data-nt-persona-section]')) return;
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    }

    onDrop(event) {
        const target = event.target.closest?.('[data-nt-persona-section]');
        if (!target || !this.dragSectionId) return;
        event.preventDefault();
        const targetId = target.dataset.ntPersonaSection;
        const extra = this.personaExtra(this.activeId);
        const from = extra.sections.findIndex(section => section.id === this.dragSectionId);
        const to = extra.sections.findIndex(section => section.id === targetId);
        if (from >= 0 && to >= 0 && from !== to) {
            const [moved] = extra.sections.splice(from, 1);
            extra.sections.splice(to, 0, moved);
            saveSettings();
            void this.syncPromptInjection();
            this.renderCurrentView();
        }
        this.dragSectionId = '';
    }

    onDragEnd(event) {
        event.target.closest?.('[data-nt-persona-section]')?.classList.remove('is-dragging');
        this.dragSectionId = '';
    }

    openLightbox() {
        this.closeLightbox();
        const id = this.activeId;
        if (!id) return;
        const overlay = document.createElement('div');
        overlay.className = 'nt-persona-lightbox';
        overlay.innerHTML = `
            <button type="button" class="nt-persona-lightbox-close" aria-label="Close">${icons.close}</button>
            <img src="${escapeHtml(this.avatarUrl(id))}" alt="${escapeHtml(this.personaName(id))}">
        `;
        overlay.addEventListener('click', event => {
            if (event.target === overlay || event.target.closest('.nt-persona-lightbox-close')) this.closeLightbox();
        });
        document.body.append(overlay);
        this.lightbox = overlay;
    }

    closeLightbox() {
        this.lightbox?.remove();
        this.lightbox = null;
    }
}
