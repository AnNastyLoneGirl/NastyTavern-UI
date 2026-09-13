import { icons } from './icons.js';

const getContext = () => {
    try { return window.SillyTavern?.getContext?.() || null; } catch (_) { return null; }
};

const escapeHtml = value => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

const chatIdOf = context => {
    try { return context?.getCurrentChatId?.() || context?.chatId || ''; } catch (_) { return context?.chatId || ''; }
};

export class ChatToolbar {
    constructor(toast, onToggleSection) {
        this.toast = toast;
        this.onToggleSection = onToggleSection;
        this.root = null;
        this.interval = null;
        this.events = [];
        this.mounted = false;
        this.lastChatId = '';
        this.lastCharacterId = null;
        this.lastGroupId = null;
        this.chatList = [];
        this.searchMatches = [];
        this.searchIndex = -1;
        this.fetchSequence = 0;
        this.boundContextRefresh = () => setTimeout(() => this.refresh(true), 0);
        this.boundKeydown = event => this.onKeydown(event);
    }

    mount() {
        this.ensureUI();
        this.integrateQuickButtons();
        this.syncVisibility();
        if (this.mounted) {
            this.refresh();
            return;
        }
        this.mounted = true;
        this.bindEvents();
        document.addEventListener('keydown', this.boundKeydown, true);
        this.interval = setInterval(() => this.tick(), 700);
        this.refresh(true);
    }

    unmount() {
        for (const { source, type, handler } of this.events) {
            try { source?.removeListener?.(type, handler); } catch (_) {}
        }
        this.events = [];
        clearInterval(this.interval);
        this.interval = null;
        document.removeEventListener('keydown', this.boundKeydown, true);
        this.clearChatSearch();
        this.root?.remove();
        document.querySelector('#nt-chat-history')?.remove();
        this.root = null;
        this.mounted = false;
        document.body?.classList.remove('nt-chat-toolbar-ready');
    }

    bindEvents() {
        const context = getContext();
        const source = context?.eventSource;
        const types = context?.eventTypes || context?.event_types;
        if (!source || !types) return;
        for (const key of ['CHAT_CHANGED', 'CHAT_CREATED', 'CHAT_DELETED', 'GROUP_CHAT_DELETED', 'GROUP_UPDATED', 'ONLINE_STATUS_CHANGED']) {
            if (!types[key]) continue;
            try {
                source.on(types[key], this.boundContextRefresh);
                this.events.push({ source, type: types[key], handler: this.boundContextRefresh });
            } catch (_) {}
        }
    }

