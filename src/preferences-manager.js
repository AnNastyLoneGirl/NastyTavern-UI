import { icons } from './icons.js';
import { t } from './i18n.js';
import { defaults, saveSettings, applySettings } from './settings.js';
import { escapeHtml as esc } from './utils.js';
import { createModalShell, showModalShell, hideModalShell, ensureModalOpacityControl } from './modal-shell.js';
import { tabsHtml } from './ui-templates.js';


const modifierKeys = new Set(['Shift', 'Control', 'Alt', 'Meta']);
const browserReserved = new Set([
    'Ctrl+K', 'Ctrl+L', 'Ctrl+T', 'Ctrl+N', 'Ctrl+W', 'Ctrl+R',
    'Ctrl+Shift+T', 'Ctrl+Shift+N', 'Ctrl+Shift+W', 'Ctrl+Shift+R',
    'Ctrl+Shift+B', 'Ctrl+Shift+C', 'Ctrl+Shift+I', 'Ctrl+Shift+J',
    'Ctrl+Shift+O', 'Ctrl+Shift+P', 'Ctrl+Shift+Delete', 'F5', 'F12',
]);

const interfaceSettingKeys = [
    'accent', 'density', 'radius', 'motion',
    'mobileModelContextInfo', 'mobileModelTokenValueInfo', 'mobileModelCostInfo', 'mobileNanoPriceInfo', 'mobileNanoSubscriptionInfo',
];

export class PreferencesManager {
    constructor(settings, toast, callbacks) {
        this.settings = settings;
        this.toast = toast;
        this.callbacks = callbacks;
        this.root = null;
        this.tab = 'interface';
        this.recording = null;
        this.boundCaptureKeydown = event => this.captureShortcut(event);
        this.boundCaptureKeyup = event => this.captureKeyup(event);
        this.boundCaptureBlur = () => this.cancelRecording();
    }

    mount() { this.ensure(); }

    unmount() {
        this.cancelRecording(false);
        this.root?.remove();
        this.root = null;
    }

    open(tab = 'interface') {
        this.ensure();
        ensureModalOpacityControl(this.root);
        this.tab = tab;
        showModalShell(this.root);
        this.render();
    }

    close() {
        this.cancelRecording(false);
        if (!this.root || this.root.hidden) return;
        hideModalShell(this.root, { immediate: false });
    }

    ensure() {
        if (this.root = document.querySelector('#nt-preferences')) {
            ensureModalOpacityControl(this.root);
            return this.root;
        }
        const { root, body } = createModalShell({
            id: 'nt-preferences',
            title: t('NastyTavern Settings'),
            subtitle: t('Interface, chat appearance, modules, backup and keyboard shortcuts'),
            icon: icons.settings,
            size: 'large',
            modalClass: 'nt-tool-modal nt-pref-modal',
            backdropClass: 'nt-tool-backdrop',
            bodyClass: 'nt-pref-body',
            bodyAttrs: { 'data-nt-pref-body': '' },
            closeAttrs: { 'data-nt-pref-close': '' },
            includeOpacityControl: true,
        });
        body.insertAdjacentHTML('beforebegin', tabsHtml('nt-pref-tab', [
            { id: 'interface', label: t('Interface') },
            { id: 'chat', label: t('Chat appearance') },
            { id: 'modules', label: t('Modules') },
            { id: 'backup', label: t('Backup & Restore') },
            { id: 'shortcuts', label: t('Keyboard Shortcuts') },
        ]));
        body.insertAdjacentHTML('afterend', '<input type="file" accept="application/json,.json" data-nt-pref-import hidden>');
        root.addEventListener('click', event => this.onClick(event));
        root.addEventListener('input', event => this.onInput(event));
        root.addEventListener('change', event => this.onChange(event));
        root.querySelector('[data-nt-pref-import]').addEventListener('change', event => this.importFile(event.target.files?.[0]));
        document.body.append(root);
        this.root = root;
        return root;
    }

