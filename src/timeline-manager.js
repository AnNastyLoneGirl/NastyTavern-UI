import { icons } from './icons.js';
import { t } from './i18n.js';
import { getContextSafe as getContext, escapeHtml } from './utils.js';
import { createModalShell, showModalShell, hideModalShell } from './modal-shell.js';

const stripExt = value => String(value ?? '').replace(/\.jsonl$/i, '');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const textOf = message => String(message?.mes ?? message?.message ?? '').replace(/\r\n/g, '\n').trim();
const roleOf = message => message?.is_system ? 'system' : message?.is_user ? 'user' : 'character';
const roleLabel = role => role === 'user' ? t('User') : role === 'system' ? t('System') : t('Character');
const displayDate = value => {
    if (!value) return '';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
};
const hashText = value => {
    let hash = 2166136261;
    const text = String(value ?? '');
    for (let i = 0; i < text.length; i++) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
};
const matchesFragments = (text, query) => {
    const fragments = String(query ?? '').toLocaleLowerCase().split(/\s+/).filter(Boolean);
    if (!fragments.length) return true;
    const haystack = String(text ?? '').toLocaleLowerCase();
    return fragments.every(fragment => haystack.includes(fragment));
};
const currentChatId = context => {
    try { return stripExt(context?.getCurrentChatId?.() || context?.chatId || ''); } catch (_) { return stripExt(context?.chatId || ''); }
};
const NODE_WIDTH = 250;
const NODE_HEIGHT = 108;

export class TimelineManager {
    constructor(toast) {
        this.toast = toast;
        this.button = null;
        this.root = null;
        this.viewport = null;
        this.stage = null;
        this.inspector = null;
        this.zoom = 1;
        this.minZoom = .4;
        this.maxZoom = 2;
        this.panState = null;
        this.events = [];
        this.interval = null;
        this.mounted = false;
        this.loading = false;
        this.loadSequence = 0;
        this.lastIdentity = '';
        this.lastLoadedAt = 0;
        this.chats = [];
        this.nodes = [];
        this.edges = [];
        this.nodeMap = new Map();
        this.selectedKey = '';
        this.searchQuery = '';
        this.boundContextChange = () => this.onContextChange();
    }

    mount() {
        this.ensureButton();
        this.ensurePanel();
        this.syncVisibility();
        if (this.mounted) return;
        this.mounted = true;
        this.bindEvents();
        this.interval = setInterval(() => this.tick(), 650);
    }

    unmount() {
        for (const { source, type, handler } of this.events) {
            try { source?.removeListener?.(type, handler); } catch (_) {}
        }
        this.events = [];
        clearInterval(this.interval);
        this.interval = null;
        this.root?.remove();
        this.button?.remove();
        this.root = null;
        this.button = null;
        this.viewport = null;
        this.stage = null;
        this.inspector = null;
        this.zoom = 1;
        this.minZoom = .4;
        this.maxZoom = 2;
        this.panState = null;
        this.mounted = false;
        document.body?.classList.remove('nt-timeline-open');
    }

    bindEvents() {
        if (this.events.length) return;
        const context = getContext();
        const source = context?.eventSource;
        const types = context?.eventTypes || context?.event_types;
        if (!source || !types) return;
        for (const key of ['CHAT_CHANGED', 'CHAT_CREATED', 'CHAT_DELETED', 'CHAT_LOADED', 'GROUP_UPDATED', 'GROUP_CHAT_DELETED']) {
            if (!types[key]) continue;
            try {
                source.on(types[key], this.boundContextChange);
                this.events.push({ source, type: types[key], handler: this.boundContextChange });
            } catch (_) {}
        }
    }

