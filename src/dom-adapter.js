const textNormalize = value => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();

const SELECTORS = {
    chat: ['#chat'],
    sendForm: ['#send_form'],
    sendTextarea: ['#send_textarea', '#send_textarea textarea'],
    sendButton: ['#send_but', '#send_button'],
    topSettings: ['#top-settings-holder'],

    response: [
        '#ai-config-button .drawer-icon',
        '#ai-config-button',
        '#leftNavDrawerIcon',
        '[title="AI Response Configuration"]',
        '[title*="Response Configuration"]',
    ],
    api: [
        '#sys-settings-button .drawer-icon',
        '#sys-settings-button',
        '#API-status-top',
        '[title="API Connections"]',
        '[title*="API Connection"]',
    ],
    formatting: [
        '#advanced-formatting-button .drawer-icon',
        '#advanced-formatting-button',
        '[title="AI Response Formatting"]',
        '[title="Advanced Formatting"]',
        '[title*="Formatting"]',
    ],
    worldInfo: [
        '#WI-SP-button .drawer-icon',
        '#WI-SP-button',
        '#WIDrawerIcon',
        '[title="World Info"]',
        '[title*="World Info"]',
        '[title*="Lorebook"]',
    ],
    userSettings: [
        '#user-settings-button .drawer-icon',
        '#user-settings-button',
        '[title="User Settings"]',
        '[title*="User Settings"]',
    ],
    backgrounds: [
        '#backgrounds-drawer-toggle',
        '#backgrounds-button .drawer-icon',
        '#backgrounds-button',
        '#logo_block .drawer-icon',
        '#logo_block',
        '#site_logo',
        '[title="Change Background Image"]',
        '[title*="Background"]',
    ],
    personas: [
        '#persona-management-button .drawer-icon',
        '#persona-management-button',
        '[title="Persona Management"]',
        '[title*="Persona"]',
    ],
    characters: [
        '#rightNavHolder .drawer-icon',
        '#rightNavDrawerIcon',
        '#rightNavHolder',
        '[title="Character Management"]',
        '[title="Characters"]',
        '[title*="Character Management"]',
    ],
    extensionsDrawer: [
        '#extensions-settings-button .drawer-icon',
        '#extensions-settings-button',
        '[title="Extensions"]',
        '[title="Extensions panel"]',
        '[title*="Extensions"]',
    ],
    extensionsMenu: ['#extensionsMenuButton'],
    dataBank: [
        '#manageAttachments',
        '#data_bank_wand_container #manageAttachments',
        '[data-i18n="Open Data Bank"]',
        '[title*="global, character, or data files"]',
    ],

    onlineStatus: ['.online_status_text', '#online_status_text2', '.online_status .online_status_text'],
    characterName: ['#rm_button_selected_ch .ch_name', '#character_name_pole', '#chat .mes[is_user="false"]:last-child .name_text'],
    personaName: ['#your_name', '#persona-management-block #your_name'],
};

const PANEL_SELECTORS = {
    response: ['#left-nav-panel', '#ai-config-button .drawer-content'],
    api: ['#rm_api_block', '#sys-settings-button .drawer-content'],
    formatting: ['#AdvancedFormatting', '#advanced-formatting-button .drawer-content'],
    worldInfo: ['#WorldInfo', '#WI-SP-button .drawer-content'],
    userSettings: ['#user-settings-block', '#user-settings-button .drawer-content'],
    backgrounds: ['#Backgrounds', '#logo_block .drawer-content'],
    personas: ['#PersonaManagement', '#persona-management-button .drawer-content', '#persona-management-block'],
    characters: ['#right-nav-panel', '#rightNavHolder .drawer-content'],
    extensionsDrawer: ['#rm_extensions_block', '#extensions-settings-button .drawer-content', '#extensions_settings', '#extensions_settings2'],
    dataBank: [],
};

function uniqueElements(elements) {
    return [...new Set(elements.filter(Boolean))];
}

export class DomAdapter {
    first(keyOrSelectors) {
        const selectors = Array.isArray(keyOrSelectors) ? keyOrSelectors : SELECTORS[keyOrSelectors] || [];
        for (const selector of selectors) {
            try {
                const el = document.querySelector(selector);
                if (el) return el;
            } catch (_) {}
        }
        return null;
    }

    all(selectors) {
        const list = Array.isArray(selectors) ? selectors : [selectors];
        const out = [];
        for (const selector of list) {
            try { out.push(...document.querySelectorAll(selector)); } catch (_) {}
        }
        return uniqueElements(out);
    }

    candidates(key, fallbacks = []) {
        const nodes = this.all(SELECTORS[key] || []);
        const semantic = this.findInteractiveByText(...fallbacks);
        if (semantic) nodes.push(semantic);
        return uniqueElements(nodes);
    }