    render() {
        if (!this.root) return;
        if (!['interface', 'chat', 'backup', 'modules', 'shortcuts'].includes(this.tab)) this.tab = 'interface';
        this.root.querySelectorAll('[data-nt-pref-tab]').forEach(button => {
            button.classList.toggle('is-active', button.dataset.ntPrefTab === this.tab);
        });
        const body = this.root.querySelector('[data-nt-pref-body]');
        if (this.tab === 'interface') body.innerHTML = this.renderInterface();
        else if (this.tab === 'chat') body.innerHTML = this.callbacks.renderChatAppearanceSettings?.() || '';
        else if (this.tab === 'shortcuts') body.innerHTML = this.renderShortcuts();
        else if (this.tab === 'modules') body.innerHTML = this.renderModules();
        else body.innerHTML = this.renderBackup();
    }

    renderInterface() {
        const s = this.settings;
        const toggle = (key, label, hint) => `
          <label class="nt-pref-setting-row nt-pref-setting-toggle">
            <span><b>${esc(t(label))}</b><small>${esc(t(hint))}</small></span>
            <input type="checkbox" data-nt-pref-setting="${key}" ${s[key] ? 'checked' : ''}>
          </label>`;
        const range = (key, label, hint, min, max, step) => `
          <label class="nt-pref-setting-row nt-pref-setting-range">
            <span><b>${esc(t(label))}</b><small>${esc(t(hint))}</small></span>
            <span class="nt-pref-setting-control"><input type="range" min="${min}" max="${max}" step="${step}" value="${Number(s[key])}" data-nt-pref-setting="${key}"><output data-nt-pref-value="${key}">${Number(s[key])} px</output></span>
          </label>`;

        return `<div class="nt-pref-interface">
          <div class="nt-pref-section-head"><div><b>${t('Interface')}</b><small>${t('Appearance settings for NastyTavern.')}</small></div><button type="button" class="nt-pref-action-button" data-nt-pref-reset-interface>${t('Reset')}</button></div>
          <section class="nt-pref-setting-group">
            <h3>${t('Appearance')}</h3>
            <label class="nt-pref-setting-row">
              <span><b>${t('Accent')}</b><small>${t('Used for active states, focus and selection.')}</small></span>
              <input type="color" value="${esc(s.accent)}" data-nt-pref-setting="accent">
            </label>
            <label class="nt-pref-setting-row">
              <span><b>${t('Density')}</b><small>${t('Controls the general spacing density.')}</small></span>
              <select data-nt-pref-setting="density"><option value="comfortable" ${s.density === 'comfortable' ? 'selected' : ''}>${t('Comfortable')}</option><option value="compact" ${s.density === 'compact' ? 'selected' : ''}>${t('Compact')}</option></select>
            </label>
            ${range('radius', 'Corner radius', 'Shared radius for NastyTavern surfaces.', 4, 24, 1)}
            ${toggle('motion', 'Interface animations', 'Keep short interface transitions enabled.')}
          </section>
          <section class="nt-pref-setting-group">
            <h3>${t('Mobile model information')}</h3>
            ${toggle('mobileModelContextInfo', 'Show model context (ctx)', 'Add the model context size to OpenRouter and NanoGPT choices on mobile.')}
            ${toggle('mobileModelTokenValueInfo', 'Show token value (t/$)', 'Add the OpenRouter prompt-token value per dollar to model choices on mobile.')}
            ${toggle('mobileModelCostInfo', 'Show max prompt cost ($)', 'Add the estimated maximum prompt cost for the current token limits to model choices on mobile.')}
            ${toggle('mobileNanoPriceInfo', 'Show Nano price (in/out)', 'Add NanoGPT input/output price per million tokens to model choices on mobile.')}
            ${toggle('mobileNanoSubscriptionInfo', 'Show Nano subscription status', 'Add NanoGPT subscription status to model choices on mobile, including sub, sub(2x), or not sub when available.')}
          </section>
        </div>`;
    }

    renderBackup() {
        return `<div class="nt-pref-backup">
          <article><span>${icons.download}</span><div><b>${t('Export NastyTavern settings')}</b><p>${t('Export appearance, shortcuts and module preferences.')}</p></div><button type="button" class="nt-pref-action-button" data-nt-pref-export>${t('Export')}</button></article>
          <article><span>${icons.upload}</span><div><b>${t('Import NastyTavern settings')}</b><p>${t('Restore a previously exported NastyTavern JSON file.')}</p></div><button type="button" class="nt-pref-action-button" data-nt-pref-import-trigger>${t('Import')}</button></article>
        </div>`;
    }