    ensureButton() {
        const existing = document.querySelector('#nt-timeline-button');
        if (existing) {
            this.button = existing;
            return existing;
        }
        const button = document.createElement('button');
        button.id = 'nt-timeline-button';
        button.type = 'button';
        button.title = 'Story Timeline';
        button.setAttribute('aria-label', 'Open story timeline');
        button.innerHTML = `<span class="nt-timeline-button-icon">${icons.timeline}</span>`;
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
        let existing = document.querySelector('#nt-timeline-panel');
        if (existing && !existing.querySelector('[data-nt-timeline-stage]')) {
            existing.remove();
            existing = null;
        }
        if (existing) {
            this.root = existing;
            this.viewport = existing.querySelector('[data-nt-timeline-viewport]');
            this.stage = existing.querySelector('[data-nt-timeline-stage]');
            this.inspector = existing.querySelector('[data-nt-timeline-inspector]');
            return existing;
        }
        const { root, header } = createModalShell({
            id: 'nt-timeline-panel',
            title: 'Story Timeline',
            subtitle: 'Current character',
            icon: icons.timeline,
            size: 'large',
            rootClass: 'nt-timeline-modal-root',
            modalClass: 'nt-timeline-modal',
            bodyClass: 'nt-timeline-modal-body',
            closeAttrs: { 'data-nt-timeline-close': '' },
            headerActionsHtml: `
              <button type="button" data-nt-timeline-focus title="Focus current chat">${icons.target}<span>Current path</span></button>
              <button type="button" data-nt-timeline-refresh title="Refresh timeline">${icons.refresh}<span>Refresh</span></button>`,
            bodyHtml: `
              <div class="nt-timeline-toolbar">
                <label class="nt-timeline-search">${icons.search}<input type="search" placeholder="Search every message…" data-nt-timeline-search><span class="nt-timeline-search-count" data-nt-timeline-search-count></span></label>
                <div class="nt-timeline-zoom">
                  <button type="button" data-nt-timeline-zoom-out title="Zoom out" aria-label="Zoom out">−</button>
                  <button type="button" data-nt-timeline-zoom-reset title="Reset zoom"><span data-nt-timeline-zoom-label>100%</span></button>
                  <button type="button" data-nt-timeline-zoom-in title="Zoom in" aria-label="Zoom in">+</button>
                </div>
                <div class="nt-timeline-stats">
                  <span><b data-nt-timeline-chat-count>0</b> chats</span>
                  <span><b data-nt-timeline-node-count>0</b> nodes</span>
                  <span><b data-nt-timeline-branch-count>0</b> branches</span>
                </div>
              </div>
              <div class="nt-timeline-progress" data-nt-timeline-progress hidden><span></span><b>Building timeline…</b><small data-nt-timeline-progress-text>Loading chats</small></div>
              <div class="nt-timeline-body">
                <div class="nt-timeline-viewport" data-nt-timeline-viewport>
                  <div class="nt-timeline-stage" data-nt-timeline-stage><div class="nt-timeline-canvas" data-nt-timeline-canvas></div></div>
                  <div class="nt-timeline-empty" data-nt-timeline-empty hidden><span>${icons.timeline}</span><b>No timeline yet</b><small>Start or load a chat, then refresh this view.</small></div>
                </div>
                <aside class="nt-timeline-inspector" data-nt-timeline-inspector>
                  <div class="nt-timeline-inspector-empty"><span>${icons.timeline}</span><b>Select a message</b><small>Click a node to inspect it, jump to its chat, or create a branch from it.</small></div>
                </aside>
              </div>`
        });
        header?.querySelector('.nt-modal-heading')?.classList.add('nt-timeline-heading');
        header?.querySelector('.nt-modal-heading-icon')?.classList.add('nt-timeline-heading-icon');
        header?.querySelector('.nt-modal-header-actions')?.classList.add('nt-timeline-header-actions');
        const subtitle = header?.querySelector('.nt-modal-heading-copy > small');
        if (subtitle) subtitle.dataset.ntTimelineSubtitle = '';
        document.body.append(root);
        root.addEventListener('click', event => this.onClick(event));
        root.addEventListener('dblclick', event => this.onDoubleClick(event));
        root.querySelector('[data-nt-timeline-search]').addEventListener('input', event => {
            this.searchQuery = event.target.value;
            this.applySearch();
        });
        this.root = root;
        this.viewport = root.querySelector('[data-nt-timeline-viewport]');
        this.stage = root.querySelector('[data-nt-timeline-stage]');
        this.inspector = root.querySelector('[data-nt-timeline-inspector]');
        this.viewport.addEventListener('wheel', event => this.onCanvasWheel(event), { passive: false });
        this.viewport.addEventListener('pointerdown', event => this.onCanvasPointerDown(event));
        this.viewport.addEventListener('pointermove', event => this.onCanvasPointerMove(event));
        this.viewport.addEventListener('pointerup', event => this.onCanvasPointerUp(event));
        this.viewport.addEventListener('pointercancel', event => this.onCanvasPointerUp(event));
        return root;
    }

    syncVisibility() {
        const isChat = document.body?.dataset?.mtView === 'chat';
        if (this.button) this.button.hidden = !isChat;
        if (!isChat && this.root && !this.root.hidden) this.close();
    }

    tick() {
        this.ensureButton();
        this.ensurePanel();
        this.syncVisibility();
        const identity = this.getIdentity();
        if (identity !== this.lastIdentity) {
            this.lastIdentity = identity;
            if (this.root && !this.root.hidden) this.refresh(true);
        }
    }

    getIdentity() {
        const context = getContext();
        if (!context) return '';
        if (context.groupId) return `g:${context.groupId}:${currentChatId(context)}`;
        const character = context.characters?.[context.characterId];
        return `c:${character?.avatar || context.characterId || ''}:${currentChatId(context)}`;
    }

    onContextChange() {
        const identity = this.getIdentity();
        this.lastIdentity = identity;
        if (this.root && !this.root.hidden) setTimeout(() => this.refresh(true), 80);
    }

    toggle() {
        if (!this.root || this.root.hidden) this.open();
        else this.close();
    }

