import { icons } from './icons.js';
import { t } from './i18n.js';
import { createModalShell, showModalShell, hideModalShell } from './modal-shell.js';

const TOOL_META = {
    timeline: { label: 'Story Timeline', subtitle: 'Branches, swipes and checkpoints', icon: icons.timeline, hiddenClass: 'nt-hide-module-timeline' },
    context: { label: 'Context Inspector', subtitle: 'Prompt and token usage', icon: icons.inspector, hiddenClass: 'nt-hide-module-context' },
    worldInfo: { label: 'World Info Inspector', subtitle: 'Activation and Lorebook diagnostics', icon: icons.lore, hiddenClass: 'nt-hide-module-worldinfo' },
    variables: { label: 'Variables', subtitle: 'Local and global variables', icon: icons.variables, hiddenClass: 'nt-hide-module-variables' },
    calendar: { label: 'Calendar & Schedule', subtitle: 'Story dates and routines', icon: icons.calendar, hiddenClass: 'nt-hide-module-calendar' },
    chatTools: { label: 'Bookmarks & Notes', subtitle: 'Saved moments and private notes', icon: icons.bookmark, hiddenClass: 'nt-hide-module-chattools' },
};

export class ChatToolsHub {
    constructor(tools = {}) {
        this.tools = tools;
        this.root = null;
        this.button = null;
        this.activeId = 'timeline';
    }

    mount() {
        this.ensurePanel();
        this.ensureButton();
        this.prepareTools();
        this.syncAvailability();
    }

    unmount() {
        this.close();
        this.button?.remove();
        this.root?.remove();
        this.button = null;
        this.root = null;
    }