    renderModules() {
        const modules = this.settings.modules || defaults.modules;
        const defs = [
            ['timeline', t('Story Timeline'), t('Timeline and branching conversation viewer.'), icons.timeline],
            ['contextInspector', t('Context / Token Inspector'), t('Prompt composition and context usage inspector.'), icons.inspector],
            ['worldInfoInspector', t('World Info Inspector'), t('Activated Lorebook entries, live scan and history.'), icons.lore],
            ['variables', t('Variable Manager'), t('Local and global variable manager.'), icons.variables],
            ['chatTools', t('Bookmarks & Notes'), t('Per-chat bookmarks and private session notes.'), icons.bookmark],
            ['calendar', t('Calendar & Schedule'), t('Story calendar, events and schedule tools.'), icons.calendar],
            ['community', t('Community Chat'), t('Real-time community chat powered by Supabase.'), icons.community],
        ];
        const communityEnabled = this.settings.communityNetworkEnabled === true;
        const presenceEnabled = communityEnabled && this.settings.communityPresenceEnabled === true;
        return `<div class="nt-pref-modules"><div class="nt-pref-section-head"><div><b>${t('NastyTavern Modules')}</b><small>${t('Choose which integrated tools are shown in the Nasty Chat Bar.')}</small></div></div><div class="nt-pref-module-grid">${defs.map(([id, label, hint, icon]) => `<label class="nt-pref-module-card"><span class="nt-pref-module-icon">${icon}</span><span class="nt-pref-module-copy"><b>${esc(label)}</b><small>${esc(hint)}</small></span><input type="checkbox" data-nt-module-visible="${esc(id)}" ${modules[id] !== false ? 'checked' : ''}></label>`).join('')}</div><p class="nt-shortcut-help">${t('Hidden modules stay installed and can still be opened with their keyboard shortcut or the Command Palette.')}</p>
          <section class="nt-pref-setting-group nt-pref-community-privacy">
            <h3>${t('Community & Privacy')}</h3>
            <label class="nt-pref-setting-row nt-pref-setting-toggle">
              <span><b>${t('Enable Community network access')}</b><small>${t('Required before NastyTavern loads the Supabase client or contacts the Community service. Supabase handles authentication and Community data; catalogue files are stored on Cloudflare R2.')}</small></span>
              <input type="checkbox" data-nt-community-network ${communityEnabled ? 'checked' : ''}>
            </label>
            <label class="nt-pref-setting-row nt-pref-setting-toggle ${communityEnabled ? '' : 'is-disabled'}">
              <span><b>${t('Share online presence and typing status')}</b><small>${t('Optional. Broadcasts your Community identity and online/typing state through Supabase Realtime while Community is active.')}</small></span>
              <input type="checkbox" data-nt-community-presence ${presenceEnabled ? 'checked' : ''} ${communityEnabled ? '' : 'disabled'}>
            </label>
            <div class="nt-pref-setting-row">
              <span><b>${t('Privacy notice')}</b><small>${t('Review what Community connects to and how Community data is handled.')}</small></span>
              <button type="button" class="nt-pref-action-button" data-nt-community-privacy-review>${t('Review')}</button>
            </div>
            <p class="nt-shortcut-help">${t('Community remains visible when network access is disabled, but opening it shows the privacy notice instead of making a connection.')}</p>
          </section></div>`;
    }

    renderShortcuts() {
        const defs = this.callbacks.getShortcutDefinitions?.() || [];
        const groups = [];
        for (const definition of defs) {
            const name = definition.group || 'NastyTavern';
            let group = groups.find(item => item.name === name);
            if (!group) { group = { name, items: [] }; groups.push(group); }
            group.items.push(definition);
        }
        const rows = groups.map(group => `<section class="nt-shortcut-group"><div class="nt-shortcut-group-title">${esc(t(group.name))}</div>${group.items.map(definition => `<article><div><b>${esc(t(definition.label))}</b><small>${esc(t(definition.hint || ''))}</small></div><button type="button" class="nt-pref-action-button nt-shortcut-record ${this.recording === definition.id ? 'is-recording' : ''}" data-nt-shortcut="${esc(definition.id)}">${esc(this.recording === definition.id ? t('Press shortcut…') : (this.settings.shortcuts?.[definition.id] || t('Unassigned')))}</button></article>`).join('')}</section>`).join('');
        return `<div class="nt-shortcuts"><div class="nt-pref-section-head"><div><b>${t('Keyboard Shortcuts')}</b><small>${t('Click a shortcut and press the new key combination.')}</small></div><button type="button" class="nt-pref-action-button" data-nt-pref-reset-shortcuts>${t('Reset')}</button></div>${rows}<p class="nt-shortcut-help">${t('Duplicate shortcuts are rejected automatically.')} ${t('Press Backspace or Delete while recording to clear a shortcut.')} ${t('Some browser shortcuts cannot be overridden.')}</p></div>`;
    }