    ensureUI() {
        if (!this.root) this.root = document.querySelector('#nt-chat-toolbar');
        if (this.root) return this.root;
        document.querySelector('#nt-chat-history')?.remove();
        document.querySelector('#nt-chat-search-panel')?.remove();
        document.querySelector('#nt-chat-more-menu')?.remove();
        const root = document.createElement('section');
        root.id = 'nt-chat-toolbar';
        root.hidden = true;
        root.setAttribute('role', 'toolbar');
        root.setAttribute('aria-label', 'Chat controls');
        root.innerHTML = `
          <div class="nt-chat-toolbar-main">
            <div class="nt-chat-left-group">
              <button type="button" class="nt-chat-history-trigger" data-nt-chat-history-toggle title="Open chat list" aria-label="Open chat list">${icons.history}<span>Chats</span></button>
              <span class="nt-chat-message-count" data-nt-chat-message-count>0 messages</span>
            </div>
            <div class="nt-chat-search-cluster">
              <button type="button" class="nt-chat-tool-button" data-nt-chat-search-prev title="Previous match" aria-label="Previous match">${icons.arrowUp}</button>
              <label class="nt-chat-inline-search" title="Search messages">${icons.search}<input type="search" placeholder="Search this chat…" data-nt-chat-search-input><span class="nt-chat-search-count" data-nt-chat-search-count>0/0</span></label>
              <button type="button" class="nt-chat-tool-button" data-nt-chat-search-next title="Next match" aria-label="Next match">${icons.arrowDown}</button>
            </div>
            <div class="nt-chat-action-group">
              <button type="button" class="nt-chat-tool-button" data-nt-chat-action="files" title="Chat files" aria-label="Chat files">${icons.folder}</button>
              <button type="button" class="nt-chat-tool-button" data-nt-chat-action="new" title="New chat" aria-label="New chat">${icons.plus}</button>
              <button type="button" class="nt-chat-tool-button" data-nt-chat-action="rename" title="Rename chat" aria-label="Rename chat">${icons.edit}</button>
              <button type="button" class="nt-chat-tool-button" data-nt-chat-action="top" title="Jump to first message" aria-label="Jump to first message">${icons.arrowUp}</button>
              <button type="button" class="nt-chat-tool-button" data-nt-chat-action="bottom" title="Jump to latest message" aria-label="Jump to latest message">${icons.arrowDown}</button>
              <button type="button" class="nt-chat-tool-button is-danger" data-nt-chat-action="delete" title="Delete chat" aria-label="Delete chat">${icons.trash}</button>
              <button type="button" class="nt-chat-tool-button" data-nt-chat-action="close" title="Close chat" aria-label="Close chat">${icons.close}</button>
            </div>
          </div>
          <div class="nt-chat-toolbar-secondary">
            <div class="nt-chat-toolbar-extras" data-nt-chat-extras></div>
          </div>
          <button type="button" class="nt-chat-global-collapse-toggle" data-nt-toolbar-collapse="all" title="Minimize chat bar" aria-label="Minimize chat bar">${icons.arrowUp}</button>`;
        const history = document.createElement('aside');
        history.id = 'nt-chat-history';
        history.hidden = true;
        history.innerHTML = `
          <div class="nt-chat-popover-header">
            <div><b>Chats</b><small data-nt-chat-history-current>Current conversation</small></div>
            <button type="button" data-nt-chat-history-close title="Close" aria-label="Close">${icons.close}</button>
          </div>
          <label class="nt-chat-popover-search">${icons.search}<input type="search" placeholder="Filter chats…" data-nt-chat-history-search></label>
          <div class="nt-chat-history-list" data-nt-chat-history-list></div>`;
        root.addEventListener('click', event => this.onToolbarClick(event));
        history.addEventListener('click', event => this.onHistoryClick(event));
        history.querySelector('[data-nt-chat-history-search]').addEventListener('input', event => this.renderHistoryList(event.target.value));
        root.querySelector('[data-nt-chat-search-input]').addEventListener('input', event => this.searchChat(event.target.value));
        document.body.append(root, history);
        this.root = root;
        document.body?.classList.add('nt-chat-toolbar-ready');
        return root;
    }

    integrateQuickButtons() {
        const host = this.root?.querySelector('[data-nt-chat-extras]');
        if (!host) return;
        for (const id of ['nt-timeline-button', 'nt-context-inspector-button', 'nt-world-info-info-button', 'nt-variable-manager-quick-button', 'nt-calendar-button', 'nt-chat-tools-button']) {
            const button = document.getElementById(id);
            if (!button) continue;
            button.classList.add('nt-chat-inline-extra');
            if (button.parentElement !== host) host.append(button);
        }
    }

    tick() {
        this.ensureUI();
        this.integrateQuickButtons();
        this.syncVisibility();
        this.refresh();
    }

    syncVisibility() {
        const isChat = document.body?.dataset?.mtView === 'chat';
        if (this.root) this.root.hidden = !isChat;
        if (!isChat) this.toggleHistory(false);
    }

    async refresh(force = false) {
        const context = getContext();
        const chatId = chatIdOf(context);
        const characterId = context?.characterId ?? null;
        const groupId = context?.groupId ?? null;
        const changed = force || chatId !== this.lastChatId || characterId !== this.lastCharacterId || groupId !== this.lastGroupId;
        this.lastChatId = chatId;
        this.lastCharacterId = characterId;
        this.lastGroupId = groupId;
        this.updateMessageCount();
        if (changed) await this.refreshChats();
        else this.syncSelectedChat();
        const currentLabel = document.querySelector('[data-nt-chat-history-current]');
        if (currentLabel) currentLabel.textContent = chatId || 'No active chat';
    }