    async open() {
        this.ensurePanel();
        this.ensureButton();
        showModalShell(this.root);
        document.body?.classList.add('nt-timeline-open');
        this.button?.classList.add('is-active');
        const stale = Date.now() - this.lastLoadedAt > 30000 || this.getIdentity() !== this.lastIdentity;
        this.lastIdentity = this.getIdentity();
        if (!this.nodes.length || stale) await this.refresh(true);
        else requestAnimationFrame(() => this.focusCurrent());
    }

    close() {
        if (this.root) hideModalShell(this.root);
        document.body?.classList.remove('nt-timeline-open');
        this.button?.classList.remove('is-active');
    }

    async refresh(force = false) {
        if (this.loading && !force) return;
        const context = getContext();
        if (!context) return;
        const sequence = ++this.loadSequence;
        this.loading = true;
        this.setProgress(true, 'Finding chats…');
        try {
            const chats = await this.fetchChats(context, sequence);
            if (sequence !== this.loadSequence) return;
            this.chats = chats;
            this.buildGraph(context);
            this.renderGraph();
            this.lastLoadedAt = Date.now();
            this.lastIdentity = this.getIdentity();
            requestAnimationFrame(() => this.focusCurrent());
        } catch (error) {
            this.toast?.('Timeline could not be built for this chat.');
            this.renderEmpty();
        } finally {
            if (sequence === this.loadSequence) {
                this.loading = false;
                this.setProgress(false);
            }
        }
    }

    setProgress(visible, text = '') {
        const bar = this.root?.querySelector('[data-nt-timeline-progress]');
        if (!bar) return;
        bar.hidden = !visible;
        const target = bar.querySelector('[data-nt-timeline-progress-text]');
        if (target && text) target.textContent = text;
    }

    async fetchChats(context, sequence) {
        const headers = context.getRequestHeaders?.() || { 'Content-Type': 'application/json' };
        const current = currentChatId(context);
        let descriptors = [];
        if (context.groupId) {
            const group = context.groups?.find?.(item => String(item.id) === String(context.groupId));
            descriptors = (group?.chats || []).map(value => ({ id: stripExt(typeof value === 'string' ? value : value?.file_name || value?.chat_id || ''), raw: value })).filter(item => item.id);
        } else {
            const character = context.characters?.[context.characterId];
            if (!character?.avatar) return [];
            const response = await fetch('/api/characters/chats', {
                method: 'POST',
                headers,
                body: JSON.stringify({ avatar_url: character.avatar }),
            });
            const data = await response.json();
            descriptors = (Array.isArray(data) ? data : []).map(item => ({ id: stripExt(item?.file_name || ''), raw: item })).filter(item => item.id);
        }
        const unique = [...new Map(descriptors.map(item => [item.id, item])).values()];
        unique.sort((a, b) => a.id === current ? -1 : b.id === current ? 1 : String(b.raw?.file_name || b.id).localeCompare(String(a.raw?.file_name || a.id)));
        const results = new Array(unique.length);
        let cursor = 0;
        let complete = 0;
        const worker = async () => {
            while (cursor < unique.length && sequence === this.loadSequence) {
                const index = cursor++;
                const descriptor = unique[index];
                try { results[index] = await this.fetchChat(context, descriptor, headers); } catch (_) { results[index] = null; }
                complete++;
                this.setProgress(true, `Loading ${complete}/${unique.length} chats…`);
            }
        };
        await Promise.all(Array.from({ length: Math.min(4, Math.max(1, unique.length)) }, () => worker()));
        return results.filter(Boolean);
    }

    async fetchChat(context, descriptor, headers) {
        if (context.groupId) {
            let response = await fetch('/api/chats/group/get', {
                method: 'POST', headers, body: JSON.stringify({ id: descriptor.id }),
            });
            let data = await response.json();
            if ((!Array.isArray(data) || !data.length) && String(descriptor.raw || '').endsWith('.jsonl')) {
                response = await fetch('/api/chats/group/get', {
                    method: 'POST', headers, body: JSON.stringify({ id: String(descriptor.raw).replace(/\.jsonl$/i, '') }),
                });
                data = await response.json();
            }
            const array = Array.isArray(data) ? data : Array.isArray(data?.chat) ? data.chat : [];
            const header = array[0]?.chat_metadata ? array[0] : null;
            return { id: descriptor.id, label: descriptor.id, header, messages: header ? array.slice(1) : array, modified: descriptor.raw?.last_mes || '' };
        }
        const character = context.characters?.[context.characterId];
        const response = await fetch('/api/chats/get', {
            method: 'POST',
            headers,
            body: JSON.stringify({ ch_name: character?.name || context.name2 || '', file_name: descriptor.id, avatar_url: character?.avatar || '' }),
        });
        const data = await response.json();
        if (!Array.isArray(data)) return null;
        const header = data[0]?.chat_metadata ? data[0] : null;
        const messages = header ? data.slice(1) : data;
        return { id: descriptor.id, label: descriptor.raw?.file_name ? stripExt(descriptor.raw.file_name) : descriptor.id, header, messages, modified: descriptor.raw?.last_mes || descriptor.raw?.file_size || '' };
    }