    findInteractiveByText(...terms) {
        const normalizedTerms = terms.map(textNormalize).filter(Boolean);
        if (!normalizedTerms.length) return null;
        const nodes = document.querySelectorAll('[title], [aria-label], [data-i18n], .drawer-icon, .drawer-toggle, .menu_button, button, a');
        for (const node of nodes) {
            if (node.closest('#mt-root, #mt-command-palette')) continue;
            const haystack = textNormalize(`${node.getAttribute('title') || ''} ${node.getAttribute('aria-label') || ''} ${node.getAttribute('data-i18n') || ''} ${node.textContent || ''}`);
            if (normalizedTerms.some(term => haystack === term || haystack.includes(term))) return node;
        }
        return null;
    }

    panelIsOpen(key) {
        const selectors = PANEL_SELECTORS[key] || [];
        for (const panel of this.all(selectors)) {
            if (panel.classList.contains('closedDrawer')) continue;
            if (panel.hidden) continue;
            const style = getComputedStyle(panel);
            if (style.display === 'none' || style.visibility === 'hidden') continue;
            return true;
        }
        return false;
    }

    getDrawerPartsFromCandidate(original, key) {
        if (!original) return { drawer: null, toggle: null, panel: null, icon: null };

        const drawer = original.matches?.('.drawer') ? original : original.closest?.('.drawer');
        const toggle = drawer?.querySelector?.(':scope > .drawer-toggle')
            || (original.matches?.('.drawer-toggle') ? original : original.closest?.('.drawer-toggle'))
            || null;
        const panel = drawer?.querySelector?.(':scope > .drawer-content')
            || this.first(PANEL_SELECTORS[key] || [])
            || null;
        const icon = toggle?.querySelector?.('.drawer-icon')
            || drawer?.querySelector?.(':scope > .drawer-toggle .drawer-icon')
            || null;

        return { drawer, toggle, panel, icon };
    }

    forceOpenDrawer(parts) {
        const { panel, icon } = parts;
        if (!panel) return false;

        document.querySelectorAll('.drawer-content.openDrawer:not(.pinnedOpen)').forEach(other => {
            if (other === panel) return;
            other.classList.remove('openDrawer');
            other.classList.add('closedDrawer');
            const otherDrawer = other.closest('.drawer');
            const otherIcon = otherDrawer?.querySelector(':scope > .drawer-toggle .drawer-icon');
            otherIcon?.classList.remove('openIcon');
            otherIcon?.classList.add('closedIcon');
        });

        panel.classList.remove('closedDrawer');
        panel.classList.add('openDrawer');
        panel.hidden = false;
        icon?.classList.remove('closedIcon');
        icon?.classList.add('openIcon');

        if (panel.id === 'right-nav-panel') {
            const list = document.querySelector('#rm_print_characters_block');
            list?.dispatchEvent(new Event('scroll', { bubbles: true }));
            try { window.jQuery?.(list)?.trigger?.('scroll'); } catch (_) {}
        }
        return true;
    }

    async click(key, fallbacks = []) {
        const candidates = this.candidates(key, fallbacks);
        if (!candidates.length) return { ok: false, reason: 'not-found', key };

        document.body?.classList.add('mt-panel-switching');
        try {
            for (const original of candidates) {
                const parts = this.getDrawerPartsFromCandidate(original, key);
                const target = parts.toggle || original;
                const before = this.panelIsOpen(key) || parts.panel?.classList.contains('openDrawer');

                try {
                    if (typeof target.click === 'function') target.click();
                    else target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
                } catch (error) {
                }

                await new Promise(resolve => setTimeout(resolve, 90));
                const after = this.panelIsOpen(key) || parts.panel?.classList.contains('openDrawer');
                if (after) return { ok: true, target, panel: parts.panel, native: true };

                if (!before && this.forceOpenDrawer(parts)) {
                    await new Promise(resolve => requestAnimationFrame(resolve));
                    return { ok: true, target, panel: parts.panel, native: false, forced: true };
                }

                if (before && this.forceOpenDrawer(parts)) {
                    return { ok: true, target, panel: parts.panel, native: false, forced: true };
                }
            }

            const panel = this.first(PANEL_SELECTORS[key] || []);
            if (panel) {
                const drawer = panel.closest('.drawer');
                const parts = {
                    drawer,
                    toggle: drawer?.querySelector(':scope > .drawer-toggle') || null,
                    panel,
                    icon: drawer?.querySelector(':scope > .drawer-toggle .drawer-icon') || null,
                };
                if (this.forceOpenDrawer(parts)) return { ok: true, panel, forced: true };
            }

            return { ok: false, reason: 'no-state-change', key, candidates };
        } finally {
            await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            document.body?.classList.remove('mt-panel-switching');
        }
    }

    focusChat() {
        const el = this.first('sendTextarea');
        if (!el) return false;
        el.focus({ preventScroll: false });
        el.scrollIntoView({ block: 'nearest' });
        return true;
    }