    updateInterfaceSetting(input) {
        const key = input?.dataset?.ntPrefSetting;
        if (!key || !interfaceSettingKeys.includes(key)) return false;
        let value = input.type === 'checkbox' ? input.checked : input.value;
        if (input.type === 'range') value = Number(value);
        this.settings[key] = value;
        const output = this.root?.querySelector(`[data-nt-pref-value="${CSS.escape(key)}"]`);
        if (output) output.textContent = `${value} px`;
        applySettings(this.settings);
        saveSettings();
        this.callbacks.interfaceSettingsChanged?.();
        return true;
    }

    onInput(event) {
        const chatAppearance = this.callbacks.chatAppearanceInput?.(event.target);
        if (chatAppearance?.handled) return;
        this.updateInterfaceSetting(event.target.closest('[data-nt-pref-setting]'));
    }

    onChange(event) {
        const chatAppearance = this.callbacks.chatAppearanceChange?.(event.target);
        if (chatAppearance?.handled) { if (chatAppearance.rerender) this.render(); return; }
        const setting = event.target.closest('[data-nt-pref-setting]');
        if (setting) { this.updateInterfaceSetting(setting); return; }
        const communityNetwork = event.target.closest('[data-nt-community-network]');
        if (communityNetwork) {
            this.settings.communityNetworkEnabled = !!communityNetwork.checked;
            if (!this.settings.communityNetworkEnabled) this.settings.communityPresenceEnabled = false;
            saveSettings();
            this.callbacks.communityPrivacyChanged?.();
            this.render();
            return;
        }
        const communityPresence = event.target.closest('[data-nt-community-presence]');
        if (communityPresence) {
            this.settings.communityPresenceEnabled = this.settings.communityNetworkEnabled === true && !!communityPresence.checked;
            saveSettings();
            this.callbacks.communityPrivacyChanged?.();
            this.render();
            return;
        }
        const toggle = event.target.closest('[data-nt-module-visible]');
        if (!toggle) return;
        const id = toggle.dataset.ntModuleVisible;
        this.settings.modules ??= structuredClone(defaults.modules);
        this.settings.modules[id] = !!toggle.checked;
        applySettings(this.settings);
        saveSettings();
        this.callbacks.modulesChanged?.();
    }

    async onClick(event) {
        if (event.target.closest('[data-nt-pref-close]')) return this.close();
        const tab = event.target.closest('[data-nt-pref-tab]');
        if (tab) { this.cancelRecording(false); this.tab = tab.dataset.ntPrefTab; return this.render(); }
        const chatAppearance = this.callbacks.chatAppearanceClick?.(event.target);
        if (chatAppearance?.handled) { if (chatAppearance.rerender) this.render(); return; }
        if (event.target.closest('[data-nt-pref-export]')) return this.exportSettings();
        if (event.target.closest('[data-nt-pref-import-trigger]')) return this.root.querySelector('[data-nt-pref-import]').click();
        if (event.target.closest('[data-nt-community-privacy-review]')) {
            this.close();
            this.callbacks.openCommunityPrivacy?.();
            return;
        }
        if (event.target.closest('[data-nt-pref-reset-interface]')) {
            for (const key of interfaceSettingKeys) this.settings[key] = structuredClone(defaults[key]);
            applySettings(this.settings);
            saveSettings();
            this.render();
            return;
        }
        if (event.target.closest('[data-nt-pref-reset-shortcuts]')) {
            this.cancelRecording(false);
            this.settings.shortcuts = structuredClone(defaults.shortcuts);
            saveSettings();
            this.callbacks.shortcutsChanged?.();
            return this.render();
        }
        const record = event.target.closest('[data-nt-shortcut]');
        if (record) return this.startRecording(record.dataset.ntShortcut);
    }

