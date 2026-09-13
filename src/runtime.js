import { DomAdapter } from './dom-adapter.js';
import { AppShell } from './shell.js';
import { CommandPalette } from './command-palette.js';
import { icons } from './icons.js';
import { defaults, getSettings, saveSettings, applySettings, buildSettingsPanel } from './settings.js';
import { VariableManager } from './variable-manager.js';
import { WorldInfoInfo } from './world-info-info.js';
import { ChatToolbar } from './chat-toolbar.js';
import { TimelineManager } from './timeline-manager.js';
import { ContextInspector } from './context-inspector.js';
import { ChatTools } from './chat-tools.js';
import { CalendarManager } from './calendar-manager.js';
import { PreferencesManager } from './preferences-manager.js';
import { HealthPanel } from './health-panel.js';
import { AboutPanel } from './about-panel.js';
import { initI18n, startI18nObserver, stopI18nObserver, localizeOwnedUI, t, translateText } from './i18n.js';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

export class NastyTavern {
    constructor() {
        this.dom = new DomAdapter();
        this.settings = getSettings();
        this.settings.contextRail = false;
        this.shell = new AppShell(id => this.navigate(id), () => this.palette.toggle(), () => this.toggleCompactNav(), () => this.healthPanel.open(), () => this.aboutPanel.open(), action => this.handleUiAction(action));
        this.palette = new CommandPalette(() => this.getActions());
        this.observer = null;
        this.interval = null;
        this.boundKeydown = e => this.onKeyDown(e);
        this.boundDocumentClick = () => this.scheduleNativePanelSync();
        this.viewSyncTimer = null;
        this.active = false;
        this.retagTimer = null;
        this.variableManager = new VariableManager(message => this.toast(message));
        this.currentView = 'chat';
        this.worldInfoInfo = new WorldInfoInfo(message => this.toast(message));
        this.chatToolbar = new ChatToolbar(message => this.toast(message), section => this.toggleToolbarSection(section));
        this.timelineManager = new TimelineManager(message => this.toast(message));
        this.contextInspector = new ContextInspector(message => this.toast(message));
        this.chatTools = new ChatTools(message => this.toast(message));
        this.calendarManager = new CalendarManager(message => this.toast(message));
        this.preferences = new PreferencesManager(this.settings, message => this.toast(message), {
            navigate: id => this.navigate(id),
            currentView: () => this.currentView,
            openTool: id => this.openTool(id),
            getShortcutDefinitions: () => this.getShortcutDefinitions(),
            eventToShortcut: e => this.eventToShortcut(e),
            shortcutsChanged: () => { saveSettings(); this.shell.updateCommandShortcut(this.settings.shortcuts?.commandPalette); },
        });
        this.healthPanel = new HealthPanel(message => this.toast(message), () => this.getHealthSnapshot());
        this.aboutPanel = new AboutPanel(() => this.healthPanel.open());
    }

    async activate() {
        await this.waitForApp();
        await initI18n();
        this.mount();
    }

    async enable() { await this.activate(); }

    async disable() {
        this.active = false;
        document.removeEventListener('keydown', this.boundKeydown, true);
        document.removeEventListener('click', this.boundDocumentClick, true);
        clearTimeout(this.viewSyncTimer); this.viewSyncTimer = null;
        stopI18nObserver();
        this.observer?.disconnect(); this.observer = null;
        clearInterval(this.interval); this.interval = null;
        this.palette.close();
        this.palette.root?.remove(); this.palette.root = null;
        this.chatToolbar.unmount();
        this.timelineManager.unmount();
        this.contextInspector.unmount();
        this.chatTools.unmount();
        this.calendarManager.unmount();
        this.preferences.unmount();
        this.healthPanel.unmount();
        this.aboutPanel.unmount();
        this.variableManager.unmount();
        this.worldInfoInfo.unmount();
        this.shell.unmount();
        document.querySelector('#mt-settings-panel')?.remove();
        document.body?.classList.remove('mt-enabled','mt-density-compact','mt-density-comfortable','mt-nav-compact','mt-nav-hidden','mt-appbar-minimized','nt-chat-main-minimized','nt-chat-extensions-minimized','mt-focus-mode','mt-context-hidden','mt-hide-native-topbar','mt-dock-panels','mt-motion','mt-panel-switching');
        document.querySelectorAll('.mt-native-panel,.mt-drawer-content,.mt-inline-card,.mt-popup-surface').forEach(el => el.classList.remove('mt-native-panel','mt-drawer-content','mt-inline-card','mt-popup-surface'));
        this.cleanAdvancedCharacterDefinitions();
    }

