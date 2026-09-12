import { icons } from './icons.js';

const NAV = [
    ['chat', 'Chat', icons.chat],
    ['characters', 'Characters', icons.characters],
    ['personas', 'Personas', icons.persona],
    ['lorebooks', 'Lorebooks', icons.lore],
    ['formatting', 'Formatting', icons.prompt],
    ['prompts', 'Prompts', icons.prompt],
    ['models', 'Models', icons.model],
    ['extensions', 'Extensions', icons.extensions],
    ['settings', 'Settings', icons.settings],
];

export class AppShell {
    constructor(onNavigate, onCommand, onToggleCompact) {
        this.onNavigate = onNavigate;
        this.onCommand = onCommand;
        this.onToggleCompact = onToggleCompact;
        this.active = 'chat';
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
              <button data-mt-command title="Command palette"><span class="mt-nav-icon">${icons.search}</span><span class="mt-nav-label">Search</span><kbd>Ctrl K</kbd></button>
              <button data-mt-collapse title="Compact navigation"><span class="mt-nav-icon">${icons.collapse}</span><span class="mt-nav-label">Collapse</span></button>
            </div>
          </aside>
          <header class="mt-appbar">
            <div class="mt-appbar-title"><span data-mt-title>Chat</span><small data-mt-subtitle>Conversation workspace</small></div>
            <button class="mt-appbar-search" data-mt-command>${icons.search}<span>Search commands</span><kbd>Ctrl K</kbd></button>
            <div class="mt-connection" title="Current SillyTavern connection"><span class="mt-connection-dot"></span><span data-mt-connection>Connection</span></div>
          </header>`;
        document.body.append(root);
        root.addEventListener('click', event => {
            const nav = event.target.closest('[data-mt-nav]');
            if (nav) this.onNavigate(nav.dataset.mtNav);
            if (event.target.closest('[data-mt-command]')) this.onCommand();
            if (event.target.closest('[data-mt-collapse]')) this.onToggleCompact();
        });
        this.root = root;
        this.setActive('chat');
        return root;
    }

    unmount() { document.querySelector('#mt-root')?.remove(); this.root = null; }

    setActive(id, subtitle) {
        this.active = id;
        const root = this.root || document.querySelector('#mt-root');
        if (!root) return;
        root.querySelectorAll('[data-mt-nav]').forEach(el => el.classList.toggle('is-active', el.dataset.mtNav === id));
        const label = NAV.find(n => n[0] === id)?.[1] || id;
        root.querySelector('[data-mt-title]').textContent = label;
        root.querySelector('[data-mt-subtitle]').textContent = subtitle || ({chat:'Conversation workspace',characters:'Character library',personas:'Identity and prompt persona',lorebooks:'World Info and dynamic context',formatting:'Context, Instruct & System Prompt',prompts:'Generation and prompt construction',models:'API and model connections',extensions:'SillyTavern extensions',settings:'Appearance and application settings'}[id] || 'Workspace');
    }

    updateStatus({connection, character, persona}) {
        const root = this.root || document.querySelector('#mt-root');
        if (!root) return;
        root.querySelector('[data-mt-connection]').textContent = connection || 'Connection';
        const charNode = root.querySelector('[data-mt-character]');
        const personaNode = root.querySelector('[data-mt-persona]');
        if (charNode) charNode.textContent = character || 'No character selected';
        if (personaNode) personaNode.textContent = persona || 'Default persona';
        const offline = /no connection|disconnected|offline/i.test(connection || '');
        root.querySelector('.mt-connection').classList.toggle('is-offline', offline);
    }
}