    closeNativeDrawers(except = null) {
        const drawers = document.querySelectorAll('.drawer-content.openDrawer, .drawer-content:not(.closedDrawer)');
        for (const panel of drawers) {
            if (except && (panel === except || panel.matches?.(except) || panel.closest?.(except))) continue;
            const drawer = panel.closest('.drawer');
            const toggle = drawer?.querySelector(':scope > .drawer-toggle');
            const icon = toggle?.querySelector('.drawer-icon');
            try { toggle?.click?.(); } catch (_) {}
            if (panel.classList.contains('openDrawer') || !panel.classList.contains('closedDrawer')) {
                panel.classList.remove('openDrawer');
                panel.classList.add('closedDrawer');
                icon?.classList.remove('openIcon');
                icon?.classList.add('closedIcon');
            }
        }
    }

    getConnectionState() {
        let nativeStatus = '';
        try {
            nativeStatus = String(window.SillyTavern?.getContext?.()?.onlineStatus || '').trim();
        } catch (_) {}

        const normalized = nativeStatus.toLowerCase();
        const offline = !normalized || ['no_connection', 'offline', 'disconnected', 'connecting'].includes(normalized);
        const label = this.first('onlineStatus')?.textContent?.trim() || nativeStatus || 'Connection';
        return { label, offline, nativeStatus };
    }

    getCharacterName() {
        const node = this.first('characterName');
        if (!node) return '';
        return ('value' in node ? node.value : node.textContent)?.trim() || '';
    }

    getPersonaName() {
        const node = this.first('personaName');
        return node && 'value' in node ? String(node.value || '').trim() : '';
    }

    discoverDataBank() {
        return this.first('dataBank') || this.findInteractiveByText('Open Data Bank', 'Data Bank');
    }

    async waitForElement(selectors, timeout = 1800, step = 60) {
        const list = Array.isArray(selectors) ? selectors : [selectors];
        const started = performance.now();
        while (performance.now() - started < timeout) {
            const el = this.first(list);
            if (el) return el;
            await new Promise(resolve => setTimeout(resolve, step));
        }
        return null;
    }

    async openDataBank() {
        let trigger = this.discoverDataBank();
        if (!trigger) {
            trigger = await this.waitForElement([
                '#manageAttachments',
                '#data_bank_wand_container #manageAttachments',
                '[data-i18n="Open Data Bank"]',
            ]);
        }
        if (!trigger) return { ok: false, reason: 'not-found' };

        try {
            if (typeof trigger.click === 'function') trigger.click();
            else trigger.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
        } catch (error) {
            return { ok: false, reason: 'click-failed', error };
        }

        const content = await this.waitForElement([
            '.popup .dataBankAttachments',
            '.popup-content .dataBankAttachments',
            '.dataBankAttachments',
        ], 2600, 70);
        if (!content) return { ok: false, reason: 'popup-not-opened', trigger };

        content.dataset.mtModule = 'databank';
        content.classList.add('mt-databank');
        const popup = content.closest('.popup, .popup-content, dialog, .ui-dialog');
        popup?.classList.add('mt-popup-surface', 'mt-databank-popup');
        return { ok: true, trigger, content, popup };
    }

    tagNativeUI() {
        const personaInner = document.querySelector('#persona-management-block');
        personaInner?.classList.remove('mt-native-panel');
        personaInner?.removeAttribute('data-mt-module');
        personaInner?.querySelector(':scope > .mt-workspace-chrome')?.remove();

        const maps = [
            ['#left-nav-panel', 'response'], ['#rm_api_block', 'models'], ['#WorldInfo', 'lorebooks'],
            ['#user-settings-block', 'settings'], ['#Backgrounds', 'backgrounds'], ['#right-nav-panel', 'characters'],
            ['#PersonaManagement', 'personas'],
            ['#AdvancedFormatting', 'formatting'],
            ['#rm_extensions_block', 'extensions'],
        ];
        for (const [selector, module] of maps) {
            const el = document.querySelector(selector);
            if (el) {
                el.dataset.mtModule = module;
                el.classList.add('mt-native-panel');
            }
        }
        const worldInfoActions = document.querySelector('#WorldInfo #world_popup_new')?.closest('.flex-container.alignitemscenter');
        worldInfoActions?.classList.add('nt-wi-popup-actions');

        document.querySelectorAll('.drawer-content').forEach(el => el.classList.add('mt-drawer-content'));
        document.querySelectorAll('.inline-drawer').forEach(el => el.classList.add('mt-inline-card'));
        document.querySelectorAll('.popup, .popup-content, dialog').forEach(el => el.classList.add('mt-popup-surface'));
        document.querySelectorAll('.dataBankAttachments').forEach(content => {
            content.dataset.mtModule = 'databank';
            content.classList.add('mt-databank');
            content.closest('.popup, .popup-content, dialog, .ui-dialog')?.classList.add('mt-popup-surface', 'mt-databank-popup');
        });
    }
}
