import { icons } from './icons.js';
import { t } from './i18n.js';
import { adoptModalShell, showModalShell, hideModalShell } from './modal-shell.js';

const PAGE_LABELS = new Map([
    ['chat', 'Chat'],
    ['characters', 'Characters'],
    ['personas', 'Personas'],
    ['lorebooks', 'Lorebooks'],
    ['backgrounds', 'Backgrounds'],
    ['formatting', 'Formatting'],
    ['prompts', 'Prompts'],
    ['models', 'Models'],
    ['extensions', 'Extensions'],
    ['settings', 'Settings'],
]);

const NAV = [
    ['chat', 'Chat', icons.chat],
    ['characters', 'Characters', icons.characters],
    ['personas', 'Personas', icons.persona],
    ['lorebooks', 'Lorebooks', icons.lore],
    ['backgrounds', 'Backgrounds', icons.image],
];


export class AppShell {
    constructor(onNavigate, onCommand, onToggleCompact, onHealth, onCommunity, onAbout, onPreferences, onUiAction, onCommunityAuth) {
        this.onNavigate = onNavigate;
        this.onCommand = onCommand;
        this.onToggleCompact = onToggleCompact;
        this.onHealth = onHealth;
        this.onCommunity = onCommunity;
        this.onAbout = onAbout;
        this.onPreferences = onPreferences;
        this.onUiAction = onUiAction;
        this.onCommunityAuth = onCommunityAuth;
        this.active = 'chat';
        this.profileValues = [];
        this.settingsSection = 'user-theme';
        this.settingsNativeMounts = [];
        this.settingsThemeLayoutObserver = null;
        this.settingsThemeLayoutFrame = 0;
        this.boundDocumentPointerDown = event => this.onDocumentPointerDown(event);
        this.boundDocumentKeyDown = event => this.onDocumentKeyDown(event);
    }