    async refreshChats() {
        const context = getContext();
        const current = chatIdOf(context);
        const sequence = ++this.fetchSequence;
        let list = [];
        if (context?.groupId) {
            const group = Array.isArray(context.groups) ? context.groups.find(item => String(item.id) === String(context.groupId)) : null;
            list = Array.isArray(group?.chats) ? group.chats.map(item => typeof item === 'string' ? item : item?.file_name || item?.id || item?.name || '').filter(Boolean) : [];
        } else if (context && context.characterId !== undefined && context.characterId !== null) {
            const avatar = context.characters?.[context.characterId]?.avatar;
            const headers = context.getRequestHeaders?.();
            if (avatar && headers) {
                try {
                    const response = await fetch('/api/characters/chats', {
                        method: 'POST',
                        headers,
                        body: JSON.stringify({ avatar_url: avatar, simple: true }),
                    });
                    if (response.ok) {
                        const data = await response.json();
                        list = Array.isArray(data) ? data.map(item => String(item?.file_name ?? item ?? '').replace(/\.jsonl$/i, '')).filter(Boolean) : [];
                    }
                } catch (_) {}
            }
        }
        if (sequence !== this.fetchSequence) return;
        if (current && !list.includes(current)) list.unshift(current);
        this.chatList = [...new Set(list)].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
        this.renderChatTabs();
    }

    renderChatTabs() {
        this.renderHistoryList();
    }

    renderHistoryList(filter = '') {
        const host = document.querySelector('[data-nt-chat-history-list]');
        if (!host) return;
        const needle = String(filter || '').trim().toLowerCase();
        const list = needle ? this.chatList.filter(name => name.toLowerCase().includes(needle)) : this.chatList;
        if (!list.length) {
            host.innerHTML = `<div class="nt-chat-history-empty"><span>${icons.history}</span><b>No chats found</b><small>${needle ? 'Try another search.' : 'No saved conversations are available.'}</small></div>`;
            return;
        }
        host.innerHTML = list.map(name => `<button type="button" class="nt-chat-history-item${name === this.lastChatId ? ' is-active' : ''}" data-nt-chat-open="${escapeHtml(name)}" title="${escapeHtml(name)}"><span>${icons.chat}</span><b>${escapeHtml(name)}</b>${name === this.lastChatId ? '<small>Current</small>' : ''}</button>`).join('');
    }

    syncSelectedChat() {
        document.querySelectorAll('#nt-chat-history [data-nt-chat-open]').forEach(button => {
            button.classList.toggle('is-active', button.dataset.ntChatOpen === this.lastChatId);
        });
    }

    toggleHistory(force) {
        const panel = document.querySelector('#nt-chat-history');
        if (!panel) return;
        const open = typeof force === 'boolean' ? force : panel.hidden;
        panel.hidden = !open;
        this.root?.querySelector('[data-nt-chat-history-toggle]')?.classList.toggle('is-active', open);
        if (open) {
            const input = panel.querySelector('[data-nt-chat-history-search]');
            if (input) input.value = '';
            this.renderHistoryList();
        }
    }

    onHistoryClick(event) {
        if (event.target.closest('[data-nt-chat-history-close]')) {
            this.toggleHistory(false);
            return;
        }
        const chat = event.target.closest('[data-nt-chat-open]');
        if (!chat) return;
        this.toggleHistory(false);
        this.openChat(chat.dataset.ntChatOpen);
    }

    updateMessageCount() {
        const count = document.querySelectorAll('#chat .mes').length;
        const target = this.root?.querySelector('[data-nt-chat-message-count]');
        if (target) target.textContent = `${count} message${count === 1 ? '' : 's'}`;
    }

    async openChat(chatId) {
        if (!chatId || chatId === this.lastChatId) return;
        const context = getContext();
        try {
            if (context?.groupId && typeof context.openGroupChat === 'function') await context.openGroupChat(context.groupId, chatId);
            else if (typeof context?.openCharacterChat === 'function') await context.openCharacterChat(chatId);
        } catch (_) {
            this.toast?.('Could not open this chat.');
        }
    }

    stepChat(direction) {
        if (!this.chatList.length) return;
        let index = this.chatList.indexOf(this.lastChatId);
        if (index < 0) index = 0;
        const next = this.chatList[(index + direction + this.chatList.length) % this.chatList.length];
        this.openChat(next);
    }

    onToolbarClick(event) {
        const collapse = event.target.closest('[data-nt-toolbar-collapse]')?.dataset.ntToolbarCollapse;
        if (collapse) {
            this.onToggleSection?.(collapse);
            return;
        }
        if (event.target.closest('[data-nt-chat-history-toggle]')) {
            this.toggleHistory();
            return;
        }
        if (event.target.closest('[data-nt-chat-search-prev]')) {
            this.moveSearch(-1);
            return;
        }
        if (event.target.closest('[data-nt-chat-search-next]')) {
            this.moveSearch(1);
            return;
        }
        const action = event.target.closest('[data-nt-chat-action]')?.dataset.ntChatAction;
        if (!action) return;
        if (action === 'files') this.clickNative('#option_select_chat');
        if (action === 'new') this.clickNative('#option_start_new_chat');
        if (action === 'rename') this.renameCurrentChat();
        if (action === 'top') this.scrollChat('top');
        if (action === 'bottom') this.scrollChat('bottom');
        if (action === 'close') this.clickNative('#option_close_chat');
        if (action === 'delete') this.deleteCurrentChat();
    }