    async clean() {
        const context = window.SillyTavern?.getContext?.();
        if (context?.extensionSettings) delete context.extensionSettings.modern_tavern_ui;
        localStorage.removeItem('modern_tavern_ui_fallback');
        context?.saveSettingsDebounced?.();
        await this.disable();
    }

    async waitForApp() {
        for (let i = 0; i < 80; i++) {
            if (document.body && (document.querySelector('#chat') || document.querySelector('#send_form'))) return;
            await wait(100);
        }
    }

    mount() {
        if (this.active) return;
        this.active = true;
        applySettings(this.settings);
        this.shell.mount();
        this.shell.updateCommandShortcut(this.settings.shortcuts?.commandPalette);
        this.palette.mount();
        this.dom.tagNativeUI();
        this.mountSettingsPanel();
        this.installObserver();
        this.updateStatus();
        this.enhanceChat();
        this.decorateNativePanels();
        this.decorateAdvancedCharacterDefinitions();
        this.variableManager.mount();
        this.setView('chat');
        this.worldInfoInfo.mount();
        this.timelineManager.mount();
        this.contextInspector.mount();
        this.chatTools.mount();
        this.calendarManager.mount();
        this.preferences.mount();
        this.healthPanel.mount();
        this.aboutPanel.mount();
        this.chatToolbar.mount();
        document.addEventListener('keydown', this.boundKeydown, true);
        document.addEventListener('click', this.boundDocumentClick, true);
        startI18nObserver();
        localizeOwnedUI();
        this.interval = setInterval(() => this.updateStatus(), 1500);
        console.info('[NastyTavern] UI overhaul active');
    }

    mountSettingsPanel() {
        if (document.querySelector('#mt-settings-panel')) return;
        const host = this.dom.discoverExtensionSettings();
        if (!host) return;
        const panel = buildSettingsPanel(this.settings, () => {
            applySettings(this.settings);
            saveSettings();
        }, () => this.preferences.open());
        host.prepend(panel);
    }

    installObserver() {
        this.observer = new MutationObserver(mutations => {
            let relevant = false;
            let panelStateChanged = false;
            for (const mutation of mutations) {
                if (mutation.type === 'childList' && mutation.addedNodes.length) relevant = true;
                if (mutation.type === 'attributes' && mutation.target?.matches?.('.mt-native-panel,.drawer-content')) panelStateChanged = true;
            }
            if (panelStateChanged) this.scheduleNativePanelSync(100);
            if (!relevant) return;
            clearTimeout(this.retagTimer);
            this.retagTimer = setTimeout(() => {
                this.dom.tagNativeUI();
                this.mountSettingsPanel();
                this.enhanceChat();
                this.decorateNativePanels();
                this.decorateAdvancedCharacterDefinitions();
                this.variableManager.mount();
                this.worldInfoInfo.mount();
                this.timelineManager.mount();
                this.contextInspector.mount();
                this.chatTools.mount();
                this.calendarManager.mount();
                this.preferences.mount();
                this.healthPanel.mount();
                this.aboutPanel.mount();
                this.chatToolbar.mount();
                localizeOwnedUI();
            }, 80);
        });
        this.observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden'] });
    }

    enhanceChat() {
        const chat = this.dom.first('chat');
        if (chat) chat.classList.add('mt-chat-surface');
        const form = this.dom.first('sendForm');
        if (form) form.classList.add('mt-composer');
        document.querySelectorAll('#chat .mes').forEach(mes => mes.classList.add('mt-message'));
    }