    mount() {
        if (document.querySelector('#mt-root')) return document.querySelector('#mt-root');
        const root = document.createElement('div');
        root.id = 'mt-root';
        root.innerHTML = `
          <aside class="mt-sidebar" aria-label="NastyTavern navigation">
            <div class="mt-brand">
              <span class="mt-brandmark">${icons.logo}</span>
              <span class="mt-brandtext"><b>NastyTavern</b><small>SillyTavern UI</small></span>
              <span class="mt-brand-version">0.1.6</span>
            </div>
            <nav class="mt-nav">
              ${NAV.map(([id,label,icon]) => `<button data-mt-nav="${id}" title="${t(label)}"><span class="mt-nav-icon">${icon}</span><span class="mt-nav-label">${t(label)}</span></button>`).join('')}
            </nav>
            <div class="mt-sidebar-bottom">
              <button data-mt-health title="${t('Health & Performance')}"><span class="mt-nav-icon">${icons.health}</span><span class="mt-nav-label">${t('Health')}</span></button>
              <button data-mt-about title="${t('About NastyTavern')}"><span class="mt-nav-icon">${icons.info}</span><span class="mt-nav-label">${t('About')}</span></button>
            </div>
          </aside>
          <button type="button" class="mt-sidebar-toggle" data-mt-collapse title="${t('Toggle navigation')}" aria-label="${t('Toggle navigation')}">
            <span class="mt-sidebar-toggle-glyph" aria-hidden="true"></span>
          </button>
          <header class="mt-appbar">
            <div class="mt-appbar-title">
              <span data-mt-title>Chat</span>
            </div>
            <div class="mt-appbar-right">
              <button type="button" class="mt-appbar-command" data-mt-command title="${t('Search')} · Ctrl K" aria-label="${t('Search')}">${icons.search}</button>
              <button type="button" class="mt-appbar-icon" data-mt-ui="focus" title="${t('Focus mode')}" aria-label="${t('Focus mode')}">${icons.workspace}</button>
              <div class="mt-account" data-mt-account>
                <button type="button" class="mt-account-toggle" data-mt-account-toggle aria-haspopup="menu" aria-expanded="false" aria-controls="mt-account-menu" title="${t('Account')}">
                  <span class="mt-account-character" data-mt-account-signed-out>${icons.characters}</span>
                  <span class="mt-account-avatar" data-mt-account-avatar hidden><img data-mt-account-avatar-image alt="" hidden><span data-mt-account-avatar-fallback>NT</span></span>
                  <span class="mt-account-identity" data-mt-account-identity hidden>
                    <span class="mt-account-name" data-mt-account-name data-nt-no-i18n></span>
                    <span class="mt-account-grade" data-mt-account-grade data-nt-no-i18n></span>
                  </span>
                  <i class="mt-community-badge" data-mt-community-badge hidden></i>
                </button>
                <div class="mt-account-menu" id="mt-account-menu" data-mt-account-menu role="menu" hidden>
                  <section class="mt-account-model" aria-label="${t('Model profile')}">
                    <div class="mt-connection" title="${t('Current SillyTavern connection')}">
                      <span class="mt-connection-dot"></span>
                      <button type="button" class="mt-connection-status" data-mt-connection data-mt-model-status title="${t('Open Models')}" aria-label="${t('Open Models')}">${t('Connection')}</button>
                      <div class="mt-header-profile" data-mt-header-profile hidden>
                        <button type="button" class="mt-header-profile-step" data-mt-profile-prev title="${t('Previous connection profile')}" aria-label="${t('Previous connection profile')}">‹</button>
                        <button type="button" class="mt-header-profile-current" data-mt-profile-current title="${t('Current connection profile')}" aria-label="${t('Current connection profile')}">${t('Profile')}</button>
                        <button type="button" class="mt-header-profile-step" data-mt-profile-next title="${t('Next connection profile')}" aria-label="${t('Next connection profile')}">›</button>
                      </div>
                    </div>
                  </section>
                  <div class="mt-account-actions">
                    <button type="button" data-mt-account-nav="extensions" role="menuitem"><span>${icons.extensions}</span><b>${t('Extensions')}</b></button>
                    <button type="button" data-mt-settings-hub-open role="menuitem"><span>${icons.settings}</span><b>${t('Settings')}</b></button>
                    <button type="button" data-mt-community role="menuitem"><span>${icons.community}</span><b>${t('Community')}</b></button>
                    <button type="button" data-mt-preferences role="menuitem"><span>${icons.settings}</span><b>${t('NastyTavern Settings')}</b></button>
                  </div>
                  <div class="mt-account-auth">
                    <button type="button" data-mt-community-auth="signin" role="menuitem"><span>${icons.characters}</span><b>${t('Connect')}</b></button>
                    <button type="button" class="mt-community-presence-toggle" data-mt-community-presence role="menuitemcheckbox" aria-checked="false" hidden>
                      <span class="mt-community-presence-status" aria-hidden="true"><i></i></span>
                      <b data-mt-community-presence-label>${t('Offline')}</b>
                      <span class="mt-community-presence-switch" aria-hidden="true"></span>
                    </button>
                    <button type="button" data-mt-community-auth="signout" role="menuitem" hidden><span>${icons.disconnect}</span><b>${t('Disconnect')}</b></button>
                  </div>
                </div>
              </div>
            </div>
          </header>
          <div id="mt-settings-hub" class="mt-settings-hub" hidden>
            <div class="nt-tool-backdrop" data-mt-settings-hub-close></div>
            <section class="nt-tool-modal mt-settings-hub-modal" role="dialog" aria-modal="true" aria-labelledby="mt-settings-hub-title">
              <header class="nt-tool-header">
                <div><span>${icons.settings}</span><div><b id="mt-settings-hub-title">${t('Settings')}</b></div></div>
                <div class="mt-settings-header-actions">
                  <button type="button" class="mt-settings-sidebar-toggle nt-panel-toggle" data-mt-settings-sidebar-toggle aria-expanded="true" title="${t('Hide settings navigation')}" aria-label="${t('Hide settings navigation')}">${icons.panel}</button>
                  <button type="button" class="nt-modal-close" data-mt-settings-hub-close title="${t('Close')}" aria-label="${t('Close')}">${icons.close}</button>
                </div>
              </header>
              <div class="mt-settings-hub-layout">
                <aside class="mt-settings-sidebar" aria-label="${t('Settings navigation')}">
                  <nav class="mt-settings-nav">
                    <section class="mt-settings-group" data-mt-settings-group="user">
                      <button type="button" class="mt-settings-category" data-mt-settings-category="user" aria-expanded="true">
                        <span>${icons.settings}</span><b>${t('User Settings')}</b>
                      </button>
                      <div class="mt-settings-subnav">
                        <button type="button" data-mt-settings-section="user-theme">${t('UI Theme')}</button>
                        <button type="button" data-mt-settings-section="user-character">${t('Character Handling')}</button>
                        <button type="button" data-mt-settings-section="user-chat">${t('Chat/Message Handling')}</button>
                      </div>
                    </section>
                    <section class="mt-settings-group" data-mt-settings-group="formatting">
                      <button type="button" class="mt-settings-category" data-mt-settings-category="formatting" aria-expanded="true">
                        <span>${icons.formatting}</span><b>${t('Formatting')}</b>
                      </button>
                      <div class="mt-settings-subnav">
                        <button type="button" data-mt-settings-section="formatting-context">${t('Context Template')}</button>
                        <button type="button" data-mt-settings-section="formatting-instruct">${t('Instruct Template')}</button>
                        <button type="button" data-mt-settings-section="formatting-system">${t('System Prompt')}</button>
                      </div>
                    </section>
                    <button type="button" class="mt-settings-category mt-settings-direct" data-mt-settings-section="models">
                      <span>${icons.model}</span><b>${t('Model')}</b>
                    </button>
                    <button type="button" class="mt-settings-category mt-settings-direct" data-mt-settings-section="prompts">
                      <span>${icons.prompt}</span><b>${t('Prompt')}</b>
                    </button>
                  </nav>
                  <div class="mt-settings-sidebar-footer">
                    <div class="mt-settings-account-host">
                      <button type="button" data-mt-native-account><span>${icons.characters}</span><b>${t('Account')}</b></button>
                    </div>
                    <div class="mt-settings-language-host" data-mt-settings-language-host></div>
                  </div>
                </aside>
                <main class="mt-settings-content">
                  <div class="mt-settings-native-host" data-mt-settings-native-host></div>
                  <div class="mt-settings-unavailable" data-mt-settings-unavailable hidden>
                    <b>${t('Section unavailable')}</b>
                    <span>${t('This SillyTavern settings section could not be found in the current build.')}</span>
                  </div>
                </main>
              </div>
            </section>
          </div>
          <button type="button" class="mt-focus-restore" data-mt-ui="focus" title="${t('Exit focus mode')}" aria-label="${t('Exit focus mode')}">${icons.workspace}<span>${t('Exit focus')}</span></button>`;
        document.body.append(root);
        const settingsHub = root.querySelector('#mt-settings-hub');
        adoptModalShell(settingsHub, { modalSelector: '.mt-settings-hub-modal', backdropSelector: '.nt-tool-backdrop', headerSelector: '.nt-tool-header', bodySelector: '.mt-settings-hub-layout', size: 'large' });
        const focusRestore = root.querySelector('.mt-focus-restore');
        focusRestore?.addEventListener('pointerdown', event => {
            event.preventDefault();
            event.stopPropagation();
            this.onUiAction?.('focus');
        });
        root.addEventListener('click', event => this.onRootClick(event));
        document.addEventListener('pointerdown', this.boundDocumentPointerDown, true);
        document.addEventListener('keydown', this.boundDocumentKeyDown, true);
        this.root = root;
        this.setActive('chat');
        this.updateCommunityAccount({ signedIn: false });
        return root;
    }

