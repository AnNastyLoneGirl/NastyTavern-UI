import { DomAdapter } from './dom-adapter.js';
import { AppShell } from './shell.js';
import { CommandPalette } from './command-palette.js';
import { icons } from './icons.js';
import { defaults, getSettings, saveSettings, applySettings, buildSettingsPanel } from './settings.js';
import { TopInfoBarIntegration } from './integrations/top-info-bar.js';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

export class NastyTavern {
    constructor() {
        this.dom = new DomAdapter();
        this.settings = getSettings();
        this.settings.contextRail = false;
        this.shell = new AppShell(id => this.navigate(id), () => this.palette.toggle(), () => this.toggleCompactNav());
        this.palette = new CommandPalette(() => this.getActions());
        this.observer = null;
        this.interval = null;
        this.boundKeydown = e => this.onKeyDown(e);
        this.active = false;
        this.retagTimer = null;
        this.topInfoBar = new TopInfoBarIntegration();
    }

    async activate() {
        await this.waitForApp();
        this.mount();
    }

    async enable() { await this.activate(); }

    async disable() {
        this.active = false;
        document.removeEventListener('keydown', this.boundKeydown, true);
        this.observer?.disconnect(); this.observer = null;
        clearInterval(this.interval); this.interval = null;
        this.palette.close();
        this.palette.root?.remove(); this.palette.root = null;
        this.topInfoBar.clean();
        this.shell.unmount();
        document.querySelector('#mt-settings-panel')?.remove();
        document.body?.classList.remove('mt-enabled','mt-density-compact','mt-density-comfortable','mt-nav-compact','mt-context-hidden','mt-hide-native-topbar','mt-dock-panels','mt-motion','mt-panel-switching');
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
        this.palette.mount();
        this.dom.tagNativeUI();
        this.mountSettingsPanel();
        this.installObserver();
        this.updateStatus();
        this.enhanceChat();
        this.decorateNativePanels();
        this.decorateAdvancedCharacterDefinitions();
        this.topInfoBar.apply();
        document.addEventListener('keydown', this.boundKeydown, true);
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
        });
        host.prepend(panel);
    }

    installObserver() {
        this.observer = new MutationObserver(mutations => {
            let relevant = false;
            for (const mutation of mutations) {
                if (mutation.addedNodes.length) { relevant = true; break; }
            }
            if (!relevant) return;
            clearTimeout(this.retagTimer);
            this.retagTimer = setTimeout(() => {
                this.dom.tagNativeUI();
                this.mountSettingsPanel();
                this.enhanceChat();
                this.decorateNativePanels();
                this.decorateAdvancedCharacterDefinitions();
                this.topInfoBar.apply();
            }, 80);
        });
        this.observer.observe(document.body, { childList: true, subtree: true });
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
            response: 'Generation & Prompts', models: 'Models & API', lorebooks: 'Lorebooks',
            settings: 'Settings', backgrounds: 'Backgrounds', characters: 'Characters',
            personas: 'Personas', formatting: 'Advanced Formatting', extensions: 'Extensions', databank: 'Data Bank',
        };
        document.querySelectorAll('.mt-native-panel').forEach(panel => {
            if (panel.querySelector(':scope > .mt-workspace-chrome')) return;
            const module = panel.dataset.mtModule || 'workspace';
            const chrome = document.createElement('div');
            chrome.className = 'mt-workspace-chrome';
            chrome.innerHTML = `<div class="mt-workspace-heading"><small>Workspace</small><b>${labels[module] || 'SillyTavern'}</b></div><div class="mt-workspace-sections"></div><button class="mt-workspace-close" title="Close workspace">${icons.close}</button>`;
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
                this.shell.setActive('chat');
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
                id: 'prompts', label: 'Prompts',
                selectors: ['#system_prompt_textarea', '#post_history_instructions_textarea'],
            },
            {
                id: 'metadata', label: 'Metadata',
                selectors: ['#creator_textarea', '#character_version_textarea', '#creator_notes_textarea', '#tags_textarea'],
            },
            {
                id: 'character', label: 'Character',
                selectors: ['#personality_textarea', '#scenario_pole', '#depth_prompt_prompt', '#depth_prompt_depth', '#depth_prompt_role', '#talkativeness_slider'],
            },
            {
                id: 'examples', label: 'Examples',
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
            nav.setAttribute('aria-label', 'Advanced character definition sections');
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
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
            event.preventDefault(); event.stopPropagation(); this.palette.toggle();
        }
        if (event.key === 'Escape' && this.palette.root && !this.palette.root.hidden) this.palette.close();
    }

    toggleCompactNav() {
        this.settings.compactNav = !this.settings.compactNav;
        applySettings(this.settings); saveSettings();
    }

    updateStatus() {
        this.shell.updateStatus({
            connection: this.dom.getOnlineStatus(),
            character: this.dom.getCharacterName(),
            persona: this.dom.getPersonaName(),
        });
    }

    async clickAndTag(key, fallbacks, activeId) {
        const result = await this.dom.click(key, fallbacks);
        if (result.ok) {
            this.shell.setActive(activeId);
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

    async navigate(id) {
        switch (id) {
            case 'chat':
                this.dom.closeNativeDrawers();
                this.dom.focusChat();
                this.shell.setActive('chat');
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
        }
    }

    toast(message) {
        if (window.toastr?.info) window.toastr.info(message, 'NastyTavern');
        else console.info('[NastyTavern]', message);
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
        ].map(([label,id,icon,hint,shortcut]) => ({label,icon,hint,shortcut,keywords:id,run:()=>this.navigate(id)}));

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
        ].map(([label,run,icon,hint]) => ({label,run,icon,hint}));

        return [...actions, ...native];
    }
}