    buildGraph(context) {
        const current = currentChatId(context);
        const nodeMap = new Map();
        const edgeMap = new Map();
        const root = { key: '__root__', depth: -1, text: 'Start', role: 'system', sessions: [], incoming: new Set(), outgoing: new Set(), swipes: 0, checkpoint: false, x: 34, y: 0 };
        nodeMap.set(root.key, root);
        const lanes = new Map(this.chats.map((chat, index) => [chat.id, index]));
        let maxDepth = 0;
        for (const chat of this.chats) {
            let previous = root.key;
            chat.messages.forEach((message, index) => {
                const text = textOf(message);
                const role = roleOf(message);
                const key = `${index}:${role}:${hashText(text)}`;
                let node = nodeMap.get(key);
                if (!node || node.text !== text) {
                    const collisionKey = node && node.text !== text ? `${key}:${hashText(text + key)}` : key;
                    node = nodeMap.get(collisionKey);
                    if (!node) {
                        node = {
                            key: collisionKey,
                            depth: index,
                            text,
                            role,
                            name: String(message?.name || (role === 'user' ? context.name1 || 'User' : context.name2 || 'Character')),
                            sessions: [],
                            incoming: new Set(),
                            outgoing: new Set(),
                            swipes: 0,
                            checkpoint: false,
                            x: 0,
                            y: 0,
                        };
                        nodeMap.set(collisionKey, node);
                    }
                }
                const swipeCount = Array.isArray(message?.swipes) ? message.swipes.length : Array.isArray(message?.swipe_info) ? message.swipe_info.length : 0;
                const checkpoint = Boolean(message?.extra?.bookmark_link || message?.extra?.checkpoint || message?.extra?.bookmark);
                node.swipes = Math.max(node.swipes, swipeCount);
                node.checkpoint ||= checkpoint;
                node.sessions.push({ chatId: chat.id, chatLabel: chat.label, messageIndex: index, message, isCurrent: chat.id === current, parent: stripExt(chat.header?.chat_metadata?.main_chat || '') });
                const edgeKey = `${previous}->${node.key}`;
                let edge = edgeMap.get(edgeKey);
                if (!edge) {
                    edge = { key: edgeKey, from: previous, to: node.key, sessions: new Set(), current: false };
                    edgeMap.set(edgeKey, edge);
                }
                edge.sessions.add(chat.id);
                edge.current ||= chat.id === current;
                nodeMap.get(previous)?.outgoing.add(node.key);
                node.incoming.add(previous);
                previous = node.key;
                maxDepth = Math.max(maxDepth, index);
            });
        }
        const groups = new Map();
        for (const node of nodeMap.values()) {
            if (node.key === root.key) continue;
            if (!groups.has(node.depth)) groups.set(node.depth, []);
            groups.get(node.depth).push(node);
        }
        const gapX = NODE_WIDTH + 42;
        const gapY = NODE_HEIGHT + 28;
        let maxY = 0;
        for (const [depth, group] of [...groups.entries()].sort((a, b) => a[0] - b[0])) {
            group.sort((a, b) => this.averageLane(a, lanes) - this.averageLane(b, lanes));
            let lastY = 34;
            for (const node of group) {
                const desired = 60 + this.averageLane(node, lanes) * gapY;
                node.x = 96 + depth * gapX;
                node.y = Math.max(desired, lastY);
                lastY = node.y + NODE_HEIGHT + 18;
                maxY = Math.max(maxY, node.y);
            }
        }
        root.y = Math.max(84, (maxY + 78) / 2);
        this.nodeMap = nodeMap;
        this.nodes = [...nodeMap.values()];
        this.edges = [...edgeMap.values()];
        this.canvasWidth = Math.max(1000, 180 + (maxDepth + 1) * gapX + 280);
        this.canvasHeight = Math.max(560, maxY + NODE_HEIGHT + 90, this.chats.length * gapY + 160);
        this.updateStats();
    }

    averageLane(node, lanes) {
        if (!node.sessions.length) return 0;
        return node.sessions.reduce((sum, session) => sum + (lanes.get(session.chatId) ?? 0), 0) / node.sessions.length;
    }

    updateStats() {
        const chats = this.root?.querySelector('[data-nt-timeline-chat-count]');
        const nodes = this.root?.querySelector('[data-nt-timeline-node-count]');
        const branches = this.root?.querySelector('[data-nt-timeline-branch-count]');
        if (chats) chats.textContent = String(this.chats.length);
        if (nodes) nodes.textContent = String(Math.max(0, this.nodes.length - 1));
        if (branches) branches.textContent = String(this.nodes.filter(node => node.key !== '__root__' && node.outgoing.size > 1).length);
        const context = getContext();
        const subtitle = this.root?.querySelector('[data-nt-timeline-subtitle]');
        if (subtitle) {
            const group = context?.groupId ? context.groups?.find?.(item => String(item.id) === String(context.groupId)) : null;
            const character = !context?.groupId ? context?.characters?.[context.characterId] : null;
            subtitle.textContent = group?.name || character?.name || context?.name2 || t('Current chat');
        }
    }