    unmount() {
        this.disconnectSettingsThemeLayout();
        this.restoreSettingsNative();
        document.removeEventListener('pointerdown', this.boundDocumentPointerDown, true);
        document.removeEventListener('keydown', this.boundDocumentKeyDown, true);
        document.querySelector('#mt-root')?.remove();
        document.body?.removeAttribute('data-mt-view');
        this.root = null;
    }

    onRootClick(event) {
        const accountToggle = event.target.closest('[data-mt-account-toggle]');
        if (accountToggle) {
            this.toggleAccountMenu();
            return;
        }
        const externalNav = event.target.closest('[data-mt-nav-external]');
        if (externalNav) {
            this.closeAccountMenu();
            this.onNavigate(externalNav.dataset.mtNavExternal);
            return;
        }
        const nav = event.target.closest('[data-mt-nav]');
        if (nav) {
            this.closeAccountMenu();
            this.onNavigate(nav.dataset.mtNav);
        }
        const accountNav = event.target.closest('[data-mt-account-nav]');
        if (accountNav) {
            this.closeAccountMenu();
            this.onNavigate(accountNav.dataset.mtAccountNav);
        }
        if (event.target.closest('[data-mt-settings-hub-open]')) {
            this.closeAccountMenu();
            this.openSettingsHub();
        }
        const settingsCategory = event.target.closest('[data-mt-settings-category]');
        if (settingsCategory) {
            const category = settingsCategory.dataset.mtSettingsCategory;
            this.setSettingsSection(category === 'formatting' ? 'formatting-context' : 'user-theme');
        }
        const settingsSection = event.target.closest('.mt-settings-nav [data-mt-settings-section]');
        if (settingsSection) this.setSettingsSection(settingsSection.dataset.mtSettingsSection);
        if (event.target.closest('[data-mt-settings-sidebar-toggle]')) this.toggleSettingsSidebar();
        if (event.target.closest('[data-mt-settings-hub-close]')) this.closeSettingsHub();
        if (event.target.closest('[data-mt-command]')) this.onCommand();
        if (event.target.closest('[data-mt-health]')) this.onHealth?.();
        if (event.target.closest('[data-mt-community]')) {
            this.closeAccountMenu();
            this.onCommunity?.();
        }
        if (event.target.closest('[data-mt-about]')) this.onAbout?.();
        if (event.target.closest('[data-mt-preferences]')) {
            this.closeAccountMenu();
            this.onPreferences?.();
        }
        if (event.target.closest('[data-mt-native-account]')) {
            document.querySelector('#account_button')?.click?.();
        }
        const presenceToggle = event.target.closest('[data-mt-community-presence]');
        if (presenceToggle) {
            this.onCommunityAuth?.('toggle-presence');
            return;
        }
        const communityAuth = event.target.closest('[data-mt-community-auth]');
        if (communityAuth) {
            this.closeAccountMenu();
            this.onCommunityAuth?.(communityAuth.dataset.mtCommunityAuth);
        }
        if (event.target.closest('[data-mt-collapse]')) this.onToggleCompact();
        const uiElement = event.target.closest('[data-mt-ui]');
        const ui = uiElement?.dataset.mtUi;
        if (ui && !uiElement.classList.contains('mt-focus-restore')) this.onUiAction?.(ui);
        const modelStatus = event.target.closest('[data-mt-model-status]');
        if (modelStatus && modelStatus.closest('.mt-connection')?.classList.contains('is-offline')) {
            this.closeAccountMenu();
            this.onNavigate('models');
            return;
        }
        if (event.target.closest('[data-mt-profile-prev]')) this.cycleConnectionProfile(-1);
        if (event.target.closest('[data-mt-profile-next]')) this.cycleConnectionProfile(1);
        if (event.target.closest('[data-mt-profile-current]')) this.cycleConnectionProfile(1);
    }