    startRecording(id) {
        this.cancelRecording(false);
        this.recording = id;
        this.render();
        window.addEventListener('keydown', this.boundCaptureKeydown, true);
        window.addEventListener('keyup', this.boundCaptureKeyup, true);
        window.addEventListener('blur', this.boundCaptureBlur, true);
    }

    cancelRecording(render = true) {
        window.removeEventListener('keydown', this.boundCaptureKeydown, true);
        window.removeEventListener('keyup', this.boundCaptureKeyup, true);
        window.removeEventListener('blur', this.boundCaptureBlur, true);
        const hadRecording = !!this.recording;
        this.recording = null;
        if (render && hadRecording) this.render();
    }

    captureKeyup(event) {
        if (!this.recording) return;
        event.preventDefault();
        event.stopImmediatePropagation();
    }

    captureShortcut(event) {
        if (!this.recording) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        const id = this.recording;
        if (['Backspace', 'Delete'].includes(event.key)) {
            this.settings.shortcuts ??= {};
            this.settings.shortcuts[id] = '';
            saveSettings();
            this.callbacks.shortcutsChanged?.();
            this.cancelRecording(false);
            this.render();
            return;
        }
        if (event.key === 'Escape') { this.cancelRecording(false); this.render(); return; }
        if (modifierKeys.has(event.key)) { this.updateRecordingPreview(event); return; }
        const combo = this.callbacks.eventToShortcut?.(event) || '';
        if (!combo) return;
        if (browserReserved.has(combo)) {
            this.toast?.(t('This shortcut is reserved by the browser. Choose another combination.'));
            this.updateRecordingPreview(event, true);
            return;
        }
        const duplicate = Object.entries(this.settings.shortcuts || {}).find(([key, value]) => key !== id && value === combo);
        if (duplicate) {
            this.toast?.(t('Shortcut already assigned.'));
            this.updateRecordingPreview(event, true);
            return;
        }
        this.settings.shortcuts ??= {};
        this.settings.shortcuts[id] = combo;
        saveSettings();
        this.callbacks.shortcutsChanged?.();
        this.cancelRecording(false);
        this.render();
    }

    updateRecordingPreview(event, error = false) {
        const button = this.root?.querySelector(`[data-nt-shortcut="${CSS.escape(this.recording || '')}"]`);
        if (!button) return;
        const parts = [];
        if (event.ctrlKey || event.metaKey) parts.push('Ctrl');
        if (event.altKey) parts.push('Alt');
        if (event.shiftKey) parts.push('Shift');
        button.textContent = parts.length ? `${parts.join('+')}+…` : t('Press shortcut…');
        button.classList.toggle('is-error', !!error);
    }

    exportSettings() {
        const safe = {};
        for (const key of Object.keys(defaults)) safe[key] = structuredClone(this.settings[key]);
        const blob = new Blob([JSON.stringify({ format: 'NastyTavern-settings', version: 1, settings: safe }, null, 2)], { type: 'application/json' });
        const anchor = document.createElement('a');
        anchor.href = URL.createObjectURL(blob);
        anchor.download = 'nastytavern-settings.json';
        anchor.click();
        setTimeout(() => URL.revokeObjectURL(anchor.href), 1000);
    }

    async importFile(file) {
        if (!file) return;
        try {
            const parsed = JSON.parse(await file.text());
            if (parsed?.format !== 'NastyTavern-settings' || !parsed.settings) throw new Error('invalid');
            for (const key of Object.keys(defaults)) if (Object.hasOwn(parsed.settings, key)) this.settings[key] = parsed.settings[key];
            applySettings(this.settings);
            saveSettings();
            this.callbacks.shortcutsChanged?.();
            this.callbacks.chatAppearanceImported?.();
            this.toast?.(t('NastyTavern settings imported.'));
            this.render();
        } catch (_) {
            this.toast?.(t('Invalid NastyTavern settings file.'));
        } finally {
            this.root.querySelector('[data-nt-pref-import]').value = '';
        }
    }
}