    decorateNativePanels() {
        const labels = {
            response: t('Generation & Prompts'), models: t('Models & API'), lorebooks: t('Lorebooks'),
            settings: t('Settings'), backgrounds: t('Backgrounds'), characters: t('Characters'),
            personas: t('Personas'), formatting: t('Advanced Formatting'), extensions: t('Extensions'), databank: t('Data Bank'),
        };
        document.querySelectorAll('.mt-native-panel').forEach(panel => {
            if (panel.querySelector(':scope > .mt-workspace-chrome')) return;
            const module = panel.dataset.mtModule || 'workspace';
            const chrome = document.createElement('div');
            chrome.className = 'mt-workspace-chrome';
            chrome.innerHTML = `<div class="mt-workspace-heading"><small>${t('Workspace')}</small><b>${labels[module] || 'SillyTavern'}</b></div><div class="mt-workspace-sections"></div><button class="mt-workspace-close" title="${t('Close workspace')}">${icons.close}</button>`;
            const sections = chrome.querySelector('.mt-workspace-sections');
            const seen = new Set();
            const headings = [...panel.querySelectorAll('h3, h4, .inline-drawer-header b')].filter(node => !node.closest('.mt-workspace-chrome'));
            for (const heading of headings) {
                const text = String(heading.textContent || '').replace(/\s+/g, ' ').trim();
                const key = text.toLowerCase();
                if (!text || text.length > 38 || seen.has(key)) continue;
                seen.add(key);
                const button = document.createElement('button');
                button.type = 'button'; button.textContent = text;
                button.addEventListener('click', event => {
                    event.preventDefault(); event.stopPropagation();
                    heading.scrollIntoView({ behavior: this.settings.motion ? 'smooth' : 'auto', block: 'start' });
                });
                sections.append(button);
                if (seen.size >= 8) break;
            }
            chrome.querySelector('.mt-workspace-close').addEventListener('click', event => {
                event.preventDefault(); event.stopPropagation();
                const parent = panel.closest('.drawer');
                const toggle = parent?.querySelector(':scope > .drawer-toggle, :scope > .drawer-header, .drawer-toggle');
                toggle?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
                this.setView('chat');
            });
            panel.prepend(chrome);
        });
    }

    decorateAdvancedCharacterDefinitions() {
        const popup = document.querySelector('#character_popup');
        if (!popup || popup.classList.contains('mt-advanced-character-popup')) return;

        popup.classList.add('mt-advanced-character-popup');
        popup.setAttribute('role', 'dialog');
        popup.setAttribute('aria-modal', 'true');

        const header = popup.querySelector('#character_popup_text');
        header?.classList.add('mt-char-advanced-header');
        popup.querySelector('#character_cross')?.classList.add('mt-char-advanced-close');
        popup.querySelector('#character_popup_ok')?.classList.add('mt-char-advanced-save');

        const topSection = node => {
            if (!node || !popup.contains(node)) return null;
            let current = node;
            while (current.parentElement && current.parentElement !== popup) current = current.parentElement;
            return current.parentElement === popup ? current : node.closest('div');
        };

        const groups = [
            {
                id: 'prompts', label: t('Prompts'),
                selectors: ['#system_prompt_textarea', '#post_history_instructions_textarea'],
            },
            {
                id: 'metadata', label: t('Metadata'),
                selectors: ['#creator_textarea', '#character_version_textarea', '#creator_notes_textarea', '#tags_textarea'],
            },
            {
                id: 'character', label: t('Character'),
                selectors: ['#personality_textarea', '#scenario_pole', '#depth_prompt_prompt', '#depth_prompt_depth', '#depth_prompt_role', '#talkativeness_slider'],
            },
            {
                id: 'examples', label: t('Examples'),
                selectors: ['#mes_example_textarea'],
            },
        ];

        const anchors = [];
        for (const group of groups) {
            const sections = [];
            for (const selector of group.selectors) {
                const field = popup.querySelector(selector);
                if (!field) continue;
                field.classList.add('mt-char-advanced-field');
                const section = topSection(field);
                if (section && !sections.includes(section)) sections.push(section);
            }
            if (!sections.length) continue;
            sections.forEach((section, index) => {
                section.classList.add('mt-char-advanced-section');
                section.dataset.mtAdvancedGroup = group.id;
                if (index === 0) section.id ||= `mt-char-advanced-${group.id}`;
            });
            anchors.push({ ...group, target: sections[0] });
        }

        popup.querySelector('#depth_prompt_prompt')?.closest('.flex-container')?.classList.add('mt-char-depth-row');
        popup.querySelector('#talkativeness_slider')?.closest('div')?.classList.add('mt-char-talkativeness');
        popup.querySelector('#mes_example_textarea')?.closest('div')?.classList.add('mt-char-examples');

        if (anchors.length && !popup.querySelector(':scope > #mt-character-advanced-nav')) {
            const nav = document.createElement('nav');
            nav.id = 'mt-character-advanced-nav';
            nav.className = 'mt-char-advanced-nav';
            nav.setAttribute('aria-label', t('Advanced character definition sections'));
            for (const anchor of anchors) {
                const button = document.createElement('button');
                button.type = 'button';
                button.textContent = anchor.label;
                button.dataset.mtAdvancedTarget = anchor.id;
                button.addEventListener('click', event => {
                    event.preventDefault();
                    event.stopPropagation();
                    anchor.target.scrollIntoView({
                        behavior: this.settings.motion ? 'smooth' : 'auto',
                        block: 'start',
                    });
                });
                nav.append(button);
            }
            if (header?.nextSibling) popup.insertBefore(nav, header.nextSibling);
            else popup.prepend(nav);
        }
    }