    onDocumentPointerDown(event) {
        const root = this.root || document.querySelector('#mt-root');
        const menu = root?.querySelector('[data-mt-account-menu]');
        if (!menu || menu.hidden) return;
        if (!event.target?.closest?.('[data-mt-account]')) this.closeAccountMenu();
    }

    onDocumentKeyDown(event) {
        if (event.key !== 'Escape') return;
        const root = this.root || document.querySelector('#mt-root');
        const menu = root?.querySelector('[data-mt-account-menu]');
        if (menu && !menu.hidden) {
            event.preventDefault();
            this.closeAccountMenu(true);
        }
    }

    toggleAccountMenu() {
        const root = this.root || document.querySelector('#mt-root');
        const menu = root?.querySelector('[data-mt-account-menu]');
        const toggle = root?.querySelector('[data-mt-account-toggle]');
        if (!menu || !toggle) return;
        const open = menu.hidden;
        menu.hidden = !open;
        toggle.setAttribute('aria-expanded', String(open));
        if (open) this.refreshConnectionProfiles();
    }

    closeAccountMenu(restoreFocus = false) {
        const root = this.root || document.querySelector('#mt-root');
        const menu = root?.querySelector('[data-mt-account-menu]');
        const toggle = root?.querySelector('[data-mt-account-toggle]');
        if (!menu || menu.hidden) return;
        menu.hidden = true;
        toggle?.setAttribute('aria-expanded', 'false');
        if (restoreFocus) toggle?.focus();
    }

    openSettingsHub() {
        const root = this.root || document.querySelector('#mt-root');
        const hub = root?.querySelector('#mt-settings-hub');
        if (!hub) return;
        showModalShell(hub);
        this.setSettingsSidebarHidden(false);
        this.mountSettingsUtilities();
        this.setSettingsSection('user-theme');
        requestAnimationFrame(() => hub.querySelector('[data-mt-settings-section="user-theme"]')?.focus());
    }


    setSettingsSidebarHidden(hidden) {
        const root = this.root || document.querySelector('#mt-root');
        const hub = root?.querySelector('#mt-settings-hub');
        const modal = hub?.querySelector('.mt-settings-hub-modal');
        const toggle = hub?.querySelector('[data-mt-settings-sidebar-toggle]');
        if (!modal || !toggle) return;
        const isHidden = Boolean(hidden);
        modal.classList.toggle('is-sidebar-hidden', isHidden);
        toggle.setAttribute('aria-expanded', String(!isHidden));
        toggle.title = t(isHidden ? 'Show settings navigation' : 'Hide settings navigation');
        toggle.setAttribute('aria-label', toggle.title);
    }