    clickNative(selector) {
        const target = document.querySelector(selector);
        if (!target) {
            this.toast?.('This SillyTavern action is not available right now.');
            return false;
        }
        try { target.click(); return true; } catch (_) { return false; }
    }

    async renameCurrentChat() {
        const context = getContext();
        const current = chatIdOf(context);
        if (!current || typeof context?.renameChat !== 'function') return;
        let value = null;
        try {
            if (context.Popup?.show?.input) value = await context.Popup.show.input('Enter new chat name', null, current);
            else value = window.prompt('Enter new chat name', current);
        } catch (_) {}
        if (!value || String(value) === current) return;
        try {
            await context.renameChat(current, String(value));
            await this.refresh(true);
        } catch (_) {
            this.toast?.('Could not rename the current chat.');
        }
    }

    async deleteCurrentChat() {
        const context = getContext();
        if (!chatIdOf(context)) return;
        let confirmed = false;
        try {
            confirmed = context.Popup?.show?.confirm ? await context.Popup.show.confirm('Delete the current chat?') : window.confirm('Delete the current chat?');
        } catch (_) {}
        if (!confirmed) return;
        try {
            if (typeof context?.executeSlashCommandsWithOptions === 'function') await context.executeSlashCommandsWithOptions('/delchat');
            else this.toast?.('Delete chat is unavailable in this SillyTavern build.');
        } catch (_) {
            this.toast?.('Could not delete the current chat.');
        }
    }

    scrollChat(where) {
        const chat = document.querySelector('#chat');
        if (!chat) return;
        chat.scrollTo({ top: where === 'top' ? 0 : chat.scrollHeight, behavior: 'smooth' });
    }

    searchChat(query) {
        this.clearChatSearch(false);
        const needle = String(query || '').trim().toLowerCase();
        if (!needle) {
            this.updateSearchCount();
            return;
        }
        this.searchMatches = [...document.querySelectorAll('#chat .mes')].filter(message => {
            const text = message.querySelector('.mes_text')?.textContent || '';
            return text.toLowerCase().includes(needle);
        });
        this.searchMatches.forEach(message => message.classList.add('nt-chat-search-hit'));
        this.searchIndex = this.searchMatches.length ? 0 : -1;
        this.focusSearchMatch();
    }

    clearChatSearch(resetInput = true) {
        document.querySelectorAll('#chat .nt-chat-search-hit, #chat .nt-chat-search-current').forEach(message => message.classList.remove('nt-chat-search-hit', 'nt-chat-search-current'));
        this.searchMatches = [];
        this.searchIndex = -1;
        if (resetInput) {
            const input = this.root?.querySelector('[data-nt-chat-search-input]');
            if (input) input.value = '';
        }
        this.updateSearchCount();
    }

    moveSearch(direction) {
        if (!this.searchMatches.length) return;
        this.searchIndex = (this.searchIndex + direction + this.searchMatches.length) % this.searchMatches.length;
        this.focusSearchMatch();
    }

    focusSearchMatch() {
        this.searchMatches.forEach((message, index) => message.classList.toggle('nt-chat-search-current', index === this.searchIndex));
        const current = this.searchMatches[this.searchIndex];
        current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        this.updateSearchCount();
    }

    updateSearchCount() {
        const target = this.root?.querySelector('[data-nt-chat-search-count]');
        if (!target) return;
        target.textContent = this.searchMatches.length ? `${this.searchIndex + 1}/${this.searchMatches.length}` : '0/0';
    }

    onKeydown(event) {
        if (event.key !== 'Escape') return;
        const history = document.querySelector('#nt-chat-history');
        if (history && !history.hidden) {
            this.toggleHistory(false);
            return;
        }
        const input = this.root?.querySelector('[data-nt-chat-search-input]');
        if (input && input.value) {
            input.value = '';
            this.clearChatSearch(false);
            input.blur();
        }
    }
}