    renderGraph() {
        const canvas = this.root?.querySelector('[data-nt-timeline-canvas]');
        const empty = this.root?.querySelector('[data-nt-timeline-empty]');
        if (!canvas || !empty) return;
        if (this.nodes.length <= 1) {
            this.renderEmpty();
            return;
        }
        empty.hidden = true;
        canvas.innerHTML = '';
        canvas.style.width = `${this.canvasWidth}px`;
        canvas.style.height = `${this.canvasHeight}px`;
        this.updateCanvasTransform();
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('class', 'nt-timeline-edges');
        svg.setAttribute('width', String(this.canvasWidth));
        svg.setAttribute('height', String(this.canvasHeight));
        svg.setAttribute('viewBox', `0 0 ${this.canvasWidth} ${this.canvasHeight}`);
        for (const edge of this.edges) {
            const from = this.nodeMap.get(edge.from);
            const to = this.nodeMap.get(edge.to);
            if (!from || !to) continue;
            const fromX = from.key === '__root__' ? from.x + 48 : from.x + NODE_WIDTH;
            const fromY = from.y + (from.key === '__root__' ? 20 : NODE_HEIGHT / 2);
            const toX = to.x;
            const toY = to.y + NODE_HEIGHT / 2;
            const mid = Math.max(42, (toX - fromX) * .5);
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', `M ${fromX} ${fromY} C ${fromX + mid} ${fromY}, ${toX - mid} ${toY}, ${toX} ${toY}`);
            path.setAttribute('class', `nt-timeline-edge${edge.current ? ' is-current' : ''}`);
            path.dataset.edgeKey = edge.key;
            svg.append(path);
        }
        canvas.append(svg);
        const start = document.createElement('div');
        start.className = 'nt-timeline-start';
        start.style.left = `${this.nodeMap.get('__root__').x}px`;
        start.style.top = `${this.nodeMap.get('__root__').y}px`;
        start.innerHTML = `<span></span><b>${t('Start')}</b>`;
        canvas.append(start);
        for (const node of this.nodes) {
            if (node.key === '__root__') continue;
            const current = node.sessions.some(session => session.isCurrent);
            const card = document.createElement('div');
            card.className = `nt-timeline-node role-${node.role}${current ? ' is-current' : ''}${node.checkpoint ? ' is-checkpoint' : ''}${node.outgoing.size > 1 ? ' is-branch' : ''}`;
            card.dataset.ntTimelineNode = node.key;
            card.tabIndex = 0;
            card.setAttribute('role', 'button');
            card.style.left = `${node.x}px`;
            card.style.top = `${node.y}px`;
            const badges = [];
            if (node.swipes > 1) badges.push(`<span title="${t('{count} swipes', { count: node.swipes })}">↔ ${node.swipes}</span>`);
            if (node.sessions.length > 1) badges.push(`<span title="${t('Shared by {count} chats', { count: node.sessions.length })}">${t('{count} chats', { count: node.sessions.length })}</span>`);
            if (node.outgoing.size > 1) badges.push(`<span class="is-branch-badge">${t('{count} branches', { count: node.outgoing.size })}</span>`);
            card.innerHTML = `<span class="nt-timeline-node-top"><i></i><b>${escapeHtml(node.name || roleLabel(node.role))}</b><small>#${node.depth + 1}</small></span><span class="nt-timeline-node-text">${escapeHtml(node.text || t('(empty message)'))}</span><span class="nt-timeline-node-badges">${badges.join('')}</span><span class="nt-timeline-node-actions"><button type="button" data-nt-timeline-node-go="${escapeHtml(node.key)}">${t('Go to')}</button><button type="button" data-nt-timeline-node-branch="${escapeHtml(node.key)}">${t('New Branch')}</button></span>`;
            canvas.append(card);
        }
        this.applySearch();
        if (this.selectedKey && this.nodeMap.has(this.selectedKey)) this.selectNode(this.selectedKey, false);
        else this.renderInspector(null);
    }

    renderEmpty() {
        const canvas = this.root?.querySelector('[data-nt-timeline-canvas]');
        const empty = this.root?.querySelector('[data-nt-timeline-empty]');
        if (canvas) canvas.innerHTML = '';
        if (empty) empty.hidden = false;
        this.renderInspector(null);
        this.updateStats();
    }