    toggleSettingsSidebar() {
        const root = this.root || document.querySelector('#mt-root');
        const modal = root?.querySelector('#mt-settings-hub .mt-settings-hub-modal');
        if (!modal) return;
        this.setSettingsSidebarHidden(!modal.classList.contains('is-sidebar-hidden'));
    }

    closeSettingsHub() {
        const root = this.root || document.querySelector('#mt-root');
        const hub = root?.querySelector('#mt-settings-hub');
        if (!hub || hub.hidden) return;
        hideModalShell(hub, { immediate: false });
        setTimeout(() => {
            if (hub && !hub.classList.contains('is-open')) {
                this.disconnectSettingsThemeLayout();
                this.restoreSettingsNative();
                hub.hidden = true;
            }
        }, 160);
    }

    setSettingsSection(sectionId) {
        const root = this.root || document.querySelector('#mt-root');
        const hub = root?.querySelector('#mt-settings-hub');
        if (!hub) return;
        const section = String(sectionId || 'user-theme');
        this.settingsSection = section;
        hub.querySelectorAll('.mt-settings-nav [data-mt-settings-section]').forEach(button => {
            const active = button.dataset.mtSettingsSection === section;
            button.classList.toggle('is-active', active);
            button.setAttribute('aria-current', active ? 'page' : 'false');
        });
        hub.querySelectorAll('[data-mt-settings-group]').forEach(group => {
            const active = section.startsWith(`${group.dataset.mtSettingsGroup}-`);
            group.classList.toggle('is-active', active);
            group.querySelector('[data-mt-settings-category]')?.classList.toggle('is-active', active);
        });
        this.mountSettingsSection(section);
    }

    mountSettingsUtilities() {
        const root = this.root || document.querySelector('#mt-root');
        const hub = root?.querySelector('#mt-settings-hub');
        if (!hub) return;
        this.restoreSettingsNative('utility');
        const languageHost = hub.querySelector('[data-mt-settings-language-host]');
        const account = document.querySelector('#account_button');
        const accountProxy = hub.querySelector('[data-mt-native-account]');
        const language = document.querySelector('#UI-language-block');
        if (accountProxy) accountProxy.disabled = !account;
        if (language && languageHost) this.moveSettingsNative(language, languageHost, 'utility');
    }

    mountSettingsSection(sectionId) {
        this.disconnectSettingsThemeLayout();
        const root = this.root || document.querySelector('#mt-root');
        const hub = root?.querySelector('#mt-settings-hub');
        const host = hub?.querySelector('[data-mt-settings-native-host]');
        const unavailable = hub?.querySelector('[data-mt-settings-unavailable]');
        if (!host || !unavailable) return;
        this.restoreSettingsNative('content');
        host.replaceChildren();
        host.dataset.mtSettingsSection = sectionId;
        const source = this.resolveSettingsSection(sectionId);
        const nodes = Array.isArray(source) ? source.filter(Boolean) : source ? [source] : [];
        unavailable.hidden = nodes.length > 0;
        host.hidden = nodes.length === 0;
        if (!nodes.length) return;
        for (const node of nodes) this.moveSettingsNative(node, host, 'content');
        host.scrollTop = 0;
        if (sectionId === 'user-theme') requestAnimationFrame(() => this.prepareSettingsThemeDisplayRows(host));
    }