    cleanAdvancedCharacterDefinitions() {
        document.querySelector('#mt-character-advanced-nav')?.remove();
        const popup = document.querySelector('#character_popup');
        if (!popup) return;
        popup.classList.remove('mt-advanced-character-popup');
        popup.removeAttribute('role');
        popup.removeAttribute('aria-modal');
        popup.querySelectorAll('.mt-char-advanced-header,.mt-char-advanced-close,.mt-char-advanced-save,.mt-char-advanced-field,.mt-char-advanced-section,.mt-char-depth-row,.mt-char-talkativeness,.mt-char-examples').forEach(el => {
            el.classList.remove('mt-char-advanced-header','mt-char-advanced-close','mt-char-advanced-save','mt-char-advanced-field','mt-char-advanced-section','mt-char-depth-row','mt-char-talkativeness','mt-char-examples');
            if (el.dataset?.mtAdvancedGroup) delete el.dataset.mtAdvancedGroup;
        });
    }

    onKeyDown(event) {
        if (event.key === 'Escape' && this.palette.root && !this.palette.root.hidden) {
            this.palette.close();
            return;
        }
        const target = event.target;
        const typing = target?.matches?.('input, textarea, select, [contenteditable="true"]');
        if (typing) return;
        const combo = this.eventToShortcut(event);
        const shortcuts = this.settings.shortcuts || {};
        const matched = Object.entries(shortcuts).find(([, value]) => value && value === combo)?.[0];
        if (!matched) return;
        event.preventDefault();
        event.stopPropagation();
        this.runShortcut(matched);
    }

    eventToShortcut(event) {
        const parts = [];
        if (event.ctrlKey || event.metaKey) parts.push('Ctrl');
        if (event.altKey) parts.push('Alt');
        if (event.shiftKey) parts.push('Shift');
        let key = String(event.key || '');
        if (['Control','Shift','Alt','Meta'].includes(key)) return '';
        if (key.length === 1) key = key.toUpperCase();
        else key = key.replace('Arrow','');
        parts.push(key);
        return parts.join('+');
    }

