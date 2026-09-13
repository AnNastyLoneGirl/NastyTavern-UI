import { icons } from './icons.js';
import { t } from './i18n.js';

const NAV = [
    ['chat', 'Chat', icons.chat],
    ['characters', 'Characters', icons.characters],
    ['personas', 'Personas', icons.persona],
    ['lorebooks', 'Lorebooks', icons.lore],
    ['backgrounds', 'Backgrounds', icons.image],
    ['formatting', 'Formatting', icons.formatting],
    ['prompts', 'Prompts', icons.prompt],
    ['models', 'Models', icons.model],
    ['extensions', 'Extensions', icons.extensions],
    ['settings', 'Settings', icons.settings],
];

export class AppShell {
    constructor(onNavigate, onCommand, onToggleCompact, onHealth, onAbout, onPreferences, onUiAction) {
        this.onNavigate = onNavigate;
        this.onCommand = onCommand;
        this.onToggleCompact = onToggleCompact;
        this.onHealth = onHealth;
        this.onAbout = onAbout;
        this.onPreferences = onPreferences;
        this.onUiAction = onUiAction;
        this.active = 'chat';
        this.profileValues = [];
    }

    mount() {
        if (document.querySelector('#mt-root')) return document.querySelector('#mt-root');
        const root = document.createElement('div');
        root.id = 'mt-root';
        root.innerHTML = `
          <aside class="mt-sidebar" aria-label="NastyTavern navigation">
            <div class="mt-brand"><span class="mt-brandmark">${icons.logo}</span><span class="mt-brandtext"><b>NastyTavern</b><small>SillyTavern UI</small></span></div>
            <nav class="mt-nav">${NAV.map(([id,label,icon]) => `<button data-mt-nav="${id}" title="${label}"><span class="mt-nav-icon">${icon}</span><span class="mt-nav-label">${label}</span></button>`).join('')}</nav>
            <div class="mt-sidebar-bottom">
              <button data-mt-command title="Command palette"><span class="mt-nav-icon">${icons.search}</span><span class="mt-nav-label">Search</span><kbd data-mt-command-shortcut>Ctrl K</kbd></button>
              <button data-mt-health title="Health & Performance"><span class="mt-nav-icon">${icons.health}</span><span class="mt-nav-label">Health</span></button>
              <button data-mt-about title="About NastyTavern"><span class="mt-nav-icon">${icons.info}</span><span class="mt-nav-label">About</span></button>
              <button data-mt-preferences title="NastyTavern Settings"><span class="mt-nav-icon">${icons.settings}</span><span class="mt-nav-label">NT Settings</span></button>
              <button data-mt-collapse title="Compact navigation"><span class="mt-nav-icon">${icons.collapse}</span><span class="mt-nav-label">Collapse</span></button>
            </div>
          </aside>
          <header class="mt-appbar">
            <div class="mt-appbar-title"><span data-mt-title>Chat</span><small data-mt-subtitle>Conversation workspace</small></div>
            <div class="mt-appbar-right">
              <div class="mt-connection" title="Current SillyTavern connection">
                <span class="mt-connection-dot"></span>
                <span class="mt-connection-status" data-mt-connection>Connection</span>
                <div class="mt-header-profile" data-mt-header-profile hidden>
                  <button type="button" class="mt-header-profile-step" data-mt-profile-prev title="${t('Previous connection profile')}" aria-label="${t('Previous connection profile')}">‹</button>
                  <button type="button" class="mt-header-profile-current" data-mt-profile-current title="${t('Current connection profile')}" aria-label="${t('Current connection profile')}">${t('Profile')}</button>
                  <button type="button" class="mt-header-profile-step" data-mt-profile-next title="${t('Next connection profile')}" aria-label="${t('Next connection profile')}">›</button>
                </div>
              </div>
              <button type="button" class="mt-appbar-icon" data-mt-ui="toggle-appbar" title="${t('Minimize header')}" aria-label="${t('Minimize header')}">${icons.arrowUp}</button>
              <button type="button" class="mt-appbar-icon" data-mt-ui="focus" title="${t('Focus mode')}" aria-label="${t('Focus mode')}">${icons.workspace}</button>
            </div>
          </header>
          <button type="button" class="mt-nav-restore" data-mt-ui="restore-nav" title="${t('Restore navigation')}" aria-label="${t('Restore navigation')}">${icons.panel}</button>
          <button type="button" class="mt-focus-restore" data-mt-ui="focus" title="${t('Exit focus mode')}" aria-label="${t('Exit focus mode')}">${icons.workspace}<span>${t('Exit focus')}</span></button>`;
        document.body.append(root);
        const focusRestore = root.querySelector('.mt-focus-restore');
        focusRestore?.addEventListener('pointerdown', event => {
            event.preventDefault();
            event.stopPropagation();
            this.onUiAction?.('focus');
        });
        root.addEventListener('click', event => {
            const nav = event.target.closest('[data-mt-nav]');
            if (nav) this.onNavigate(nav.dataset.mtNav);
            if (event.target.closest('[data-mt-command]')) this.onCommand();
            if (event.target.closest('[data-mt-health]')) this.onHealth?.();
            if (event.target.closest('[data-mt-about]')) this.onAbout?.();
            if (event.target.closest('[data-mt-preferences]')) this.onPreferences?.();
            if (event.target.closest('[data-mt-collapse]')) this.onToggleCompact();
            const uiElement = event.target.closest('[data-mt-ui]');
            const ui = uiElement?.dataset.mtUi;
            if (ui && !uiElement.classList.contains('mt-focus-restore')) this.onUiAction?.(ui);
            if (event.target.closest('[data-mt-profile-prev]')) this.cycleConnectionProfile(-1);
            if (event.target.closest('[data-mt-profile-next]')) this.cycleConnectionProfile(1);
            if (event.target.closest('[data-mt-profile-current]')) this.cycleConnectionProfile(1);
        });
        this.root = root;
        this.setActive('chat');
        return root;
    }

    unmount() { document.querySelector('#mt-root')?.remove(); document.body?.removeAttribute('data-mt-view'); this.root = null; }


    updateCommandShortcut(value) {
        const label = String(value || '').replaceAll('+', ' ');
        const root = this.root || document.querySelector('#mt-root');
        root?.querySelectorAll('[data-mt-command-shortcut]').forEach(node => node.textContent = label || '—');
    }


    setActive(id, subtitle) {
        this.active = id;
        document.body?.setAttribute('data-mt-view', id);
        const root = this.root || document.querySelector('#mt-root');
        if (!root) return;
        root.querySelectorAll('[data-mt-nav]').forEach(el => el.classList.toggle('is-active', el.dataset.mtNav === id));
        const label = NAV.find(n => n[0] === id)?.[1] || id;
        root.querySelector('[data-mt-title]').textContent = label;
        root.querySelector('[data-mt-subtitle]').textContent = subtitle || ({chat:'Conversation workspace',characters:'Character library',personas:'Identity and prompt persona',lorebooks:'World Info and dynamic context',backgrounds:'Chat backgrounds and image library',formatting:'Context, Instruct & System Prompt',prompts:'Generation and prompt construction',models:'API and model connections',extensions:'SillyTavern extensions',settings:'Appearance and application settings'}[id] || 'Workspace');
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