    prepareSettingsThemeDisplayRows(host) {
        if (!host?.isConnected) return;
        const definitions = [
            { keys: ['Avatar Style', 'Avatar Style:', 'Avatars:'], selectors: ['#avatar_style'] },
            { keys: ['Chat Style:', 'Chat Style'], selectors: ['#chat_display'] },
            { keys: ['Media Style:', 'Media Style'], selectors: ['#media_display', '#media_display_style', '[name="media_display"]'] },
            { keys: ['Notifications:', 'Notifications'], selectors: ['#toastr_position', '[name="toastr_position"]'] },
        ];
        const entries = definitions.map(definition => {
            let select = null;
            for (const selector of definition.selectors) {
                select = host.querySelector(selector);
                if (select) break;
            }
            let label = null;
            for (const key of definition.keys) {
                label = [...host.querySelectorAll('[data-i18n]')].find(element => element.getAttribute('data-i18n') === key) || null;
                if (label) break;
            }
            let row = label?.closest('.flex-container') || select?.closest('.flex-container') || null;
            if (!select && row) select = row.querySelector('select');
            if (!label && row) label = [...row.children].find(element => element !== select && element.matches?.('span,label')) || null;
            if (!row || !label || !select) return null;
            return { row, label, select };
        }).filter(Boolean);
        if (entries.length !== definitions.length) return;
        for (const { row, label, select } of entries) {
            row.classList.add('nt-theme-compact-row');
            label.classList.add('nt-theme-compact-label');
            select.classList.add('nt-theme-compact-select');
        }

        const update = () => {
            if (!host.isConnected) return;
            cancelAnimationFrame(this.settingsThemeLayoutFrame);
            this.settingsThemeLayoutFrame = requestAnimationFrame(() => {
                const widths = entries.map(({ row, label }) => {
                    const rowWidth = row.getBoundingClientRect().width;
                    const labelWidth = label.getBoundingClientRect().width;
                    const styles = getComputedStyle(row);
                    const gap = Number.parseFloat(styles.columnGap) || Number.parseFloat(styles.gap) || 10;
                    return Math.max(0, rowWidth - labelWidth - gap);
                }).filter(width => Number.isFinite(width) && width > 0);
                if (!widths.length) return;
                host.style.setProperty('--nt-theme-select-width', `${Math.floor(Math.min(...widths))}px`);
            });
        };

        update();
        if (typeof ResizeObserver === 'function') {
            this.settingsThemeLayoutObserver = new ResizeObserver(update);
            this.settingsThemeLayoutObserver.observe(host);
            for (const { row, label } of entries) {
                this.settingsThemeLayoutObserver.observe(row);
                this.settingsThemeLayoutObserver.observe(label);
            }
        }
    }

    disconnectSettingsThemeLayout() {
        this.settingsThemeLayoutObserver?.disconnect?.();
        this.settingsThemeLayoutObserver = null;
        cancelAnimationFrame(this.settingsThemeLayoutFrame);
        this.settingsThemeLayoutFrame = 0;
        const host = (this.root || document.querySelector('#mt-root'))?.querySelector('[data-mt-settings-native-host]');
        host?.style?.removeProperty('--nt-theme-select-width');
    }

    moveSettingsNative(node, host, kind) {
        if (!node || !host || node.closest('[data-mt-settings-native-host]') === host) return;
        const placeholder = document.createComment(`nasty-settings-${kind}`);
        node.parentNode?.insertBefore(placeholder, node);
        this.settingsNativeMounts.push({ node, placeholder, kind });
        node.classList.add('nt-settings-native-mounted');
        host.appendChild(node);
    }

    restoreSettingsNative(kind = null) {
        const remaining = [];
        for (const mount of [...this.settingsNativeMounts].reverse()) {
            if (kind && mount.kind !== kind) {
                remaining.unshift(mount);
                continue;
            }
            const { node, placeholder } = mount;
            node?.classList?.remove('nt-settings-native-mounted');
            if (placeholder?.parentNode && node) placeholder.parentNode.replaceChild(node, placeholder);
            else placeholder?.remove?.();
        }
        this.settingsNativeMounts = kind ? remaining : [];
    }

    resolveSettingsSection(sectionId) {
        switch (sectionId) {
            case 'user-theme':
                return document.querySelector('#UI-Theme-Block, [name="UserSettingsFirstColumn"]');
            case 'user-character':
                return document.querySelector('#UI-Customization, [name="UserSettingsSecondColumn"]');
            case 'user-chat':
                return document.querySelector('#power-user-options-block, [name="UserSettingsThirdColumn"]');
            case 'formatting-context':
                return document.querySelector('#ContextSettings') || this.findSettingsColumn('#AdvancedFormatting, #advanced-formatting-button .drawer-content', ['Context Template']);
            case 'formatting-instruct':
                return document.querySelector('#InstructSettings') || this.findSettingsColumn('#AdvancedFormatting, #advanced-formatting-button .drawer-content', ['Instruct Template', 'Instruct Mode']);
            case 'formatting-system':
                return document.querySelector('#SystemPromptColumn') || this.findSettingsColumn('#AdvancedFormatting, #advanced-formatting-button .drawer-content', ['System Prompt']);
            case 'models':
                return document.querySelector('#rm_api_block, #sys-settings-button .drawer-content');
            case 'prompts':
                return document.querySelector('#left-nav-panel, #ai-config-button .drawer-content');
            default:
                return null;
        }
    }