    getShortcutDefinitions() {
        return [
            { id:'commandPalette', label:'Command palette', hint:'Search NastyTavern actions', group:'NastyTavern' },
            { id:'timeline', label:'Story Timeline', hint:'Open the branching story canvas', group:'NastyTavern' },
            { id:'contextInspector', label:'Context Inspector', hint:'Inspect prompt and token usage', group:'NastyTavern' },
            { id:'worldInfoInspector', label:'World Info Inspector', hint:'Inspect Lorebook activation', group:'NastyTavern' },
            { id:'variables', label:'Variables', hint:'Open the Variable Manager', group:'NastyTavern' },
            { id:'chatTools', label:'Chat Tools', hint:'Open bookmarks and session notes', group:'NastyTavern' },
            { id:'calendar', label:'Calendar & Schedule', hint:'Open the per-chat calendar and weekly schedule', group:'NastyTavern' },
            { id:'health', label:'Health & Performance', hint:'Open diagnostic information', group:'NastyTavern' },
            { id:'focusMode', label:'Focus mode', hint:'Hide interface chrome and keep only the essentials', group:'NastyTavern' },
            { id:'nativeChat', label:'Chat view', hint:'Return to the main chat and close native panels', group:'SillyTavern' },
            { id:'nativeCharacters', label:'Character Management', hint:'Open native Character Management', group:'SillyTavern' },
            { id:'nativePersonas', label:'Persona Management', hint:'Open native Persona Management', group:'SillyTavern' },
            { id:'nativeLorebooks', label:'World Info / Lorebooks', hint:'Open native World Info editor', group:'SillyTavern' },
            { id:'nativeBackgrounds', label:'Backgrounds', hint:'Open native Backgrounds panel', group:'SillyTavern' },
            { id:'nativeFormatting', label:'Advanced Formatting', hint:'Open native Advanced Formatting', group:'SillyTavern' },
            { id:'nativePrompts', label:'Response Configuration & Prompt Manager', hint:'Open native Response Configuration and Prompt Manager', group:'SillyTavern' },
            { id:'nativeModels', label:'API Connections', hint:'Open native API Connections', group:'SillyTavern' },
            { id:'nativeExtensions', label:'Extensions', hint:'Open native Extensions panel', group:'SillyTavern' },
            { id:'nativeSettings', label:'User Settings', hint:'Open native User Settings', group:'SillyTavern' },
            { id:'nativeDataBank', label:'Data Bank', hint:'Open native Data Bank', group:'SillyTavern' },
        ];
    }

    runShortcut(id) {
        if (id === 'commandPalette') return this.palette.toggle();
        if (id === 'health') return this.healthPanel.open();
        if (id === 'focusMode') return this.handleUiAction('focus');
        if (id === 'timeline') return this.openTool('timeline');
        if (id === 'contextInspector') return this.openTool('context');
        if (id === 'worldInfoInspector') return this.openTool('worldInfo');
        if (id === 'variables') return this.openTool('variables');
        if (id === 'chatTools') return this.openTool('chatTools');
        if (id === 'calendar') return this.openTool('calendar');
        if (id === 'nativeChat') return this.navigate('chat');
        if (id === 'nativeCharacters') return this.navigate('characters');
        if (id === 'nativePersonas') return this.navigate('personas');
        if (id === 'nativeLorebooks') return this.navigate('lorebooks');
        if (id === 'nativeBackgrounds') return this.navigate('backgrounds');
        if (id === 'nativeFormatting') return this.navigate('formatting');
        if (id === 'nativePrompts') return this.navigate('prompts');
        if (id === 'nativeModels') return this.navigate('models');
        if (id === 'nativeExtensions') return this.navigate('extensions');
        if (id === 'nativeSettings') return this.navigate('settings');
        if (id === 'nativeDataBank') return this.navigate('databank');
    }

    openTool(id) {
        this.dom.closeNativeDrawers();
        this.setView('chat');
        this.timelineManager.close();
        this.contextInspector.close();
        this.worldInfoInfo.close();
        this.variableManager.close();
        this.chatTools.close();
        this.calendarManager.close();
        if (id === 'timeline') this.timelineManager.open();
        if (id === 'context') this.contextInspector.open();
        if (id === 'worldInfo') this.worldInfoInfo.open();
        if (id === 'variables') this.variableManager.open();
        if (id === 'chatTools') this.chatTools.open();
        if (id === 'calendar') this.calendarManager.open();
    }