    applySearch() {
        const query = this.searchQuery.trim();
        let matches = 0;
        for (const element of this.root?.querySelectorAll('[data-nt-timeline-node]') || []) {
            const node = this.nodeMap.get(element.dataset.ntTimelineNode);
            const match = !query || matchesFragments(`${node?.name || ''} ${node?.text || ''} ${node?.sessions.map(session => session.chatLabel).join(' ') || ''}`, query);
            element.classList.toggle('is-search-match', Boolean(query && match));
            element.classList.toggle('is-search-dim', Boolean(query && !match));
            if (query && match) matches++;
        }
        const target = this.root?.querySelector('[data-nt-timeline-search-count]');
        if (target) target.textContent = query ? t('{count} matches', { count: matches }) : '';
        if (query && matches) {
            const first = this.root?.querySelector('[data-nt-timeline-node].is-search-match');
            const node = first ? this.nodeMap.get(first.dataset.ntTimelineNode) : null;
            if (node) this.centerNode(node, true);
        }
    }

    selectNode(key, scroll = false) {
        const node = this.nodeMap.get(key);
        if (!node || key === '__root__') return;
        this.selectedKey = key;
        this.root?.querySelectorAll('[data-nt-timeline-node].is-selected').forEach(element => element.classList.remove('is-selected'));
        const element = this.root?.querySelector(`[data-nt-timeline-node="${CSS.escape(key)}"]`);
        element?.classList.add('is-selected');
        if (scroll) this.centerNode(node, true);
        this.renderInspector(node);
    }

    renderInspector(node) {
        if (!this.inspector) return;
        if (!node) {
            this.inspector.innerHTML = `<div class="nt-timeline-inspector-empty"><span>${icons.timeline}</span><b>Select a message</b><small>Click a node to inspect it, jump to its chat, or create a branch from it.</small></div>`;
            return;
        }
        const preferred = node.sessions.find(session => session.isCurrent) || node.sessions[0];
        const swipes = Array.isArray(preferred?.message?.swipes) ? preferred.message.swipes : [];
        const date = preferred?.message?.send_date || preferred?.message?.gen_started || preferred?.message?.gen_finished || '';
        const sessionCards = node.sessions.map((session, index) => `
          <article class="nt-timeline-session${session.isCurrent ? ' is-current' : ''}">
            <div><b>${escapeHtml(session.chatLabel)}</b><small>${session.isCurrent ? t('Current chat') : session.parent ? t('Branch of {name}', { name: escapeHtml(session.parent) }) : t('Conversation')}</small></div>
            <div class="nt-timeline-session-actions">
              <button type="button" data-nt-timeline-open-session="${index}">${t('Go to')}</button>
              <button type="button" data-nt-timeline-branch-session="${index}">${t('New Branch')}</button>
            </div>
          </article>`).join('');
        const swipeCards = swipes.length > 1 ? `
          <details class="nt-timeline-swipes">
            <summary><span>${t('Swipes')}</span><b>${swipes.length}</b></summary>
            <div>${swipes.map((swipe, index) => `<article${index === Number(preferred?.message?.swipe_id || 0) ? ' class="is-active"' : ''}><b>${t('Swipe {count}', { count: index + 1 })}</b><p>${escapeHtml(String(swipe || '').slice(0, 500))}</p></article>`).join('')}</div>
          </details>` : '';
        this.inspector.innerHTML = `
          <div class="nt-timeline-inspector-head">
            <div><span class="nt-timeline-role role-${node.role}">${roleLabel(node.role)}</span><b>${escapeHtml(node.name || roleLabel(node.role))}</b><small>${t('Message {count}', { count: node.depth + 1 })}${date ? ` · ${escapeHtml(displayDate(date))}` : ''}</small></div>
            <span class="nt-timeline-depth">#${node.depth + 1}</span>
          </div>
          <div class="nt-timeline-inspector-chips">
            ${node.outgoing.size > 1 ? `<span>${t('{count} branches', { count: node.outgoing.size })}</span>` : ''}
            ${node.swipes > 1 ? `<span>${t('{count} swipes', { count: node.swipes })}</span>` : ''}
            ${node.checkpoint ? '<span class="is-checkpoint">Checkpoint</span>' : ''}
            ${node.sessions.length > 1 ? `<span>${t('{count} chats', { count: node.sessions.length })}</span>` : ''}
          </div>
          <div class="nt-timeline-message-preview">${escapeHtml(node.text || t('(empty message)'))}</div>
          ${swipeCards}
          <section class="nt-timeline-inspector-section"><div class="nt-timeline-section-title"><b>${t('Appears in')}</b><small>${t('{count} conversations', { count: node.sessions.length })}</small></div><div class="nt-timeline-session-list">${sessionCards}</div></section>`;
    }


    updateCanvasTransform() {
        const canvas = this.root?.querySelector('[data-nt-timeline-canvas]');
        if (!canvas || !this.stage || !this.viewport) return;
        canvas.style.transform = `scale(${this.zoom})`;
        canvas.style.transformOrigin = '0 0';
        this.stage.style.width = `${Math.max(this.viewport.clientWidth, this.canvasWidth * this.zoom)}px`;
        this.stage.style.height = `${Math.max(this.viewport.clientHeight, this.canvasHeight * this.zoom)}px`;
        this.stage.style.backgroundSize = `${22 * this.zoom}px ${22 * this.zoom}px`;
        const label = this.root?.querySelector('[data-nt-timeline-zoom-label]');
        if (label) label.textContent = `${Math.round(this.zoom * 100)}%`;
    }

