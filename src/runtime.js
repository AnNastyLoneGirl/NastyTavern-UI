import { DomAdapter } from './dom-adapter.js';
import { AppShell } from './shell.js';
import { CommandPalette } from './command-palette.js';
import { icons } from './icons.js';
import { getSettings, saveSettings, applySettings } from './settings.js';
import { VariableManager } from './variable-manager.js';
import { WorldInfoInfo } from './world-info-info.js';
import { ChatToolbar } from './chat-toolbar.js';
import { TimelineManager } from './timeline-manager.js';
import { ContextInspector } from './context-inspector.js';
import { ChatTools } from './chat-tools.js';
import { CalendarManager } from './calendar-manager.js';
import { ChatToolsHub } from './chat-tools-hub.js';
import { PreferencesManager } from './preferences-manager.js';
import { HealthPanel } from './health-panel.js';
import { AboutPanel } from './about-panel.js';
import { HomeDashboard } from './home-dashboard.js';
import { CommunityChat } from './community-chat.js';
import { CharacterDetailsModal } from './character-details.js';
import { ExtensionsModal } from './extensions-modal.js';
import { CatalogueModal } from './catalogue-modal.js';
import { createModalShell, showModalShell, hideModalShell } from './modal-shell.js';
import { emptyStateHtml } from './ui-templates.js';
import { initI18n, startI18nObserver, stopI18nObserver, localizeOwnedUI, t, translateText } from './i18n.js';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

const NT_SHA256_K = new Uint32Array([
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2,
]);

const ntRotateRight = (value, bits) => (value >>> bits) | (value << (32 - bits));

function ntSha256Hex(text) {
    const source = new TextEncoder().encode(String(text));
    const bitLength = source.length * 8;
    const paddedLength = Math.ceil((source.length + 9) / 64) * 64;
    const bytes = new Uint8Array(paddedLength);
    bytes.set(source);
    bytes[source.length] = 0x80;

    const view = new DataView(bytes.buffer);
    const high = Math.floor(bitLength / 0x100000000);
    const low = bitLength >>> 0;
    view.setUint32(paddedLength - 8, high, false);
    view.setUint32(paddedLength - 4, low, false);

    const hash = new Uint32Array([
        0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,
        0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19,
    ]);
    const words = new Uint32Array(64);

    for (let offset = 0; offset < paddedLength; offset += 64) {
        for (let i = 0; i < 16; i++) words[i] = view.getUint32(offset + i * 4, false);
        for (let i = 16; i < 64; i++) {
            const x = words[i - 15];
            const y = words[i - 2];
            const s0 = ntRotateRight(x, 7) ^ ntRotateRight(x, 18) ^ (x >>> 3);
            const s1 = ntRotateRight(y, 17) ^ ntRotateRight(y, 19) ^ (y >>> 10);
            words[i] = (words[i - 16] + s0 + words[i - 7] + s1) >>> 0;
        }

        let [a,b,c,d,e,f,g,h] = hash;
        for (let i = 0; i < 64; i++) {
            const S1 = ntRotateRight(e, 6) ^ ntRotateRight(e, 11) ^ ntRotateRight(e, 25);
            const ch = (e & f) ^ (~e & g);
            const t1 = (h + S1 + ch + NT_SHA256_K[i] + words[i]) >>> 0;
            const S0 = ntRotateRight(a, 2) ^ ntRotateRight(a, 13) ^ ntRotateRight(a, 22);
            const maj = (a & b) ^ (a & c) ^ (b & c);
            const t2 = (S0 + maj) >>> 0;
            h = g; g = f; f = e; e = (d + t1) >>> 0;
            d = c; c = b; b = a; a = (t1 + t2) >>> 0;
        }

        hash[0] = (hash[0] + a) >>> 0;
        hash[1] = (hash[1] + b) >>> 0;
        hash[2] = (hash[2] + c) >>> 0;
        hash[3] = (hash[3] + d) >>> 0;
        hash[4] = (hash[4] + e) >>> 0;
        hash[5] = (hash[5] + f) >>> 0;
        hash[6] = (hash[6] + g) >>> 0;
        hash[7] = (hash[7] + h) >>> 0;
    }

    return Array.from(hash, value => value.toString(16).padStart(8, '0')).join('');
}

function ntCanonicalize(value) {
    if (Array.isArray(value)) return value.map(item => ntCanonicalize(item));
    if (value && typeof value === 'object') {
        const output = {};
        for (const key of Object.keys(value).sort()) output[key] = ntCanonicalize(value[key]);
        return output;
    }
    return value;
}


export class NastyTavern {
    constructor() {
        this.dom = new DomAdapter();
        this.settings = getSettings();
        this.shell = new AppShell(id => this.navigate(id), () => this.palette.toggle(), () => this.toggleCompactNav(), () => this.healthPanel.open(), () => this.communityChat?.open(), () => this.aboutPanel.open(), () => this.preferences.open(), action => this.handleUiAction(action), action => this.handleCommunityAuth(action));
        this.palette = new CommandPalette(() => this.getActions());
        this.observer = null;
        this.nativeSidePanelObserver = null;
        this.nativeSidePanelResizeObserver = null;
        this.nativeSidePanels = new Set();
        this.interval = null;
        this.boundKeydown = e => this.onKeyDown(e);
        this.boundDocumentClick = event => this.onDocumentClick(event);
        this.boundDocumentChange = event => this.onDocumentChange(event);
        this.mobileNavMedia = window.matchMedia?.('(max-width: 680px), (orientation: landscape) and (max-height: 520px) and (max-width: 1024px)') || null;
        this.boundResponsiveNavChange = () => this.syncResponsiveNavMode();
        this.chatCharacterContextTranslation = { source: '', expanded: '', translationSource: '', translationKey: '', translated: '', shown: false, translating: false, manualOriginal: false };
        this.characterModalRoot = null;
        this.characterModalState = null;
        this.characterCreateModalRoot = null;
        this.characterCreateModalState = null;
        this.characterCreateActionState = null;
        this.characterCreateLayoutState = null;
        this.characterCreateTabState = null;
        this.characterCreateSubmissionState = null;
        this.characterEditLiveSaveState = null;
        this.characterDialogueExamplesPopup = null;
        this.characterDialogueExamplesDraft = null;
        this.characterLibraryControlState = null;
        this.characterLibraryExtensionAvailable = false;
        this.characterLibraryEditState = null;
        this.groupCreateReturnState = null;
        this.groupDeleteReturnState = null;
        this.personaModalRoot = null;
        this.personaModalState = null;
        this.personaModalOpening = false;
        this.personaNativeTogglePassThrough = false;
        this.backgroundModalRoot = null;
        this.backgroundModalState = null;
        this.backgroundModalOpening = false;
        this.extensionsModal = new ExtensionsModal(message => this.toast(message));
        this.catalogueModal = null;
        this.lorebookModalRoot = null;
        this.lorebookModalState = null;
        this.lorebookModalOpening = false;
        this.lorebookNativeTogglePassThrough = false;
        this.lorebookSettingsLayoutState = null;
        this.lorebookSettingsPopup = null;
        this.lorebookSettingsPopupState = null;
        this.lorebookSplitState = null;
        this.characterTagSortState = null;
        this.characterTagUsageCache = null;
        this.characterEmptyStateState = null;
        this.characterLibraryPerformanceState = null;
        this.characterPaginationStateRef = null;
        this.thirdPartyLauncherState = new Map();
        this.thirdPartyWorkspacePassThrough = '';
        this.viewSyncTimer = null;
        this.active = false;
        this.retagTimer = null;
        this.variableManager = new VariableManager(message => this.toast(message));
        this.currentView = 'chat';
        this.worldInfoInfo = new WorldInfoInfo(message => this.toast(message));
        this.chatToolbar = new ChatToolbar(message => this.toast(message));
        this.timelineManager = new TimelineManager(message => this.toast(message));
        this.contextInspector = new ContextInspector(message => this.toast(message));
        this.chatTools = new ChatTools(message => this.toast(message));
        this.calendarManager = new CalendarManager(message => this.toast(message));
        this.chatToolsHub = new ChatToolsHub({
            timeline: this.timelineManager,
            context: this.contextInspector,
            worldInfo: this.worldInfoInfo,
            variables: this.variableManager,
            calendar: this.calendarManager,
            chatTools: this.chatTools,
        });
        this.characterDetails = new CharacterDetailsModal(message => this.toast(message));
        this.communityChat = new CommunityChat(this.settings, message => this.toast(message), {
            badgeChanged: value => this.shell?.updateCommunityBadge(value),
            accountChanged: state => this.shell?.updateCommunityAccount?.(state),
            homeChanged: () => this.homeDashboard?.sync({ view: this.currentView }),
            openResourceDetails: options => this.characterDetails?.open?.(options),
            closeResourceDetails: () => this.characterDetails?.close?.({ restoreFocus: false }),
        });
        this.catalogueModal = new CatalogueModal(this.communityChat, message => this.toast(message), this.characterDetails);
        this.preferences = new PreferencesManager(this.settings, message => this.toast(message), {
            navigate: id => this.navigate(id),
            currentView: () => this.currentView,
            openTool: id => this.openTool(id),
            getShortcutDefinitions: () => this.getShortcutDefinitions(),
            eventToShortcut: e => this.eventToShortcut(e),
            shortcutsChanged: () => { saveSettings(); this.shell.updateCommandShortcut(this.settings.shortcuts?.commandPalette); },
            communityPrivacyChanged: () => { void this.handleCommunityPrivacyChanged(); },
            openCommunityPrivacy: () => this.communityChat?.openPrivacyNotice?.(),
        });
        this.healthPanel = new HealthPanel(message => this.toast(message), () => this.getHealthSnapshot());
        this.aboutPanel = new AboutPanel(() => this.healthPanel.open());
        this.homeDashboard = new HomeDashboard({
            navigate: id => this.navigate(id),
            toast: message => this.toast(message),
            getCommunitySnapshot: () => this.communityChat?.getHomeSnapshot?.(),
            openCommunity: channelSlug => this.communityChat?.open?.({ channelSlug }),
            openCommunityResource: resource => this.communityChat?.openResourceDetails?.(resource),
            openCatalogue: () => this.openCharacterCatalogue(),
            openCreateCharacter: () => this.openCharacterCreateModal(),
        });
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
        document.removeEventListener('change', this.boundDocumentChange, true);
        this.mobileNavMedia?.removeEventListener?.('change', this.boundResponsiveNavChange);
        clearTimeout(this.viewSyncTimer); this.viewSyncTimer = null;
        clearTimeout(this.retagTimer); this.retagTimer = null;
        stopI18nObserver();
        this.observer?.disconnect(); this.observer = null;
        this.nativeSidePanelObserver?.disconnect(); this.nativeSidePanelObserver = null;
        this.nativeSidePanelResizeObserver?.disconnect(); this.nativeSidePanelResizeObserver = null;
        this.nativeSidePanels.forEach(panel => {
            panel?.classList?.remove('nt-native-side-panel', 'nt-authors-note-panel', 'nt-cfg-scale-panel', 'nt-token-probability-panel', 'nt-moonlit-echoes-panel', 'nt-third-party-side-panel');
            panel?.querySelector?.('.nt-native-side-panel-header')?.classList?.remove('nt-native-side-panel-header');
            panel?.querySelector?.('#floatingPromptheader')?.classList?.remove('nt-native-side-panel-heading');
            panel?.querySelector?.('[data-nt-native-side-panel-title="generated"]')?.remove();
        });
        this.nativeSidePanels.clear();
        document.querySelectorAll('.nt-third-party-workspace-panel,.nt-third-party-workspace-surface,.nt-third-party-fixed-workspace,.nt-third-party-native-heading,.nt-third-party-native-trigger').forEach(element => {
            element.classList.remove('nt-third-party-workspace-panel', 'nt-third-party-workspace-surface', 'nt-third-party-fixed-workspace', 'nt-third-party-native-heading', 'nt-third-party-native-trigger');
            delete element.dataset.ntThirdPartyWorkspace;
        });
        document.body?.classList.remove('nt-native-side-panel-open', 'nt-native-side-panel-maximized');
        document.documentElement.style.removeProperty('--nt-native-side-panel-width');
        clearInterval(this.interval); this.interval = null;
        this.palette.close();
        this.palette.root?.remove(); this.palette.root = null;
        this.chatToolsHub.unmount();
        this.chatToolbar.unmount();
        this.timelineManager.unmount();
        this.contextInspector.unmount();
        this.chatTools.unmount();
        this.calendarManager.unmount();
        this.preferences.unmount();
        this.healthPanel.unmount();
        this.aboutPanel.unmount();
        this.characterDetails.unmount();
        await this.extensionsModal.unmount();
        this.catalogueModal?.unmount();
        this.communityChat.unmount();
        this.homeDashboard.unmount();
        this.variableManager.unmount();
        this.worldInfoInfo.unmount();
        this.shell.unmount();
        await this.cleanupPersonaModal();
        await this.cleanupBackgroundModal();
        await this.cleanupLorebookModal();
        await this.cleanupCharacterModal();
        document.querySelector('[data-nt-chat-character-context]')?.remove();
        document.body?.classList.remove('mt-enabled','mt-density-compact','mt-density-comfortable','mt-nav-compact','mt-nav-hidden','mt-appbar-minimized','mt-focus-mode','mt-hide-native-topbar','mt-dock-panels','mt-motion','mt-panel-switching','nt-mobile-nav-forced','nt-character-modal-open','nt-character-create-modal-open','nt-group-modal-open','nt-persona-modal-open','nt-background-modal-open','nt-lorebook-modal-open','nt-extensions-modal-open','nt-chat-tools-hub-open','nt-native-side-panel-open','nt-native-side-panel-maximized');
        document.querySelectorAll('.mt-native-panel,.mt-drawer-content,.mt-inline-card,.mt-popup-surface').forEach(el => el.classList.remove('mt-native-panel','mt-drawer-content','mt-inline-card','mt-popup-surface'));
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
        this.syncResponsiveNavMode();
        this.shell.mount();
        this.syncCharacterLibraryIntegration();
        this.shell.updateCommandShortcut(this.settings.shortcuts?.commandPalette);
        this.palette.mount();
        this.dom.tagNativeUI();
        this.installObserver();
        this.updateStatus();
        this.enhanceChat();
        this.setupNativeSidePanels();
        this.syncThirdPartyLaunchers();
        this.decorateNativePanels();
        this.ensureCommunityShareButtons();
        this.variableManager.mount();
        this.setView('chat');
        this.worldInfoInfo.mount();
        this.timelineManager.mount();
        this.contextInspector.mount();
        this.chatTools.mount();
        this.calendarManager.mount();
        this.chatToolsHub.mount();
        this.preferences.mount();
        this.healthPanel.mount();
        this.aboutPanel.mount();
        this.communityChat.mount();
        this.catalogueModal?.mount();
        this.homeDashboard.mount();
        this.chatToolbar.mount();
        document.addEventListener('keydown', this.boundKeydown, true);
        document.addEventListener('click', this.boundDocumentClick, true);
        document.addEventListener('change', this.boundDocumentChange, true);
        this.mobileNavMedia?.addEventListener?.('change', this.boundResponsiveNavChange);
        startI18nObserver();
        localizeOwnedUI();
        this.interval = setInterval(() => this.updateStatus(), 1500);
        console.info('[NastyTavern] UI overhaul active');
    }