    getHealthSnapshot() {
        const context = window.SillyTavern?.getContext?.();
        const cstats = this.contextInspector.getStats();
        const wstats = this.worldInfoInfo.getStats();
        const chatStore = context?.chatMetadata?.nastyTavernChatTools || {};
        const calendarStats = this.calendarManager.getStats();
        return {
            timelineNodes: Array.isArray(this.timelineManager?.nodes) ? Math.max(0, this.timelineManager.nodes.length - 1) : (this.timelineManager?.nodes?.size || 0),
            contextTokens: cstats.tokens,
            contextPercent: cstats.percent,
            worldInfoEntries: wstats.active,
            bookmarks: Array.isArray(chatStore.bookmarks) ? chatStore.bookmarks.length : 0,
            notes: Array.isArray(chatStore.notes) ? chatStore.notes.length : 0,
            calendarEvents: calendarStats.events,
            weeklyItems: calendarStats.weekly,
            calendarInjected: calendarStats.injected,
        };
    }

    toggleCompactNav() {
        if (this.settings.navHidden) {
            this.settings.navHidden = false;
            this.settings.compactNav = false;
        } else if (!this.settings.compactNav) {
            this.settings.compactNav = true;
        } else {
            this.settings.navHidden = true;
        }
        applySettings(this.settings); saveSettings();
    }

    handleUiAction(action) {
        if (action === 'restore-nav') {
            this.settings.navHidden = false;
            this.settings.compactNav = false;
        }
        if (action === 'toggle-appbar') this.settings.appbarMinimized = !this.settings.appbarMinimized;
        if (action === 'focus') {
            this.settings.focusMode = !this.settings.focusMode;
            if (this.settings.focusMode) {
                this.dom.closeNativeDrawers();
                this.setView('chat');
                this.timelineManager.close();
                this.contextInspector.close();
                this.worldInfoInfo.close();
                this.variableManager.close();
                this.chatTools.close();
                this.calendarManager.close();
            }
        }
        applySettings(this.settings);
        saveSettings();
    }

    toggleToolbarSection(section) {
        if (section === 'all' || section === 'main' || section === 'secondary') {
            const next = !(this.settings.chatBarMinimized && this.settings.extensionsBarMinimized);
            this.settings.chatBarMinimized = next;
            this.settings.extensionsBarMinimized = next;
        }
        applySettings(this.settings);
        saveSettings();
    }

    updateStatus() {
        this.shell.updateStatus({
            connection: this.dom.getOnlineStatus(),
            character: this.dom.getCharacterName(),
            persona: this.dom.getPersonaName(),
        });
        this.syncNativePanelView();
        localizeOwnedUI();
    }

    scheduleNativePanelSync(delay = 140) {
        if (this.currentView === 'chat') return;
        const expected = this.currentView;
        clearTimeout(this.viewSyncTimer);
        this.viewSyncTimer = setTimeout(() => {
            this.viewSyncTimer = null;
            if (this.currentView !== expected) return;
            this.syncNativePanelView();
        }, delay);
    }

    nativePanelForView(view) {
        return {
            characters: '#right-nav-panel',
            personas: '#PersonaManagement',
            lorebooks: '#WorldInfo',
            formatting: '#AdvancedFormatting',
            prompts: '#left-nav-panel',
            models: '#rm_api_block',
            extensions: '#rm_extensions_block',
            settings: '#user-settings-block',
            backgrounds: '#Backgrounds',
        }[view] || '';
    }

    nativePanelIsOpen(view) {
        const selector = this.nativePanelForView(view);
        if (!selector) return view === 'chat';
        const panel = document.querySelector(selector);
        if (!panel || panel.hidden || panel.classList.contains('closedDrawer')) return false;
        if (panel.classList.contains('openDrawer')) return true;
        const style = getComputedStyle(panel);
        return style.display !== 'none' && style.visibility !== 'hidden' && panel.getClientRects().length > 0;
    }

    syncNativePanelView() {
        if (this.currentView === 'chat') return;
        if (this.nativePanelIsOpen(this.currentView)) return;
        this.setView('chat');
    }