    setZoom(value, clientX = null, clientY = null) {
        if (!this.viewport) return;
        const next = Math.min(this.maxZoom, Math.max(this.minZoom, Number(value) || 1));
        if (Math.abs(next - this.zoom) < .001) return;
        const rect = this.viewport.getBoundingClientRect();
        const focusX = clientX == null ? this.viewport.clientWidth / 2 : clientX - rect.left;
        const focusY = clientY == null ? this.viewport.clientHeight / 2 : clientY - rect.top;
        const logicalX = (this.viewport.scrollLeft + focusX) / this.zoom;
        const logicalY = (this.viewport.scrollTop + focusY) / this.zoom;
        this.zoom = next;
        this.updateCanvasTransform();
        requestAnimationFrame(() => {
            this.viewport.scrollLeft = logicalX * this.zoom - focusX;
            this.viewport.scrollTop = logicalY * this.zoom - focusY;
        });
    }

    onCanvasWheel(event) {
        if (!this.viewport || this.root?.hidden) return;
        if (event.target.closest('input, textarea, select')) return;
        event.preventDefault();
        const factor = Math.exp(-event.deltaY * .0014);
        this.setZoom(this.zoom * factor, event.clientX, event.clientY);
    }

    onCanvasPointerDown(event) {
        if (!this.viewport || event.button !== 0) return;
        if (event.target.closest('button, input, textarea, select, a, [data-nt-timeline-node]')) return;
        this.panState = {
            id: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            left: this.viewport.scrollLeft,
            top: this.viewport.scrollTop,
        };
        this.viewport.classList.add('is-panning');
        try { this.viewport.setPointerCapture(event.pointerId); } catch (_) {}
        event.preventDefault();
    }

    onCanvasPointerMove(event) {
        if (!this.panState || this.panState.id !== event.pointerId || !this.viewport) return;
        this.viewport.scrollLeft = this.panState.left - (event.clientX - this.panState.x);
        this.viewport.scrollTop = this.panState.top - (event.clientY - this.panState.y);
        event.preventDefault();
    }

    onCanvasPointerUp(event) {
        if (!this.panState || this.panState.id !== event.pointerId) return;
        try { this.viewport?.releasePointerCapture(event.pointerId); } catch (_) {}
        this.panState = null;
        this.viewport?.classList.remove('is-panning');
    }

    centerNode(node, smooth = false) {
        if (!node || !this.viewport) return;
        const left = (node.x + NODE_WIDTH / 2) * this.zoom - this.viewport.clientWidth / 2;
        const top = (node.y + NODE_HEIGHT / 2) * this.zoom - this.viewport.clientHeight / 2;
        this.viewport.scrollTo({ left: Math.max(0, left), top: Math.max(0, top), behavior: smooth ? 'smooth' : 'auto' });
    }

    preferredSession(node) {
        return node?.sessions?.find(session => session.isCurrent) || node?.sessions?.[0] || null;
    }

    onClick(event) {
        if (event.target.closest('[data-nt-timeline-zoom-out]')) {
            this.setZoom(this.zoom / 1.18);
            return;
        }
        if (event.target.closest('[data-nt-timeline-zoom-reset]')) {
            this.setZoom(1);
            return;
        }
        if (event.target.closest('[data-nt-timeline-zoom-in]')) {
            this.setZoom(this.zoom * 1.18);
            return;
        }
        const nodeGo = event.target.closest('[data-nt-timeline-node-go]');
        if (nodeGo) {
            event.stopPropagation();
            const node = this.nodeMap.get(nodeGo.dataset.ntTimelineNodeGo);
            const session = this.preferredSession(node);
            if (session) this.openSession(session);
            return;
        }
        const nodeBranch = event.target.closest('[data-nt-timeline-node-branch]');
        if (nodeBranch) {
            event.stopPropagation();
            const node = this.nodeMap.get(nodeBranch.dataset.ntTimelineNodeBranch);
            const session = this.preferredSession(node);
            if (session) this.branchSession(session);
            return;
        }
        if (event.target.closest('[data-nt-timeline-close]')) {
            this.close();
            return;
        }
        if (event.target.closest('[data-nt-timeline-refresh]')) {
            this.refresh(true);
            return;
        }
        if (event.target.closest('[data-nt-timeline-focus]')) {
            this.focusCurrent();
            return;
        }
        const nodeElement = event.target.closest('[data-nt-timeline-node]');
        if (nodeElement) {
            this.selectNode(nodeElement.dataset.ntTimelineNode);
            return;
        }
        const open = event.target.closest('[data-nt-timeline-open-session]');
        if (open) {
            const node = this.nodeMap.get(this.selectedKey);
            const session = node?.sessions?.[Number(open.dataset.ntTimelineOpenSession)];
            if (session) this.openSession(session);
            return;
        }
        const branch = event.target.closest('[data-nt-timeline-branch-session]');
        if (branch) {
            const node = this.nodeMap.get(this.selectedKey);
            const session = node?.sessions?.[Number(branch.dataset.ntTimelineBranchSession)];
            if (session) this.branchSession(session);
        }
    }