    ensureButton() {
        if (this.button = document.querySelector('#nt-chat-tools-hub-button')) return this.button;
        const button = document.createElement('button');
        button.id = 'nt-chat-tools-hub-button';
        button.type = 'button';
        button.className = 'nt-chat-tool-button';
        button.title = t('Chat Tools');
        button.setAttribute('aria-label', t('Open chat tools'));
        button.innerHTML = `<span>${icons.panel || icons.workspace}</span>`;
        button.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            this.toggle();
        });
        document.body.append(button);
        this.button = button;
        return button;
    }

    ensurePanel() {
        if (this.root = document.querySelector('#nt-chat-tools-hub')) return this.root;
        const nav = Object.entries(TOOL_META).map(([id, meta]) => `
            <button type="button" data-nt-chat-tools-tool="${id}" title="${t(meta.label)}">
                <span>${meta.icon}</span>
                <span><b>${t(meta.label)}</b><small>${t(meta.subtitle)}</small></span>
            </button>`).join('');
        const { root, body } = createModalShell({
            id: 'nt-chat-tools-hub',
            title: t('Chat Tools'),
            subtitle: t('Utilities for the current conversation'),
            icon: icons.panel || icons.workspace,
            size: 'large',
            rootClass: 'nt-chat-tools-hub-root',
            modalClass: 'nt-chat-tools-hub-modal',
            bodyClass: 'nt-chat-tools-hub-body',
            closeAttrs: { 'data-nt-chat-tools-hub-close': '' },
            bodyHtml: `
                <div class="nt-chat-tools-hub-layout">
                    <aside class="nt-chat-tools-hub-sidebar" aria-label="${t('Chat tools navigation')}">
                        <nav class="nt-chat-tools-hub-nav">${nav}</nav>
                    </aside>
                    <main class="nt-chat-tools-hub-stage" data-nt-chat-tools-stage></main>
                </div>`,
        });
        body.addEventListener('click', event => {
            const button = event.target.closest('[data-nt-chat-tools-tool]');
            if (button) this.select(button.dataset.ntChatToolsTool);
        });
        root.addEventListener('click', event => {
            if (event.target.closest('[data-nt-chat-tools-hub-close]')) this.close();
        });
        document.body.append(root);
        this.root = root;
        return root;
    }

    prepareTools() {
        const stage = this.root?.querySelector('[data-nt-chat-tools-stage]');
        if (!stage) return;
        for (const [id, module] of Object.entries(this.tools)) {
            const toolRoot = module?.ensurePanel?.();
            if (!toolRoot) continue;
            toolRoot.dataset.ntModalEmbedded = 'true';
            toolRoot.dataset.ntChatToolsPanel = id;
            toolRoot.hidden = true;

            const shell = toolRoot.querySelector(':scope > .nt-modal-shell');
            if (shell) {
                shell.setAttribute('role', 'region');
                shell.removeAttribute('aria-modal');
                shell.removeAttribute('aria-labelledby');
                shell.setAttribute('aria-label', t(TOOL_META[id]?.label || 'Chat Tool'));
            }
            const header = toolRoot.querySelector(':scope > .nt-modal-shell > .nt-modal-header');
            const headerActions = header?.querySelector('.nt-modal-header-actions');
            const actions = headerActions ? [...headerActions.querySelectorAll(':scope > :not(.nt-modal-close)')] : [];
            if (actions.length) {
                const actionBar = document.createElement('div');
                actionBar.className = 'nt-chat-tools-hub-pane-actions';
                for (const className of headerActions.classList) {
                    if (className !== 'nt-modal-header-actions') actionBar.classList.add(className);
                }
                for (const action of actions) actionBar.append(action);
                const firstContent = header?.nextElementSibling;
                if (shell && firstContent) shell.insertBefore(actionBar, firstContent);
            }
            stage.append(toolRoot);

            const quickButton = module?.button || module?.quickButton;
            if (quickButton) {
                quickButton.dataset.ntToolGrouped = 'true';
                quickButton.hidden = true;
                quickButton.style.display = 'none';
                quickButton.setAttribute('aria-hidden', 'true');
                quickButton.tabIndex = -1;
            }
        }
    }

    isEnabled(id) {
        const meta = TOOL_META[id];
        return Boolean(meta && !document.body.classList.contains(meta.hiddenClass));
    }

    syncAvailability() {
        if (!this.root) return;
        const enabled = Object.keys(TOOL_META).filter(id => this.isEnabled(id));
        for (const [id] of Object.entries(TOOL_META)) {
            const button = this.root.querySelector(`[data-nt-chat-tools-tool="${id}"]`);
            if (button) button.hidden = !enabled.includes(id);
        }
        if (this.button) this.button.hidden = enabled.length === 0;
        if (!enabled.includes(this.activeId)) this.activeId = enabled[0] || 'timeline';
    }

    toggle() {
        if (this.root && !this.root.hidden) this.close();
        else this.open(this.activeId);
    }

    open(id = this.activeId) {
        this.ensurePanel();
        this.ensureButton();
        this.prepareTools();
        this.syncAvailability();
        if (this.isEnabled(id)) this.activeId = id;
        showModalShell(this.root);
        document.body.classList.add('nt-chat-tools-hub-open');
        this.select(this.activeId);
    }

    select(id) {
        if (!TOOL_META[id] || !this.isEnabled(id)) return;
        this.activeId = id;
        for (const [toolId, module] of Object.entries(this.tools)) {
            const active = toolId === id;
            const button = this.root?.querySelector(`[data-nt-chat-tools-tool="${toolId}"]`);
            button?.classList.toggle('is-active', active);
            if (active) button?.setAttribute('aria-current', 'page');
            else button?.removeAttribute('aria-current');
            if (active) {
                Promise.resolve(module?.open?.()).catch(() => {});
            } else {
                module?.close?.();
            }
        }
        const activeRoot = this.tools[id]?.root;
        requestAnimationFrame(() => activeRoot?.querySelector('input, textarea, select, button:not([hidden])')?.focus?.({ preventScroll: true }));
    }

    close() {
        for (const module of Object.values(this.tools)) module?.close?.();
        if (this.root) hideModalShell(this.root, { immediate: false });
        document.body.classList.remove('nt-chat-tools-hub-open');
    }
}