    async clickAndTag(key, fallbacks, activeId) {
        const result = await this.dom.click(key, fallbacks);
        if (result.ok) {
            this.setView(activeId);
            return true;
        }
        const detail = result.reason === 'not-found' ? 'control not found' : 'native control did not open';
        console.warn('[NastyTavern] navigation failed', { key, fallbacks, result });
        this.toast(`Could not open ${activeId}: ${detail}. The native SillyTavern toolbar is still available.`);
        return false;
    }

    async clickNativeElement(el) {
        if (!el) return false;
        try {
            if (typeof el.click === 'function') el.click();
            else el.dispatchEvent(new MouseEvent('click', {bubbles:true,cancelable:true,view:window}));
            return true;
        } catch (error) {
            console.warn('[NastyTavern] direct native click failed', el, error);
            return false;
        }
    }

    setView(id, subtitle) {
        this.currentView = id;
        this.shell.setActive(id, subtitle);
        requestAnimationFrame(() => localizeOwnedUI());
    }

    async navigate(id) {
        if (id !== 'chat') {
            this.variableManager.close();
            this.worldInfoInfo.close();
            this.timelineManager.close();
            this.contextInspector.close();
            this.chatTools.close();
            this.calendarManager.close();
        }
        switch (id) {
            case 'chat':
                this.dom.closeNativeDrawers();
                this.dom.focusChat();
                this.setView('chat');
                break;
            case 'characters':
                await this.clickAndTag('characters', ['Character Management','Characters'], 'characters');
                break;
            case 'personas':
                await this.clickAndTag('personas', ['Persona Management','Personas'], 'personas');
                break;
            case 'lorebooks':
                await this.clickAndTag('worldInfo', ['World Info','Lorebook'], 'lorebooks');
                break;
            case 'formatting':
                await this.clickAndTag('formatting', ['Advanced Formatting','AI Response Formatting','Context Template','Instruct Template'], 'formatting');
                break;
            case 'prompts':
                await this.clickAndTag('response', ['AI Response Configuration','Response Configuration'], 'prompts');
                break;
            case 'models':
                await this.clickAndTag('api', ['API Connections','API Connection'], 'models');
                break;
            case 'extensions':
                if (!(await this.clickAndTag('extensionsDrawer', ['Extensions'], 'extensions'))) await this.clickAndTag('extensionsMenu', ['Extensions'], 'extensions');
                break;
            case 'settings':
                await this.clickAndTag('userSettings', ['User Settings'], 'settings');
                break;
            case 'backgrounds':
                await this.clickAndTag('backgrounds', ['Backgrounds','Change Background Image'], 'backgrounds');
                break;
            case 'databank': {
                this.dom.closeNativeDrawers();
                this.setView('chat');
                const result = await this.dom.openDataBank();
                if (!result.ok) this.toast('Could not open Data Bank. The native SillyTavern control is still available.');
                break;
            }
        }
    }

    toast(message) {
        const localized = translateText(message);
        if (window.toastr?.info) window.toastr.info(localized, 'NastyTavern');
        else console.info('[NastyTavern]', localized);
    }