    onDoubleClick(event) {
        if (event.target.closest('.nt-timeline-node-actions')) return;
        const element = event.target.closest('[data-nt-timeline-node]');
        if (!element) return;
        const node = this.nodeMap.get(element.dataset.ntTimelineNode);
        const session = node?.sessions.find(item => item.isCurrent) || node?.sessions[0];
        if (session) this.openSession(session);
    }

    focusCurrent() {
        const context = getContext();
        const id = currentChatId(context);
        const currentNodes = this.nodes.filter(node => node.sessions?.some(session => session.chatId === id));
        const node = currentNodes.sort((a, b) => b.depth - a.depth)[0];
        if (!node) return;
        this.selectNode(node.key, true);
        const element = this.root?.querySelector(`[data-nt-timeline-node="${CSS.escape(node.key)}"]`);
        element?.classList.add('is-focus-flash');
        setTimeout(() => element?.classList.remove('is-focus-flash'), 900);
    }

    async openSession(session) {
        if (!session) return;
        const context = getContext();
        try {
            if (context?.groupId && typeof context.openGroupChat === 'function') await context.openGroupChat(context.groupId, session.chatId);
            else if (typeof context?.openCharacterChat === 'function') await context.openCharacterChat(session.chatId);
            await this.jumpToMessage(session.messageIndex);
        } catch (error) {
            this.toast?.('Could not open this timeline chat.');
        }
    }

    async jumpToMessage(index) {
        for (let attempt = 0; attempt < 30; attempt++) {
            const message = document.querySelector(`#chat .mes[mesid="${index}"]`) || document.querySelectorAll('#chat .mes')[index];
            if (message) {
                message.scrollIntoView({ behavior: 'smooth', block: 'center' });
                message.classList.add('nt-timeline-jump-flash');
                setTimeout(() => message.classList.remove('nt-timeline-jump-flash'), 1100);
                return message;
            }
            await sleep(80);
        }
        return null;
    }

    async branchSession(session) {
        if (!session) return;
        const context = getContext();
        try {
            if (currentChatId(context) !== session.chatId) {
                if (context?.groupId && typeof context.openGroupChat === 'function') await context.openGroupChat(context.groupId, session.chatId);
                else if (typeof context?.openCharacterChat === 'function') await context.openCharacterChat(session.chatId);
            }
            const message = await this.jumpToMessage(session.messageIndex);
            if (!message) {
                this.toast?.('Open this message and use Message actions → Branch.');
                return;
            }
            let branchButton = this.findBranchControl(message);
            if (!branchButton) {
                const menu = this.findMessageMenu(message);
                if (menu) {
                    menu.click();
                    await sleep(120);
                    branchButton = this.findVisibleBranchControl();
                }
            }
            if (branchButton) {
                branchButton.click();
                return;
            }
            this.toast?.('Message opened. Use its … menu and choose Branch.');
        } catch (error) {
            this.toast?.('Could not start a branch from this message.');
        }
    }

    findBranchControl(scope) {
        const selectors = ['[data-i18n*="branch" i]', '[title*="branch" i]', '[aria-label*="branch" i]', '.mes_branch', '.branch_button'];
        for (const selector of selectors) {
            const found = scope?.querySelector?.(selector);
            if (found) return found;
        }
        return [...(scope?.querySelectorAll?.('button,[role="button"],.mes_button,.menu_button') || [])].find(element => /\b(branch|branche|ramification)\b/i.test(`${element.textContent || ''} ${element.title || ''} ${element.getAttribute('aria-label') || ''}`)) || null;
    }

    findMessageMenu(message) {
        const selectors = ['[data-i18n*="message actions" i]', '[title*="message actions" i]', '[aria-label*="message actions" i]', '.mes_buttons .fa-ellipsis', '.mes_buttons .fa-ellipsis-h', '.mes_buttons .fa-ellipsis-v', '.mes_buttons .fa-ellipsis-vertical'];
        for (const selector of selectors) {
            const found = message?.querySelector?.(selector);
            if (found) return found.closest('button,[role="button"],.mes_button') || found;
        }
        return null;
    }

    findVisibleBranchControl() {
        const elements = [...document.querySelectorAll('[data-i18n*="branch" i],[title*="branch" i],[aria-label*="branch" i],button,[role="button"],.menu_button')];
        return elements.find(element => {
            const rect = element.getBoundingClientRect();
            if (!rect.width || !rect.height) return false;
            const text = `${element.textContent || ''} ${element.title || ''} ${element.getAttribute('aria-label') || ''} ${element.getAttribute('data-i18n') || ''}`;
            return /\b(branch|branche|ramification)\b/i.test(text);
        }) || null;
    }
}