    findSettingsColumn(rootSelector, labels) {
        const root = document.querySelector(rootSelector);
        if (!root) return null;
        const wanted = labels.map(label => String(label).trim().toLowerCase());
        const headings = root.querySelectorAll('h3,h4,h5,[data-i18n]');
        for (const heading of headings) {
            const text = String(heading.getAttribute?.('data-i18n') || heading.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
            if (!wanted.some(label => text === label || text.startsWith(label))) continue;
            let current = heading;
            while (current && current.parentElement && current.parentElement !== root) {
                if (current.id || current.classList.contains('flex1') || current.classList.contains('flexFlowColumn')) return current;
                current = current.parentElement;
            }
            if (current && current !== root) return current;
        }
        return null;
    }

    updateCommunityAccount(state = {}) {
        const root = this.root || document.querySelector('#mt-root');
        if (!root) return;
        const signedIn = Boolean(state.signedIn);
        const username = String(state.username || '').trim() || t('Community');
        const avatarUrl = String(state.avatarUrl || '').trim();
        const toggle = root.querySelector('[data-mt-account-toggle]');
        const signedOut = root.querySelector('[data-mt-account-signed-out]');
        const avatar = root.querySelector('[data-mt-account-avatar]');
        const image = root.querySelector('[data-mt-account-avatar-image]');
        const fallback = root.querySelector('[data-mt-account-avatar-fallback]');
        const identity = root.querySelector('[data-mt-account-identity]');
        const name = root.querySelector('[data-mt-account-name]');
        const grade = root.querySelector('[data-mt-account-grade]');
        const signin = root.querySelector('[data-mt-community-auth="signin"]');
        const signout = root.querySelector('[data-mt-community-auth="signout"]');
        const presenceToggle = root.querySelector('[data-mt-community-presence]');
        const presenceLabel = root.querySelector('[data-mt-community-presence-label]');
        const presenceEnabled = state.presenceEnabled === true;
        const communityEnabled = state.communityEnabled !== false;
        const role = String(state.role || 'member').trim().toLowerCase();
        const roleLabel = role === 'admin' ? t('Admin') : role === 'moderator' ? t('Moderator') : t('Member');
        toggle?.classList.toggle('is-signed-in', signedIn);
        if (toggle) {
            toggle.title = signedIn ? `${username} · ${roleLabel}` : t('Account');
            toggle.setAttribute('data-community-state', signedIn ? 'signed-in' : 'signed-out');
        }
        if (signedOut) signedOut.hidden = signedIn;
        if (avatar) avatar.hidden = !signedIn;
        if (identity) identity.hidden = !signedIn;
        if (name) name.textContent = signedIn ? username : '';
        if (grade) grade.textContent = signedIn ? roleLabel : '';
        if (signin) signin.hidden = signedIn;
        if (signout) signout.hidden = !signedIn;
        if (presenceToggle) {
            presenceToggle.hidden = !signedIn || !communityEnabled;
            presenceToggle.classList.toggle('is-online', signedIn && presenceEnabled);
            presenceToggle.setAttribute('aria-checked', presenceEnabled ? 'true' : 'false');
            presenceToggle.title = presenceEnabled ? t('Go offline') : t('Go online');
        }
        if (presenceLabel) presenceLabel.textContent = presenceEnabled ? t('Online') : t('Offline');
        if (image) {
            image.hidden = !signedIn || !avatarUrl;
            if (signedIn && avatarUrl) image.src = avatarUrl;
            else image.removeAttribute('src');
        }
        if (fallback) {
            fallback.hidden = !signedIn || Boolean(avatarUrl);
            fallback.textContent = username.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || 'NT';
        }
    }

    setCharacterLibraryAvailable(available) {
        const root = this.root || document.querySelector('#mt-root');
        const nav = root?.querySelector('.mt-nav');
        if (!nav) return;

        let button = nav.querySelector('[data-mt-nav-external="character-library"]');
        if (!available) {
            button?.remove();
            return;
        }

        if (!button) {
            button = document.createElement('button');
            button.type = 'button';
            button.dataset.mtNavExternal = 'character-library';
            button.className = 'mt-nav-character-library';
            button.innerHTML = `<span class="mt-nav-icon">${icons.folder}</span><span class="mt-nav-label"></span>`;
            const charactersButton = nav.querySelector('[data-mt-nav="characters"]');
            if (charactersButton) charactersButton.insertAdjacentElement('afterend', button);
            else nav.prepend(button);
        }

        const label = t('Character Library');
        button.title = label;
        button.setAttribute('aria-label', label);
        const labelNode = button.querySelector('.mt-nav-label');
        if (labelNode) labelNode.textContent = label;
    }

    updateCommunityBadge(value) {
        const root = this.root || document.querySelector('#mt-root');
        const badge = root?.querySelector('[data-mt-community-badge]');
        if (!badge) return;
        const count = typeof value === 'object' ? Number(value?.total || 0) : Number(value || 0);
        const mentions = typeof value === 'object' ? Number(value?.mentions || 0) : 0;
        const unread = typeof value === 'object' ? Number(value?.unread || 0) : count;
        const active = mentions > 0 || unread > 0;
        badge.hidden = !active;
        badge.textContent = '';
        badge.classList.toggle('has-mentions', active);
        badge.title = mentions > 0 ? t('Unread mention') : (unread > 0 ? t('Unread messages') : '');
    }

    updateCommandShortcut(value) {
        const label = String(value || '').replaceAll('+', ' ');
        const root = this.root || document.querySelector('#mt-root');
        root?.querySelectorAll('[data-mt-command-shortcut]').forEach(node => node.textContent = label || '—');
    }

    setActive(id) {
        this.active = id;
        document.body?.setAttribute('data-mt-view', id);
        const root = this.root || document.querySelector('#mt-root');
        if (!root) return;
        root.querySelectorAll('[data-mt-nav]').forEach(el => el.classList.toggle('is-active', el.dataset.mtNav === id));
        const label = PAGE_LABELS.get(id) || id;
        const titleNode = root.querySelector('[data-mt-title]');
        if (titleNode) titleNode.textContent = t(label);
    }

    updateStatus({connection, offline: nativeOffline, character, persona}) {
        const root = this.root || document.querySelector('#mt-root');
        if (!root) return;
        const connectionNode = root.querySelector('.mt-connection');
        const statusNode = root.querySelector('[data-mt-connection]');
        const profileNode = root.querySelector('[data-mt-header-profile]');
        const status = connection || 'Connection';
        const fallbackOffline = /(^connection$)|no\b.*connection|not connected|disconnected|offline|connecting|pas\s+de\s+connexion|non\s+connect|déconnect|hors\s+ligne|connexion\s+en\s+cours/i.test(status);
        const offline = typeof nativeOffline === 'boolean' ? nativeOffline : fallbackOffline;
        if (statusNode) {
            statusNode.textContent = status;
            statusNode.hidden = !offline;
        }
        if (profileNode) profileNode.hidden = offline;
        connectionNode?.classList.toggle('is-offline', offline);
        if (!offline) this.refreshConnectionProfiles();
        const charNode = root.querySelector('[data-mt-character]');
        const personaNode = root.querySelector('[data-mt-persona]');
        if (charNode) charNode.textContent = character || 'No character selected';
        if (personaNode) personaNode.textContent = persona || 'Default persona';
    }

    refreshConnectionProfiles() {
        const source = document.querySelector('#connection_profiles');
        const root = this.root || document.querySelector('#mt-root');
        const label = root?.querySelector('[data-mt-profile-current]');
        const prev = root?.querySelector('[data-mt-profile-prev]');
        const next = root?.querySelector('[data-mt-profile-next]');
        if (!label || !prev || !next) return;
        if (!source || !source.options.length) {
            this.profileValues = [];
            label.textContent = t('No profile');
            label.disabled = true;
            prev.disabled = true;
            next.disabled = true;
            return;
        }
        this.profileValues = [...source.options].map(option => ({ value: option.value, label: option.textContent?.trim() || option.value }));
        const current = this.profileValues.find(item => item.value === source.value) || this.profileValues[0];
        label.textContent = current?.label || t('Profile');
        label.title = current ? t('Connection profile: {name} · click for next', { name: current.label }) : t('Connection profile');
        label.disabled = source.disabled;
        prev.disabled = source.disabled || this.profileValues.length < 2;
        next.disabled = source.disabled || this.profileValues.length < 2;
    }

    cycleConnectionProfile(direction) {
        const source = document.querySelector('#connection_profiles');
        if (!source || source.disabled) return;
        this.refreshConnectionProfiles();
        if (!this.profileValues.length) return;
        const currentIndex = Math.max(0, this.profileValues.findIndex(item => item.value === source.value));
        const nextIndex = (currentIndex + direction + this.profileValues.length) % this.profileValues.length;
        const nextValue = this.profileValues[nextIndex]?.value;
        if (nextValue === undefined) return;
        source.value = nextValue;
        source.dispatchEvent(new Event('change', { bubbles: true }));
        this.refreshConnectionProfiles();
    }
}