    getActions() {
        const actions = [
            ['Open chat','chat',icons.chat,'Focus the conversation','Ctrl K'],
            ['Characters','characters',icons.characters,'Open character library'],
            ['Personas','personas',icons.persona,'Manage identity and persona'],
            ['Lorebooks / World Info','lorebooks',icons.lore,'Open World Info editor'],
            ['Formatting','formatting',icons.prompt,'Context Template, Instruct Template and System Prompt'],
            ['Generation & Prompt settings','prompts',icons.prompt,'Response Configuration and Prompt Manager'],
            ['Models & API','models',icons.model,'API Connections'],
            ['Extensions','extensions',icons.extensions,'Manage extensions'],
            ['User settings','settings',icons.settings,'Appearance and application settings'],
        ].map(([label,id,icon,hint,shortcut]) => ({label:t(label),icon,hint:t(hint),shortcut,keywords:`${id} ${t(label)} ${t(hint)}`,run:()=>this.navigate(id)}));

        actions.splice(1, 0, {
            label: t('Variables'),
            icon: icons.variables,
            hint: t('Manage local variables for this chat and global variables'),
            keywords: 'variables local global setvar getvar setglobalvar getglobalvar',
            run: () => {
                this.dom.closeNativeDrawers();
                this.setView('chat');
                this.variableManager.open();
            },
        });


        actions.splice(2, 0, {
            label: t('Context Inspector'),
            icon: icons.inspector,
            hint: t('Inspect the final prompt and token usage'),
            keywords: 'context prompt tokens inspector',
            run: () => this.openTool('context'),
        }, {
            label: t('World Info Inspector'),
            icon: icons.lore,
            hint: t('Inspect active entries, live scans and Lorebook history'),
            keywords: 'world info lorebook monitor activated history',
            run: () => this.openTool('worldInfo'),
        }, {
            label: t('Chat Tools'),
            icon: icons.bookmark,
            hint: t('Bookmarks and private session notes'),
            keywords: 'bookmarks notes session chat tools',
            run: () => this.openTool('chatTools'),
        }, {
            label: t('NastyTavern Settings'),
            icon: icons.workspace,
            hint: t('Backup and keyboard shortcuts'),
            keywords: 'backup export import shortcuts nasty settings',
            run: () => this.preferences.open(),
        }, {
            label: t('Health & Performance'),
            icon: icons.health,
            hint: t('Open NastyTavern diagnostics'),
            keywords: 'health performance diagnostics',
            run: () => this.healthPanel.open(),
        });

        actions.splice(2, 0, {
            label: t('Focus mode'),
            icon: icons.workspace,
            hint: t('Hide interface chrome and keep only the chat and composer'),
            keywords: 'focus minimal clean distraction free hide interface',
            shortcut: this.settings.shortcuts?.focusMode || '',
            run: () => this.handleUiAction('focus'),
        });

        actions.splice(2, 0, {
            label: t('Calendar & Schedule'),
            icon: icons.calendar,
            hint: t('Manage story dates, appointments, weekly routines and prompt injection'),
            keywords: 'calendar schedule planning agenda appointment routine date weekly',
            run: () => this.openTool('calendar'),
        });

        actions.splice(2, 0, {
            label: t('Story Timeline'),
            icon: icons.timeline,
            hint: t('Explore chats as an interactive branching story timeline'),
            keywords: 'timeline branches chats checkpoints swipes story tree',
            run: () => {
                this.dom.closeNativeDrawers();
                this.setView('chat');
                this.timelineManager.open();
            },
        }, {
            label: t('Chat history'),
            icon: icons.history,
            hint: t('Switch quickly between chats for the current character or group'),
            keywords: 'chat history conversations switch chats',
            run: () => {
                this.dom.closeNativeDrawers();
                this.setView('chat');
                this.chatToolbar.openHistory();
            },
        }, {
            label: t('Search current chat'),
            icon: icons.search,
            hint: t('Find and jump between matching messages in the current chat'),
            keywords: 'search find messages current chat',
            run: () => {
                this.dom.closeNativeDrawers();
                this.setView('chat');
                this.chatToolbar.openSearch();
            },
        });

        const native = [
            ['Data Bank', async () => {
                const result = await this.dom.openDataBank();
                if (!result.ok) this.toast('Data Bank could not be opened. Chat Attachments may be unavailable.');
            }, icons.data, 'Open retrieval / document context'],
            ['Backgrounds', () => this.clickAndTag('backgrounds',['Change Background Image','Backgrounds'],'chat'), icons.panel, 'Change chat background'],
            ['Regenerate response', () => this.dom.findInteractiveByText('Regenerate')?.click(), icons.chat, 'Generate the last reply again'],
            ['Continue generation', () => this.dom.findInteractiveByText('Continue')?.click(), icons.chat, 'Continue the current reply'],
            ['Impersonate', () => this.dom.findInteractiveByText('Impersonate')?.click(), icons.persona, 'Generate as the active persona'],
            ['New chat', () => this.dom.findInteractiveByText('New Chat')?.click(), icons.chat, 'Start a new conversation'],
        ].map(([label,run,icon,hint]) => ({label:t(label),run,icon,hint:t(hint)}));

        return [...actions, ...native];
    }
}