    installObserver() {
        const isNastyOwnedNode = node => {
            const element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
            if (!element) return false;
            return !!element.closest?.('#mt-root, #nt-home-dashboard, #nt-community-panel, #nt-character-details-modal, #nt-variable-manager, #nt-world-info-info, #nt-chat-toolbar, #nt-chat-history, #nt-timeline-panel, #nt-context-inspector, #nt-chat-tools, #nt-calendar-manager, #nt-chat-tools-hub, #nt-preferences, #nt-health-panel, #nt-about-panel, #mt-command-palette, #nt-character-modal, #nt-character-create-modal, #nt-character-convert-confirm, #nt-group-modal, #nt-persona-modal, #nt-background-modal, #nt-lorebook-modal, #nt-extensions-modal, #nt-catalogue-modal, #nt-catalogue-upload-modal, [data-nt-chat-character-context]');
        };

        this.observer = new MutationObserver(mutations => {
            let relevant = false;
            let panelStateChanged = false;
            let nativeSidePanelStructureChanged = false;
            let translationAvailabilityChanged = false;
            for (const mutation of mutations) {
                if (mutation.type === 'childList') {
                    if (mutation.addedNodes.length) {
                        relevant ||= [...mutation.addedNodes].some(node => !isNastyOwnedNode(node));
                    }
                    if (mutation.addedNodes.length || mutation.removedNodes.length) {
                        const changedNodes = [...mutation.addedNodes, ...mutation.removedNodes];
                        nativeSidePanelStructureChanged ||= changedNodes.some(node => {
                            const element = node?.nodeType === Node.ELEMENT_NODE ? node : null;
                            return !!element && (
                                element.matches?.('#floatingPrompt, #cfgConfig, #logprobsViewer, [data-nt-native-side-panel], [id*="moonlit" i], [class*="moonlit" i], #datacat_browser_topbar_button') ||
                                element.querySelector?.('#floatingPrompt, #cfgConfig, #logprobsViewer, [data-nt-native-side-panel], [id*="moonlit" i], [class*="moonlit" i], #datacat_browser_topbar_button')
                            );
                        });
                    }
                }
                if (mutation.type === 'attributes' && mutation.target?.matches?.('.mt-native-panel,.drawer-content')) panelStateChanged = true;
                if (mutation.type === 'attributes' && mutation.target === document.body && mutation.attributeName === 'class') translationAvailabilityChanged = true;
            }
            if (nativeSidePanelStructureChanged) {
                this.setupNativeSidePanels();
                this.syncThirdPartyLaunchers();
            }
            if (panelStateChanged) {
                this.syncCharacterModalState();
                this.scheduleNativePanelSync(100);
            }
            if (translationAvailabilityChanged) this.syncChatCharacterContext();
            if (!relevant) return;
            clearTimeout(this.retagTimer);
            this.retagTimer = setTimeout(() => {
                this.dom.tagNativeUI();
                this.enhanceChat();
                this.setupNativeSidePanels();
                this.syncThirdPartyLaunchers();
                this.decorateNativePanels();
                this.syncCharacterLibraryIntegration();
                this.ensureCommunityShareButtons();
                this.variableManager.mount();
                this.worldInfoInfo.mount();
                this.timelineManager.mount();
                this.contextInspector.mount();
                this.chatTools.mount();
                this.calendarManager.mount();
                this.preferences.mount();
                this.healthPanel.mount();
                this.aboutPanel.mount();
                this.communityChat.mount();
                this.catalogueModal?.mount();
                this.homeDashboard.mount();
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
        this.syncChatCharacterContext();
    }

    getNativeSidePanelCandidates() {
        // Keep native/ST panels explicit, then discover opt-in third-party movable
        // popouts by semantic extension markers. This lets themes such as Moonlit
        // Echoes participate without turning every draggable element into a dock.
        const panels = new Set(document.querySelectorAll('#floatingPrompt, #cfgConfig, #logprobsViewer, [data-nt-native-side-panel]'));
        const moonlitMarkers = document.querySelectorAll('[id*="moonlit" i], [class*="moonlit" i], [data-extension-name*="moonlit" i]');
        for (const marker of moonlitMarkers) {
            let candidate = marker;
            while (candidate && candidate !== document.body) {
                if (candidate.querySelector?.(':scope > .panelControlBar')) {
                    panels.add(candidate);
                    candidate.classList.add('nt-moonlit-echoes-panel');
                    break;
                }
                candidate = candidate.parentElement;
            }
        }
        return [...panels];
    }

    syncThirdPartyLaunchers() {
        const host = this.shell?.root?.querySelector?.('[data-mt-third-party-launchers]');
        const datacatSource = document.querySelector('#datacat_browser_topbar_button');

        // Character-library extensions belong to one discoverable navigation group
        // instead of accumulating unrelated icon buttons in the app bar. Keep the
        // native source as the action owner and expose only a lightweight proxy row.
        this.shell?.setCharacterLibrarySourceAvailable?.('datacat', Boolean(datacatSource), {
            label: 'DataCat',
            icon: icons.extensions,
        });

        if (datacatSource) this.thirdPartyLauncherState.set('datacat', datacatSource);
        else this.thirdPartyLauncherState.delete('datacat');

        // Remove the previous app-bar bridge if upgrading without a full reload.
        host?.querySelector('[data-nt-third-party-launcher="datacat"]')?.remove();
        if (host) host.hidden = !host.childElementCount;
    }

    thirdPartyWorkspaceDefinition(view) {
        const providers = {
            personas: {
                key: 'persona-library',
                label: 'Persona Library',
                panelSelector: '#PersonaManagement',
                triggerSelectors: ['#persona-management-button > .drawer-toggle', '#persona-management-button > .drawer-toggle .drawer-icon'],
                assetTokens: ['persona-library'],
                surfaceSelectors: [
                    '[id*="persona-library" i]', '[class*="persona-library" i]',
                    '[id*="personalibrary" i]', '[class*="personalibrary" i]',
                    '[data-extension-name*="persona library" i]', '[aria-label*="persona library" i]',
                ],
            },
            lorebooks: {
                key: 'world-info-gallery',
                label: 'World Info Gallery',
                panelSelector: '#WorldInfo',
                triggerSelectors: ['#WI-SP-button > .drawer-toggle', '#WIDrawerIcon'],
                assetTokens: ['world-info-gallery'],
                surfaceSelectors: [
                    '[id*="world-info-gallery" i]', '[class*="world-info-gallery" i]',
                    '[id*="worldinfogallery" i]', '[class*="worldinfogallery" i]',
                    '[data-extension-name*="world info gallery" i]', '[aria-label*="world info gallery" i]',
                ],
            },
        };
        return providers[view] || null;
    }

    thirdPartyWorkspaceAvailable(view) {
        const provider = this.thirdPartyWorkspaceDefinition(view);
        if (!provider) return false;

        const assets = document.querySelectorAll('script[src], link[href]');
        for (const asset of assets) {
            const url = String(asset.getAttribute('src') || asset.getAttribute('href') || '').toLowerCase();
            if (provider.assetTokens.some(token => url.includes(token))) return true;
        }
        return provider.surfaceSelectors.some(selector => {
            try { return Boolean(document.querySelector(selector)); }
            catch (_) { return false; }
        });
    }

    elementIsVisible(element) {
        if (!(element instanceof HTMLElement) || !element.isConnected || element.hidden) return false;
        const style = getComputedStyle(element);
        return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0' && element.getClientRects().length > 0;
    }

    findThirdPartyWorkspaceSurface(view) {
        const provider = this.thirdPartyWorkspaceDefinition(view);
        if (!provider) return null;
        const panel = document.querySelector(provider.panelSelector);
        const candidates = [];

        for (const selector of provider.surfaceSelectors) {
            let nodes = [];
            try { nodes = [...document.querySelectorAll(selector)]; }
            catch (_) { continue; }
            for (const node of nodes) {
                if (!(node instanceof HTMLElement) || !this.elementIsVisible(node)) continue;
                if (node === panel || node.closest('script,style,template')) continue;
                candidates.push(node);
            }
        }

        // Extensions do not have a shared UI API. As a compatibility fallback,
        // accept a visible dialog/popup whose own heading names the provider.
        if (!candidates.length) {
            const label = provider.label.toLowerCase();
            const semantic = document.querySelectorAll('dialog, [role="dialog"], .popup, .popup-content, body > div');
            for (const node of semantic) {
                if (!(node instanceof HTMLElement) || !this.elementIsVisible(node)) continue;
                const heading = node.querySelector('h1,h2,h3,[role="heading"],.title,.header');
                const text = String(heading?.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
                if (text.includes(label)) candidates.push(node);
            }
        }

        if (candidates.length) {
            candidates.sort((a, b) => {
                const ar = a.getBoundingClientRect();
                const br = b.getBoundingClientRect();
                return (br.width * br.height) - (ar.width * ar.height);
            });
            return candidates[0];
        }
        return this.elementIsVisible(panel) ? panel : null;
    }

    decorateThirdPartyWorkspace(view) {
        const provider = this.thirdPartyWorkspaceDefinition(view);
        if (!provider || !this.thirdPartyWorkspaceAvailable(view)) return false;
        const panel = document.querySelector(provider.panelSelector);
        if (panel instanceof HTMLElement) {
            panel.classList.add('nt-third-party-workspace-panel');
            panel.dataset.ntThirdPartyWorkspace = provider.key;
            panel.querySelector(':scope > .mt-workspace-chrome')?.remove();

            // World Info Gallery replaces the native World Info browsing surface.
            // Keep SillyTavern's controls in the DOM for compatibility, but remove
            // the redundant native heading while the gallery owns this workspace.
            if (view === 'lorebooks') {
                const nativeHeadingLabel = panel.querySelector('span[data-i18n="Worlds/Lorebooks"]');
                nativeHeadingLabel?.closest('h3')?.classList.add('nt-third-party-native-heading');

                // The native World Info drawer trigger is redundant once the gallery
                // owns the Lorebooks workspace. Keep it in the DOM because SillyTavern
                // and the provider still use it as the programmatic open hook, but do
                // not render it beside the integrated workspace.
                const nativeTrigger = document.querySelector('#WI-SP-button > .drawer-toggle')
                    || document.querySelector('#WIDrawerIcon')?.closest('.drawer-toggle')
                    || document.querySelector('#WIDrawerIcon');
                nativeTrigger?.classList.add('nt-third-party-native-trigger');
            }
        }

        const surface = this.findThirdPartyWorkspaceSurface(view);
        if (surface instanceof HTMLElement) {
            surface.classList.add('nt-third-party-workspace-surface');
            surface.dataset.ntThirdPartyWorkspace = provider.key;
            const position = getComputedStyle(surface).position;
            if (surface !== panel && position === 'fixed') surface.classList.add('nt-third-party-fixed-workspace');
        }
        return Boolean(surface || panel);
    }

    async waitForThirdPartyWorkspace(view, timeout = 2400) {
        const provider = this.thirdPartyWorkspaceDefinition(view);
        if (!provider) return null;
        const startedAt = performance.now();
        while (performance.now() - startedAt < timeout) {
            const surface = this.findThirdPartyWorkspaceSurface(view);
            const panel = document.querySelector(provider.panelSelector);
            if (surface || this.elementIsVisible(panel)) return surface || panel;
            await wait(50);
        }
        return null;
    }

    async openThirdPartyWorkspace(view) {
        const provider = this.thirdPartyWorkspaceDefinition(view);
        if (!provider || !this.thirdPartyWorkspaceAvailable(view)) return false;

        // The provider owns the feature. NastyTavern only supplies the workspace
        // boundary and navigation, keeping the extension's real DOM/listeners intact.
        if (view === 'personas' && this.isPersonaModalOpen()) await this.closePersonaModal({ restoreFocus: false });
        if (view === 'lorebooks' && this.isLorebookModalOpen()) await this.closeLorebookModal({ restoreFocus: false });

        const existing = this.findThirdPartyWorkspaceSurface(view);
        const panel = document.querySelector(provider.panelSelector);
        if (existing || this.elementIsVisible(panel)) {
            this.decorateThirdPartyWorkspace(view);
            this.setView(view, provider.label);
            return true;
        }

        const trigger = provider.triggerSelectors.map(selector => document.querySelector(selector)).find(Boolean);
        if (!(trigger instanceof HTMLElement)) return false;

        this.thirdPartyWorkspacePassThrough = view;
        try {
            trigger.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
            const opened = await this.waitForThirdPartyWorkspace(view);
            if (!opened) return false;
            this.decorateThirdPartyWorkspace(view);
            this.setView(view, provider.label);
            requestAnimationFrame(() => this.decorateThirdPartyWorkspace(view));
            return true;
        } finally {
            this.thirdPartyWorkspacePassThrough = '';
        }
    }

    ensureNativeSidePanelHeader(panel) {
        const controlBar = panel?.querySelector?.(':scope > .panelControlBar');
        if (!controlBar) return;

        controlBar.classList.add('nt-native-side-panel-header');

        if (panel.id === 'floatingPrompt') {
            const nativeTitle = controlBar.querySelector('#floatingPromptheader');
            if (nativeTitle) nativeTitle.classList.add('nt-native-side-panel-heading');
            return;
        }

        const generatedTitles = {
            cfgConfig: 'CFG Scale',
            logprobsViewer: 'Token Probabilities',
        };
        const titleText = generatedTitles[panel.id] || (panel.classList.contains('nt-moonlit-echoes-panel') ? 'Moonlit Echoes' : '');
        if (titleText && !controlBar.querySelector('[data-nt-native-side-panel-title]')) {
            const title = document.createElement('div');
            title.className = 'nt-native-side-panel-heading';
            title.dataset.ntNativeSidePanelTitle = 'generated';
            title.textContent = t(titleText);
            controlBar.prepend(title);
        }
    }

    setupNativeSidePanels() {
        const panels = this.getNativeSidePanelCandidates();

        this.nativeSidePanelObserver?.disconnect();
        this.nativeSidePanelResizeObserver?.disconnect();
        this.nativeSidePanelObserver ||= new MutationObserver(() => this.syncNativeSidePanelLayout());
        if (typeof ResizeObserver === 'function') {
            this.nativeSidePanelResizeObserver ||= new ResizeObserver(() => this.syncNativeSidePanelLayout());
        }
        this.nativeSidePanels.clear();

        for (const panel of panels) {
            panel.classList.add('nt-native-side-panel');
            if (panel.id === 'floatingPrompt') panel.classList.add('nt-authors-note-panel');
            if (panel.id === 'cfgConfig') panel.classList.add('nt-cfg-scale-panel');
            if (panel.id === 'logprobsViewer') panel.classList.add('nt-token-probability-panel');
            if (panel.classList.contains('nt-moonlit-echoes-panel')) panel.classList.add('nt-third-party-side-panel');
            this.ensureNativeSidePanelHeader(panel);
            this.nativeSidePanels.add(panel);
            this.nativeSidePanelObserver.observe(panel, {
                attributes: true,
                attributeFilter: ['style', 'class', 'hidden'],
            });
            this.nativeSidePanelResizeObserver?.observe(panel);
        }

        this.syncNativeSidePanelLayout();
    }

    nativeSidePanelIsVisible(panel) {
        if (!panel?.isConnected || panel.hidden) return false;
        const style = getComputedStyle(panel);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
        return panel.getClientRects().length > 0;
    }

    syncNativeSidePanelLayout() {
        const visiblePanels = [...this.nativeSidePanels].filter(panel => this.nativeSidePanelIsVisible(panel));
        const body = document.body;
        const root = document.documentElement;

        if (!visiblePanels.length) {
            body?.classList.remove('nt-native-side-panel-open', 'nt-native-side-panel-maximized');
            root.style.removeProperty('--nt-native-side-panel-width');
            return;
        }

        // Only a right-edge popout reserves chat width. Full/maximized surfaces stay
        // overlays, so they never leave stale horizontal space behind when closed.
        const pageGutter = Number.parseFloat(getComputedStyle(root).getPropertyValue('--nt-page-gutter')) || 18;
        const panelStates = visiblePanels.map(panel => {
            const rect = panel.getBoundingClientRect();
            const maximized = panel.classList.contains('maximized');
            const rightGap = Math.max(0, window.innerWidth - rect.right);
            const touchesRightWorkspaceEdge = rightGap <= pageGutter * 2;
            return { panel, rect, maximized, touchesRightWorkspaceEdge };
        });

        const docked = panelStates
            .filter(state => !state.maximized && state.touchesRightWorkspaceEdge && state.rect.width > 0)
            .sort((a, b) => b.rect.width - a.rect.width)[0] || null;
        const maximized = panelStates.some(state => state.maximized);

        body?.classList.toggle('nt-native-side-panel-open', !!docked);
        body?.classList.toggle('nt-native-side-panel-maximized', maximized);

        if (docked) root.style.setProperty('--nt-native-side-panel-width', `${Math.ceil(docked.rect.width)}px`);
        else root.style.removeProperty('--nt-native-side-panel-width');
    }

    getChatCharacterContext() {
        const context = window.SillyTavern?.getContext?.();
        if (!context || context.groupId !== undefined && context.groupId !== null) return '';
        const characterId = context.characterId;
        if (characterId === undefined || characterId === null) return '';
        const character = context.characters?.[characterId];
        if (!character) return '';
        const data = character.data && typeof character.data === 'object' ? character.data : {};
        const candidates = [data.nt_context, character.nt_context, data.nt_contexte, character.nt_contexte];
        for (const candidate of candidates) {
            const value = String(candidate ?? '').trim();
            if (value) return value;
        }
        return '';
    }

    formatChatCharacterContextSource(source) {
        const context = window.SillyTavern?.getContext?.();
        const value = String(source ?? '');
        if (!value) return '';
        try {
            return typeof context?.substituteParams === 'function' ? String(context.substituteParams(value)) : value;
        } catch (error) {
            console.warn('[NastyTavern] Character context macro expansion failed.', error);
            return value;
        }
    }

    renderChatCharacterContextContent(block, value) {
        const target = block?.querySelector?.('[data-nt-chat-character-context-text]');
        if (!target) return;
        const context = window.SillyTavern?.getContext?.();
        const character = context?.characters?.[context?.characterId];
        const characterName = String(character?.name || context?.name2 || '');
        const content = String(value ?? '');
        try {
            if (typeof context?.messageFormatting === 'function') {
                target.innerHTML = context.messageFormatting(content, characterName, false, false, -1, {}, false);
            } else {
                target.textContent = content;
            }
        } catch (error) {
            console.warn('[NastyTavern] Character context message formatting failed.', error);
            target.textContent = content;
        }
    }

    syncChatCharacterContext() {
        const chat = this.dom.first('chat') || document.querySelector('#chat');
        if (!chat) return;
        const value = this.getChatCharacterContext();
        let block = chat.querySelector(':scope > [data-nt-chat-character-context]');
        if (!value) {
            block?.remove();
            this.chatCharacterContextTranslation = { source: '', expanded: '', translationSource: '', translationKey: '', translated: '', shown: false, translating: false, manualOriginal: false };
            return;
        }
        if (!block) {
            block = document.createElement('section');
            block.className = 'nt-chat-character-context';
            block.dataset.ntChatCharacterContext = '1';
            block.setAttribute('role', 'note');
            block.setAttribute('aria-label', t('Context'));
            block.innerHTML = `
                <div class="nt-chat-character-context-actions">
                    <button type="button" class="nt-chat-character-context-translate" data-nt-chat-context-translate hidden></button>
                </div>
                <div class="mes_text nt-chat-character-context-text" data-nt-no-i18n data-nt-chat-character-context-text></div>`;
        }
        const state = this.chatCharacterContextTranslation;
        if (state.source !== value) {
            this.chatCharacterContextTranslation = { source: value, expanded: this.formatChatCharacterContextSource(value), translationSource: '', translationKey: '', translated: '', shown: false, translating: false, manualOriginal: false };
        }
        const current = this.chatCharacterContextTranslation;
        const displayValue = current.shown && current.translated ? current.translated : (current.expanded || value);
        this.renderChatCharacterContextContent(block, displayValue);
        this.syncChatCharacterContextTranslationAction(block);
        const firstMessage = chat.querySelector(':scope > .mes');
        if (firstMessage) {
            if (block.parentElement !== chat || block.nextElementSibling !== firstMessage) chat.insertBefore(block, firstMessage);
        } else if (block.parentElement !== chat || chat.firstElementChild !== block) {
            chat.prepend(block);
        }
        void this.syncChatCharacterContextAutomaticTranslation(block);
    }

    getChatCharacterContextTranslationSettings() {
        const translateSettings = window.SillyTavern?.getContext?.()?.extensionSettings?.translate || {};
        return {
            autoMode: String(translateSettings.auto_mode || 'none'),
            targetLanguage: String(translateSettings.target_language || ''),
            provider: String(translateSettings.provider || ''),
        };
    }

    getChatCharacterContextTranslationKey() {
        const { targetLanguage, provider } = this.getChatCharacterContextTranslationSettings();
        return `${targetLanguage}::${provider}`;
    }

    shouldAutoTranslateChatCharacterContext() {
        const { autoMode } = this.getChatCharacterContextTranslationSettings();
        return autoMode === 'responses' || autoMode === 'both';
    }

    async syncChatCharacterContextAutomaticTranslation(block = document.querySelector('[data-nt-chat-character-context]')) {
        if (!block || !this.shouldAutoTranslateChatCharacterContext()) return false;
        if (!document.body?.classList.contains('translate') || typeof globalThis.translate !== 'function') return false;

        const state = this.chatCharacterContextTranslation;
        if (state.manualOriginal || state.translating) return false;
        const source = state.source || this.getChatCharacterContext();
        if (!source) return false;
        const translationSource = state.expanded || this.formatChatCharacterContextSource(source);
        const translationKey = this.getChatCharacterContextTranslationKey();

        if (state.translated && state.translationSource === translationSource && state.translationKey === translationKey) {
            if (!state.shown) {
                state.shown = true;
                this.renderChatCharacterContextContent(block, state.translated);
                this.syncChatCharacterContextTranslationAction(block);
            }
            return true;
        }

        if (state.shown) {
            state.shown = false;
            this.renderChatCharacterContextContent(block, translationSource);
        }
        return await this.toggleChatCharacterContextTranslation({ automatic: true });
    }

    syncChatCharacterContextTranslationAction(block = document.querySelector('[data-nt-chat-character-context]')) {
        const button = block?.querySelector?.('[data-nt-chat-context-translate]');
        if (!button) return;
        const available = document.body?.classList.contains('translate') && typeof globalThis.translate === 'function';
        button.hidden = !available;
        const actions = button.closest('.nt-chat-character-context-actions');
        if (actions) actions.hidden = !available;
        const state = this.chatCharacterContextTranslation;
        if (!available) {
            if (state.shown) {
                state.shown = false;
                this.renderChatCharacterContextContent(block, state.expanded || this.formatChatCharacterContextSource(state.source));
            }
            return;
        }
        button.disabled = state.translating;
        button.classList.toggle('is-loading', state.translating);
        button.classList.toggle('is-translated', state.shown);
        const label = state.translating ? t('Translating…') : state.shown ? t('Original') : t('Translate');
        button.textContent = label;
        button.title = state.shown ? t('Show original context') : t('Translate context with SillyTavern');
        button.setAttribute('aria-label', button.title);
        button.setAttribute('aria-pressed', state.shown ? 'true' : 'false');
    }

    async toggleChatCharacterContextTranslation({ forceTranslate = false, automatic = false } = {}) {
        const block = document.querySelector('[data-nt-chat-character-context]');
        if (!block) return false;
        const state = this.chatCharacterContextTranslation;
        const source = state.source || this.getChatCharacterContext();
        if (!source) return false;

        if (state.shown && !forceTranslate && !automatic) {
            state.shown = false;
            state.manualOriginal = true;
            this.renderChatCharacterContextContent(block, state.expanded || this.formatChatCharacterContextSource(source));
            this.syncChatCharacterContextTranslationAction(block);
            return true;
        }
        if (!automatic) state.manualOriginal = false;
        if (automatic && state.manualOriginal) return false;

        const translator = globalThis.translate;
        if (typeof translator !== 'function' || !document.body?.classList.contains('translate')) {
            this.syncChatCharacterContextTranslationAction(block);
            return false;
        }

        const translationSource = state.expanded || this.formatChatCharacterContextSource(source);
        const { targetLanguage, provider } = this.getChatCharacterContextTranslationSettings();
        const translationKey = this.getChatCharacterContextTranslationKey();
        if (state.translating) return false;
        if (!forceTranslate && state.translated && state.source === source && state.translationSource === translationSource && state.translationKey === translationKey) {
            state.shown = true;
            this.renderChatCharacterContextContent(block, state.translated);
            this.syncChatCharacterContextTranslationAction(block);
            return true;
        }

        state.translating = true;
        this.syncChatCharacterContextTranslationAction(block);
        try {
            const translated = await translator(translationSource, targetLanguage || undefined, provider || undefined);
            if (!translated || this.getChatCharacterContext() !== source || this.chatCharacterContextTranslation.source !== source) return false;
            state.translationSource = translationSource;
            state.translationKey = translationKey;
            state.translated = String(translated);
            state.shown = true;
            state.manualOriginal = false;
            this.renderChatCharacterContextContent(block, state.translated);
            return true;
        } catch (error) {
            console.warn('[NastyTavern] Character context translation failed.', error);
            return false;
        } finally {
            if (this.chatCharacterContextTranslation.source === source) {
                this.chatCharacterContextTranslation.translating = false;
                this.syncChatCharacterContextTranslationAction(block);
            }
        }
    }

    decorateNativePanels() {
        const labels = {
            response: t('Generation & Prompts'), models: t('Models & API'), lorebooks: t('Lorebooks'),
            settings: t('Settings'), backgrounds: t('Backgrounds'), characters: t('Characters'),
            personas: t('Personas'), formatting: t('Advanced Formatting'), extensions: t('Extensions'), databank: t('Data Bank'),
        };
        document.querySelectorAll('.mt-native-panel').forEach(panel => {
            const module = panel.dataset.mtModule || 'workspace';
            if (panel.classList.contains('nt-third-party-workspace-panel')) {
                panel.querySelector(':scope > .mt-workspace-chrome')?.remove();
                return;
            }
            if (module === 'characters') {
                panel.querySelector(':scope > .mt-workspace-chrome')?.remove();
                return;
            }
            if (panel.querySelector(':scope > .mt-workspace-chrome')) return;
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

    onDocumentChange(event) {
        const target = event.target instanceof Element ? event.target : null;
        if (!target?.matches?.('#translation_auto_mode, #translation_target_language, #translation_provider')) return;

        const state = this.chatCharacterContextTranslation;
        const previousKey = state.translationKey;
        const nextKey = this.getChatCharacterContextTranslationKey();
        state.manualOriginal = false;
        if (previousKey && previousKey !== nextKey) {
            state.translationSource = '';
            state.translationKey = '';
            state.translated = '';
            state.shown = false;
        }
        queueMicrotask(() => this.syncChatCharacterContext());
    }

    onDocumentClick(event) {
        const target = event.target instanceof Element ? event.target : event.target?.parentElement;
        const contextTranslate = target?.closest?.('[data-nt-chat-context-translate]');
        if (contextTranslate) {
            event.preventDefault();
            event.stopPropagation();
            void this.toggleChatCharacterContextTranslation();
            return;
        }
        if (target?.closest?.('#translate_chat')) {
            queueMicrotask(() => void this.toggleChatCharacterContextTranslation({ forceTranslate: true }));
        }
        const nativeCharacterToggle = target?.closest?.('#rightNavHolder > .drawer-toggle, #rightNavDrawerIcon');
        if (nativeCharacterToggle && !this.isCharacterModalOpen()) {
            event.preventDefault();
            event.stopPropagation();
            queueMicrotask(() => this.openCharacterModal());
            return;
        }
        // Only intercept the native drawer launcher itself. Third-party Persona
        // workspaces live inside the drawer content; matching the whole drawer
        // would swallow their card/detail clicks during capture phase.
        const nativePersonaToggle = target?.closest?.('#persona-management-button > .drawer-toggle');
        if (nativePersonaToggle && !this.isPersonaModalOpen()) {
            if (this.thirdPartyWorkspaceAvailable('personas')) {
                if (this.thirdPartyWorkspacePassThrough === 'personas') {
                    queueMicrotask(() => this.decorateThirdPartyWorkspace('personas'));
                    return;
                }
                event.preventDefault();
                event.stopPropagation();
                queueMicrotask(() => this.openThirdPartyWorkspace('personas'));
                return;
            }
            // openPersonaModal() must briefly click the native Persona toggle so
            // SillyTavern can initialize its own controls. Let that one internal
            // click pass through instead of intercepting it and recursively
            // opening the NastyTavern modal again.
            if (this.personaNativeTogglePassThrough || this.personaModalOpening) {
                this.scheduleNativePanelSync();
                return;
            }
            event.preventDefault();
            event.stopPropagation();
            queueMicrotask(() => this.openPersonaModal());
            return;
        }
        const nativeBackgroundToggle = target?.closest?.('#backgrounds-button > .drawer-toggle, #backgrounds-drawer-toggle, #backgrounds-button .drawer-icon, #logo_block > .drawer-toggle, #logo_block .drawer-icon');
        if (nativeBackgroundToggle && !this.isBackgroundModalOpen()) {
            if (this.backgroundModalOpening) {
                this.scheduleNativePanelSync();
                return;
            }
            event.preventDefault();
            event.stopPropagation();
            queueMicrotask(() => this.openBackgroundModal());
            return;
        }

        const nativeExtensionsToggle = target?.closest?.('#extensions-settings-button > .drawer-toggle, #extensions-settings-button .drawer-icon');
        if (nativeExtensionsToggle && !this.extensionsModal.isOpen()) {
            event.preventDefault();
            event.stopPropagation();
            queueMicrotask(() => this.navigate('extensions'));
            return;
        }

        // Same rule for World Info: the drawer content belongs to the active
        // workspace provider, so only the real launcher may be intercepted.
        const nativeLorebookToggle = target?.closest?.('#WI-SP-button > .drawer-toggle');
        if (nativeLorebookToggle && !this.isLorebookModalOpen()) {
            if (this.thirdPartyWorkspaceAvailable('lorebooks')) {
                if (this.thirdPartyWorkspacePassThrough === 'lorebooks') {
                    queueMicrotask(() => this.decorateThirdPartyWorkspace('lorebooks'));
                    return;
                }
                event.preventDefault();
                event.stopPropagation();
                queueMicrotask(() => this.openThirdPartyWorkspace('lorebooks'));
                return;
            }
            // Like Personas, Lorebooks must let one internal native click through
            // so SillyTavern can initialize the World Info editor before we mount
            // those same controls in the NastyTavern modal.
            if (this.lorebookNativeTogglePassThrough || this.lorebookModalOpening) {
                this.scheduleNativePanelSync();
                return;
            }
            event.preventDefault();
            event.stopPropagation();
            queueMicrotask(() => this.openLorebookModal());
            return;
        }
        this.scheduleNativePanelSync();
        if (target?.closest?.('#favorite_button')) setTimeout(() => this.syncCharacterFavoriteState(), 80);
    }

    onKeyDown(event) {
        const target = event.target;
        const isEditable = target instanceof Element && (
            target.matches('input, textarea, select, [contenteditable="true"], [contenteditable="plaintext-only"]') ||
            !!target.closest('input, textarea, select, [contenteditable="true"], [contenteditable="plaintext-only"], .CodeMirror, .cm-editor, [role="textbox"]')
        );
        if (isEditable) return;

        const combo = this.eventToShortcut(event);
        if (!combo) return;
        const shortcuts = this.settings.shortcuts || {};
        const matched = Object.entries(shortcuts).find(([, value]) => value && value === combo)?.[0];
        if (!matched) return;

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
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
            { id:'community', label:'Community Chat', hint:'Open the NastyTavern real-time community chat', group:'NastyTavern' },
            { id:'communityPresence', label:'Community presence', hint:'Switch between online and offline presence', group:'NastyTavern' },
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
        if (id === 'community') return this.communityChat.open();
        if (id === 'communityPresence') return this.toggleCommunityPresence();
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
        this.chatToolsHub.open(id);
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

    syncResponsiveNavMode() {
        const forceCompact = !!this.mobileNavMedia?.matches;
        document.body?.classList.toggle('nt-mobile-nav-forced', forceCompact);
        document.body?.classList.toggle('mt-nav-compact', forceCompact || !!this.settings.compactNav);
    }

    toggleCompactNav() {
        this.settings.navHidden = false;
        this.settings.compactNav = !this.settings.compactNav;
        applySettings(this.settings);
        this.syncResponsiveNavMode();
        saveSettings();
    }

    handleUiAction(action) {
        if (action === 'restore-nav') {
            this.settings.navHidden = false;
            this.settings.compactNav = false;
        }
        if (action === 'focus') {
            this.settings.focusMode = !this.settings.focusMode;
            if (this.settings.focusMode) {
                this.dom.closeNativeDrawers();
                this.setView('chat');
                this.chatToolsHub.close();
            }
        }
        applySettings(this.settings);
        this.syncResponsiveNavMode();
        saveSettings();
    }

    async handleCommunityPrivacyChanged() {
        await this.communityChat?.handlePrivacySettingsChanged?.();
        this.shell?.updateCommunityAccount?.(this.communityChat?.getAccountSnapshot?.());
    }

    async toggleCommunityPresence() {
        const account = this.communityChat?.getAccountSnapshot?.() || {};
        if (!account.communityEnabled) {
            this.toast(t('Enable Community network access before changing presence.'));
            return false;
        }
        await this.communityChat?.togglePresenceEnabled?.();
        this.shell?.updateCommunityAccount?.(this.communityChat?.getAccountSnapshot?.());
        if (this.preferences?.root && !this.preferences.root.hidden) this.preferences.render?.();
        return true;
    }

    async handleCommunityAuth(action) {
        if (action === 'toggle-presence') return this.toggleCommunityPresence();
        if (action === 'signout') {
            await this.communityChat?.signOutCommunity?.();
            this.shell?.updateCommunityAccount?.(this.communityChat?.getAccountSnapshot?.());
            return;
        }
        await this.communityChat?.open?.();
        this.shell?.updateCommunityAccount?.(this.communityChat?.getAccountSnapshot?.());
    }

    updateStatus() {
        const connectionState = this.dom.getConnectionState();
        const character = this.dom.getCharacterName();
        const persona = this.dom.getPersonaName();
        this.shell.updateStatus({
            connection: connectionState.label,
            offline: connectionState.offline,
            character,
            persona,
        });
        this.shell.updateCommunityAccount(this.communityChat?.getAccountSnapshot?.());
        this.homeDashboard.sync({
            view: this.currentView,
            connection: connectionState.label,
            character,
            persona,
        });
        this.syncNativePanelView();
        this.syncCharacterFavoriteState();
        this.syncCharacterConvertButton();
        this.syncCharacterLibraryIntegration();
        this.ensureCommunityShareButtons();
        this.syncChatCharacterContext();
        localizeOwnedUI();
    }

    characterLibraryLauncher() {
        const standalone = document.querySelector('#st-gallery-btn');
        if (standalone instanceof HTMLElement) return standalone;
        const libraryAction = document.querySelector('#charlib-launcher-dropdown [data-action="library"]');
        return libraryAction instanceof HTMLElement ? libraryAction : null;
    }

    syncCharacterLibraryIntegration() {
        const available = Boolean(this.characterLibraryLauncher());
        if (available !== this.characterLibraryExtensionAvailable) {
            this.characterLibraryExtensionAvailable = available;
        }
        this.shell?.setCharacterLibraryAvailable?.(available);
        return available;
    }

    openCharacterLibrary() {
        const launcher = this.characterLibraryLauncher();
        if (!launcher) {
            this.syncCharacterLibraryIntegration();
            this.toast(t('Character Library is not available.'));
            return false;
        }
        launcher.click();
        return true;
    }

    openDataCat() {
        const launcher = document.querySelector('#datacat_browser_topbar_button');
        if (!(launcher instanceof HTMLElement)) {
            this.syncThirdPartyLaunchers();
            this.toast(t('DataCat is not available.'));
            return false;
        }
        launcher.click();
        return true;
    }

    ensureCommunityShareButtons() {
        const lorebookSelect = document.querySelector('#world_editor_select');
        const lorebookRow = lorebookSelect?.closest('.flex-container');
        if (lorebookSelect && lorebookRow) {
            lorebookRow.classList.add('nt-lorebook-community-share-row');
            let button = lorebookRow.querySelector('[data-nt-share-lorebook-community]');
            if (!button) {
                button = document.createElement('button');
                button.type = 'button';
                button.className = 'nt-native-community-share nt-native-community-share-lorebook';
                button.dataset.ntShareLorebookCommunity = '1';
                button.innerHTML = `${icons.community}<span>${t('Share to Community')}</span>`;
                button.title = t('Share this Lorebook to Community');
                button.addEventListener('click', async event => {
                    event.preventDefault();
                    event.stopPropagation();
                    button.disabled = true;
                    try { await this.communityChat.shareCurrentLorebook(); }
                    catch (error) { this.toast(error?.message || t('Could not share this Lorebook.')); }
                    finally { button.disabled = false; }
                });
                const importButton = lorebookRow.querySelector('#world_import_button');
                if (importButton) lorebookRow.insertBefore(button, importButton);
                else lorebookRow.append(button);
            }
            const hasLorebook = Boolean(String(lorebookSelect.value || '').trim());
            button.disabled = !hasLorebook;
            button.setAttribute('aria-disabled', hasLorebook ? 'false' : 'true');
        }
    }

    syncCharacterFavoriteState() {
        const button = document.querySelector('#favorite_button');
        if (!button) return;
        const raw = String(document.querySelector('#fav_checkbox')?.value ?? '').trim().toLowerCase();
        const isFavorite = button.classList.contains('fav_on')
            || (!button.classList.contains('fav_off') && ['1', 'true', 'yes', 'on'].includes(raw));
        button.classList.toggle('mt-character-favorite-active', isFavorite);
        button.setAttribute('aria-pressed', isFavorite ? 'true' : 'false');
    }

    ensureCharacterModalRoot() {
        let root = this.characterModalRoot;
        if (!root?.isConnected) root = document.querySelector('#nt-character-modal');
        if (!root) {
            ({ root } = createModalShell({
                id: 'nt-character-modal',
                title: t('Characters'),
                icon: icons.characters,
                size: 'large',
                modalClass: 'nt-character-modal',
                bodyClass: 'nt-character-modal-body',
                bodyAttrs: { 'data-nt-character-host': '' },
                footerClass: 'nt-character-modal-footer',
                footerHtml: '',
                closeAttrs: { 'data-nt-character-close': '' },
            }));
            const footer = root.querySelector('[data-nt-character-footer]') || root.querySelector('.nt-character-modal-footer');
            if (footer) {
                footer.setAttribute('data-nt-character-footer', '');
                footer.hidden = true;
            }
            root.addEventListener('click', event => {
                if (event.target.closest('[data-nt-character-close]')) this.closeCharacterModal();
            });
            document.body.append(root);
        }
        this.characterModalRoot = root;
        return root;
    }

    characterModalPanel() {
        return document.querySelector('#right-nav-panel[data-mt-module="characters"]') || document.querySelector('#right-nav-panel');
    }

    decorateCharacterLibrary(panel) {
        if (!panel) return;

        const quickActions = [
            { action: 'create', selector: '#rm_button_create', icon: icons.characters, label: t('Create Character'), run: () => this.openCharacterCreateModal() },
            { action: 'create-group', selector: '#rm_button_group_chats', icon: icons.community, label: t('Create Group'), run: () => this.openGroupCreateModal() },
            { action: 'import-json', selector: '#character_import_button', icon: icons.download, label: t('Import JSON') },
            { action: 'import-cloud', selector: '#external_import_button', icon: icons.cloud, label: t('Import Cloud') },
            { action: 'catalogue', icon: icons.workspace, label: t('Nasty Catalogue'), run: () => this.openCharacterCatalogue() },
        ];

        let quickGrid = panel.querySelector('.nt-character-quick-actions');
        if (!quickGrid) {
            quickGrid = document.createElement('div');
            quickGrid.className = 'nt-character-quick-actions';
            quickGrid.setAttribute('aria-label', t('Quick Actions'));
            quickGrid.innerHTML = `<div class="nt-quick-action-grid nt-character-quick-grid">${quickActions.map(entry => {
                const available = entry.run || Boolean(panel.querySelector(entry.selector));
                return `<button type="button" data-nt-character-action="${entry.action}" aria-label="${entry.label}" title="${entry.label}"${available ? '' : ' disabled'}><span>${entry.icon}</span><b>${entry.label}</b></button>`;
            }).join('')}</div>`;
            quickGrid.addEventListener('click', event => {
                const button = event.target.closest('[data-nt-character-action]');
                if (!button || button.disabled) return;
                const entry = quickActions.find(item => item.action === button.dataset.ntCharacterAction);
                if (!entry) return;
                if (entry.run) {
                    void entry.run();
                    return;
                }
                panel.querySelector(entry.selector)?.click();
            });
            const firstContent = panel.querySelector('#CharListButtonAndHotSwaps, #rm_PinAndTabs, #rm_characters_block');
            if (firstContent?.parentNode) firstContent.parentNode.insertBefore(quickGrid, firstContent);
            else panel.prepend(quickGrid);
        }

        for (const entry of quickActions) {
            if (entry.selector) panel.querySelector(entry.selector)?.classList.add('nt-character-native-quick-source');
        }

        panel.querySelector('#rm_characters_block')?.classList.add('nt-character-library');
        this.decorateCharacterLibraryControls(panel);
        this.decorateCharacterTagSorting(panel);
        this.decorateCharacterPagination(panel);
        this.decorateCharacterLibraryPerformance(panel);
        this.decorateCharacterEmptyState(panel);
        this.decorateCharacterLibraryEditOpen(panel);
    }

    decorateCharacterLibraryEditOpen(panel) {
        const list = panel?.querySelector('#rm_print_characters_block');
        if (!list) return;

        const previous = this.characterLibraryEditState;
        if (previous?.list === list) return;
        previous?.list?.removeEventListener('click', previous.onClick);

        const onClick = event => {
            const characterCard = event.target.closest?.('.character_select');
            if (characterCard && list.contains(characterCard)) {
                // Let SillyTavern handle the character selection first. Its native
                // handler hydrates #form_create with the selected card, after which
                // NastyTavern can mount that already-filled editor in our modal.
                const opener = characterCard instanceof HTMLElement ? characterCard : null;
                queueMicrotask(() => {
                    void this.openCharacterEditModalFromNativeSelection({ opener });
                });
                return;
            }

            const groupCard = event.target.closest?.('.group_select');
            if (!groupCard || !list.contains(groupCard)) return;
            // Group selection is handled natively at document level. Wait until
            // SillyTavern has hydrated the group editor, then mount those same
            // controls in NastyTavern's group modal.
            const opener = groupCard instanceof HTMLElement ? groupCard : null;
            queueMicrotask(() => {
                void this.openGroupEditModalFromNativeSelection({ opener });
            });
        };

        list.addEventListener('click', onClick);
        this.characterLibraryEditState = { list, onClick };
    }

    ensurePersonaModalRoot() {
        let root = this.personaModalRoot;
        if (!root?.isConnected) root = document.querySelector('#nt-persona-modal');
        if (!root) {
            ({ root } = createModalShell({
                id: 'nt-persona-modal',
                title: t('Personas'),
                icon: icons.persona,
                size: 'wide',
                modalClass: 'nt-persona-modal',
                headerClass: 'nt-persona-modal-header',
                bodyClass: 'nt-persona-modal-body',
                bodyAttrs: { 'data-nt-persona-host': '' },
                closeAttrs: { 'data-nt-persona-close': '' },
            }));
            root.addEventListener('click', event => {
                if (event.target.closest('[data-nt-persona-close]')) void this.closePersonaModal();
            });
            document.body.append(root);
        }
        this.personaModalRoot = root;
        return root;
    }

    isPersonaModalOpen() {
        const root = this.personaModalRoot || document.querySelector('#nt-persona-modal');
        return Boolean(root && !root.hidden && root.classList.contains('is-open'));
    }

    async waitForNativePersonaContent(timeout = 2600) {
        const startedAt = Date.now();
        while (Date.now() - startedAt < timeout) {
            const panel = document.querySelector('#PersonaManagement');
            const block = document.querySelector('#persona-management-block');
            if (panel?.isConnected && block?.isConnected) return { panel, block };
            await wait(50);
        }
        return null;
    }

    mountNativePersonaContent(root, { opener = null } = {}) {
        const panel = document.querySelector('#PersonaManagement');
        const block = document.querySelector('#persona-management-block');
        const host = root?.querySelector('[data-nt-persona-host]');
        if (!panel || !block || !host || !block.parentNode) return false;

        if (this.personaModalState) this.restoreNativePersonaContent({ restoreFocus: false });

        const placeholder = document.createComment('NastyTavern native Persona Management');
        block.parentNode.insertBefore(placeholder, block);
        const resolvedOpener = opener instanceof HTMLElement
            ? opener
            : document.activeElement instanceof HTMLElement ? document.activeElement : null;

        this.personaModalState = {
            panel,
            block,
            placeholder,
            blockClass: block.getAttribute('class'),
            blockStyle: block.getAttribute('style'),
            panelHidden: panel.hidden,
            opener: resolvedOpener,
        };

        block.classList.add('nt-persona-native-editor');
        host.append(block);

        // The useful Persona controls now live in the modal. Hide the emptied
        // native drawer shell so it cannot remain visible behind the backdrop.
        panel.hidden = true;
        return true;
    }

    restoreNativePersonaContent({ restoreFocus = true } = {}) {
        const state = this.personaModalState;
        if (!state) return;
        const { panel, block, placeholder } = state;

        if (placeholder?.parentNode) {
            placeholder.parentNode.insertBefore(block, placeholder);
            placeholder.remove();
        }
        if (state.blockClass == null) block.removeAttribute('class');
        else block.setAttribute('class', state.blockClass);
        if (state.blockStyle == null) block.removeAttribute('style');
        else block.setAttribute('style', state.blockStyle);

        // Personas is modal-only in NastyTavern. Never restore the native drawer
        // as an open background surface after the modal closes.
        panel.hidden = false;
        panel.classList.remove('openDrawer');
        panel.classList.add('closedDrawer');
        const drawer = panel.closest('#persona-management-button');
        const icon = drawer?.querySelector(':scope > .drawer-toggle .drawer-icon, .drawer-icon');
        icon?.classList.remove('openIcon');
        icon?.classList.add('closedIcon');

        const opener = state.opener;
        this.personaModalState = null;
        if (restoreFocus && opener?.isConnected) requestAnimationFrame(() => opener.focus?.({ preventScroll: true }));
    }

    async openPersonaModal() {
        if (this.isPersonaModalOpen()) return true;
        if (this.personaModalOpening) return false;

        this.personaModalOpening = true;
        try {
            if (this.isGroupModalOpen()) await this.closeGroupModal({ restoreFocus: false, reopenCharacters: false });
            if (this.isCharacterCreateModalOpen()) await this.closeCharacterCreateModal({ restoreFocus: false });
            if (this.isCharacterModalOpen()) this.closeCharacterModal();
            if (this.isBackgroundModalOpen()) await this.closeBackgroundModal({ restoreFocus: false });
            if (this.isLorebookModalOpen()) await this.closeLorebookModal({ restoreFocus: false });

            const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;

            // Persona Management is initialized by SillyTavern during app startup,
            // unlike surfaces that need their native drawer opened to hydrate.
            // Mount the existing controls directly so the native Persona drawer
            // never opens, becomes selected, or changes the background view.
            const native = await this.waitForNativePersonaContent(800);
            if (!native) {
                console.warn('[NastyTavern] Persona modal could not find native Persona Management content.');
                this.toast(t('Could not open Personas.'));
                return false;
            }

            const root = this.ensurePersonaModalRoot();
            if (!this.mountNativePersonaContent(root, { opener })) {
                this.toast(t('Could not open Personas.'));
                return false;
            }

            document.body?.classList.add('nt-persona-modal-open');
            showModalShell(root);
            requestAnimationFrame(() => {
                root.querySelector('.nt-modal-close')?.focus?.({ preventScroll: true });
            });
            return true;
        } finally {
            this.personaNativeTogglePassThrough = false;
            this.personaModalOpening = false;
        }
    }

    async closePersonaModal({ restoreFocus = true } = {}) {
        const root = this.personaModalRoot || document.querySelector('#nt-persona-modal');
        hideModalShell(root);
        this.restoreNativePersonaContent({ restoreFocus });
        document.body?.classList.remove('nt-persona-modal-open');
        return true;
    }

    async cleanupPersonaModal() {
        await this.closePersonaModal({ restoreFocus: false });
        this.personaModalRoot?.remove();
        this.personaModalRoot = null;
        document.querySelector('#nt-persona-modal')?.remove();
        document.body?.classList.remove('nt-persona-modal-open');
    }

    ensureBackgroundModalRoot() {
        let root = this.backgroundModalRoot;
        if (!root?.isConnected) root = document.querySelector('#nt-background-modal');
        if (!root) {
            ({ root } = createModalShell({
                id: 'nt-background-modal',
                title: t('Backgrounds'),
                icon: icons.image,
                size: 'large',
                modalClass: 'nt-background-modal',
                headerClass: 'nt-background-modal-header',
                bodyClass: 'nt-background-modal-body',
                bodyAttrs: { 'data-nt-background-host': '' },
                closeAttrs: { 'data-nt-background-close': '' },
            }));
            root.addEventListener('click', event => {
                if (event.target.closest('[data-nt-background-close]')) void this.closeBackgroundModal();
            });
            document.body.append(root);
        }
        this.backgroundModalRoot = root;
        return root;
    }

    isBackgroundModalOpen() {
        const root = this.backgroundModalRoot || document.querySelector('#nt-background-modal');
        return Boolean(root && !root.hidden && root.classList.contains('is-open'));
    }

    async waitForNativeBackgroundContent(timeout = 1800) {
        const startedAt = Date.now();
        while (Date.now() - startedAt < timeout) {
            const panel = document.querySelector('#Backgrounds');
            if (panel?.isConnected) return panel;
            await wait(50);
        }
        return null;
    }

    mountNativeBackgroundContent(root, { opener = null } = {}) {
        const panel = document.querySelector('#Backgrounds');
        const host = root?.querySelector('[data-nt-background-host]');
        if (!panel || !host || !panel.parentNode) return false;

        if (this.backgroundModalState) this.restoreNativeBackgroundContent({ restoreFocus: false });

        const placeholder = document.createComment('NastyTavern native Backgrounds');
        panel.parentNode.insertBefore(placeholder, panel);
        const resolvedOpener = opener instanceof HTMLElement
            ? opener
            : document.activeElement instanceof HTMLElement ? document.activeElement : null;

        this.backgroundModalState = {
            panel,
            placeholder,
            panelClass: panel.getAttribute('class'),
            panelStyle: panel.getAttribute('style'),
            panelHidden: panel.hidden,
            opener: resolvedOpener,
        };

        panel.classList.add('nt-background-native-editor');
        panel.classList.remove('closedDrawer');
        panel.classList.add('openDrawer');
        panel.hidden = false;
        host.append(panel);
        return true;
    }

    restoreNativeBackgroundContent({ restoreFocus = true } = {}) {
        const state = this.backgroundModalState;
        if (!state) return;
        const { panel, placeholder } = state;

        if (placeholder?.parentNode) {
            placeholder.parentNode.insertBefore(panel, placeholder);
            placeholder.remove();
        }
        if (state.panelClass == null) panel.removeAttribute('class');
        else panel.setAttribute('class', state.panelClass);
        if (state.panelStyle == null) panel.removeAttribute('style');
        else panel.setAttribute('style', state.panelStyle);
        panel.hidden = state.panelHidden;

        // Backgrounds is modal-only in NastyTavern. Restore the native drawer
        // closed so it can never remain visible behind the application shell.
        panel.classList.remove('openDrawer');
        panel.classList.add('closedDrawer');
        const drawer = panel.closest('#backgrounds-button, #logo_block');
        const icon = drawer?.querySelector(':scope > .drawer-toggle .drawer-icon, .drawer-icon');
        icon?.classList.remove('openIcon');
        icon?.classList.add('closedIcon');

        const opener = state.opener;
        this.backgroundModalState = null;
        if (restoreFocus && opener?.isConnected) requestAnimationFrame(() => opener.focus?.({ preventScroll: true }));
    }

    async openBackgroundModal() {
        if (this.isBackgroundModalOpen()) return true;
        if (this.backgroundModalOpening) return false;

        this.backgroundModalOpening = true;
        try {
            if (this.isGroupModalOpen()) await this.closeGroupModal({ restoreFocus: false, reopenCharacters: false });
            if (this.isCharacterCreateModalOpen()) await this.closeCharacterCreateModal({ restoreFocus: false });
            if (this.isCharacterModalOpen()) this.closeCharacterModal();
            if (this.isPersonaModalOpen()) await this.closePersonaModal({ restoreFocus: false });
            if (this.isLorebookModalOpen()) await this.closeLorebookModal({ restoreFocus: false });

            const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
            const native = await this.waitForNativeBackgroundContent();
            if (!native) {
                console.warn('[NastyTavern] Background modal could not find native Backgrounds content.');
                this.toast(t('Could not open Backgrounds.'));
                return false;
            }

            const root = this.ensureBackgroundModalRoot();
            if (!this.mountNativeBackgroundContent(root, { opener })) {
                this.toast(t('Could not open Backgrounds.'));
                return false;
            }

            document.body?.classList.add('nt-background-modal-open');
            showModalShell(root);
            requestAnimationFrame(() => {
                root.querySelector('.nt-modal-close')?.focus?.({ preventScroll: true });
            });
            return true;
        } finally {
            this.backgroundModalOpening = false;
        }
    }

    async closeBackgroundModal({ restoreFocus = true } = {}) {
        const root = this.backgroundModalRoot || document.querySelector('#nt-background-modal');
        hideModalShell(root);
        this.restoreNativeBackgroundContent({ restoreFocus });
        document.body?.classList.remove('nt-background-modal-open');
        return true;
    }

    async cleanupBackgroundModal() {
        await this.closeBackgroundModal({ restoreFocus: false });
        this.backgroundModalRoot?.remove();
        this.backgroundModalRoot = null;
        document.querySelector('#nt-background-modal')?.remove();
        document.body?.classList.remove('nt-background-modal-open');
    }

    ensureLorebookModalRoot() {
        let root = this.lorebookModalRoot;
        if (!root?.isConnected) root = document.querySelector('#nt-lorebook-modal');
        if (!root) {
            ({ root } = createModalShell({
                id: 'nt-lorebook-modal',
                title: t('Lorebooks'),
                icon: icons.lore,
                size: 'large',
                modalClass: 'nt-lorebook-modal',
                headerClass: 'nt-lorebook-modal-header',
                bodyClass: 'nt-lorebook-modal-body',
                bodyAttrs: { 'data-nt-lorebook-host': '' },
                headerActionsHtml: `<button type="button" class="nt-panel-toggle nt-lorebook-sidebar-toggle" data-nt-lorebook-sidebar-toggle aria-expanded="true" title="${t('Hide Lorebook entries')}" aria-label="${t('Hide Lorebook entries')}">${icons.panel}</button>`,
                closeAttrs: { 'data-nt-lorebook-close': '' },
            }));
            root.addEventListener('click', event => {
                if (event.target.closest('[data-nt-lorebook-sidebar-toggle]')) {
                    event.preventDefault();
                    this.toggleLorebookSidebar();
                    return;
                }
                if (event.target.closest('[data-nt-lorebook-sidebar-dismiss]')) {
                    event.preventDefault();
                    this.setLorebookSidebarHidden(true);
                    return;
                }
                if (event.target.closest('[data-nt-lorebook-close]')) void this.closeLorebookModal();
            });
            root.addEventListener('nt:modal-escape-request', event => {
                if (this.lorebookSettingsPopup) {
                    event.preventDefault();
                    return;
                }
                const modal = root.querySelector('.nt-lorebook-modal');
                if (this.isLorebookPhoneLayout() && modal && !modal.classList.contains('is-sidebar-hidden')) {
                    this.setLorebookSidebarHidden(true);
                    event.preventDefault();
                }
            });
            document.body.append(root);
        }
        this.lorebookModalRoot = root;
        return root;
    }

    isLorebookModalOpen() {
        const root = this.lorebookModalRoot || document.querySelector('#nt-lorebook-modal');
        return Boolean(root && !root.hidden && root.classList.contains('is-open'));
    }

    isLorebookPhoneLayout() {
        return window.matchMedia?.('(max-width: 680px), (orientation: landscape) and (max-height: 520px) and (max-width: 960px)')?.matches ?? false;
    }

    setLorebookSidebarHidden(hidden) {
        const root = this.lorebookModalRoot || document.querySelector('#nt-lorebook-modal');
        const modal = root?.querySelector('.nt-lorebook-modal');
        const toggle = root?.querySelector('[data-nt-lorebook-sidebar-toggle]');
        if (!modal || !toggle) return;
        const isHidden = Boolean(hidden);
        modal.classList.toggle('is-sidebar-hidden', isHidden);
        toggle.setAttribute('aria-expanded', String(!isHidden));
        toggle.title = t(isHidden ? 'Show Lorebook entries' : 'Hide Lorebook entries');
        toggle.setAttribute('aria-label', toggle.title);
    }

    toggleLorebookSidebar() {
        const root = this.lorebookModalRoot || document.querySelector('#nt-lorebook-modal');
        const modal = root?.querySelector('.nt-lorebook-modal');
        if (!modal) return;
        this.setLorebookSidebarHidden(!modal.classList.contains('is-sidebar-hidden'));
    }

    async waitForNativeLorebookContent(timeout = 2600) {
        const startedAt = Date.now();
        while (Date.now() - startedAt < timeout) {
            const panel = document.querySelector('#WorldInfo');
            const holder = panel?.querySelector('#wi-holder');
            if (panel?.isConnected && holder?.isConnected) return { panel, holder };
            await wait(50);
        }
        return null;
    }

    mountNativeLorebookContent(root, { opener = null } = {}) {
        const panel = document.querySelector('#WorldInfo');
        const host = root?.querySelector('[data-nt-lorebook-host]');
        if (!panel || !host || !panel.parentNode) return false;

        if (this.lorebookModalState) this.restoreNativeLorebookContent({ restoreFocus: false });

        const placeholder = document.createComment('NastyTavern native World Info');
        panel.parentNode.insertBefore(placeholder, panel);
        const resolvedOpener = opener instanceof HTMLElement
            ? opener
            : document.activeElement instanceof HTMLElement ? document.activeElement : null;

        this.lorebookModalState = {
            panel,
            placeholder,
            panelClass: panel.getAttribute('class'),
            panelStyle: panel.getAttribute('style'),
            panelHidden: panel.hidden,
            opener: resolvedOpener,
        };

        panel.classList.add('nt-lorebook-native-editor');
        panel.classList.remove('closedDrawer');
        panel.classList.add('openDrawer');
        panel.hidden = false;
        host.append(panel);
        this.prepareLorebookSettingsLauncher(panel);
        this.prepareLorebookSplitView(panel);
        return true;
    }

    prepareLorebookSettingsLauncher(panel) {
        if (!panel?.isConnected) return false;
        if (this.lorebookSettingsLayoutState?.panel === panel) return true;
        this.restoreLorebookSettingsLayout();

        const activeWorlds = panel.querySelector('#WIMultiSelector');
        const activationSettings = panel.querySelector('#wiActivationSettings');
        const topBlock = panel.querySelector('#wiTopBlock') || activeWorlds?.parentElement;
        if (!activeWorlds || !activationSettings || !topBlock) return false;

        let activationRoot = activationSettings;
        while (activationRoot.parentElement && activationRoot.parentElement !== topBlock) {
            activationRoot = activationRoot.parentElement;
        }
        if (activationRoot.parentElement !== topBlock) {
            activationRoot = activationSettings.closest('.range-block')
                || activationSettings.closest('.inline-drawer')
                || activationSettings.parentElement;
        }
        if (!activationRoot) return false;

        const settingsContent = activationSettings.closest('.inline-drawer-content') || activationSettings;
        const pinControl = panel.querySelector('#WI_panel_pin_div');
        const createButton = panel.querySelector('#world_create_button');
        const lorebookToolbar = createButton?.parentElement || panel.querySelector('#world_popup > .flex-container.alignitemscenter:first-of-type');
        const launcher = document.createElement('button');
        launcher.type = 'button';
        launcher.className = 'menu_button nt-lorebook-settings-launcher';
        launcher.title = t('Lorebook settings');
        launcher.setAttribute('aria-label', t('Lorebook settings'));
        launcher.innerHTML = `${icons.settings}<span>${t('Settings')}</span>`;
        launcher.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            void this.openLorebookSettingsPopup();
        });

        // Settings belongs to the Lorebook file-action toolbar. Keeping it next
        // to Create removes the redundant visual section while the native
        // settings controls themselves remain the source of truth in the popup.
        if (createButton?.parentNode) createButton.insertAdjacentElement('beforebegin', launcher);
        else lorebookToolbar?.append(launcher);

        this.lorebookSettingsLayoutState = {
            panel,
            activeWorlds,
            activationRoot,
            settingsContent,
            pinControl,
            launcher,
            activeWorldsHidden: activeWorlds.hidden,
            activationRootHidden: activationRoot.hidden,
            pinControlHidden: pinControl?.hidden ?? false,
        };

        // Keep the native settings controls as the source of truth, but remove
        // their redundant containers from the main Lorebooks modal. They become
        // visible again automatically when moved into the secondary settings popup.
        activeWorlds.classList.add('nt-lorebook-settings-source-hidden');
        activationRoot.classList.add('nt-lorebook-settings-source-hidden');
        pinControl?.classList.add('nt-lorebook-pin-hidden');
        activeWorlds.hidden = true;
        activationRoot.hidden = true;
        if (pinControl) pinControl.hidden = true;
        topBlock.classList.add('nt-lorebook-top-controls');
        return true;
    }

    prepareLorebookSplitView(panel) {
        if (!panel?.isConnected) return false;
        if (this.lorebookSplitState?.panel === panel) {
            this.syncLorebookSplitEntries();
            return true;
        }
        this.restoreLorebookSplitView();

        const popup = panel.querySelector('#world_popup');
        const actionsRow = panel.querySelector('#world_popup_new')?.closest('.flex-container.alignitemscenter');
        const entriesList = panel.querySelector('#world_popup_entries_list');
        if (!popup || !actionsRow || !entriesList || !actionsRow.parentNode || !entriesList.parentNode) return false;

        actionsRow.classList.add('nt-wi-popup-actions', 'nt-lorebook-sidebar-controls');

        const actionsPlaceholder = document.createComment('NastyTavern Lorebook sidebar controls');
        const entriesPlaceholder = document.createComment('NastyTavern Lorebook entries');
        actionsRow.parentNode.insertBefore(actionsPlaceholder, actionsRow);
        entriesList.parentNode.insertBefore(entriesPlaceholder, entriesList);

        const pagination = actionsRow.querySelector('#world_info_pagination');
        const paginationPlaceholder = pagination ? document.createComment('NastyTavern Lorebook pagination') : null;
        if (pagination && paginationPlaceholder) pagination.parentNode.insertBefore(paginationPlaceholder, pagination);

        const openAll = actionsRow.querySelector('#OpenAllWIEntries');
        const closeAll = actionsRow.querySelector('#CloseAllWIEntries');
        const openAllHidden = openAll?.hidden ?? false;
        const closeAllHidden = closeAll?.hidden ?? false;
        if (openAll) openAll.hidden = true;
        if (closeAll) closeAll.hidden = true;

        const workspace = document.createElement('div');
        workspace.className = 'nt-lorebook-workspace';

        const sidebar = document.createElement('aside');
        sidebar.className = 'nt-lorebook-sidebar';
        sidebar.setAttribute('aria-label', t('Lorebook entries'));

        const sidebarList = document.createElement('div');
        sidebarList.className = 'nt-lorebook-entry-list';
        sidebarList.setAttribute('role', 'listbox');
        sidebarList.setAttribute('aria-label', t('Lorebook entries'));

        const sidebarFooter = document.createElement('div');
        sidebarFooter.className = 'nt-lorebook-sidebar-footer';

        const sidebarScrim = document.createElement('div');
        sidebarScrim.className = 'nt-lorebook-sidebar-scrim';
        sidebarScrim.setAttribute('data-nt-lorebook-sidebar-dismiss', '');
        sidebarScrim.setAttribute('aria-hidden', 'true');

        const detail = document.createElement('section');
        detail.className = 'nt-lorebook-detail';
        detail.setAttribute('aria-label', t('Lorebook entry editor'));

        const empty = document.createElement('div');
        empty.className = 'nt-lorebook-detail-empty';
        empty.innerHTML = `<i class="fa-solid fa-book-open" aria-hidden="true"></i><span>${t('Select an entry to edit it.')}</span>`;

        sidebar.append(actionsRow, sidebarList, sidebarFooter);
        if (pagination) sidebarFooter.append(pagination);
        detail.append(entriesList, empty);
        workspace.append(sidebarScrim, sidebar, detail);
        popup.append(workspace);

        panel.classList.add('nt-lorebook-split-ready');
        entriesList.classList.add('nt-lorebook-detail-entries');

        const scheduleSync = () => {
            const state = this.lorebookSplitState;
            if (!state || state.syncQueued) return;
            state.syncQueued = true;
            requestAnimationFrame(() => {
                const current = this.lorebookSplitState;
                if (!current) return;
                current.syncQueued = false;
                this.syncLorebookSplitEntries();
            });
        };

        const observer = new MutationObserver(scheduleSync);
        observer.observe(entriesList, { childList: true });

        const onNativeInput = event => {
            const entry = event.target?.closest?.('.world_entry');
            if (!entry) return;
            this.syncLorebookSplitEntryRow(entry);
        };
        const onNativeClick = event => {
            if (!event.target?.closest?.('.world_entry')) return;
            requestAnimationFrame(() => {
                const entry = event.target?.closest?.('.world_entry');
                if (entry?.isConnected) this.syncLorebookSplitEntryRow(entry);
            });
        };
        entriesList.addEventListener('input', onNativeInput, true);
        entriesList.addEventListener('change', onNativeInput, true);
        entriesList.addEventListener('click', onNativeClick, true);

        this.lorebookSplitState = {
            panel,
            popup,
            actionsRow,
            actionsPlaceholder,
            entriesList,
            entriesPlaceholder,
            pagination,
            paginationPlaceholder,
            openAll,
            closeAll,
            openAllHidden,
            closeAllHidden,
            workspace,
            sidebarScrim,
            sidebar,
            sidebarList,
            sidebarFooter,
            detail,
            empty,
            observer,
            onNativeInput,
            onNativeClick,
            selectedUid: null,
            syncQueued: false,
        };

        this.syncLorebookSplitEntries();
        return true;
    }

    getLorebookEntryUid(entry) {
        if (!(entry instanceof Element)) return '';
        return String(entry.getAttribute('uid') || entry.dataset?.uid || '').trim();
    }

    syncLorebookSplitEntryRow(entry) {
        const state = this.lorebookSplitState;
        if (!state || !(entry instanceof Element)) return;
        const uid = this.getLorebookEntryUid(entry);
        if (!uid) return;
        const row = state.sidebarList.querySelector(`[data-nt-lorebook-entry-uid="${CSS.escape(uid)}"]`);
        if (!row) return;

        const nativeName = entry.querySelector('textarea[name="comment"]');
        const rowName = row.querySelector('.nt-lorebook-entry-name');
        const fallbackName = nativeName?.getAttribute('placeholder') || `${t('Entry')} ${uid}`;
        if (rowName) rowName.textContent = String(nativeName?.value || '').trim() || fallbackName;

        // Keep the compact header labels clean: SillyTavern ships the mobile
        // labels with a trailing colon (Position:, Depth:, Order:, Trigger %:).
        // In the NastyTavern modal those labels sit directly above their fields,
        // so the punctuation is redundant.
        for (const label of entry.querySelectorAll('.WIEnteryHeaderControls .WIEntryHeaderTitleMobile')) {
            label.textContent = String(label.textContent || '').replace(/:\s*$/, '');
        }

        const nativeState = entry.querySelector('select[name="entryStateSelector"]');
        if (nativeState) {
            const typeIcons = { constant: '🔵', normal: '🟢', vectorized: '🔗' };
            for (const option of nativeState.options) {
                const icon = typeIcons[option.value];
                if (icon && option.textContent !== icon) option.textContent = icon;
            }
            nativeState.title = t('Entry type');
            nativeState.setAttribute('aria-label', t('Entry type'));
        }
        const rowState = row.querySelector('.nt-lorebook-entry-state');
        if (rowState && nativeState && rowState.value !== nativeState.value) rowState.value = nativeState.value;

        const disabled = entry.classList.contains('disabledWIEntry')
            || entry.querySelector('[name="entryKillSwitch"]')?.classList.contains('fa-toggle-off');
        const toggle = row.querySelector('.nt-lorebook-entry-enabled');
        if (toggle) {
            toggle.classList.toggle('is-disabled', disabled);
            toggle.setAttribute('aria-pressed', disabled ? 'false' : 'true');
            toggle.title = disabled ? t('Enable entry') : t('Disable entry');
            toggle.innerHTML = `<i class="fa-solid ${disabled ? 'fa-toggle-off' : 'fa-toggle-on'}" aria-hidden="true"></i>`;
        }
    }

    syncLorebookSplitEntries() {
        const state = this.lorebookSplitState;
        if (!state) return;

        // SillyTavern injects a desktop header row above the World Info entries.
        // NastyTavern renders its own labels inside the selected-entry editor, so
        // keeping the native row creates a duplicated, misaligned set of labels.
        state.entriesList.querySelectorAll('#WIEntryHeaderTitlesPC').forEach(header => header.remove());

        const entries = Array.from(state.entriesList.children).filter(node => node instanceof Element && node.classList.contains('world_entry'));
        const previousUid = state.selectedUid;
        state.sidebarList.replaceChildren();

        for (const entry of entries) {
            const uid = this.getLorebookEntryUid(entry);
            if (!uid) continue;

            const row = document.createElement('div');
            row.className = 'nt-lorebook-entry-row';
            row.dataset.ntLorebookEntryUid = uid;
            row.setAttribute('role', 'option');
            row.tabIndex = 0;

            const enabled = document.createElement('button');
            enabled.type = 'button';
            enabled.className = 'menu_button nt-lorebook-entry-enabled';
            enabled.addEventListener('click', event => {
                event.preventDefault();
                event.stopPropagation();
                entry.querySelector('[name="entryKillSwitch"]')?.click();
                requestAnimationFrame(() => this.syncLorebookSplitEntryRow(entry));
            });

            const name = document.createElement('span');
            name.className = 'nt-lorebook-entry-name';

            const nativeState = entry.querySelector('select[name="entryStateSelector"]');
            const entryState = document.createElement('select');
            entryState.className = 'text_pole nt-lorebook-entry-state';
            entryState.title = t('Entry type');
            entryState.setAttribute('aria-label', t('Entry type'));
            const typeOptions = [
                ['constant', '🔵'],
                ['normal', '🟢'],
                ['vectorized', '🔗'],
            ];
            for (const [value, label] of typeOptions) {
                const option = document.createElement('option');
                option.value = value;
                option.textContent = label;
                entryState.append(option);
            }
            if (nativeState?.value) entryState.value = nativeState.value;
            entryState.addEventListener('click', event => event.stopPropagation());
            entryState.addEventListener('input', event => {
                event.stopPropagation();
                if (!nativeState) return;
                nativeState.value = entryState.value;
                nativeState.dispatchEvent(new Event('input', { bubbles: true }));
                requestAnimationFrame(() => this.syncLorebookSplitEntryRow(entry));
            });
            entryState.addEventListener('change', event => event.stopPropagation());

            const createAction = (className, iconClass, nativeSelector, titleFallback) => {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = `menu_button ${className}`;
                const native = entry.querySelector(nativeSelector);
                button.title = native?.getAttribute('title') || t(titleFallback);
                button.setAttribute('aria-label', button.title);
                button.innerHTML = `<i class="fa-solid ${iconClass}" aria-hidden="true"></i>`;
                button.addEventListener('click', event => {
                    event.preventDefault();
                    event.stopPropagation();
                    native?.click();
                });
                return button;
            };

            const move = createAction('nt-lorebook-entry-move', 'fa-right-left', '.move_entry_button', 'Move/Copy Entry to Another Lorebook');
            const duplicate = createAction('nt-lorebook-entry-duplicate', 'fa-paste', '.duplicate_entry_button', 'Duplicate world info entry');
            const remove = createAction('nt-lorebook-entry-delete', 'fa-trash-can', '.delete_entry_button', 'Delete world info entry');

            const select = () => this.selectLorebookSplitEntry(uid);
            row.addEventListener('click', select);
            row.addEventListener('keydown', event => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                select();
            });

            row.append(enabled, name, entryState, move, duplicate, remove);
            state.sidebarList.append(row);
            this.syncLorebookSplitEntryRow(entry);
        }

        let nextUid = previousUid && entries.some(entry => this.getLorebookEntryUid(entry) === previousUid) ? previousUid : '';
        if (!nextUid) nextUid = entries.length ? this.getLorebookEntryUid(entries[0]) : '';
        if (nextUid) this.selectLorebookSplitEntry(nextUid, { preserveScroll: true });
        else {
            state.selectedUid = null;
            state.empty.hidden = false;
            state.entriesList.classList.add('is-empty');
        }
    }

    selectLorebookSplitEntry(uid, { preserveScroll = false } = {}) {
        const state = this.lorebookSplitState;
        if (!state) return false;
        const entries = Array.from(state.entriesList.children).filter(node => node instanceof Element && node.classList.contains('world_entry'));
        const target = entries.find(entry => this.getLorebookEntryUid(entry) === String(uid));
        if (!target) return false;

        const previous = entries.find(entry => entry.classList.contains('nt-lorebook-selected-entry'));
        if (previous && previous !== target) {
            const previousDrawer = previous.querySelector(':scope > form > .inline-drawer');
            const previousContent = previousDrawer?.querySelector(':scope > .inline-drawer-content');
            if (previousContent && !previousContent.hidden && getComputedStyle(previousContent).display !== 'none') {
                previousDrawer?.querySelector(':scope > .inline-drawer-header .inline-drawer-toggle')?.click();
            }
        }

        for (const entry of entries) entry.classList.toggle('nt-lorebook-selected-entry', entry === target);
        for (const row of state.sidebarList.querySelectorAll('.nt-lorebook-entry-row')) {
            const selected = row.dataset.ntLorebookEntryUid === String(uid);
            row.classList.toggle('is-selected', selected);
            row.setAttribute('aria-selected', selected ? 'true' : 'false');
        }

        state.selectedUid = String(uid);
        state.empty.hidden = true;
        state.entriesList.classList.remove('is-empty');

        // The selected entry must stay expanded because NastyTavern hides the
        // native drawer toggle inside the split editor. SillyTavern collapses
        // World Info entries more aggressively on narrow/mobile layouts, and
        // the previous check looked for the obsolete `.inline-drawer-outlet`
        // instead of the actual `.inline-drawer-content` container. That could
        // leave the Content editor collapsed with no visible way to reopen it.
        const drawer = target.querySelector(':scope > form > .inline-drawer');
        const content = drawer?.querySelector(':scope > .inline-drawer-content');
        const toggle = drawer?.querySelector(':scope > .inline-drawer-header .inline-drawer-toggle');
        const contentIsCollapsed = !content || content.hidden || getComputedStyle(content).display === 'none';
        if (toggle && contentIsCollapsed) toggle.click();

        if (!preserveScroll) {
            state.detail.scrollTop = 0;
            if (this.isLorebookPhoneLayout()) this.setLorebookSidebarHidden(true);
        }
        return true;
    }

    restoreLorebookSplitView() {
        const state = this.lorebookSplitState;
        if (!state) return;
        state.observer?.disconnect();
        state.entriesList?.removeEventListener('input', state.onNativeInput, true);
        state.entriesList?.removeEventListener('change', state.onNativeInput, true);
        state.entriesList?.removeEventListener('click', state.onNativeClick, true);

        if (state.pagination && state.paginationPlaceholder?.parentNode) {
            state.paginationPlaceholder.parentNode.insertBefore(state.pagination, state.paginationPlaceholder);
            state.paginationPlaceholder.remove();
        }
        if (state.actionsPlaceholder?.parentNode) {
            state.actionsPlaceholder.parentNode.insertBefore(state.actionsRow, state.actionsPlaceholder);
            state.actionsPlaceholder.remove();
        }
        if (state.entriesPlaceholder?.parentNode) {
            state.entriesPlaceholder.parentNode.insertBefore(state.entriesList, state.entriesPlaceholder);
            state.entriesPlaceholder.remove();
        }

        if (state.openAll) state.openAll.hidden = state.openAllHidden;
        if (state.closeAll) state.closeAll.hidden = state.closeAllHidden;
        state.actionsRow?.classList.remove('nt-lorebook-sidebar-controls');
        state.entriesList?.classList.remove('nt-lorebook-detail-entries', 'is-empty');
        state.entriesList?.querySelectorAll('.nt-lorebook-selected-entry').forEach(entry => entry.classList.remove('nt-lorebook-selected-entry'));
        state.panel?.classList.remove('nt-lorebook-split-ready');
        state.workspace?.remove();
        this.lorebookSplitState = null;
    }

    restoreLorebookSettingsPopupNodes() {
        const state = this.lorebookSettingsPopupState;
        if (!state) return;
        const { settingsContent, settingsPlaceholder, activeWorlds, activePlaceholder } = state;

        if (settingsPlaceholder?.parentNode && settingsContent) {
            settingsPlaceholder.parentNode.insertBefore(settingsContent, settingsPlaceholder);
            settingsPlaceholder.remove();
        }
        if (activePlaceholder?.parentNode && activeWorlds) {
            activePlaceholder.parentNode.insertBefore(activeWorlds, activePlaceholder);
            activePlaceholder.remove();
        }

        // World Info uses Select2 on desktop. A Select2 dropdown normally gets
        // appended to <body>, which cannot appear above SillyTavern's native
        // <dialog> popup top layer. Restore the normal native Select2 instance
        // after the popup-specific instance has been torn down.
        if (state.activeWorldSelect2Rebound) {
            const jq = window.jQuery || window.$;
            const select = activeWorlds?.querySelector?.('#world_info');
            if (jq?.fn?.select2 && select) {
                const $select = jq(select);
                try { if ($select.data('select2')) $select.select2('destroy'); } catch { /* already destroyed */ }
                if (state.activeWorldSelect2HadInstance) {
                    try {
                        $select.select2({
                            width: '100%',
                            placeholder: t('No Worlds active. Click here to select.'),
                            allowClear: true,
                            closeOnSelect: false,
                        });
                    } catch (error) {
                        console.warn('[NastyTavern] Failed to restore Active Worlds Select2.', error);
                    }
                }
            }
        }

        const layout = this.lorebookSettingsLayoutState;
        if (layout) {
            layout.activeWorlds.hidden = true;
            layout.activationRoot.hidden = true;
        }
        this.lorebookSettingsPopupState = null;
    }

    prepareLorebookActiveWorldsSelect2(popup) {
        const state = this.lorebookSettingsPopupState;
        const activeWorlds = state?.activeWorlds;
        const select = activeWorlds?.querySelector?.('#world_info');
        const jq = window.jQuery || window.$;
        if (!state || !select || !popup?.dlg || !jq?.fn?.select2) return;

        const $select = jq(select);
        const hadInstance = Boolean($select.data('select2'));
        // On mobile SillyTavern intentionally leaves this as a native multi-select.
        // Only rebind an existing desktop Select2 instance.
        if (!hadInstance) return;

        try { $select.select2('destroy'); } catch (error) {
            console.warn('[NastyTavern] Failed to detach Active Worlds Select2.', error);
            return;
        }

        try {
            $select.select2({
                width: '100%',
                placeholder: t('No Worlds active. Click here to select.'),
                allowClear: true,
                closeOnSelect: false,
                dropdownParent: jq(popup.dlg),
            });
            state.activeWorldSelect2HadInstance = true;
            state.activeWorldSelect2Rebound = true;
        } catch (error) {
            console.warn('[NastyTavern] Failed to bind Active Worlds Select2 inside Lorebook settings popup.', error);
        }
    }

    closeLorebookSettingsPopup() {
        const popup = this.lorebookSettingsPopup;
        this.lorebookSettingsPopup = null;
        this.restoreLorebookSettingsPopupNodes();
        if (!popup) return;
        try { void popup.completeCancelled?.(); } catch { /* Popup may already be closing. */ }
    }

    async openLorebookSettingsPopup() {
        if (this.lorebookSettingsPopup) return true;
        const layout = this.lorebookSettingsLayoutState;
        const context = window.SillyTavern?.getContext?.();
        const popupType = context?.POPUP_TYPE?.TEXT ?? context?.POPUP_TYPE?.DISPLAY;
        if (!layout?.settingsContent || !layout?.activeWorlds || !context?.Popup || popupType == null) {
            this.toast(t('Could not open Lorebook settings.'));
            return false;
        }

        const content = document.createElement('div');
        content.className = 'nt-lorebook-settings-popup';
        content.innerHTML = `
            <div class="nt-lorebook-settings-popup-main" data-nt-lorebook-settings-main></div>
            <div class="nt-lorebook-settings-popup-worlds" data-nt-lorebook-settings-worlds></div>`;
        const mainHost = content.querySelector('[data-nt-lorebook-settings-main]');
        const worldsHost = content.querySelector('[data-nt-lorebook-settings-worlds]');
        if (!mainHost || !worldsHost) return false;

        const settingsPlaceholder = document.createComment('NastyTavern Lorebook activation settings');
        const activePlaceholder = document.createComment('NastyTavern active worlds');
        layout.settingsContent.parentNode?.insertBefore(settingsPlaceholder, layout.settingsContent);
        layout.activeWorlds.parentNode?.insertBefore(activePlaceholder, layout.activeWorlds);
        mainHost.append(layout.settingsContent);
        worldsHost.append(layout.activeWorlds);
        layout.activeWorlds.hidden = false;

        this.lorebookSettingsPopupState = {
            settingsContent: layout.settingsContent,
            settingsPlaceholder,
            activeWorlds: layout.activeWorlds,
            activePlaceholder,
        };

        let popup;
        const options = {
            wide: true,
            large: true,
            allowVerticalScrolling: true,
            okButton: t('OK'),
            cancelButton: false,
            onOpen: openedPopup => {
                this.prepareLorebookActiveWorldsSelect2(openedPopup);
            },
            onClose: async () => {
                this.restoreLorebookSettingsPopupNodes();
                if (this.lorebookSettingsPopup === popup) this.lorebookSettingsPopup = null;
            },
        };
        popup = new context.Popup(content, popupType, t('Lorebook settings'), options);
        this.lorebookSettingsPopup = popup;
        try {
            await popup.show();
        } finally {
            this.restoreLorebookSettingsPopupNodes();
            if (this.lorebookSettingsPopup === popup) this.lorebookSettingsPopup = null;
        }
        return true;
    }

    restoreLorebookSettingsLayout() {
        this.closeLorebookSettingsPopup();
        const state = this.lorebookSettingsLayoutState;
        if (!state) return;
        state.launcher?.remove();
        state.activeWorlds.classList.remove('nt-lorebook-settings-source-hidden');
        state.activationRoot.classList.remove('nt-lorebook-settings-source-hidden');
        state.pinControl?.classList.remove('nt-lorebook-pin-hidden');
        state.activeWorlds.hidden = state.activeWorldsHidden;
        state.activationRoot.hidden = state.activationRootHidden;
        if (state.pinControl) state.pinControl.hidden = state.pinControlHidden;
        state.activeWorlds.parentElement?.classList.remove('nt-lorebook-top-controls');
        state.panel?.querySelector('#wiTopBlock')?.classList.remove('nt-lorebook-top-controls');
        this.lorebookSettingsLayoutState = null;
    }

    restoreNativeLorebookContent({ restoreFocus = true } = {}) {
        this.restoreLorebookSplitView();
        this.restoreLorebookSettingsLayout();
        const state = this.lorebookModalState;
        if (!state) return;
        const { panel, placeholder } = state;

        if (placeholder?.parentNode) {
            placeholder.parentNode.insertBefore(panel, placeholder);
            placeholder.remove();
        }
        if (state.panelClass == null) panel.removeAttribute('class');
        else panel.setAttribute('class', state.panelClass);
        if (state.panelStyle == null) panel.removeAttribute('style');
        else panel.setAttribute('style', state.panelStyle);
        panel.hidden = state.panelHidden;

        const opener = state.opener;
        this.lorebookModalState = null;
        this.dom.closeNativeDrawers();
        if (restoreFocus && opener?.isConnected) requestAnimationFrame(() => opener.focus?.({ preventScroll: true }));
    }

    async openLorebookModal() {
        if (this.isLorebookModalOpen()) return true;
        if (this.lorebookModalOpening) return false;

        this.lorebookModalOpening = true;
        try {
            if (this.isGroupModalOpen()) await this.closeGroupModal({ restoreFocus: false, reopenCharacters: false });
            if (this.isCharacterCreateModalOpen()) await this.closeCharacterCreateModal({ restoreFocus: false });
            if (this.isCharacterModalOpen()) this.closeCharacterModal();
            if (this.isPersonaModalOpen()) await this.closePersonaModal({ restoreFocus: false });
            if (this.isBackgroundModalOpen()) await this.closeBackgroundModal({ restoreFocus: false });

            const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
            let result;
            this.lorebookNativeTogglePassThrough = true;
            try {
                result = await this.dom.click('worldInfo', ['World Info', 'Lorebook']);
            } finally {
                this.lorebookNativeTogglePassThrough = false;
            }

            const native = await this.waitForNativeLorebookContent();
            if (!native || (!result.ok && !native.panel)) {
                console.warn('[NastyTavern] Lorebook modal failed to open native World Info.', result);
                this.toast(t('Could not open Lorebooks.'));
                return false;
            }

            const root = this.ensureLorebookModalRoot();
            if (!this.mountNativeLorebookContent(root, { opener })) {
                this.toast(t('Could not open Lorebooks.'));
                return false;
            }

            // Modal-only surface: do not select Lorebooks as the underlying
            // application view. Keep whatever view was already active.
            document.body?.classList.add('nt-lorebook-modal-open');
            this.setLorebookSidebarHidden(false);
            showModalShell(root);
            requestAnimationFrame(() => {
                root.querySelector('.nt-modal-close')?.focus?.({ preventScroll: true });
            });
            return true;
        } finally {
            this.lorebookNativeTogglePassThrough = false;
            this.lorebookModalOpening = false;
        }
    }

    async closeLorebookModal({ restoreFocus = true } = {}) {
        this.closeLorebookSettingsPopup();
        const root = this.lorebookModalRoot || document.querySelector('#nt-lorebook-modal');
        hideModalShell(root);

        // Restoring the native World Info drawer ends by clicking its native
        // drawer toggle to close it. That internal click must not be intercepted
        // as a fresh request to reopen the NastyTavern Lorebook modal.
        this.lorebookNativeTogglePassThrough = true;
        try {
            this.restoreNativeLorebookContent({ restoreFocus });
        } finally {
            this.lorebookNativeTogglePassThrough = false;
        }

        document.body?.classList.remove('nt-lorebook-modal-open');
        return true;
    }

    async cleanupLorebookModal() {
        await this.closeLorebookModal({ restoreFocus: false });
        this.lorebookModalRoot?.remove();
        this.lorebookModalRoot = null;
        document.querySelector('#nt-lorebook-modal')?.remove();
        document.body?.classList.remove('nt-lorebook-modal-open');
    }

    ensureGroupModalRoot() {
        let root = this.groupModalRoot;
        if (!root?.isConnected) root = document.querySelector('#nt-group-modal');
        if (!root) {
            ({ root } = createModalShell({
                id: 'nt-group-modal',
                title: t('Group'),
                icon: icons.community,
                size: 'large',
                modalClass: 'nt-group-modal',
                headerClass: 'nt-group-modal-header',
                bodyClass: 'nt-group-modal-body',
                bodyAttrs: { 'data-nt-group-host': '' },
                leadingHtml: `<button type="button" class="nt-modal-close nt-group-back" data-nt-group-back title="${t('Back to Characters')}" aria-label="${t('Back to Characters')}">${icons.arrowLeft}</button>`,
                closeAttrs: { 'data-nt-group-close': '' },
            }));
            root.addEventListener('click', event => {
                if (event.target.closest('[data-nt-group-back]')) {
                    void this.returnToCharacterModalFromGroup();
                    return;
                }
                if (event.target.closest('[data-nt-group-close]')) void this.closeGroupModal();
            });
            root.addEventListener('click', event => {
                const target = event.target instanceof Element ? event.target : null;
                const viewButton = target?.closest('.group_member [data-action="view"]');
                if (!viewButton || !root.contains(viewButton)) return;
                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation();
                void this.openGroupMemberCharacterDetails(viewButton);
            }, true);
            document.body.append(root);
        }
        this.groupModalRoot = root;
        return root;
    }

    isGroupModalOpen() {
        const root = this.groupModalRoot || document.querySelector('#nt-group-modal');
        return Boolean(root && !root.hidden && root.classList.contains('is-open'));
    }

    async waitForNativeGroupEditor(panel = this.characterModalPanel(), timeout = 3000) {
        const startedAt = Date.now();
        while (Date.now() - startedAt < timeout) {
            const block = panel?.querySelector('#rm_group_chats_block');
            if (block?.isConnected) {
                const style = getComputedStyle(block);
                if (!block.hidden && style.display !== 'none' && style.visibility !== 'hidden') return true;
            }
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        return false;
    }

    mountNativeGroupEditor(root, { opener = null } = {}) {
        const panel = this.characterModalPanel();
        const block = panel?.querySelector('#rm_group_chats_block');
        const host = root?.querySelector('[data-nt-group-host]');
        if (!block || !host || !block.parentNode) return false;

        const placeholder = document.createComment('NastyTavern native group editor');
        block.parentNode.insertBefore(placeholder, block);
        const resolvedOpener = opener instanceof HTMLElement ? opener : document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const groupId = resolvedOpener?.getAttribute?.('data-grid') || resolvedOpener?.dataset?.grid || null;
        this.groupModalState = {
            block,
            placeholder,
            blockClass: block.getAttribute('class'),
            blockStyle: block.getAttribute('style'),
            blockHidden: block.hidden,
            opener: resolvedOpener,
            groupId: groupId ? String(groupId) : null,
        };

        block.classList.add('nt-group-native-editor');
        block.hidden = false;
        host.append(block);
        return true;
    }

    restoreNativeGroupEditor({ restoreFocus = true } = {}) {
        const state = this.groupModalState;
        if (!state) return;
        const { block, placeholder } = state;

        if (placeholder?.parentNode) {
            placeholder.parentNode.insertBefore(block, placeholder);
            placeholder.remove();
        }
        if (state.blockClass == null) block.removeAttribute('class');
        else block.setAttribute('class', state.blockClass);
        if (state.blockStyle == null) block.removeAttribute('style');
        else block.setAttribute('style', state.blockStyle);
        block.hidden = state.blockHidden;

        const opener = state.opener;
        this.groupModalState = null;
        if (restoreFocus && opener?.isConnected) requestAnimationFrame(() => opener.focus?.({ preventScroll: true }));
    }

    setGroupModalTitle(mode = 'edit') {
        const root = this.groupModalRoot || document.querySelector('#nt-group-modal');
        const title = root?.querySelector('#nt-group-modal-title');
        if (title) title.textContent = mode === 'create' ? t('Create Group') : t('Edit Group');
        if (root) root.dataset.ntGroupMode = mode;
    }

    restoreGroupCreateReturn() {
        const state = this.groupCreateReturnState;
        if (!state) return;
        state.submit?.removeEventListener('click', state.onSubmitClick, true);
        state.observer?.disconnect();
        this.groupCreateReturnState = null;
    }

    prepareGroupCreateReturn(root) {
        this.restoreGroupCreateReturn();
        const submit = root?.querySelector('#rm_group_submit');
        const charactersBlock = this.characterModalPanel()?.querySelector('#rm_characters_block');
        if (!(submit instanceof HTMLElement) || !(charactersBlock instanceof HTMLElement)) return;

        const state = { submit, charactersBlock, observer: null, onSubmitClick: null, awaitingCreate: false };
        const charactersAreVisible = () => {
            if (!charactersBlock.isConnected || charactersBlock.hidden) return false;
            const style = getComputedStyle(charactersBlock);
            return style.display !== 'none' && style.visibility !== 'hidden';
        };
        const finishWhenCreated = () => {
            if (!state.awaitingCreate || !this.isGroupModalOpen()) return;
            if (root?.dataset.ntGroupMode !== 'create' || !charactersAreVisible()) return;
            state.awaitingCreate = false;
            this.restoreGroupCreateReturn();
            // SillyTavern has already returned its native panel to the Character
            // library here, which only happens after /api/groups/create succeeds.
            // Do not fire the native group Back action a second time.
            void this.closeGroupModal({
                restoreFocus: false,
                reopenCharacters: true,
                normalizeNative: false,
            });
        };

        state.onSubmitClick = () => {
            if (root?.dataset.ntGroupMode !== 'create' || submit.hasAttribute('disabled')) return;
            state.awaitingCreate = true;
            requestAnimationFrame(finishWhenCreated);
        };
        state.observer = new MutationObserver(finishWhenCreated);
        state.observer.observe(charactersBlock, { attributes: true, attributeFilter: ['style', 'class', 'hidden'] });
        submit.addEventListener('click', state.onSubmitClick, true);
        this.groupCreateReturnState = state;
    }

    restoreGroupDeleteReturn() {
        const state = this.groupDeleteReturnState;
        if (!state) return;
        state.deleteButton?.removeEventListener('click', state.onDeleteClick, true);
        state.observer?.disconnect();
        this.groupDeleteReturnState = null;
    }

    prepareGroupDeleteReturn(root) {
        this.restoreGroupDeleteReturn();
        const deleteButton = root?.querySelector('#rm_group_delete');
        const charactersBlock = this.characterModalPanel()?.querySelector('#rm_characters_block');
        const groupId = this.groupModalState?.groupId;
        if (!(deleteButton instanceof HTMLElement) || !(charactersBlock instanceof HTMLElement) || !groupId) return;

        const state = { deleteButton, charactersBlock, groupId, observer: null, onDeleteClick: null, awaitingDelete: false };
        const charactersAreVisible = () => {
            if (!charactersBlock.isConnected || charactersBlock.hidden) return false;
            const style = getComputedStyle(charactersBlock);
            return style.display !== 'none' && style.visibility !== 'hidden';
        };
        const groupStillExists = () => {
            const groups = window.SillyTavern?.getContext?.()?.groups;
            return Array.isArray(groups) && groups.some(group => String(group?.id) === state.groupId);
        };
        const finishWhenDeleted = () => {
            if (!state.awaitingDelete || !this.isGroupModalOpen()) return;
            if (root?.dataset.ntGroupMode !== 'edit' || !charactersAreVisible()) return;
            // Native SillyTavern switches back to the Character library after a
            // successful deletion. Verify the group has actually disappeared so
            // cancelling the confirmation can never close the NastyTavern modal.
            if (groupStillExists()) return;
            state.awaitingDelete = false;
            this.restoreGroupDeleteReturn();
            void this.closeGroupModal({
                restoreFocus: false,
                reopenCharacters: true,
                normalizeNative: false,
            });
        };

        state.onDeleteClick = () => {
            if (root?.dataset.ntGroupMode !== 'edit') return;
            state.awaitingDelete = true;
            requestAnimationFrame(finishWhenDeleted);
        };
        state.observer = new MutationObserver(finishWhenDeleted);
        state.observer.observe(charactersBlock, { attributes: true, attributeFilter: ['style', 'class', 'hidden'] });
        deleteButton.addEventListener('click', state.onDeleteClick, true);
        this.groupDeleteReturnState = state;
    }

    async showPreparedGroupModal({ mode = 'edit', opener = null } = {}) {
        if (this.isGroupModalOpen()) return true;
        if (this.isLorebookModalOpen()) await this.closeLorebookModal({ restoreFocus: false });
        const panel = this.characterModalPanel();
        if (!panel || !(await this.waitForNativeGroupEditor(panel))) {
            this.toast(t('Could not open group editor.'));
            return false;
        }

        if (this.isCharacterModalOpen()) this.closeCharacterModal();
        if (this.isCharacterCreateModalOpen()) await this.closeCharacterCreateModal({ restoreFocus: false });

        const root = this.ensureGroupModalRoot();
        this.setGroupModalTitle(mode);
        if (!this.mountNativeGroupEditor(root, { opener })) {
            this.toast(t('Could not open group editor.'));
            return false;
        }

        if (mode === 'create') {
            this.prepareGroupCreateReturn(root);
            this.restoreGroupDeleteReturn();
        } else {
            this.restoreGroupCreateReturn();
            this.prepareGroupDeleteReturn(root);
        }

        document.body?.classList.add('nt-group-modal-open');
        showModalShell(root);
        requestAnimationFrame(() => {
            root.querySelector('#rm_group_chat_name, #rm_group_members_filter, .nt-modal-close')?.focus?.({ preventScroll: true });
        });
        return true;
    }

    async openGroupCreateModal() {
        if (this.isGroupModalOpen()) return true;
        const panel = this.characterModalPanel();
        const source = panel?.querySelector('#rm_button_group_chats');
        if (!panel || !source) {
            this.toast(t('Could not open group editor.'));
            return false;
        }

        const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        source.click();
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        return this.showPreparedGroupModal({ mode: 'create', opener });
    }

    async openGroupEditModalFromNativeSelection({ opener = null } = {}) {
        if (this.isGroupModalOpen()) return true;
        return this.showPreparedGroupModal({ mode: 'edit', opener });
    }

    async closeGroupModal({ restoreFocus = true, reopenCharacters = false, normalizeNative = true } = {}) {
        this.restoreGroupCreateReturn();
        this.restoreGroupDeleteReturn();
        const root = this.groupModalRoot || document.querySelector('#nt-group-modal');
        hideModalShell(root);

        const opener = this.groupModalState?.opener;
        this.restoreNativeGroupEditor({ restoreFocus: false });
        document.body?.classList.remove('nt-group-modal-open');

        // Normalize native Character Management back to its library view using
        // SillyTavern's own Back action. A successful group creation already does
        // this natively, so that path explicitly skips this second navigation.
        if (normalizeNative) {
            const panel = this.characterModalPanel();
            const back = panel?.querySelector('#rm_button_back_from_group');
            if (back instanceof HTMLElement) {
                back.click();
                await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            }
        }

        if (reopenCharacters) return this.openCharacterModal();
        if (restoreFocus && opener?.isConnected) requestAnimationFrame(() => opener.focus?.({ preventScroll: true }));
        return true;
    }

    async returnToCharacterModalFromGroup() {
        if (!this.isGroupModalOpen()) return false;
        return this.closeGroupModal({ restoreFocus: false, reopenCharacters: true });
    }


    async loadCharacterCardJsonById(chid) {
        const context = window.SillyTavern?.getContext?.();
        const character = context?.characters?.[chid];
        if (!character) throw new Error(t('Could not load this Character Card.'));
        const avatar = String(character.avatar || '').trim();
        if (avatar) {
            try {
                const response = await fetch('/api/characters/export', {
                    method: 'POST',
                    headers: context?.getRequestHeaders?.() || { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ format: 'json', avatar_url: avatar }),
                });
                if (response.ok) {
                    const text = await response.text();
                    if (text.trim()) return JSON.parse(text);
                }
            } catch (error) {
                console.warn('[NastyTavern] Could not export Character Card JSON for read-only details; using loaded character data.', error);
            }
        }
        const data = character.data && typeof character.data === 'object' ? structuredClone(character.data) : {};
        for (const key of ['name','description','personality','scenario','first_mes','mes_example','creator_notes','system_prompt','post_history_instructions','creator','character_version','alternate_greetings','tags']) {
            if (data[key] === undefined && character[key] !== undefined) data[key] = structuredClone(character[key]);
        }
        return { ...structuredClone(character), data };
    }

    async openGroupMemberCharacterDetails(viewButton) {
        const member = viewButton?.closest?.('.group_member');
        const chid = Number(member?.getAttribute('data-chid'));
        if (!member || !Number.isInteger(chid) || chid < 0) {
            this.toast(t('Could not load this Character Card.'));
            return false;
        }
        const isCandidate = Boolean(member.closest('#rm_group_add_members'));
        const nativeAction = member.querySelector(`[data-action="${isCandidate ? 'add' : 'remove'}"]`);
        const contextLabel = isCandidate ? t('Add Members') : t('Current Members');
        try {
            const card = await this.loadCharacterCardJsonById(chid);
            const imageUrl = member.querySelector('.avatar img')?.currentSrc || member.querySelector('.avatar img')?.src || '';
            return this.characterDetails.open({
                card,
                imageUrl,
                context: isCandidate ? 'group-add' : 'group-current',
                contextLabel,
                opener: viewButton,
                actions: nativeAction ? [{
                    id: isCandidate ? 'group-add' : 'group-remove',
                    label: isCandidate ? t('Add to Group') : t('Remove from Group'),
                    icon: isCandidate ? icons.plus : icons.trash,
                    primary: isCandidate,
                    destructive: !isCandidate,
                    run: async () => nativeAction.click(),
                }] : [],
            });
        } catch (error) {
            this.toast(error?.message || t('Could not load this Character Card.'));
            return false;
        }
    }

    cleanCharacterLibraryEditOpen() {
        const state = this.characterLibraryEditState;
        if (!state) return;
        state.list?.removeEventListener('click', state.onClick);
        this.characterLibraryEditState = null;
    }

    async waitForNativeCharacterEditor(panel, timeout = 3000) {
        const startedAt = Date.now();
        while (Date.now() - startedAt < timeout) {
            const form = panel?.querySelector('#form_create');
            const block = panel?.querySelector('#rm_ch_create_block');
            const actionType = String(form?.getAttribute('actiontype') || '').toLowerCase();
            const context = window.SillyTavern?.getContext?.();
            const hasCharacter = context?.characterId !== undefined && context?.characterId !== null;
            const blockVisible = Boolean(block && !block.hidden && block.style.display !== 'none');
            if (form && blockVisible && actionType !== 'createcharacter' && (actionType || hasCharacter)) return true;
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        return false;
    }

    characterEditJsonData(panel = this.characterModalPanel()) {
        const form = panel?.querySelector('#form_create');
        const raw = form?.querySelector('[name="json_data"]')?.value;
        if (typeof raw === 'string' && raw.trim()) {
            try {
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
            } catch (error) {
                console.warn('[NastyTavern] Could not parse selected character json_data for Edit Character.', error);
            }
        }

        const context = window.SillyTavern?.getContext?.();
        const character = context?.characters?.[context?.characterId];
        return character && typeof character === 'object' ? character : {};
    }

    hydrateCharacterEditNastyFields(panel = this.characterModalPanel()) {
        const json = this.characterEditJsonData(panel);
        const data = json?.data && typeof json.data === 'object' && !Array.isArray(json.data)
            ? json.data
            : json;
        const name = this.characterCreateModalRoot?.querySelector('[data-nt-character-edit-name]');
        const description = this.characterCreateModalRoot?.querySelector('[data-nt-character-description]');
        const context = this.characterCreateModalRoot?.querySelector('[data-nt-character-context]');
        if (name) name.value = String(data?.name ?? json?.name ?? '');
        if (description) description.value = String(data?.nt_description ?? '');
        if (context) context.value = String(data?.nt_contexte ?? '');
        this.syncCharacterConvertButton(panel);
    }

    characterNastyMetadataState(panel = this.characterModalPanel()) {
        const json = this.characterEditJsonData(panel);
        const data = json?.data && typeof json.data === 'object' && !Array.isArray(json.data) ? json.data : {};
        const context = window.SillyTavern?.getContext?.();
        const current = context?.characters?.[context?.characterId];
        const currentData = current?.data && typeof current.data === 'object' && !Array.isArray(current.data) ? current.data : {};
        const first = (...values) => values.map(value => String(value ?? '').trim()).find(Boolean) || '';
        const creator = first(json?.nt_creator, data?.nt_creator, current?.nt_creator, currentData?.nt_creator);
        const uuid = first(json?.nt_uuid, data?.nt_uuid, current?.nt_uuid, currentData?.nt_uuid);
        const sha = first(json?.nt_sha, data?.nt_sha, current?.nt_sha, currentData?.nt_sha);
        return { creator, uuid, sha, complete: Boolean(creator && uuid && sha) };
    }

    syncCharacterConvertButton(panel = this.characterModalPanel()) {
        const root = this.characterCreateModalRoot || document.querySelector('#nt-character-create-modal');
        const button = root?.querySelector('[data-nt-character-convert]');
        if (!(button instanceof HTMLButtonElement)) return;
        const account = this.communityChat?.getAccountSnapshot?.();
        const isEdit = root?.dataset.ntCharacterEditorMode === 'edit';
        const metadata = this.characterNastyMetadataState(panel);
        button.hidden = !(isEdit && account?.signedIn && account?.username && !metadata.complete);
    }

    async askCharacterOriginalCreator() {
        document.querySelector('#nt-character-convert-confirm')?.remove();
        return await new Promise(resolve => {
            const { root, body } = createModalShell({
                id: 'nt-character-convert-confirm',
                title: t('Convert for NastyTavern'),
                subtitle: t('Character Card provenance'),
                icon: icons.logo,
                size: 'compact',
                modalClass: 'nt-character-convert-confirm-modal',
                bodyClass: 'nt-character-convert-confirm-body',
                closeAttrs: { 'data-nt-character-convert-cancel': '' },
            });
            body.innerHTML = `
                <p>${t('Are you the original creator of this Character Card?')}</p>
                <div class="nt-character-convert-confirm-actions">
                    <button type="button" data-nt-character-convert-answer="no">${t('No')}</button>
                    <button type="button" class="is-primary" data-nt-character-convert-answer="yes">${t('Yes')}</button>
                </div>`;
            let settled = false;
            const finish = value => {
                if (settled) return;
                settled = true;
                hideModalShell(root, { immediate: false });
                setTimeout(() => root.remove(), 180);
                resolve(value);
            };
            root.addEventListener('click', event => {
                const answer = event.target.closest('[data-nt-character-convert-answer]');
                if (answer) return finish(answer.dataset.ntCharacterConvertAnswer === 'yes');
                if (event.target.closest('[data-nt-character-convert-cancel]')) finish(null);
            });
            document.body.append(root);
            showModalShell(root);
            setTimeout(() => root.querySelector('[data-nt-character-convert-answer="yes"]')?.focus(), 30);
        });
    }

    async convertCurrentCharacterForNasty(panel = this.characterModalPanel()) {
        const root = this.characterCreateModalRoot || document.querySelector('#nt-character-create-modal');
        const button = root?.querySelector('[data-nt-character-convert]');
        const account = this.communityChat?.getAccountSnapshot?.();
        if (!account?.signedIn || !String(account.username || '').trim()) {
            this.syncCharacterConvertButton(panel);
            return false;
        }

        const before = this.characterNastyMetadataState(panel);
        if (before.complete) {
            this.syncCharacterConvertButton(panel);
            return true;
        }

        const originalCreator = await this.askCharacterOriginalCreator();
        if (originalCreator === null) return false;
        if (button) button.disabled = true;
        try {
            const json = this.syncCharacterEditJsonData(panel) || this.characterEditJsonData(panel);
            if (!json || typeof json !== 'object' || Array.isArray(json)) return false;
            if (!json.data || typeof json.data !== 'object' || Array.isArray(json.data)) json.data = {};

            const data = json.data;
            json.nt_creator = before.creator || (originalCreator ? String(account.username).trim() : 'unknown');
            json.nt_uuid = before.uuid || crypto.randomUUID();
            json.nt_sha = ntSha256Hex(JSON.stringify(ntCanonicalize(data)));

            const form = panel?.querySelector('#form_create');
            const jsonField = form?.querySelector('[name="json_data"]');
            if (jsonField) jsonField.value = JSON.stringify(json);

            const saveButton = panel?.querySelector('#create_button');
            if (!(saveButton instanceof HTMLElement)) throw new Error(t('Could not save this Character Card.'));
            saveButton.click();
            this.syncCharacterConvertButton(panel);
            this.toast(t('Character Card converted for NastyTavern.'));
            return true;
        } catch (error) {
            console.error('[NastyTavern] Character conversion failed.', error);
            this.toast(error?.message || t('Could not convert this Character Card.'));
            return false;
        } finally {
            if (button?.isConnected) button.disabled = false;
        }
    }

    syncCharacterEditJsonData(panel = this.characterModalPanel(), formData = null) {
        const form = panel?.querySelector('#form_create');
        if (!(form instanceof HTMLFormElement)) return null;

        const raw = formData instanceof FormData
            ? formData.get('json_data')
            : form.querySelector('[name="json_data"]')?.value;
        let json = {};
        if (typeof raw === 'string' && raw.trim()) {
            try {
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) json = parsed;
            } catch (error) {
                console.warn('[NastyTavern] Could not parse character json_data during live edit.', error);
            }
        }
        if (!json.data || typeof json.data !== 'object' || Array.isArray(json.data)) json.data = {};
        const data = json.data;
        const value = selector => String(panel?.querySelector(selector)?.value ?? '');

        // Keep json_data aligned with the live editor before SillyTavern serializes
        // the native edit request. Unknown/future data fields are preserved because
        // we only overwrite fields represented by the current editor.
        data.nt_description = String(this.characterCreateModalRoot?.querySelector('[data-nt-character-description]')?.value ?? '');
        data.nt_contexte = String(this.characterCreateModalRoot?.querySelector('[data-nt-character-context]')?.value ?? '');

        // SillyTavern's character save/export contract uses the native `tags` form
        // field as the source of truth, then mirrors it to both V1 `tags` and
        // V2 `data.tags` server-side. Keep the same contract here instead of
        // relying on json_data alone (which SillyTavern overwrites from FormData).
        const selectedTags = this.characterCreateSelectedTagNames(panel);
        json.tags = [...selectedTags];
        data.tags = [...selectedTags];
        if (formData instanceof FormData) formData.set('tags', selectedTags.join(','));

        data.name = String(this.characterCreateModalRoot?.querySelector('[data-nt-character-edit-name]')?.value
            ?? panel.querySelector('#character_name_pole')?.value
            ?? data.name
            ?? '');
        data.description = value('#description_textarea');
        data.personality = value('#personality_textarea');
        data.scenario = value('#scenario_pole');
        data.first_mes = value('#firstmessage_textarea');
        data.mes_example = this.serializeCharacterDialogueExamples(
            Array.isArray(this.characterDialogueExamplesDraft)
                ? this.characterDialogueExamplesDraft
                : this.parseCharacterDialogueExamples(value('#mes_example_textarea'))
        );
        data.creator_notes = value('#creator_notes_textarea');
        data.system_prompt = value('#system_prompt_textarea');
        data.post_history_instructions = value('#post_history_instructions_textarea');
        data.creator = value('#creator_textarea');
        data.character_version = value('#character_version_textarea');

        const context = window.SillyTavern?.getContext?.();
        const currentCharacter = context?.characters?.[context?.characterId];
        if (Array.isArray(currentCharacter?.data?.alternate_greetings)) {
            data.alternate_greetings = structuredClone(currentCharacter.data.alternate_greetings);
        } else if (!Array.isArray(data.alternate_greetings)) {
            data.alternate_greetings = [];
        }

        if (!data.extensions || typeof data.extensions !== 'object' || Array.isArray(data.extensions)) data.extensions = {};
        data.extensions.talkativeness = value('#talkativeness_slider');
        data.extensions.world = value('#character_world');
        data.extensions.depth_prompt = {
            prompt: value('#depth_prompt_prompt'),
            depth: Number(panel?.querySelector('#depth_prompt_depth')?.value ?? data.extensions.depth_prompt?.depth ?? 4),
            role: value('#depth_prompt_role') || 'system',
        };

        json.nt_sha = ntSha256Hex(JSON.stringify(ntCanonicalize(data)));
        const serialized = JSON.stringify(json);
        const jsonField = form.querySelector('[name="json_data"]');
        if (jsonField) jsonField.value = serialized;
        if (formData instanceof FormData) formData.set('json_data', serialized);
        return json;
    }

    prepareCharacterEditLiveSave(panel = this.characterModalPanel()) {
        this.restoreCharacterEditLiveSave();
        const form = panel?.querySelector('#form_create');
        if (!(form instanceof HTMLFormElement)) return false;

        const SAVE_DELAY = 900;
        let saveTimer = null;
        let renameTimer = null;
        let saving = false;
        let renaming = false;

        const isEditActive = () => (
            this.isCharacterCreateModalOpen()
            && this.characterCreateModalRoot?.dataset.ntCharacterEditorMode === 'edit'
            && form.getAttribute('actiontype') === 'editcharacter'
        );

        const persist = async () => {
            saveTimer = null;
            if (!isEditActive() || saving || renaming) return;
            const saveButton = panel?.querySelector('#create_button');
            if (!(saveButton instanceof HTMLElement)) return;
            saving = true;
            try {
                // Use the exact native SillyTavern edit path. The formdata hook
                // below injects NastyTavern metadata and refreshes nt_sha first.
                saveButton.click();
            } finally {
                // createOrEditCharacter is async, while click() is not awaitable.
                // A short guard prevents a burst of duplicate clicks without
                // replacing SillyTavern's own save lifecycle.
                setTimeout(() => { saving = false; }, SAVE_DELAY);
            }
        };

        const schedulePersist = () => {
            if (!isEditActive()) return;
            clearTimeout(saveTimer);
            saveTimer = setTimeout(() => { void persist(); }, SAVE_DELAY);
        };

        const rename = async input => {
            renameTimer = null;
            if (!isEditActive() || renaming || !(input instanceof HTMLInputElement)) return;
            const nextName = input.value.trim();
            const context = window.SillyTavern?.getContext?.();
            const currentName = String(context?.characters?.[context?.characterId]?.name ?? '').trim();
            if (!nextName || nextName === currentName) return;

            clearTimeout(saveTimer);
            try {
                // Flush all other pending fields before the native rename reloads
                // the selected character and its avatar key.
                await persist();
                await wait(SAVE_DELAY);
                renaming = true;
                const nativeModule = await import('/script.js');
                const ok = await nativeModule.renameCharacter?.(nextName, { silent: true, renameChats: false });
                if (ok) {
                    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
                    this.hydrateCharacterEditNastyFields(panel);
                }
            } catch (error) {
                console.error('[NastyTavern] Character rename failed during live edit.', error);
                this.toast(t('Could not rename character.'));
            } finally {
                renaming = false;
            }
        };

        const onInput = event => {
            if (!isEditActive()) return;
            const target = event.target;
            if (!(target instanceof HTMLElement)) return;
            if (target.matches('[data-nt-character-edit-name]')) {
                clearTimeout(renameTimer);
                renameTimer = setTimeout(() => { void rename(target); }, SAVE_DELAY);
                return;
            }
            if (target.matches('input[type="file"], button, [type="button"], [type="submit"]')) return;
            schedulePersist();
        };

        const onChange = event => {
            if (!isEditActive()) return;
            const target = event.target;
            if (target instanceof HTMLInputElement && target.matches('[data-nt-character-edit-name]')) {
                clearTimeout(renameTimer);
                void rename(target);
                return;
            }
            if (target instanceof HTMLElement && !target.matches('input[type="file"]')) schedulePersist();
        };

        form.addEventListener('input', onInput, true);
        form.addEventListener('change', onChange, true);
        this.characterEditLiveSaveState = { form, onInput, onChange, getSaveTimer: () => saveTimer, getRenameTimer: () => renameTimer };
        return true;
    }

    restoreCharacterEditLiveSave() {
        const state = this.characterEditLiveSaveState;
        if (!state) return;
        state.form?.removeEventListener('input', state.onInput, true);
        state.form?.removeEventListener('change', state.onChange, true);
        clearTimeout(state.getSaveTimer?.());
        clearTimeout(state.getRenameTimer?.());
        this.characterEditLiveSaveState = null;
    }

    setCharacterEditorMode(mode = 'create') {
        const root = this.characterCreateModalRoot || document.querySelector('#nt-character-create-modal');
        if (!root) return;
        const isEdit = mode === 'edit';
        root.dataset.ntCharacterEditorMode = isEdit ? 'edit' : 'create';
        root.querySelector('.nt-character-create-modal')?.classList.toggle('is-edit-mode', isEdit);
        const title = root.querySelector('#nt-character-create-modal-title');
        if (title) title.textContent = t(isEdit ? 'Edit Character' : 'Create Character');
    }

    async openCharacterEditModalFromNativeSelection({ opener = null } = {}) {
        if (!this.isCharacterModalOpen()) return false;
        const panel = this.characterModalPanel();
        if (!panel) return false;
        if (!await this.waitForNativeCharacterEditor(panel)) return false;
        if (!this.isCharacterModalOpen()) return false;

        // The native editor is now fully hydrated by SillyTavern. Restore the
        // drawer to its normal DOM location, then mount that same hydrated
        // editor into the shared Create/Edit modal shell.
        this.closeCharacterModal();
        this.characterDialogueExamplesDraft = null;

        const root = this.ensureCharacterCreateModalRoot();
        this.setCharacterEditorMode('edit');
        if (!this.mountCharacterCreateDrawer(root)) {
            this.toast(t('Could not open Characters.'));
            return false;
        }

        this.prepareCharacterCreateActions(panel);
        this.prepareCharacterCreateLayout(panel);
        this.hydrateCharacterEditNastyFields(panel);
        this.prepareCharacterCreateSubmission(panel);
        this.prepareCharacterEditLiveSave(panel);

        // Preserve the clicked library card as the focus return target when the
        // native card element still exists after the editor closes.
        if (opener && this.characterCreateModalState) this.characterCreateModalState.opener = opener;

        document.body?.classList.add('nt-character-create-modal-open');
        showModalShell(root);
        requestAnimationFrame(() => {
            const nameInput = panel.querySelector('#character_name_pole')
                || root.querySelector('[data-nt-character-edit-name]');
            (nameInput || root.querySelector('.nt-modal-close'))?.focus?.({ preventScroll: true });
        });
        this.syncCharacterFavoriteState();
        return true;
    }

    async openCharacterCatalogue() {
        this.closeCharacterModal();
        await this.catalogueModal?.open?.();
    }

    decorateCharacterLibraryPerformance(panel) {
        const list = panel?.querySelector('#rm_print_characters_block');
        if (!list) return;
        const previous = this.characterLibraryPerformanceState;
        if (previous?.list === list) return;
        previous?.observer?.disconnect();
        if (previous?.idle) (window.cancelIdleCallback || clearTimeout)(previous.idle);

        list.classList.add('nt-character-performance-list');
        const tuneImage = image => {
            if (!(image instanceof HTMLImageElement)) return;
            if (!image.hasAttribute('loading')) image.loading = 'lazy';
            image.decoding = 'async';
        };
        const tuneNode = node => {
            if (!(node instanceof Element)) return;
            if (node.matches('img')) tuneImage(node);
            node.querySelectorAll?.('img').forEach(tuneImage);
        };

        // Character Library's dedicated extension stays responsive with large
        // collections by deferring off-screen image/render work. Apply the same
        // principle to ST's native list without replacing its nodes or handlers.
        let cursor = 0;
        const entries = list.children;
        const runChunk = deadline => {
            const canContinue = () => !deadline || deadline.timeRemaining() > 2 || deadline.didTimeout;
            let processed = 0;
            while (cursor < entries.length && processed < 80 && canContinue()) {
                tuneNode(entries[cursor++]);
                processed += 1;
            }
            if (cursor < entries.length) {
                const scheduleIdle = window.requestIdleCallback || (callback => setTimeout(() => callback({ timeRemaining: () => 8, didTimeout: true }), 16));
                const idle = scheduleIdle(runChunk, { timeout: 120 });
                if (this.characterLibraryPerformanceState?.list === list) this.characterLibraryPerformanceState.idle = idle;
            }
        };
        const scheduleIdle = window.requestIdleCallback || (callback => setTimeout(() => callback({ timeRemaining: () => 8, didTimeout: true }), 16));
        const idle = scheduleIdle(runChunk, { timeout: 120 });

        const observer = new MutationObserver(mutations => {
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) tuneNode(node);
            }
        });
        observer.observe(list, { childList: true, subtree: true });
        this.characterLibraryPerformanceState = { list, observer, idle };
    }

    cleanCharacterLibraryPerformance() {
        const state = this.characterLibraryPerformanceState;
        if (!state) return;
        state.observer?.disconnect();
        if (state.idle) (window.cancelIdleCallback || clearTimeout)(state.idle);
        state.list?.classList.remove('nt-character-performance-list');
        this.characterLibraryPerformanceState = null;
    }

    decorateCharacterEmptyState(panel) {
        const library = panel?.querySelector('#rm_characters_block');
        const list = panel?.querySelector('#rm_print_characters_block');
        if (!library || !list) return;

        let stateNode = library.querySelector('.nt-character-empty-state');
        if (!stateNode) {
            const wrapper = document.createElement('div');
            wrapper.innerHTML = emptyStateHtml({
                icon: icons.characters,
                className: 'nt-character-empty-state',
                attrs: { role: 'status', 'aria-live': 'polite', hidden: true },
                iconClass: 'nt-character-empty-icon',
                iconAttrs: { 'aria-hidden': 'true' },
                titleAttrs: { 'data-nt-character-empty-title': '' },
                subtitleAttrs: { 'data-nt-character-empty-description': '' },
                actionHtml: '<button type="button" class="nt-character-empty-action" data-nt-character-empty-action></button>',
            });
            stateNode = wrapper.firstElementChild;
            list.insertAdjacentElement('afterend', stateNode);
        }

        const hasVisibleEntry = () => {
            // Avoid getComputedStyle() on every card. SillyTavern expresses the
            // character-library visibility state through DOM attributes/classes
            // and inline display changes, so a selector can stop at the first
            // eligible entry without forcing layout for thousands of nodes.
            const selector = [
                '.character_select',
                '.group_select',
                '.bogus_folder_select',
            ].map(base => `${base}:not([hidden]):not([aria-hidden="true"]):not(.hidden):not(.hiddenByScroll):not([style*="display: none"]):not([style*="display:none"]):not([style*="visibility: hidden"]):not([style*="visibility:hidden"])`).join(', ');
            return Boolean(list.querySelector(selector));
        };

        const update = () => {
            if (!stateNode.isConnected || !list.isConnected) return;
            const empty = !hasVisibleEntry();
            stateNode.hidden = !empty;
            library.classList.toggle('is-empty', empty);

            const pagination = this.characterModalRoot?.querySelector('.nt-character-pagination');
            const footer = this.characterModalRoot?.querySelector('[data-nt-character-footer]');
            if (pagination) pagination.hidden = empty;
            if (footer) footer.hidden = empty;
            if (!empty) return;

            const search = panel.querySelector('#character_search_bar');
            const hasSearch = Boolean(String(search?.value || '').trim());
            const title = stateNode.querySelector('[data-nt-character-empty-title]');
            const description = stateNode.querySelector('[data-nt-character-empty-description]');
            const action = stateNode.querySelector('[data-nt-character-empty-action]');

            if (hasSearch) {
                if (title) title.textContent = t('No characters found');
                if (description) description.textContent = t('Try a different search or clear it.');
                if (action) {
                    action.textContent = t('Clear search');
                    action.dataset.ntCharacterEmptyAction = 'clear-search';
                }
            } else {
                if (title) title.textContent = t('No characters yet');
                if (description) description.textContent = t('Create a character or import one to start your library.');
                if (action) {
                    action.textContent = t('Create Character');
                    action.dataset.ntCharacterEmptyAction = 'create';
                }
            }
        };

        const previous = this.characterEmptyStateState;
        if (previous?.list === list) return;

        previous?.observer?.disconnect();
        previous?.search?.removeEventListener('input', previous.onSearch);
        previous?.search?.removeEventListener('change', previous.onSearch);
        previous?.tagControls?.removeEventListener('click', previous.onFilter);
        previous?.tagControls?.removeEventListener('change', previous.onFilter);
        previous?.stateNode?.removeEventListener('click', previous.onAction);
        cancelAnimationFrame(previous?.frame || 0);

        let frame = 0;
        const scheduleUpdate = () => {
            if (frame) return;
            frame = requestAnimationFrame(() => {
                frame = 0;
                update();
                if (this.characterEmptyStateState?.list === list) this.characterEmptyStateState.frame = 0;
            });
            if (this.characterEmptyStateState?.list === list) this.characterEmptyStateState.frame = frame;
        };
        const observer = new MutationObserver(() => scheduleUpdate());
        // Do not observe class/style attributes across thousands of cards. Native
        // filtering can mutate every entry in one interaction; watching those
        // attributes creates the very O(n) mutation pressure we are avoiding.
        observer.observe(list, { childList: true });

        const search = panel.querySelector('#character_search_bar');
        const tagControls = panel.querySelector('#charListFixedTop > .rm_tag_controls');
        const onSearch = scheduleUpdate;
        const onFilter = () => requestAnimationFrame(scheduleUpdate);
        search?.addEventListener('input', onSearch);
        search?.addEventListener('change', onSearch);
        tagControls?.addEventListener('click', onFilter);
        tagControls?.addEventListener('change', onFilter);

        const onAction = event => {
            const button = event.target.closest('[data-nt-character-empty-action]');
            if (!button) return;
            if (button.dataset.ntCharacterEmptyAction === 'clear-search') {
                const input = panel.querySelector('#character_search_bar');
                if (!input) return;
                input.value = '';
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
                input.focus?.({ preventScroll: true });
                scheduleUpdate();
                return;
            }
            void this.openCharacterCreateModal();
        };
        stateNode.addEventListener('click', onAction);
        this.characterEmptyStateState = { list, stateNode, observer, search, tagControls, onSearch, onFilter, onAction, frame };
        scheduleUpdate();
    }

    cleanCharacterEmptyState() {
        const state = this.characterEmptyStateState;
        if (state) {
            cancelAnimationFrame(state.frame || 0);
            state.observer?.disconnect();
            state.search?.removeEventListener('input', state.onSearch);
            state.search?.removeEventListener('change', state.onSearch);
            state.tagControls?.removeEventListener('click', state.onFilter);
            state.tagControls?.removeEventListener('change', state.onFilter);
            state.stateNode?.removeEventListener('click', state.onAction);
            this.characterEmptyStateState = null;
        }
        document.querySelector('#nt-character-modal .nt-character-empty-state')?.remove();
        document.querySelector('#nt-character-modal #rm_characters_block')?.classList.remove('is-empty');
    }

    decorateCharacterLibraryControls(panel) {
        const toolbar = panel?.querySelector('#rm_print_characters_pagination');
        const quickActions = panel?.querySelector('.nt-character-quick-actions');
        if (!toolbar || !quickActions || this.characterLibraryControlState) return;

        const placements = [
            [panel.querySelector('#character_sort_order'), toolbar],
            [panel.querySelector('#form_character_search_form'), quickActions],
        ].filter(([node, target]) => node && target);
        if (!placements.length) return;

        this.characterLibraryControlState = placements.map(([node, target]) => {
            const placeholder = document.createComment(`NastyTavern Characters control: ${node.id || node.tagName}`);
            node.parentNode?.insertBefore(placeholder, node);
            target.append(node);
            return { node, placeholder, target };
        });
    }

    syncCharacterLibraryControls(panel) {
        const state = this.characterLibraryControlState;
        if (!state?.length) return;
        for (const { node, target } of state) {
            if (node?.parentNode !== target && target?.isConnected) target.append(node);
        }
    }

    restoreCharacterLibraryControls() {
        const state = this.characterLibraryControlState;
        if (!state?.length) {
            this.characterLibraryControlState = null;
            return;
        }
        for (const { node, placeholder } of state) {
            if (placeholder?.parentNode && node) placeholder.parentNode.insertBefore(node, placeholder);
            placeholder?.remove?.();
        }
        this.characterLibraryControlState = null;
    }

    invalidateCharacterTagUsageCache() {
        this.characterTagUsageCache = null;
    }

    characterTagUsageCounts() {
        const context = window.SillyTavern?.getContext?.();
        const characters = Array.isArray(context?.characters) ? context.characters : [];
        const globalTags = Array.isArray(context?.tags) ? context.tags : [];
        const tagMap = context?.tagMap && typeof context.tagMap === 'object' ? context.tagMap : {};
        const cached = this.characterTagUsageCache;
        if (cached
            && cached.characters === characters
            && cached.characterCount === characters.length
            && cached.globalTags === globalTags
            && cached.tagCount === globalTags.length
            && cached.tagMap === tagMap) {
            return cached.counts;
        }

        const tagNamesById = new Map(globalTags.map(tag => [String(tag?.id ?? ''), String(tag?.name ?? tag?.label ?? '').trim()]).filter(([, name]) => name));
        const counts = new Map();
        const normalize = value => String(value ?? '').trim().toLocaleLowerCase();
        const add = name => {
            const clean = String(name ?? '').trim();
            if (!clean) return;
            const key = normalize(clean);
            counts.set(key, (counts.get(key) || 0) + 1);
        };
        const collect = (candidate, names) => {
            if (Array.isArray(candidate)) {
                for (const value of candidate) {
                    const name = typeof value === 'object' ? value?.name ?? value?.label : value;
                    if (String(name ?? '').trim()) names.add(String(name).trim());
                }
            } else if (typeof candidate === 'string') {
                for (const value of candidate.split(/[,;|]/g)) if (value.trim()) names.add(value.trim());
            }
        };

        let mappedAssignments = 0;
        for (const assigned of Object.values(tagMap)) {
            if (!Array.isArray(assigned)) continue;
            const unique = new Set(assigned.map(id => String(id)));
            for (const id of unique) {
                const name = tagNamesById.get(id);
                if (name) {
                    add(name);
                    mappedAssignments += 1;
                }
            }
        }

        // Modern SillyTavern already maintains tagMap as its lightweight index.
        // Only fall back to parsing full character objects when that index is
        // unavailable, avoiding thousands of nested-field reads on large sets.
        if (!mappedAssignments && !Object.keys(tagMap).length) {
            for (const character of characters) {
                const names = new Set();
                collect(character?.tags, names);
                collect(character?.data?.tags, names);
                collect(character?.data?.extensions?.tags, names);
                collect(character?.metadata?.tags, names);
                collect(character?.extensions?.tags, names);
                for (const name of names) add(name);
            }
        }

        this.characterTagUsageCache = {
            characters,
            characterCount: characters.length,
            globalTags,
            tagCount: globalTags.length,
            tagMap,
            counts,
        };
        return counts;
    }

    sortCharacterTagList(panel) {
        const container = panel?.querySelector('#charListFixedTop > .rm_tag_controls .tags');
        if (!container) return;
        const nodes = [...container.children].filter(node => node instanceof HTMLElement && String(node.textContent || '').trim());
        if (nodes.length < 2) return;

        const counts = this.characterTagUsageCounts();
        const label = node => String(
            node.dataset?.tagName
            || node.getAttribute?.('data-tag-name')
            || node.getAttribute?.('data-tag')
            || node.querySelector?.('.tag_name, .tag-name, [data-tag-name]')?.textContent
            || node.textContent
            || ''
        ).trim();
        const normalize = value => String(value ?? '').trim().toLocaleLowerCase();
        const sorted = [...nodes].sort((a, b) => {
            const aLabel = label(a);
            const bLabel = label(b);
            const usageDiff = (counts.get(normalize(bLabel)) || 0) - (counts.get(normalize(aLabel)) || 0);
            return usageDiff || aLabel.localeCompare(bLabel, undefined, { sensitivity: 'base' });
        });

        if (nodes.every((node, index) => node === sorted[index])) return;
        for (const node of sorted) container.append(node);
    }

    decorateCharacterTagSorting(panel) {
        const root = panel?.querySelector('#charListFixedTop > .rm_tag_controls');
        if (!root) return;
        const previous = this.characterTagSortState;
        if (previous?.root === root) return;
        previous?.observer?.disconnect();

        let frame = 0;
        const schedule = () => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(() => this.sortCharacterTagList(panel));
            if (this.characterTagSortState?.root === root) this.characterTagSortState.frame = frame;
        };
        const observer = new MutationObserver(mutations => {
            // Sorting depends on tag membership/labels, not hover/selection style
            // churn. Ignore attribute-only updates to avoid needless work.
            if (mutations.some(mutation => mutation.type === 'childList' || mutation.type === 'characterData')) schedule();
        });
        observer.observe(root, { childList: true, subtree: true, characterData: true });
        this.characterTagSortState = { root, observer, frame: 0 };
        schedule();
    }

    cleanCharacterTagSorting() {
        const state = this.characterTagSortState;
        if (!state) return;
        cancelAnimationFrame(state.frame || 0);
        state.observer?.disconnect();
        this.characterTagSortState = null;
    }

    characterPaginationState(nativePagination) {
        const pagination = window.jQuery?.(nativePagination);
        if (!pagination?.pagination) return { current: 1, total: 1 };

        let current = 1;
        let total = 1;
        try { current = Number(pagination.pagination('getCurrentPageNum')) || 1; }
        catch (_) {
            try { current = Number(pagination.pagination('getSelectedPageNum')) || 1; }
            catch (_) {}
        }
        try { total = Number(pagination.pagination('getTotalPage')) || 1; }
        catch (_) {}

        total = Math.max(1, total);
        current = Math.min(Math.max(1, current), total);
        return { current, total };
    }

    syncCharacterPagination(panel = this.characterModalPanel()) {
        const nativePagination = panel?.querySelector('#rm_print_characters_pagination');
        const controls = this.characterModalRoot?.querySelector('.nt-character-pagination') || document.querySelector('#nt-character-modal .nt-character-pagination');
        if (!nativePagination || !controls) return;

        this.syncCharacterLibraryControls(panel);
        const { current, total } = this.characterPaginationState(nativePagination);
        const currentLabel = controls.querySelector('[data-nt-character-page-current]');
        if (currentLabel) currentLabel.textContent = String(current);

        controls.querySelector('[data-nt-character-page="first"]')?.toggleAttribute('disabled', current <= 1);
        controls.querySelector('[data-nt-character-page="previous"]')?.toggleAttribute('disabled', current <= 1);
        controls.querySelector('[data-nt-character-page="next"]')?.toggleAttribute('disabled', current >= total);
        controls.querySelector('[data-nt-character-page="last"]')?.toggleAttribute('disabled', current >= total);
    }

    decorateCharacterPagination(panel) {
        const nativePagination = panel?.querySelector('#rm_print_characters_pagination');
        const footer = this.characterModalRoot?.querySelector('[data-nt-character-footer]');
        if (!nativePagination || !footer) return;

        let controls = footer.querySelector('.nt-character-pagination');
        if (!controls) {
            controls = document.createElement('nav');
            controls.className = 'nt-character-pagination';
            controls.setAttribute('aria-label', t('Pagination'));
            controls.innerHTML = `
                <button type="button" data-nt-character-page="first" aria-label="${t('First page')}" title="${t('First page')}">&lt;&lt;</button>
                <button type="button" data-nt-character-page="previous" aria-label="${t('Previous page')}" title="${t('Previous page')}">&lt;</button>
                <span class="nt-character-page-current" data-nt-character-page-current aria-live="polite">1</span>
                <button type="button" data-nt-character-page="next" aria-label="${t('Next page')}" title="${t('Next page')}">&gt;</button>
                <button type="button" data-nt-character-page="last" aria-label="${t('Last page')}" title="${t('Last page')}">&gt;&gt;</button>`;

            controls.addEventListener('click', event => {
                const button = event.target.closest('[data-nt-character-page]');
                if (!button || button.disabled) return;
                const pagination = window.jQuery?.(nativePagination);
                if (!pagination?.pagination) return;

                const action = button.dataset.ntCharacterPage;
                try {
                    if (action === 'first') pagination.pagination('go', 1);
                    else if (action === 'previous') pagination.pagination('previous');
                    else if (action === 'next') pagination.pagination('next');
                    else if (action === 'last') pagination.pagination('go', this.characterPaginationState(nativePagination).total);
                } catch (_) {}
                requestAnimationFrame(() => this.syncCharacterPagination(panel));
            });
            footer.append(controls);
        }
        footer.hidden = false;

        if (this.characterPaginationStateRef?.nativePagination !== nativePagination) {
            this.characterPaginationObserver?.disconnect();
            let frame = 0;
            const scheduleSync = () => {
                if (frame) return;
                frame = requestAnimationFrame(() => {
                    frame = 0;
                    this.syncCharacterPagination(panel);
                    if (this.characterPaginationStateRef?.nativePagination === nativePagination) this.characterPaginationStateRef.frame = 0;
                });
                if (this.characterPaginationStateRef?.nativePagination === nativePagination) this.characterPaginationStateRef.frame = frame;
            };
            this.characterPaginationObserver = new MutationObserver(scheduleSync);
            this.characterPaginationObserver.observe(nativePagination, { childList: true, subtree: true, characterData: true });
            this.characterPaginationStateRef = { nativePagination, frame };
        }
        this.syncCharacterPagination(panel);
    }

    cleanCharacterLibrary(panel) {
        if (!panel) return;
        cancelAnimationFrame(this.characterPaginationStateRef?.frame || 0);
        this.characterPaginationObserver?.disconnect();
        this.characterPaginationObserver = null;
        this.characterPaginationStateRef = null;
        this.invalidateCharacterTagUsageCache();
        this.cleanCharacterEmptyState();
        this.cleanCharacterLibraryPerformance();
        this.cleanCharacterTagSorting();
        this.cleanCharacterLibraryEditOpen();
        this.restoreCharacterLibraryControls();
        this.characterModalRoot?.querySelector('.nt-character-pagination')?.remove();
        const footer = this.characterModalRoot?.querySelector('[data-nt-character-footer]');
        if (footer) footer.hidden = true;
        panel.querySelector('.nt-character-quick-actions')?.remove();
        panel.querySelectorAll('.nt-character-native-quick-source').forEach(action => action.classList.remove('nt-character-native-quick-source'));
        panel.querySelector('#rm_characters_block')?.classList.remove('nt-character-library');
    }

    characterModalDrawer() {
        return document.querySelector('#rightNavHolder') || this.characterModalPanel()?.closest('.drawer') || null;
    }

    isCharacterModalOpen() {
        const root = this.characterModalRoot || document.querySelector('#nt-character-modal');
        return Boolean(root && !root.hidden && root.classList.contains('is-open'));
    }

    mountCharacterDrawer(root) {
        const drawer = this.characterModalDrawer();
        const panel = this.characterModalPanel();
        const host = root?.querySelector('[data-nt-character-host]');
        if (!drawer || !panel || !host) return false;

        if (!this.characterModalState) {
            const placeholder = document.createComment('NastyTavern Characters drawer');
            const parent = drawer.parentNode;
            if (!parent) return false;
            parent.insertBefore(placeholder, drawer);
            this.characterModalState = {
                drawer, panel, placeholder,
                drawerClass: drawer.getAttribute('class'),
                drawerStyle: drawer.getAttribute('style'),
                panelClass: panel.getAttribute('class'),
                panelStyle: panel.getAttribute('style'),
                panelHidden: panel.hidden,
                opener: document.activeElement instanceof HTMLElement ? document.activeElement : null,
            };
        }

        drawer.classList.add('nt-character-modal-drawer');
        panel.classList.add('nt-character-modal-native');
        panel.classList.remove('closedDrawer');
        panel.classList.add('openDrawer');
        panel.hidden = false;
        host.append(drawer);
        this.decorateCharacterLibrary(panel);

        const icon = drawer.querySelector(':scope > .drawer-toggle .drawer-icon, #rightNavDrawerIcon');
        icon?.classList.remove('closedIcon');
        icon?.classList.add('openIcon');
        const list = panel.querySelector('#rm_print_characters_block');
        list?.dispatchEvent(new Event('scroll', { bubbles: true }));
        try { window.jQuery?.(list)?.trigger?.('scroll'); } catch (_) {}
        return true;
    }

    restoreCharacterDrawer() {
        const state = this.characterModalState;
        if (!state) return;
        const { drawer, panel, placeholder } = state;
        this.cleanCharacterLibrary(panel);

        if (placeholder?.parentNode) {
            placeholder.parentNode.insertBefore(drawer, placeholder);
            placeholder.remove();
        }

        if (state.drawerClass == null) drawer.removeAttribute('class');
        else drawer.setAttribute('class', state.drawerClass);
        if (state.drawerStyle == null) drawer.removeAttribute('style');
        else drawer.setAttribute('style', state.drawerStyle);
        if (state.panelClass == null) panel.removeAttribute('class');
        else panel.setAttribute('class', state.panelClass);
        if (state.panelStyle == null) panel.removeAttribute('style');
        else panel.setAttribute('style', state.panelStyle);
        panel.hidden = state.panelHidden;

        // Characters is modal-only in NastyTavern: never leave the native drawer visibly open.
        panel.classList.remove('openDrawer');
        panel.classList.add('closedDrawer');
        const icon = drawer.querySelector(':scope > .drawer-toggle .drawer-icon, #rightNavDrawerIcon');
        icon?.classList.remove('openIcon');
        icon?.classList.add('closedIcon');

        const opener = state.opener;
        this.characterModalState = null;
        if (opener?.isConnected) requestAnimationFrame(() => opener.focus?.({ preventScroll: true }));
    }

    async openCharacterModal() {
        if (this.isCharacterModalOpen()) return true;
        if (this.isBackgroundModalOpen()) await this.closeBackgroundModal({ restoreFocus: false });
        if (this.isLorebookModalOpen()) await this.closeLorebookModal({ restoreFocus: false });

        // Characters owns the baseline state for Character Management. Any child
        // workflow (Create, Edit, or future native subviews) may leave the native
        // panel in a detail state when it closes; normalize only when Characters
        // is opened instead of duplicating the same reset in every child modal.
        if (this.isCharacterCreateModalOpen()) {
            await this.closeCharacterCreateModal({ restoreFocus: false });
        }
        await this.ensureNativeCharacterLibraryView();
        this.invalidateCharacterTagUsageCache();

        const root = this.ensureCharacterModalRoot();
        if (!this.mountCharacterDrawer(root)) {
            console.warn('[NastyTavern] Character modal failed to mount native Character Management.');
            this.toast(t('Could not open Characters.'));
            return false;
        }

        this.chatToolbar?.toggleHistory?.(false);
        document.body?.classList.add('nt-character-modal-open');
        showModalShell(root);
        requestAnimationFrame(() => {
            root.querySelector('.nt-modal-close')?.focus?.({ preventScroll: true });
        });
        this.syncCharacterFavoriteState();
        this.homeDashboard?.sync({ view: this.currentView });
        return true;
    }

    closeCharacterModal() {
        const root = this.characterModalRoot || document.querySelector('#nt-character-modal');
        hideModalShell(root);
        this.restoreCharacterDrawer();
        document.body?.classList.remove('nt-character-modal-open');
        this.homeDashboard?.sync({ view: this.currentView });
    }

    syncCharacterModalState() {
        if (!this.isCharacterModalOpen()) return;
        const state = this.characterModalState;
        if (!state?.drawer?.isConnected || !state?.panel?.isConnected) this.closeCharacterModal();
    }

    async cleanupCharacterModal() {
        await this.closeGroupModal({ restoreFocus: false, reopenCharacters: false });
        this.groupModalRoot?.remove();
        this.groupModalRoot = null;
        document.querySelector('#nt-group-modal')?.remove();
        this.closeCharacterDialogueExamplesPopup();
        await this.closeCharacterCreateModal({ restoreFocus: false });
        await this.ensureNativeCharacterLibraryView();
        this.characterCreateModalRoot?.remove();
        this.characterCreateModalRoot = null;
        document.querySelector('#nt-character-create-modal')?.remove();
        this.restoreCharacterDrawer();
        this.characterModalRoot?.remove();
        this.characterModalRoot = null;
        document.querySelector('#nt-character-modal')?.remove();
        document.body?.classList.remove('nt-character-modal-open', 'nt-character-create-modal-open');
    }

    ensureCharacterCreateModalRoot() {
        let root = this.characterCreateModalRoot;
        if (!root?.isConnected) root = document.querySelector('#nt-character-create-modal');
        if (!root) {
            ({ root } = createModalShell({
                id: 'nt-character-create-modal',
                title: t('Create Character'),
                icon: icons.characters,
                size: 'large',
                modalClass: 'nt-character-create-modal',
                headerClass: 'nt-character-create-header',
                bodyClass: 'nt-character-create-modal-body',
                bodyAttrs: { 'data-nt-character-create-host': '' },
                leadingHtml: `<button type="button" class="nt-modal-close nt-character-create-back" data-nt-character-create-back title="${t('Back to Characters')}" aria-label="${t('Back to Characters')}">${icons.arrowLeft}</button>`,
                headerActionsHtml: `<button type="button" class="nt-panel-toggle nt-character-create-identity-toggle" data-nt-character-create-identity-toggle aria-expanded="true" title="${t('Hide character identity')}" aria-label="${t('Hide character identity')}">${icons.panel}</button>`,
                closeAttrs: { 'data-nt-character-create-close': '' },
            }));
            root.querySelector('.nt-modal-header-actions')?.classList.add('nt-character-create-header-actions');

            root.addEventListener('click', event => {
                if (event.target.closest('[data-nt-character-create-back]')) {
                    void this.returnToCharacterModal();
                    return;
                }
                if (event.target.closest('[data-nt-character-create-identity-toggle]')) {
                    this.toggleCharacterCreateIdentity();
                    return;
                }
                if (event.target.closest('[data-nt-character-create-close]')) void this.closeCharacterCreateModal();
            });
            document.body.append(root);
        }

        this.characterCreateModalRoot = root;
        return root;
    }

    isCharacterCreateModalOpen() {
        const root = this.characterCreateModalRoot || document.querySelector('#nt-character-create-modal');
        return Boolean(root && !root.hidden && root.classList.contains('is-open'));
    }

    mountCharacterCreateDrawer(root) {
        const drawer = this.characterModalDrawer();
        const panel = this.characterModalPanel();
        const host = root?.querySelector('[data-nt-character-create-host]');
        if (!drawer || !panel || !host) return false;

        const placeholder = document.createComment('NastyTavern Create Character drawer');
        const parent = drawer.parentNode;
        if (!parent) return false;
        parent.insertBefore(placeholder, drawer);
        this.characterCreateModalState = {
            drawer,
            panel,
            placeholder,
            drawerClass: drawer.getAttribute('class'),
            drawerStyle: drawer.getAttribute('style'),
            panelClass: panel.getAttribute('class'),
            panelStyle: panel.getAttribute('style'),
            panelHidden: panel.hidden,
            opener: document.activeElement instanceof HTMLElement ? document.activeElement : null,
        };

        drawer.classList.add('nt-character-create-modal-drawer');
        panel.classList.add('nt-character-create-modal-native');
        panel.classList.remove('closedDrawer');
        panel.classList.add('openDrawer');
        panel.hidden = false;
        host.append(drawer);
        return true;
    }

    restoreCharacterCreateDrawer({ restoreFocus = true } = {}) {
        const state = this.characterCreateModalState;
        if (!state) return;
        const { drawer, panel, placeholder } = state;

        if (placeholder?.parentNode) {
            placeholder.parentNode.insertBefore(drawer, placeholder);
            placeholder.remove();
        }

        if (state.drawerClass == null) drawer.removeAttribute('class');
        else drawer.setAttribute('class', state.drawerClass);
        if (state.drawerStyle == null) drawer.removeAttribute('style');
        else drawer.setAttribute('style', state.drawerStyle);
        if (state.panelClass == null) panel.removeAttribute('class');
        else panel.setAttribute('class', state.panelClass);
        if (state.panelStyle == null) panel.removeAttribute('style');
        else panel.setAttribute('style', state.panelStyle);
        panel.hidden = state.panelHidden;

        panel.classList.remove('openDrawer');
        panel.classList.add('closedDrawer');
        const icon = drawer.querySelector(':scope > .drawer-toggle .drawer-icon, #rightNavDrawerIcon');
        icon?.classList.remove('openIcon');
        icon?.classList.add('closedIcon');

        const opener = state.opener;
        this.characterCreateModalState = null;
        if (restoreFocus && opener?.isConnected) requestAnimationFrame(() => opener.focus?.({ preventScroll: true }));
    }

    isMoonlitEchoesActive() {
        const markers = document.querySelectorAll([
            'link[href*="moonlit" i]',
            'script[src*="moonlit" i]',
            'style[data-extension-name*="moonlit" i]',
            '[data-extension-name*="moonlit" i]',
            '[data-extension*="moonlit" i]',
            '[id*="moonlit" i]',
            '[class*="moonlit" i]',
        ].join(','));

        return [...markers].some(marker => {
            if (!(marker instanceof Element)) return false;
            const id = String(marker.id || '').toLowerCase();
            const classes = [...(marker.classList || [])].map(value => String(value).toLowerCase());
            const href = String(marker.getAttribute?.('href') || marker.getAttribute?.('src') || '').toLowerCase();
            const extensionName = String(marker.getAttribute?.('data-extension-name') || marker.getAttribute?.('data-extension') || '').toLowerCase();

            if (href.includes('moonlit') || extensionName.includes('moonlit')) return true;
            if (id.includes('moonlit') && !id.startsWith('nt-')) return true;
            return classes.some(value => value.includes('moonlit') && !value.startsWith('nt-moonlit'));
        });
    }

    prepareCharacterCreateActions(panel) {
        this.restoreCharacterCreateActions();
        const form = panel?.querySelector('#form_create');
        const source = panel?.querySelector('#rm_ch_create_block .form_create_bottom_buttons_block');
        if (!form || !source) return false;

        const root = this.characterCreateModalRoot || document.querySelector('#nt-character-create-modal');
        const isEdit = root?.dataset.ntCharacterEditorMode === 'edit';
        const useDetachedActionSlot = this.isMoonlitEchoesActive();
        let actionSlot = null;

        // Preserve NastyTavern's normal Character editor DOM exactly when no
        // conflicting drawer theme is active. Moonlit Echoes needs the native
        // action controls detached from the drawer geometry, so create the
        // compatibility slot only for that runtime condition and remove it on
        // close. This keeps the standard identity/main-tab layout unchanged.
        if (useDetachedActionSlot) {
            const modal = root?.querySelector('.nt-character-create-modal');
            const body = root?.querySelector('[data-nt-character-create-host]');
            if (!modal || !body) return false;
            actionSlot = document.createElement('div');
            actionSlot.className = 'nt-character-create-action-slot';
            actionSlot.dataset.ntCharacterActionSlot = '';
            actionSlot.setAttribute('role', 'toolbar');
            actionSlot.setAttribute('aria-label', t('Character actions'));
            modal.insertBefore(actionSlot, body);
            root.classList.add('nt-moonlit-character-editor');
        } else {
            root?.classList.remove('nt-moonlit-character-editor');
        }

        const toolbar = document.createElement('div');
        toolbar.className = 'nt-character-create-actions';
        if (isEdit) toolbar.classList.add('is-edit-actions');
        const moved = [];

        const moveAction = node => {
            if (!(node instanceof HTMLElement)) return;
            moved.push({
                node,
                parent: node.parentNode,
                nextSibling: node.nextSibling,
                hadNastyActionClass: node.classList.contains('nt-character-create-action-item'),
            });
            node.classList.add('nt-character-create-action-item');
            toolbar.append(node);
        };

        if (isEdit) {
            // Edit Character deliberately exposes only the seven high-value native
            // actions requested by NastyTavern. Moving the original SillyTavern
            // nodes preserves their handlers, state and compatibility.
            const actions = [
                source.querySelector('#favorite_button'),
                source.querySelector('#world_button'),
                source.querySelector('.chat_lorebook_button'),
                source.querySelector('#char_connections_button'),
                source.querySelector('#export_button'),
                source.querySelector('#dupe_button'),
                source.querySelector('#delete_button'),
            ];
            actions.forEach(moveAction);
        } else {
            const excluded = new Set([
                'rm_button_back',
                'favorite_button',
                'advanced_div',
                'char_connections_button',
                'export_button',
                'dupe_button',
                'delete_button',
            ]);

            for (const node of Array.from(source.children)) {
                if (!(node instanceof HTMLElement)) continue;
                if (
                    node.matches('input[type="hidden"]')
                    || excluded.has(node.id)
                    || node.classList.contains('chat_lorebook_button')
                ) continue;
                moveAction(node);
            }
        }

        if (!moved.length) return false;

        if (isEdit) {
            const shareButton = document.createElement('button');
            shareButton.type = 'button';
            shareButton.className = 'nt-native-community-share nt-native-community-share-character';
            shareButton.dataset.ntShareCharacterCommunity = '1';
            shareButton.innerHTML = `${icons.community}<span>${t('Share to Community')}</span>`;
            shareButton.title = t('Share this Character Card to Community');
            shareButton.setAttribute('aria-label', shareButton.title);
            shareButton.addEventListener('click', async event => {
                event.preventDefault();
                event.stopPropagation();
                if (shareButton.disabled) return;
                shareButton.disabled = true;
                try {
                    await this.communityChat?.shareCurrentCharacterCard?.({ signedOutAuthMode: 'signup' });
                } catch (error) {
                    this.toast(error?.message || t('Could not share this Character Card.'));
                } finally {
                    if (shareButton.isConnected) shareButton.disabled = false;
                }
            });
            toolbar.prepend(shareButton);
        }

        // Reuse SillyTavern's native total/permanent token counters. Moving the
        // original node keeps the native updater connected to the same IDs and
        // avoids maintaining a parallel token-counting implementation.
        const tokenSummary = panel?.querySelector('#result_info_text') || document.querySelector('#result_info_text');
        let tokenSummaryPlaceholder = null;
        let tokenSummaryHadClass = false;
        if (tokenSummary?.parentNode) {
            tokenSummaryPlaceholder = document.createComment('NastyTavern Character token summary');
            tokenSummary.parentNode.insertBefore(tokenSummaryPlaceholder, tokenSummary);
            tokenSummaryHadClass = tokenSummary.classList.contains('nt-character-token-summary');
            tokenSummary.classList.add('nt-character-token-summary');
            toolbar.append(tokenSummary);
        }

        let deleteEventSource = null;
        let deleteEventType = null;
        let onCharacterDeleted = null;
        if (isEdit) {
            const context = window.SillyTavern?.getContext?.();
            const editedCharacter = context?.characters?.[context?.characterId];
            deleteEventSource = context?.eventSource || null;
            deleteEventType = context?.event_types?.CHARACTER_DELETED || context?.eventTypes?.CHARACTER_DELETED || null;

            if (deleteEventSource && deleteEventType) {
                const editedAvatar = editedCharacter?.avatar;
                onCharacterDeleted = payload => {
                    const deletedAvatar = payload?.character?.avatar;
                    if (editedAvatar && deletedAvatar && deletedAvatar !== editedAvatar) return;

                    // CHARACTER_DELETED is emitted by SillyTavern only after the
                    // confirmation has been accepted and the delete succeeded.
                    // Defer navigation so SillyTavern can finish its own UI cleanup first.
                    setTimeout(() => {
                        if (this.characterCreateModalRoot?.dataset.ntCharacterEditorMode !== 'edit') return;
                        void this.returnToCharacterModal();
                    }, 0);
                };
                deleteEventSource.on(deleteEventType, onCharacterDeleted);
            }
        }

        if (useDetachedActionSlot) actionSlot.replaceChildren(toolbar);
        else form.insertBefore(toolbar, form.firstChild);

        source.classList.add('nt-character-create-native-actions');
        this.characterCreateActionState = {
            toolbar,
            source,
            moved,
            actionSlot,
            useDetachedActionSlot,
            tokenSummary,
            tokenSummaryPlaceholder,
            tokenSummaryHadClass,
            deleteEventSource,
            deleteEventType,
            onCharacterDeleted,
        };
        return true;
    }

    restoreCharacterCreateActions() {
        const state = this.characterCreateActionState;
        if (!state) return;
        const {
            toolbar,
            source,
            moved,
            actionSlot,
            useDetachedActionSlot,
            tokenSummary,
            tokenSummaryPlaceholder,
            tokenSummaryHadClass,
            deleteEventSource,
            deleteEventType,
            onCharacterDeleted,
        } = state;

        if (deleteEventSource && deleteEventType && onCharacterDeleted) {
            deleteEventSource.removeListener?.(deleteEventType, onCharacterDeleted);
        }

        if (tokenSummary && tokenSummaryPlaceholder?.parentNode) {
            tokenSummaryPlaceholder.parentNode.insertBefore(tokenSummary, tokenSummaryPlaceholder);
            tokenSummaryPlaceholder.remove();
            if (!tokenSummaryHadClass) tokenSummary.classList.remove('nt-character-token-summary');
        }

        for (const item of [...moved].reverse()) {
            const { node, parent, nextSibling, hadNastyActionClass } = item;
            if (!node?.isConnected && !toolbar?.contains(node)) continue;
            if (nextSibling?.parentNode === parent) parent.insertBefore(node, nextSibling);
            else parent.append(node);
            if (!hadNastyActionClass) node.classList.remove('nt-character-create-action-item');
        }

        source?.classList.remove('nt-character-create-native-actions');
        toolbar?.remove();
        if (useDetachedActionSlot) actionSlot?.remove();
        (this.characterCreateModalRoot || document.querySelector('#nt-character-create-modal'))
            ?.classList.remove('nt-moonlit-character-editor');
        this.characterCreateActionState = null;
    }

    setCharacterCreateIdentityHidden(hidden) {
        const root = this.characterCreateModalRoot || document.querySelector('#nt-character-create-modal');
        const modal = root?.querySelector('.nt-character-create-modal');
        const toggle = root?.querySelector('[data-nt-character-create-identity-toggle]');
        if (!modal || !toggle) return;
        const isHidden = Boolean(hidden);
        modal.classList.toggle('is-identity-hidden', isHidden);
        toggle.setAttribute('aria-expanded', String(!isHidden));
        toggle.title = t(isHidden ? 'Show character identity' : 'Hide character identity');
        toggle.setAttribute('aria-label', toggle.title);
    }

    toggleCharacterCreateIdentity() {
        const root = this.characterCreateModalRoot || document.querySelector('#nt-character-create-modal');
        const modal = root?.querySelector('.nt-character-create-modal');
        if (!modal) return;
        this.setCharacterCreateIdentityHidden(!modal.classList.contains('is-identity-hidden'));
    }

    characterDialogueExamplesField() {
        return this.characterModalPanel()?.querySelector('#mes_example_textarea') || document.querySelector('#mes_example_textarea');
    }

    parseCharacterDialogueExamples(value) {
        const raw = String(value || '').replace(/\r\n?/g, '\n').trim();
        if (!raw) return [];
        if (!/^\s*<START>\s*$/m.test(raw)) return [raw.replace(/^\s*<START>\s*\n?/, '').trim()].filter(Boolean);
        return raw
            .split(/(?:^|\n)\s*<START>\s*(?=\n|$)/)
            .map(item => item.trim())
            .filter(Boolean);
    }

    serializeCharacterDialogueExamples(examples) {
        return (Array.isArray(examples) ? examples : [])
            .map(value => String(value ?? '').replace(/\r\n?/g, '\n').trim())
            .map(value => value.replace(/^\s*<START>\s*\n?/, '').trim())
            .filter(Boolean)
            .map(value => `<START>\n${value}`)
            .join('\n');
    }

    characterCreateSelectedTagNames(panel) {
        const tagList = panel?.querySelector('#tagList');
        if (!tagList) return [];

        const context = window.SillyTavern?.getContext?.();
        const globalTags = Array.isArray(context?.tags) ? context.tags : [];
        const namesById = new Map(globalTags
            .map(tag => [String(tag?.id ?? ''), String(tag?.name ?? tag?.label ?? '').trim()])
            .filter(([id, name]) => id && name));
        const names = [];
        const seen = new Set();

        for (const node of tagList.querySelectorAll('.tag')) {
            const id = String(node.getAttribute('id') || node.dataset?.tagId || '').trim();
            const fallback = String(
                node.dataset?.tagName
                || node.getAttribute('data-tag-name')
                || node.querySelector?.('.tag_name, .tag-name, [data-tag-name]')?.textContent
                || node.textContent
                || ''
            ).replace(/[×✕]+\s*$/, '').trim();
            const name = namesById.get(id) || fallback;
            const key = name.toLocaleLowerCase();
            if (!name || seen.has(key)) continue;
            seen.add(key);
            names.push(name);
        }

        return names;
    }


    prepareCharacterCreateSubmission(panel) {
        this.restoreCharacterCreateSubmission();
        const form = panel?.querySelector('#form_create');
        if (!(form instanceof HTMLFormElement)) return false;

        let pendingNtUuid = '';

        const onFormData = event => {
            if (!this.isCharacterCreateModalOpen()) return;
            const actionType = form.getAttribute('actiontype');
            const isCreate = actionType === 'createcharacter';
            const isEdit = actionType === 'editcharacter'
                && this.characterCreateModalRoot?.dataset.ntCharacterEditorMode === 'edit';
            if (!isCreate && !isEdit) return;
            const formData = event.formData;
            if (!(formData instanceof FormData)) return;

            if (isEdit) {
                this.syncCharacterEditJsonData(panel, formData);
                return;
            }

            const nativeExamples = this.characterDialogueExamplesField()?.value || '';
            const examples = Array.isArray(this.characterDialogueExamplesDraft)
                ? this.characterDialogueExamplesDraft
                : this.parseCharacterDialogueExamples(nativeExamples);
            formData.set('mes_example', this.serializeCharacterDialogueExamples(examples));

            // Mirror the selected library tags into the native character-card tags field.
            const selectedTags = this.characterCreateSelectedTagNames(panel);
            formData.set('tags', selectedTags.join(','));

            const description = this.characterCreateModalRoot?.querySelector('[data-nt-character-description]')?.value ?? '';
            const context = this.characterCreateModalRoot?.querySelector('[data-nt-character-context]')?.value ?? '';
            const rawJsonData = formData.get('json_data');
            let jsonData = {};
            if (typeof rawJsonData === 'string' && rawJsonData.trim()) {
                try {
                    const parsed = JSON.parse(rawJsonData);
                    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) jsonData = parsed;
                } catch (error) {
                    console.warn('[NastyTavern] Could not parse native character JSON data before creation; preserving NastyTavern metadata in a fresh payload.', error);
                }
            }
            if (!jsonData.data || typeof jsonData.data !== 'object' || Array.isArray(jsonData.data)) jsonData.data = {};
            jsonData.tags = [...selectedTags];

            if (!pendingNtUuid) pendingNtUuid = crypto.randomUUID();
            const account = this.communityChat?.getAccountSnapshot?.();
            const ntCreator = account?.signedIn && account?.username
                ? String(account.username).trim()
                : 'unknown';
            // NastyTavern modifies these values after SillyTavern has built json_data,
            // so mirror them into data before hashing the complete data object.
            jsonData.data.nt_description = String(description);
            jsonData.data.nt_contexte = String(context);
            jsonData.data.tags = [...selectedTags];
            jsonData.data.mes_example = this.serializeCharacterDialogueExamples(examples);

            jsonData.nt_uuid = pendingNtUuid;
            jsonData.nt_creator = ntCreator || 'unknown';
            jsonData.nt_sha = ntSha256Hex(JSON.stringify(ntCanonicalize(jsonData.data)));

            formData.set('json_data', JSON.stringify(jsonData));
        };

        let successObserver = null;
        let successTimeout = null;
        let transitionPending = false;

        const stopWatchingForSuccess = () => {
            successObserver?.disconnect();
            successObserver = null;
            if (successTimeout) clearTimeout(successTimeout);
            successTimeout = null;
        };

        const nativeCreateReturnedToLibrary = createBlock => Boolean(
            createBlock
            && (createBlock.hidden || createBlock.style.display === 'none')
        );

        const transitionToCharacters = async () => {
            if (transitionPending || !this.isCharacterCreateModalOpen()) return;
            const createBlock = panel?.querySelector('#rm_ch_create_block');
            if (!nativeCreateReturnedToLibrary(createBlock)) return;

            transitionPending = true;
            stopWatchingForSuccess();
            try {
                // SillyTavern writes display:none inline on rm_ch_create_block only
                // after a successful create request, tag mapping, character reload,
                // and select_rm_info('char_create'). Our modal CSS may override that
                // in computed styles, so the native inline state is the reliable
                // lifecycle signal here.
                await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
                if (!this.isCharacterCreateModalOpen()) return;
                await this.closeCharacterCreateModal({ restoreFocus: false });
                await this.openCharacterModal();
            } finally {
                transitionPending = false;
            }
        };

        const onSubmit = () => {
            if (!this.isCharacterCreateModalOpen()) return;
            if (form.getAttribute('actiontype') !== 'createcharacter') return;
            const createBlock = panel?.querySelector('#rm_ch_create_block');
            if (!createBlock) return;

            stopWatchingForSuccess();
            successObserver = new MutationObserver(() => {
                if (nativeCreateReturnedToLibrary(createBlock)) void transitionToCharacters();
            });
            successObserver.observe(createBlock, {
                attributes: true,
                attributeFilter: ['style', 'hidden'],
            });

            // Cover a synchronous/native transition that happens before the
            // observer callback is delivered.
            queueMicrotask(() => {
                if (nativeCreateReturnedToLibrary(createBlock)) void transitionToCharacters();
            });

            // A failed/invalid creation leaves the native create block active.
            successTimeout = setTimeout(stopWatchingForSuccess, 30000);
        };

        form.addEventListener('formdata', onFormData);
        form.addEventListener('submit', onSubmit);
        this.characterCreateSubmissionState = {
            form,
            onFormData,
            onSubmit,
            stopWatchingForSuccess,
        };
        return true;
    }

    restoreCharacterCreateSubmission() {
        const state = this.characterCreateSubmissionState;
        if (!state) return;
        state.form?.removeEventListener('formdata', state.onFormData);
        state.form?.removeEventListener('submit', state.onSubmit);
        state.stopWatchingForSuccess?.();
        this.characterCreateSubmissionState = null;
    }

    closeCharacterDialogueExamplesPopup() {
        const popup = this.characterDialogueExamplesPopup;
        this.characterDialogueExamplesPopup = null;
        if (!popup) return;
        try { void popup.completeCancelled?.(); } catch { /* SillyTavern may already be closing it. */ }
    }

    async openCharacterDialogueExamplesPopup() {
        if (this.characterDialogueExamplesPopup) return true;
        const field = this.characterDialogueExamplesField();
        const context = window.SillyTavern?.getContext?.();
        const popupType = context?.POPUP_TYPE?.TEXT ?? context?.POPUP_TYPE?.DISPLAY;
        if (!field || !context?.Popup || popupType == null) {
            this.toast(t('Could not open dialogue examples.'));
            return false;
        }

        const examples = Array.isArray(this.characterDialogueExamplesDraft)
            ? this.characterDialogueExamplesDraft
            : (this.characterDialogueExamplesDraft = this.parseCharacterDialogueExamples(field.value));
        const content = document.createElement('div');
        // Deliberately reuse the native Alternate Greetings structure/classes so
        // both editors inherit the exact same SillyTavern layout and controls.
        content.className = 'alternate_grettings flexFlowColumn flex-container nt-character-dialogue-popup';
        content.innerHTML = `
            <div class="title_restorable">
                <h3><span>${t('Examples of dialogue')}</span></h3>
                <div class="menu_button menu_button_icon nt-character-dialogue-add" data-nt-dialogue-example-add title="${t('Add')}" aria-label="${t('Add')}">
                    <i class="fa-solid fa-plus" aria-hidden="true"></i>
                    <span>${t('Add')}</span>
                </div>
            </div>
            <small class="justifyLeft">${t('Dialogue examples show how the character speaks, responds, and interacts. They help the model reproduce the character’s tone and conversational style.')}</small>
            <hr>
            <div class="alternate_greetings_list flexFlowColumn flex-container wide100p" data-nt-dialogue-example-list></div>`;
        const list = content.querySelector('[data-nt-dialogue-example-list]');

        const render = () => {
            if (!list) return;
            if (!examples.length) {
                list.innerHTML = `
                    <strong class="alternate_grettings_hint margin-bot-10px">
                        <span>${t('Click the')}</span> <i class="fa-solid fa-plus" aria-hidden="true"></i> <span>${t('button to get started!')}</span>
                    </strong>`;
                return;
            }

            list.innerHTML = examples.map((value, index) => `
                <div class="alternate_greeting" data-nt-dialogue-example-row="${index}">
                    <details open>
                        <summary>
                            <div class="title_restorable">
                                <strong><span>${t('Example')} #</span><span class="greeting_index">${index + 1}</span></strong>
                                <div class="menu_button menu_button_icon nt-character-dialogue-remove" data-nt-dialogue-example-remove="${index}" title="${t('Delete')}" aria-label="${t('Delete')}">
                                    <i class="fa-solid fa-trash-alt" aria-hidden="true"></i>
                                    <span>${t('Delete')}</span>
                                </div>
                            </div>
                        </summary>
                        <textarea name="dialogue_examples" class="text_pole textarea_compact alternate_greeting_text mdHotkeys" autocomplete="off" rows="12" data-nt-dialogue-example-input="${index}" placeholder="${t('Examples of chat dialogue')}"></textarea>
                    </details>
                </div>`).join('');

            list.querySelectorAll('[data-nt-dialogue-example-input]').forEach(textarea => {
                const index = Number(textarea.dataset.ntDialogueExampleInput);
                textarea.value = examples[index] || '';
            });
        };

        const addExample = () => {
            examples.push('');
            render();
            requestAnimationFrame(() => list?.querySelector('[data-nt-dialogue-example-row]:last-child [data-nt-dialogue-example-input]')?.focus?.());
        };

        content.addEventListener('input', event => {
            const textarea = event.target.closest?.('[data-nt-dialogue-example-input]');
            if (!textarea) return;
            const index = Number(textarea.dataset.ntDialogueExampleInput);
            if (!Number.isInteger(index) || index < 0 || index >= examples.length) return;
            examples[index] = textarea.value;
        });
        content.addEventListener('click', event => {
            const add = event.target.closest?.('[data-nt-dialogue-example-add]');
            if (add) {
                addExample();
                return;
            }
            const remove = event.target.closest?.('[data-nt-dialogue-example-remove]');
            if (!remove) return;
            event.preventDefault();
            event.stopPropagation();
            const index = Number(remove.dataset.ntDialogueExampleRemove);
            if (!Number.isInteger(index) || index < 0 || index >= examples.length) return;
            examples.splice(index, 1);
            render();
        });

        render();
        let popup;
        const options = {
            wide: true,
            large: true,
            allowVerticalScrolling: true,
            onClose: async () => {
                if (this.characterDialogueExamplesPopup === popup) this.characterDialogueExamplesPopup = null;
            },
        };
        popup = new context.Popup(content, popupType, '', options);
        this.characterDialogueExamplesPopup = popup;
        try {
            await popup.show();
        } finally {
            if (this.characterDialogueExamplesPopup === popup) this.characterDialogueExamplesPopup = null;
        }
        return true;
    }

    setCharacterCreateTab(tabId) {
        const state = this.characterCreateTabState;
        if (!state?.tabsRoot) return;
        const requested = state.panels.has(tabId) ? tabId : 'profile';
        state.active = requested;
        for (const [id, panel] of state.panels) panel.hidden = id !== requested;
        for (const button of state.tabsRoot.querySelectorAll('[data-nt-character-create-tab]')) {
            const active = button.dataset.ntCharacterCreateTab === requested;
            button.classList.toggle('is-active', active);
            button.setAttribute('aria-selected', String(active));
            button.tabIndex = active ? 0 : -1;
        }
    }

    prepareCharacterCreateTabs(panel, main) {
        this.restoreCharacterCreateTabs();
        if (!panel || !main) return false;

        const description = panel.querySelector('#descriptionWrapper') || panel.querySelector('#description_textarea')?.parentElement;
        const firstMessage = panel.querySelector('#firstMessageWrapper') || panel.querySelector('#firstmessage_textarea')?.parentElement;
        const personality = document.querySelector('#personality_div');
        const scenario = document.querySelector('#scenario_div');
        const examples = document.querySelector('#mes_example_div');
        const promptContent = document.querySelector('#system_prompt_textarea')?.closest('.inline-drawer-content');
        const characterNote = document.querySelector('#depth_prompt_div');
        const talkativeness = document.querySelector('#talkativeness_div');

        if (!description || !firstMessage || !personality || !scenario || !examples || !promptContent || !characterNote || !talkativeness) {
            console.warn('[NastyTavern] Create Character tabs could not find every native field; keeping the native main layout.');
            return false;
        }

        const tabsRoot = document.createElement('div');
        tabsRoot.className = 'nt-character-create-tabs';
        tabsRoot.innerHTML = `
            <div class="nt-character-create-tablist" role="tablist" aria-label="${t('Character editor sections')}">
                <button type="button" role="tab" data-nt-character-create-tab="profile" aria-controls="nt-character-tab-profile">${t('Profile')}</button>
                <button type="button" role="tab" data-nt-character-create-tab="opening" aria-controls="nt-character-tab-opening">${t('Opening')}</button>
                <button type="button" role="tab" data-nt-character-create-tab="behavior" aria-controls="nt-character-tab-behavior">${t('Behavior')}</button>
            </div>
            <div class="nt-character-create-tab-panels">
                <section id="nt-character-tab-profile" class="nt-character-create-tab-panel" data-nt-character-create-panel="profile" role="tabpanel"></section>
                <section id="nt-character-tab-opening" class="nt-character-create-tab-panel" data-nt-character-create-panel="opening" role="tabpanel" hidden>
                    <div class="nt-character-create-context-block">
                        <div class="nt-character-create-context-heading nt-character-field-heading flex-container alignItemsBaseline">
                            <span>${t('Context')}</span>
                            <i class="editor_maximize fa-solid fa-maximize right_menu_button" data-for="nt_character_context_textarea" title="${t('Expand the editor')}" aria-label="${t('Expand the editor')}" role="button" tabindex="0"></i>
                        </div>
                        <textarea id="nt_character_context_textarea" class="nt-character-create-context-field" data-nt-character-context rows="5" placeholder="${t('Context for the opening message')}"></textarea>
                    </div>
                </section>
                <section id="nt-character-tab-behavior" class="nt-character-create-tab-panel" data-nt-character-create-panel="behavior" role="tabpanel" hidden>
                    <div data-nt-character-prompt-overrides></div>
                </section>
            </div>`;
        main.append(tabsRoot);

        const panels = new Map([
            ['profile', tabsRoot.querySelector('[data-nt-character-create-panel="profile"]')],
            ['opening', tabsRoot.querySelector('[data-nt-character-create-panel="opening"]')],
            ['behavior', tabsRoot.querySelector('[data-nt-character-create-panel="behavior"]')],
        ]);
        const promptHost = tabsRoot.querySelector('[data-nt-character-prompt-overrides]');
        const moved = [];
        const move = (node, target, label) => {
            if (!node?.parentNode || !target) return;
            const placeholder = document.createComment(`NastyTavern Create Character tab: ${label}`);
            node.parentNode.insertBefore(placeholder, node);
            target.append(node);
            moved.push({ node, placeholder });
        };

        move(description, panels.get('profile'), 'description');
        move(personality, panels.get('profile'), 'personality');
        move(scenario, panels.get('profile'), 'scenario');
        move(firstMessage, panels.get('opening'), 'first message');
        move(examples, panels.get('opening'), 'message examples');
        examples.classList.add('nt-character-dialogue-native-source');
        const dialogueLauncher = document.createElement('div');
        dialogueLauncher.className = 'nt-character-dialogue-launcher';
        dialogueLauncher.innerHTML = `
            <button type="button" class="menu_button" data-nt-character-dialogue-examples>${t('Examples of dialogue')}</button>`;
        examples.insertAdjacentElement('beforebegin', dialogueLauncher);
        move(promptContent, promptHost, 'prompt overrides');
        move(characterNote, panels.get('behavior'), "character's note");
        move(talkativeness, panels.get('behavior'), 'talkativeness');

        const onClick = event => {
            const dialogueExamples = event.target.closest('[data-nt-character-dialogue-examples]');
            if (dialogueExamples) {
                void this.openCharacterDialogueExamplesPopup();
                return;
            }
            const button = event.target.closest('[data-nt-character-create-tab]');
            if (!button) return;
            this.setCharacterCreateTab(button.dataset.ntCharacterCreateTab);
        };
        const onKeyDown = event => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            const buttons = Array.from(tabsRoot.querySelectorAll('[data-nt-character-create-tab]'));
            const current = buttons.indexOf(document.activeElement);
            if (current < 0) return;
            event.preventDefault();
            let next = current;
            if (event.key === 'ArrowLeft') next = (current - 1 + buttons.length) % buttons.length;
            if (event.key === 'ArrowRight') next = (current + 1) % buttons.length;
            if (event.key === 'Home') next = 0;
            if (event.key === 'End') next = buttons.length - 1;
            buttons[next]?.focus();
            this.setCharacterCreateTab(buttons[next]?.dataset.ntCharacterCreateTab);
        };
        tabsRoot.addEventListener('click', onClick);
        tabsRoot.addEventListener('keydown', onKeyDown);
        this.characterCreateTabState = { tabsRoot, panels, moved, onClick, onKeyDown, active: 'profile', examples, dialogueLauncher };
        this.setCharacterCreateTab('profile');
        return true;
    }

    restoreCharacterCreateTabs() {
        const state = this.characterCreateTabState;
        if (!state) return;
        this.closeCharacterDialogueExamplesPopup();
        state.examples?.classList.remove('nt-character-dialogue-native-source');
        state.tabsRoot?.removeEventListener('click', state.onClick);
        state.tabsRoot?.removeEventListener('keydown', state.onKeyDown);
        for (const item of [...state.moved].reverse()) {
            if (item.placeholder?.parentNode) item.placeholder.parentNode.insertBefore(item.node, item.placeholder);
            item.placeholder?.remove();
        }
        state.tabsRoot?.remove();
        this.characterCreateTabState = null;
    }

    normalizeCharacterCreateFieldHeadings(panel) {
        this.restoreCharacterCreateFieldHeadings();
        if (!panel) return;

        const state = [];
        const stripMarkdownPrefix = root => {
            if (!root) return;
            const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
            let node;
            while ((node = walker.nextNode())) {
                if (!node.nodeValue?.trim()) continue;
                const cleaned = node.nodeValue.replace(/^(\s*)#{1,6}\s+/, '$1');
                if (cleaned !== node.nodeValue) node.nodeValue = cleaned;
                break;
            }
        };
        const mark = element => {
            if (!element) return null;
            const hadClass = element.classList.contains('nt-character-field-heading');
            element.classList.add('nt-character-field-heading');
            stripMarkdownPrefix(element);
            state.push({ type: 'class', element, hadClass });
            return element;
        };
        const normalize = element => {
            if (!element) return null;
            if (element.tagName !== 'H4') return mark(element);

            const replacement = document.createElement('div');
            for (const attribute of Array.from(element.attributes)) {
                replacement.setAttribute(attribute.name, attribute.value);
            }
            replacement.classList.add('nt-character-field-heading');
            while (element.firstChild) replacement.append(element.firstChild);
            element.replaceWith(replacement);
            stripMarkdownPrefix(replacement);
            state.push({ type: 'replace', original: element, replacement });
            return replacement;
        };
        const headingForField = selector => {
            const field = panel.querySelector(selector) || document.querySelector(selector);
            if (!field) return null;
            const block = field.parentElement;
            return block?.querySelector(':scope > h4') || block?.querySelector('h4');
        };

        // Identity metadata: all three native h4s become the same neutral field heading.
        normalize(headingForField('#creator_textarea'));
        normalize(headingForField('#creator_notes_textarea'));
        normalize(headingForField('#character_version_textarea'));

        // Profile tab.
        mark(panel.querySelector('#description_div') || document.querySelector('#description_div'));
        normalize((panel.querySelector('#personality_div') || document.querySelector('#personality_div'))?.querySelector(':scope > h4'));
        normalize((panel.querySelector('#scenario_div') || document.querySelector('#scenario_div'))?.querySelector(':scope > h4'));

        // Opening tab. Context already uses the shared primitive in our own markup.
        const firstMessageTitle = (panel.querySelector('#first_message_div') || document.querySelector('#first_message_div'))
            ?.querySelector(':scope > .flex-container, :scope > div');
        mark(firstMessageTitle);

        // Behavior tab.
        normalize(headingForField('#system_prompt_textarea'));
        normalize(headingForField('#post_history_instructions_textarea'));
        normalize(headingForField('#depth_prompt_prompt'));
        normalize((panel.querySelector('#talkativeness_div') || document.querySelector('#talkativeness_div'))?.querySelector(':scope > h4'));

        this.characterCreateHeadingState = state;
    }

    restoreCharacterCreateFieldHeadings() {
        const state = this.characterCreateHeadingState;
        if (!state) return;
        for (const item of [...state].reverse()) {
            if (item.type === 'replace') {
                const { original, replacement } = item;
                if (!replacement?.isConnected) continue;
                while (replacement.firstChild) original.append(replacement.firstChild);
                replacement.replaceWith(original);
            } else if (item.type === 'class' && item.element && !item.hadClass) {
                item.element.classList.remove('nt-character-field-heading');
            }
        }
        this.characterCreateHeadingState = null;
    }

    prepareCharacterCreateLayout(panel) {
        this.restoreCharacterCreateLayout();
        const form = panel?.querySelector('#form_create');
        const root = this.characterCreateModalRoot || document.querySelector('#nt-character-create-modal');
        const toolbar = form?.querySelector(':scope > .nt-character-create-actions')
            || root?.querySelector('[data-nt-character-action-slot] .nt-character-create-actions');
        const nativeNameInput = panel?.querySelector('#character_name_pole');
        const name = nativeNameInput?.closest('#name_div');
        const isEditMode = this.characterCreateModalRoot?.dataset.ntCharacterEditorMode === 'edit';
        const layoutName = isEditMode ? null : name;
        const avatar = panel?.querySelector('#avatar_div_div');
        const avatarControls = panel?.querySelector('#avatar_controls');
        const characterManagementLabel = panel?.querySelector('label[for="char-management-dropdown"]');
        const characterManagementSelect = panel?.querySelector('#char-management-dropdown');
        const characterManagementControl = characterManagementLabel || characterManagementSelect;
        const tags = panel?.querySelector('#tags_div');
        const nativeIdentity = panel?.querySelector('#avatar-and-name-block');
        const creatorField = document.querySelector('#creator_textarea');
        const creatorNotesField = document.querySelector('#creator_notes_textarea');
        const versionField = document.querySelector('#character_version_textarea');
        if (!form || !toolbar || !avatar || !tags || (!layoutName && !isEditMode)) return false;

        const moveNode = (node, target, label) => {
            if (!node?.parentNode) return null;
            const placeholder = document.createComment(`NastyTavern ${label}`);
            node.parentNode.insertBefore(placeholder, node);
            target.append(node);
            return { node, placeholder };
        };

        const workspace = document.createElement('div');
        workspace.className = 'nt-character-create-workspace';
        workspace.innerHTML = `
            <aside class="nt-character-create-identity" aria-label="${t('Character identity')}">
                <div class="nt-character-create-identity-top">
                    <div class="nt-character-create-avatar-column" data-nt-character-create-avatar></div>
                    <div class="nt-character-create-name" data-nt-character-create-name></div>
                </div>
                <textarea class="nt-character-create-description-field" data-nt-character-description rows="3" maxlength="180" placeholder="${t('Short description of the character')}"></textarea>
                <div class="nt-character-create-tags" data-nt-character-create-tags></div>
                <div class="nt-character-create-meta" data-nt-character-create-meta></div>
            </aside>
            <section class="nt-character-create-main" data-nt-character-create-main></section>`;
        // The visual editor workspace must always remain inside the native
        // character form. Moonlit Echoes gets a detached modal-owned action row,
        // but detaching the toolbar must never detach/reorder the identity column
        // or Profile/Opening/Behavior body. Keep the standard NastyTavern editor
        // layout as the single source of truth in both normal and Moonlit modes.
        if (toolbar.parentElement === form) toolbar.insertAdjacentElement('afterend', workspace);
        else form.insertBefore(workspace, form.firstChild);

        const avatarHost = workspace.querySelector('[data-nt-character-create-avatar]');
        const nameHost = workspace.querySelector('[data-nt-character-create-name]');
        const tagsHost = workspace.querySelector('[data-nt-character-create-tags]');
        if (isEditMode && nameHost) {
            const editNameField = document.createElement('div');
            editNameField.className = 'nt-character-edit-name-field';
            editNameField.innerHTML = `
                <input type="text" class="text_pole" data-nt-character-edit-name autocomplete="off" spellcheck="false" aria-label="${t('Character Name')}" placeholder="${t('Character Name')}">
                <button type="button" class="nt-character-convert-button" data-nt-character-convert hidden>${icons.logo}<span>${t('Convert for NastyTavern')}</span></button>`;
            editNameField.querySelector('[data-nt-character-convert]')?.addEventListener('click', () => {
                void this.convertCurrentCharacterForNasty(panel);
            });
            nameHost.append(editNameField);
        }
        const metaHost = workspace.querySelector('[data-nt-character-create-meta]');
        const main = workspace.querySelector('[data-nt-character-create-main]');
        const movedIdentity = [];
        const movedMain = [];

        const nativeFieldBlock = field => {
            if (!field) return null;
            const flexItem = field.closest('.flex1');
            if (flexItem && document.querySelector('#character_popup')?.contains(flexItem)) return flexItem;
            return field.parentElement;
        };

        for (const [node, target, label] of [
            [avatar, avatarHost, 'Create Character avatar'],
            [avatarControls, avatarHost, 'Create Character avatar controls'],
            [layoutName, nameHost, 'Create Character name'],
            [isEditMode ? characterManagementControl : null, nameHost, 'Edit Character More menu'],
            [tags, tagsHost, 'Create Character tags'],
        ]) {
            const moved = moveNode(node, target, label);
            if (moved) movedIdentity.push(moved);
        }
        nativeIdentity?.classList.add('nt-character-create-native-identity-source');

        // Edit Character keeps SillyTavern's native More… menu, but rename is
        // redundant because the name field above already uses native rename.
        // Hide only that option while mounted and restore it on close.
        const hiddenManagementOptions = [];
        if (isEditMode && characterManagementSelect) {
            for (const option of Array.from(characterManagementSelect.options || [])) {
                const signature = [
                    option.value,
                    option.textContent,
                    option.getAttribute('data-i18n'),
                    option.title,
                ].filter(Boolean).join(' ').toLocaleLowerCase();
                if (!signature.includes('rename')) continue;
                hiddenManagementOptions.push({ option, hidden: option.hidden, disabled: option.disabled });
                option.hidden = true;
                option.disabled = true;
            }
        }

        const creatorNotesBlock = nativeFieldBlock(creatorNotesField);
        const metadataBlocks = [creatorField, creatorNotesField, versionField]
            .map(nativeFieldBlock)
            .filter((node, index, list) => node && list.indexOf(node) === index);
        for (const [index, node] of metadataBlocks.entries()) {
            const moved = moveNode(node, metaHost, `Create Character metadata ${index + 1}`);
            if (moved) movedIdentity.push(moved);
        }

        // Keep exactly one fullscreen control beside Creator's Notes. Current
        // SillyTavern versions may already provide one, so reuse the native
        // control instead of adding a second icon. Older versions still get a
        // temporary native-style control while the field is mounted here.
        let creatorNotesExpand = null;
        let creatorNotesExpandAdded = false;
        let creatorNotesHeadingAddedFlex = false;
        const creatorNotesHiddenExpands = [];
        const creatorNotesHeading = creatorNotesBlock?.querySelector('h4');
        if (creatorNotesHeading && creatorNotesField) {
            if (!creatorNotesHeading.classList.contains('flex-container')) {
                creatorNotesHeading.classList.add('flex-container');
                creatorNotesHeadingAddedFlex = true;
            }
            if (!creatorNotesHeading.classList.contains('alignItemsBaseline')) {
                creatorNotesHeading.classList.add('alignItemsBaseline');
                creatorNotesHeading.dataset.ntAddedAlignBaseline = 'true';
            }

            const existingExpands = Array.from(creatorNotesHeading.querySelectorAll('.editor_maximize'));
            if (existingExpands.length) {
                creatorNotesExpand = existingExpands.at(-1);
                for (const duplicate of existingExpands.slice(0, -1)) {
                    creatorNotesHiddenExpands.push({ node: duplicate, hidden: duplicate.hidden });
                    duplicate.hidden = true;
                }
            } else {
                creatorNotesExpand = document.createElement('i');
                creatorNotesExpand.className = 'editor_maximize fa-solid fa-maximize right_menu_button';
                creatorNotesExpand.dataset.for = creatorNotesField.id;
                creatorNotesExpand.title = t('Expand the editor');
                creatorNotesExpand.setAttribute('aria-label', creatorNotesExpand.title);
                creatorNotesExpand.setAttribute('role', 'button');
                creatorNotesExpand.tabIndex = 0;
                creatorNotesHeading.append(creatorNotesExpand);
                creatorNotesExpandAdded = true;
            }
        }

        for (const node of Array.from(form.children)) {
            if (!(node instanceof HTMLElement)) continue;
            if (node === toolbar || node === workspace || node === nativeIdentity) continue;
            if (node.matches('input[type="hidden"]')) continue;
            const placeholder = document.createComment('NastyTavern Create Character main content');
            form.insertBefore(placeholder, node);
            main.append(node);
            movedMain.push({ node, placeholder });
        }

        this.characterCreateLayoutState = {
            workspace,
            nativeIdentity,
            movedIdentity,
            movedMain,
            creatorNotesExpand,
            creatorNotesExpandAdded,
            creatorNotesHiddenExpands,
            creatorNotesHeading,
            creatorNotesHeadingAddedFlex,
            hiddenManagementOptions,
        };
        this.prepareCharacterCreateTabs(panel, main);
        this.normalizeCharacterCreateFieldHeadings(panel);
        this.setCharacterCreateIdentityHidden(false);
        return true;
    }

    restoreCharacterCreateLayout() {
        const state = this.characterCreateLayoutState;
        if (!state) return;
        this.restoreCharacterCreateFieldHeadings();
        this.restoreCharacterCreateTabs();
        if (state.creatorNotesExpandAdded) state.creatorNotesExpand?.remove();
        for (const item of state.creatorNotesHiddenExpands || []) item.node.hidden = item.hidden;
        if (state.creatorNotesHeading) {
            if (state.creatorNotesHeadingAddedFlex) state.creatorNotesHeading.classList.remove('flex-container');
            if (state.creatorNotesHeading.dataset.ntAddedAlignBaseline === 'true') {
                state.creatorNotesHeading.classList.remove('alignItemsBaseline');
                delete state.creatorNotesHeading.dataset.ntAddedAlignBaseline;
            }
        }
        for (const item of [...state.movedMain].reverse()) {
            if (item.placeholder?.parentNode) item.placeholder.parentNode.insertBefore(item.node, item.placeholder);
            item.placeholder?.remove();
        }
        for (const item of state.hiddenManagementOptions || []) {
            item.option.hidden = item.hidden;
            item.option.disabled = item.disabled;
        }
        for (const item of [...state.movedIdentity].reverse()) {
            if (item.placeholder?.parentNode) item.placeholder.parentNode.insertBefore(item.node, item.placeholder);
            item.placeholder?.remove();
        }
        state.nativeIdentity?.classList.remove('nt-character-create-native-identity-source');
        state.workspace?.remove();
        this.characterCreateLayoutState = null;
    }

    async openCharacterCreateModal() {
        if (this.isCharacterCreateModalOpen()) return true;
        if (this.isLorebookModalOpen()) await this.closeLorebookModal({ restoreFocus: false });

        this.characterDialogueExamplesDraft = null;

        // Characters and Create Character are sibling modals: never stack them.
        if (this.isCharacterModalOpen()) this.closeCharacterModal();

        const root = this.ensureCharacterCreateModalRoot();
        this.setCharacterEditorMode('create');
        if (!this.mountCharacterCreateDrawer(root)) {
            console.warn('[NastyTavern] Create Character modal failed to mount native Character Management.');
            this.toast(t('Could not open Characters.'));
            return false;
        }

        const panel = this.characterModalPanel();
        const createButton = panel?.querySelector('#rm_button_create');
        if (!createButton) {
            this.restoreCharacterCreateDrawer({ restoreFocus: false });
            this.toast(t('Could not open Characters.'));
            return false;
        }

        createButton.click();
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

        const createBlock = panel.querySelector('#rm_ch_create_block');
        if (!createBlock) {
            this.restoreCharacterCreateDrawer({ restoreFocus: false });
            this.toast(t('Could not open Characters.'));
            return false;
        }

        this.prepareCharacterCreateActions(panel);
        this.prepareCharacterCreateLayout(panel);
        this.prepareCharacterCreateSubmission(panel);

        document.body?.classList.add('nt-character-create-modal-open');
        showModalShell(root);
        requestAnimationFrame(() => {
            const nameInput = createBlock.querySelector('#character_name_pole');
            (nameInput || root.querySelector('.nt-modal-close'))?.focus?.({ preventScroll: true });
        });
        this.syncCharacterFavoriteState();
        return true;
    }

    async ensureNativeCharacterLibraryView() {
        const panel = this.characterModalPanel();
        if (!panel) return;

        const groupBlock = panel.querySelector('#rm_group_chats_block');
        const groupVisible = (() => {
            if (!groupBlock?.isConnected || groupBlock.hidden) return false;
            const style = getComputedStyle(groupBlock);
            return style.display !== 'none' && style.visibility !== 'hidden';
        })();
        if (groupVisible) {
            panel.querySelector('#rm_button_back_from_group')?.click();
            await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        }

        const createBlock = panel.querySelector('#rm_ch_create_block');
        const isDetailViewVisible = () => {
            if (!createBlock?.isConnected || createBlock.hidden) return false;
            const style = getComputedStyle(createBlock);
            return style.display !== 'none' && style.visibility !== 'hidden';
        };

        if (!isDetailViewVisible()) return;

        // Use SillyTavern's own navigation to normalize Character Management before
        // the Characters modal is mounted. This single entry-point reset also covers
        // future Edit Character/detail modals that reuse the native character form.
        panel.querySelector('#rm_button_back')?.click();
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

        // Compatibility fallback for SillyTavern builds where Back does not fully
        // restore the character library.
        if (isDetailViewVisible()) {
            panel.querySelector('#rm_button_characters')?.click();
            await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        }
    }

    async closeCharacterCreateModal({ restoreFocus = true } = {}) {
        if (this.characterCreateClosePromise) return this.characterCreateClosePromise;

        this.characterCreateClosePromise = (async () => {
            this.closeCharacterDialogueExamplesPopup();
            this.characterDialogueExamplesDraft = null;
            const root = this.characterCreateModalRoot || document.querySelector('#nt-character-create-modal');
            hideModalShell(root);

            this.restoreCharacterEditLiveSave();
            this.restoreCharacterCreateSubmission();
            this.restoreCharacterCreateLayout();
            this.restoreCharacterCreateActions();
            this.restoreCharacterCreateDrawer({ restoreFocus });
            document.body?.classList.remove('nt-character-create-modal-open');
            this.homeDashboard?.sync({ view: this.currentView });
        })();

        try {
            await this.characterCreateClosePromise;
        } finally {
            this.characterCreateClosePromise = null;
        }
    }

    async returnToCharacterModal() {
        if (!this.isCharacterCreateModalOpen()) return false;
        await this.closeCharacterCreateModal({ restoreFocus: false });
        return this.openCharacterModal();
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
        if (this.thirdPartyWorkspaceAvailable(view)) {
            const surface = this.findThirdPartyWorkspaceSurface(view);
            if (surface && this.elementIsVisible(surface)) return true;
        }
        if (view === 'personas' && this.isPersonaModalOpen()) return true;
        if (view === 'backgrounds' && this.isBackgroundModalOpen()) return true;
        if (view === 'lorebooks' && this.isLorebookModalOpen()) return true;
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
        if (this.thirdPartyWorkspaceAvailable(this.currentView)) this.decorateThirdPartyWorkspace(this.currentView);
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

    setView(id, subtitle) {
        this.currentView = id;
        this.shell.setActive(id, subtitle);
        const connectionState = this.dom.getConnectionState();
        this.homeDashboard?.sync({
            view: id,
            connection: connectionState.label,
            character: this.dom.getCharacterName(),
            persona: this.dom.getPersonaName(),
        });
        requestAnimationFrame(() => localizeOwnedUI());
    }

    async navigate(id) {
        if (this.isGroupModalOpen()) await this.closeGroupModal({ restoreFocus: false, reopenCharacters: false });
        if (id !== 'personas' && this.isPersonaModalOpen()) await this.closePersonaModal({ restoreFocus: false });
        if (id !== 'backgrounds' && this.isBackgroundModalOpen()) await this.closeBackgroundModal({ restoreFocus: false });
        if (id !== 'lorebooks' && this.isLorebookModalOpen()) await this.closeLorebookModal({ restoreFocus: false });
        if (id !== 'extensions' && this.extensionsModal.isOpen()) await this.extensionsModal.close({ restoreFocus: false });
        if (id !== 'characters' && this.isCharacterModalOpen()) this.closeCharacterModal();
        if (id !== 'chat') {
            this.chatToolsHub.close();
        }
        switch (id) {
            case 'chat':
                this.dom.closeNativeDrawers();
                this.dom.focusChat();
                this.setView('chat');
                break;
            case 'characters':
                return this.openCharacterModal();
            case 'character-library':
                return this.openCharacterLibrary();
            case 'datacat':
                return this.openDataCat();
            case 'personas':
                if (this.thirdPartyWorkspaceAvailable('personas')) return this.openThirdPartyWorkspace('personas');
                return this.openPersonaModal();
            case 'lorebooks':
                if (this.thirdPartyWorkspaceAvailable('lorebooks')) return this.openThirdPartyWorkspace('lorebooks');
                return this.openLorebookModal();
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
                return this.extensionsModal.open();
            case 'settings':
                await this.clickAndTag('userSettings', ['User Settings'], 'settings');
                break;
            case 'backgrounds':
                return this.openBackgroundModal();
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
            ['Formatting','formatting',icons.formatting,'Context Template, Instruct Template and System Prompt'],
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
            run: () => this.openTool('variables'),
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
            label: t('Community Chat'),
            icon: icons.community,
            hint: t('Open the NastyTavern real-time community chat'),
            keywords: 'community chat realtime supabase sillytavern character cards lorebooks',
            shortcut: this.settings.shortcuts?.community || '',
            run: () => this.communityChat.open(),
        });

        actions.splice(3, 0, {
            label: t('Community presence'),
            icon: icons.community,
            hint: t('Switch between online and offline presence'),
            keywords: 'community presence online offline status realtime',
            shortcut: this.settings.shortcuts?.communityPresence || '',
            run: () => this.toggleCommunityPresence(),
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
            run: () => this.openTool('timeline'),
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
            ['Backgrounds', () => this.navigate('backgrounds'), icons.image, 'Change chat background'],
            ['Regenerate response', () => this.dom.findInteractiveByText('Regenerate')?.click(), icons.chat, 'Generate the last reply again'],
            ['Continue generation', () => this.dom.findInteractiveByText('Continue')?.click(), icons.chat, 'Continue the current reply'],
            ['Impersonate', () => this.dom.findInteractiveByText('Impersonate')?.click(), icons.persona, 'Generate as the active persona'],
            ['New chat', () => this.dom.findInteractiveByText('New Chat')?.click(), icons.chat, 'Start a new conversation'],
        ].map(([label,run,icon,hint]) => ({label:t(label),run,icon,hint:t(hint)}));

        return [...actions, ...native];
    }
}
