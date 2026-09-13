import { icons } from './icons.js';
import { t } from './i18n.js';

const HERO_IMAGE = new URL('../assets/home-hero.webp', import.meta.url).href;

const ctx = () => {
    try { return window.SillyTavern?.getContext?.() || null; } catch (_) { return null; }
};

const escapeHtml = value => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const formatBytes = size => { const n = Number(size || 0); if (!Number.isFinite(n) || n <= 0) return '0 B'; if (n < 1024) return `${n} B`; if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`; return `${(n / 1024 / 1024).toFixed(1)} MB`; };
const isFavorite = value => value === true || value === 1 || ['1', 'true', 'yes', 'on'].includes(String(value ?? '').toLowerCase());
const timestamp = value => {
    if (value === undefined || value === null || value === '') return 0;
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

export class HomeDashboard {
    constructor(options = {}) {
        this.navigate = options.navigate || (() => {});
        this.toast = options.toast || (() => {});
        this.getCommunitySnapshot = options.getCommunitySnapshot || (() => ({ ready:false, signedIn:false, online:0, messages:[], characterCards:[], lorebooks:[], mentions:0 }));
        this.openCommunity = options.openCommunity || (() => {});
        this.openCommunityResource = options.openCommunityResource || (() => {});
        this.root = null;
        this.active = false;
        this.lastSignature = '';
        this.lastCommunitySignature = '';
        this.recentNodes = [];
        this.boundClick = event => this.onClick(event);
    }

    mount() {
        if (this.root?.isConnected) return this.root;
        this.root = document.querySelector('#nt-home-dashboard');
        if (!this.root) {
            const root = document.createElement('section');
            root.id = 'nt-home-dashboard';
            root.hidden = true;
            root.setAttribute('aria-label', t('NastyTavern Home'));
            root.addEventListener('click', this.boundClick);
            document.body.append(root);
            this.root = root;
        }
        return this.root;
    }

    unmount() {
        this.root?.removeEventListener('click', this.boundClick);
        this.root?.remove();
        this.root = null;
        this.active = false;
        this.lastSignature = '';
        this.lastCommunitySignature = '';
        this.recentNodes = [];
        document.body?.classList.remove('nt-home-active');
    }

    isNoChat() {
        const context = ctx();
        if (!context) return false;

        let chatId = '';
        try { chatId = context.getCurrentChatId?.() ?? context.chatId ?? ''; }
        catch (_) { chatId = context.chatId ?? ''; }

        if (chatId !== undefined && chatId !== null && String(chatId) !== '') return false;

        // Temporary chats intentionally have no persistent chat id too.
        // The real distinction is whether SillyTavern is still rendering its Welcome Screen.
        const chat = document.querySelector('#chat');
        const welcome = chat?.querySelector('.welcomePanel, [class*="welcomePanel"], [data-welcome-screen]');
        if (welcome) return true;

        // Compatibility fallback for builds where the welcome wrapper class changes:
        // recent-chat cards only exist on the Welcome Screen, never in a temporary chat.
        if (chat?.querySelector('.recentChat')) return true;

        return false;
    }

    sync({ view = 'chat' } = {}) {
        this.mount();
        const shouldShow = view === 'chat' && this.isNoChat();
        if (!shouldShow) {
            if (this.active) {
                this.active = false;
                this.root.hidden = true;
                document.body?.classList.remove('nt-home-active');
            }
            return;
        }

        this.active = true;
        this.root.hidden = false;
        document.body?.classList.add('nt-home-active');

        const characters = this.getCharacters();
        const recent = this.getRecentCharacters(characters);
        const favorites = this.getFavoriteCharacters(characters);
        const community = this.getCommunitySnapshot?.() || { ready:false, signedIn:false, online:0, messages:[], characterCards:[], lorebooks:[], mentions:0 };
        const signature = JSON.stringify({
            recent: recent.map(item => [item.characterIndex, item.file, item.avatar, item.title, item.preview, item.meta]),
            favorites: favorites.map(item => [item.characterIndex, item.avatar, item.title]),
            characterCount: characters.length,
            version: this.getVersion(),
        });
        const communitySignature = JSON.stringify([
            community.ready,
            community.signedIn,
            community.online,
            community.mentions,
            ...(community.messages || []).map(m => [m.id, m.channel_slug, m.content, m.created_at, m.profile?.username, m.profile?.avatar_url]),
            ...(community.characterCards || []).map(m => [m.id, m.metadata?.display_name, m.metadata?.name, m.metadata?.size, m.metadata?.path, m.profile?.username]),
            ...(community.lorebooks || []).map(m => [m.id, m.metadata?.display_name, m.metadata?.name, m.metadata?.size, m.metadata?.path, m.profile?.username]),
        ]);

        // Realtime Community updates are frequent. Re-rendering the entire Home page here
        // recreates the scroll container and sends the user back to the top. When only
        // Community changed, update that widget in place and leave the rest of Home alone.
        if (signature === this.lastSignature) {
            if (communitySignature !== this.lastCommunitySignature) {
                this.lastCommunitySignature = communitySignature;
                this.updateCommunityWidget(community);
            }
            return;
        }

        this.lastSignature = signature;
        this.lastCommunitySignature = communitySignature;
        this.render({ characters, recent, favorites, community });
    }

    getVersion() {
        return clean(document.querySelector('#version_display')?.textContent) || 'SillyTavern';
    }

    getCharacters() {
        const context = ctx();
        const list = Array.isArray(context?.characters) ? context.characters : [];
        return list
            .map((character, characterIndex) => ({ character, characterIndex }))
            .filter(({ character }) => character && clean(character.name || character.avatar));
    }

    avatarUrl(avatar) {
        if (!avatar) return '';
        const context = ctx();
        try {
            const url = context?.getThumbnailUrl?.('avatar', avatar);
            if (url) return String(url);
        } catch (_) {}
        return `/thumbnail?type=avatar&file=${encodeURIComponent(avatar)}`;
    }

    getNativeRecentChats() {
        const context = ctx();
        const characters = Array.isArray(context?.characters) ? context.characters : [];
        const nodes = [...document.querySelectorAll('#chat .welcomePanel .recentChat, #chat .recentChat')]
            .filter((node, index, list) => list.indexOf(node) === index);

        return nodes.map((node, index) => {
            const avatar = node.getAttribute('data-avatar') || '';
            const group = node.getAttribute('data-group') || '';
            const file = node.getAttribute('data-file') || '';
            const characterIndex = characters.findIndex(item => String(item?.avatar || '') === avatar);
            const character = characterIndex >= 0 ? characters[characterIndex] : null;
            const image = node.querySelector('img')?.src || this.avatarUrl(avatar);
            const nativeText = clean(node.textContent);
            const title = clean(character?.name || file.replace(/\.jsonl$/i, '') || t('Conversation {count}', { count: index + 1 }));
            const fileLabel = clean(file.replace(/\.jsonl$/i, ''));
            let preview = clean(node.querySelector('.recentChatMessage, .recentChatPreview, .chatPreview, .mes, .mes_text, .ch_description')?.textContent);
            if (!preview) preview = nativeText.replace(title, '').replace(fileLabel, '').trim();
            preview = preview.slice(0, 150);
            const meta = clean(node.querySelector('small, time, .timestamp, .recentChatDate')?.textContent);
            return { node, nativeIndex: index, avatar, group, file, characterIndex, character, title, preview, meta, image };
        });
    }

    getRecentCharacters(characterEntries) {
        const byAvatar = new Map(characterEntries.map(entry => [String(entry.character?.avatar || ''), entry]));
        const recent = [];
        const seen = new Set();

        for (const item of this.getNativeRecentChats()) {
            if (item.group || !item.avatar || seen.has(item.avatar)) continue;
            const entry = byAvatar.get(String(item.avatar));
            if (!entry) continue;
            seen.add(item.avatar);
            recent.push({
                ...item,
                character: entry.character,
                characterIndex: entry.characterIndex,
                title: clean(entry.character?.name) || item.title,
                image: item.image || this.avatarUrl(item.avatar),
            });
        }

        const fallback = characterEntries
            .filter(entry => !seen.has(String(entry.character?.avatar || '')))
            .sort((a, b) => timestamp(b.character?.date_last_chat) - timestamp(a.character?.date_last_chat));

        for (const entry of fallback) {
            const character = entry.character;
            const avatar = String(character?.avatar || '');
            if (!avatar || seen.has(avatar)) continue;
            seen.add(avatar);
            recent.push({
                node: null,
                nativeIndex: -1,
                avatar,
                group: '',
                file: clean(character?.chat || ''),
                characterIndex: entry.characterIndex,
                character,
                title: clean(character?.name) || t('Unnamed character'),
                preview: clean(character?.description || character?.data?.description || '').slice(0, 150),
                meta: '',
                image: this.avatarUrl(avatar),
            });
        }

        return recent.slice(0, 12);
    }

    getFavoriteCharacters(characterEntries) {
        return characterEntries
            .filter(({ character }) => isFavorite(character?.fav))
            .sort((a, b) => {
                const recentDiff = timestamp(b.character?.date_last_chat) - timestamp(a.character?.date_last_chat);
                return recentDiff || clean(a.character?.name).localeCompare(clean(b.character?.name));
            })
            .map(entry => ({
                characterIndex: entry.characterIndex,
                avatar: String(entry.character?.avatar || ''),
                title: clean(entry.character?.name) || t('Unnamed character'),
                image: this.avatarUrl(entry.character?.avatar),
            }));
    }

    recentCharacterList(recent, hasCharacters) {
        if (!hasCharacters) return this.gettingStarted();
        if (!recent.length) {
            return `<div class="nt-home-list-empty"><span>${icons.characters}</span><b>${t('No recent characters')}</b><small>${t('Open a character from your library and it will appear here.')}</small><button type="button" data-nt-home-action="characters">${t('Browse characters')}</button></div>`;
        }

        this.recentNodes = recent.map(item => item.node);
        return recent.map((item, index) => `
          <button type="button" class="nt-home-character-row" data-nt-home-recent="${index}" data-nt-home-character="${item.characterIndex}" title="${escapeHtml(item.title)}">
            <span class="nt-home-character-avatar">${item.image ? `<img src="${escapeHtml(item.image)}" alt="">` : icons.characters}</span>
            <span class="nt-home-character-copy">
              <b>${escapeHtml(item.title)}</b>
              <small>${escapeHtml(item.preview || t('Open the latest conversation with this character.'))}</small>
              ${item.meta ? `<em>${escapeHtml(item.meta)}</em>` : ''}
            </span>
            <span class="nt-home-character-open">${icons.arrowRight}</span>
          </button>`).join('');
    }

    gettingStarted() {
        return `
          <div class="nt-home-getting-started">
            <span class="nt-home-getting-icon">${icons.characters}</span>
            <small>${t('GETTING STARTED')}</small>
            <h3>${t('Create your first character')}</h3>
            <p>${t('Characters are the heart of SillyTavern. Create one from scratch or import an existing character card to get started.')}</p>
            <div>
              <button type="button" class="is-primary" data-nt-home-action="create">${icons.plus}<span>${t('Create character')}</span></button>
              <button type="button" data-nt-home-action="import">${icons.upload}<span>${t('Import character')}</span></button>
            </div>
          </div>`;
    }

    favoriteCarousel(favorites) {
        if (!favorites.length) {
            return `
              <div class="nt-home-favorites-empty">
                <span>${icons.bookmark}</span>
                <div><b>${t('No favorite characters yet')}</b><small>${t('Mark characters as favorites to keep them one click away on this page.')}</small></div>
                <button type="button" data-nt-home-action="characters">${t('Browse characters')}</button>
              </div>`;
        }

        return `
          <div class="nt-home-favorites-track" data-nt-home-favorites-track>
            ${favorites.map(item => `
              <button type="button" class="nt-home-favorite-card" data-nt-home-favorite="${item.characterIndex}" title="${escapeHtml(item.title)}">
                <span>${item.image ? `<img src="${escapeHtml(item.image)}" alt="">` : icons.characters}</span>
                <b>${escapeHtml(item.title)}</b>
                <small>${t('Open character')}</small>
              </button>`).join('')}
          </div>`;
    }

    quickActions() {
        const actions = [
            ['temporary', icons.chat, t('Temporary chat'), t('Start without a character')],
            ['characters', icons.characters, t('Characters'), t('Browse your library')],
            ['create', icons.plus, t('Create character'), t('Build a new card')],
            ['import', icons.upload, t('Import character'), t('Add a card from a file')],
            ['models', icons.plug, t('API Connections'), t('Configure your model')],
            ['lorebooks', icons.lore, t('Lorebooks'), t('Manage world context')],
        ];
        return actions.map(([action, icon, label, hint]) => `
          <button type="button" data-nt-home-action="${action}">
            <span>${icon}</span><div><b>${label}</b><small>${hint}</small></div>${icons.arrowRight}
          </button>`).join('');
    }

    renderCommunityFeed(snapshot) {
        const messages = Array.isArray(snapshot.messages) ? snapshot.messages : [];
        if (!snapshot.ready) return `<div class="nt-home-community-loading"><span class="nt-community-spinner"></span><small>${t('Connecting to Community…')}</small></div>`;
        if (!snapshot.signedIn) return `<div class="nt-home-resource-empty nt-home-community-signed-out"><span>${icons.community}</span><small>${t('Sign in to Community to see recent messages.')}</small></div>`;
        return `<div class="nt-home-community-feed">${messages.length ? messages.map(message => `<button type="button" data-nt-home-action="community"><span class="nt-home-community-avatar">${message.profile?.avatar_url ? `<img src="${escapeHtml(message.profile.avatar_url)}" alt="">` : escapeHtml(String(message.profile?.username || '?').slice(0,2).toUpperCase())}</span><div><b>${escapeHtml(message.profile?.username || t('Unknown user'))}<em>#${escapeHtml(message.channel_slug === 'nastytavern' ? 'nastytavern' : t('General').toLowerCase())}</em></b><p>${escapeHtml(String(message.content || t('Shared a Community file')).slice(0,180))}</p></div></button>`).join('') : `<div class="nt-home-community-empty"><small>${t('No recent messages yet. Open Community and start the conversation.')}</small></div>`}</div>`;
    }

    renderSharedResources(resources, kind) {
        const rows = Array.isArray(resources) ? resources.slice(0, 5) : [];
        const empty = kind === 'character' ? t('No Character Cards shared yet.') : t('No Lorebooks shared yet.');
        const fallbackIcon = kind === 'character' ? icons.characters : icons.lore;
        if (!rows.length) return `<div class="nt-home-resource-empty"><span>${fallbackIcon}</span><small>${empty}</small></div>`;
        return `<div class="nt-home-resource-list">${rows.map(item => {
            const meta = item.metadata || {};
            const author = item.profile?.username || t('Unknown user');
            const logicalName = String(meta.display_name || meta.name || (kind === 'character' ? t('Character Card') : t('Lorebook'))).replace(/\.(?:png|json|lorebook)$/i, '');
            return `<button type="button" class="nt-home-resource-row" data-nt-home-resource="${escapeHtml(item.id)}" title="${escapeHtml(t('View resource details'))}: ${escapeHtml(logicalName)}"><span class="nt-home-resource-preview">${item.preview_url ? `<img src="${escapeHtml(item.preview_url)}" alt="${escapeHtml(logicalName)}">` : fallbackIcon}</span><span class="nt-home-resource-copy"><b>${escapeHtml(logicalName)}</b><small>${escapeHtml(t('Shared by {name}', { name: author }))}</small><em>${escapeHtml(formatBytes(meta.size))}</em></span>${icons.arrowRight}</button>`;
        }).join('')}</div>`;
    }

    updateCommunityWidget(community) {
        if (!this.root?.isConnected) return;
        const current = this.root.querySelector('[data-nt-home-community-widget]');
        if (!current) return;

        const scroll = this.root.querySelector('.nt-home-scroll');
        const scrollTop = scroll?.scrollTop ?? 0;
        const template = document.createElement('template');
        template.innerHTML = this.renderCommunityWidget(community).trim();
        const next = template.content.firstElementChild;
        if (!next) return;
        current.replaceWith(next);

        // Keep the viewport perfectly stable even if message/resource rows change height.
        if (scroll) {
            scroll.scrollTop = scrollTop;
            requestAnimationFrame(() => {
                if (scroll.isConnected) scroll.scrollTop = scrollTop;
            });
        }
    }

    renderCommunityWidget(community) {
        const snapshot = community || { ready:false, signedIn:false, online:0, messages:[], characterCards:[], lorebooks:[], mentions:0 };
        return `<div class="nt-home-community-grid" data-nt-home-community-widget>
          <section class="nt-home-section nt-home-community">
            <header><div><span>${icons.community}</span><div><h2>${t('Community')}</h2><small>${t('Latest from General and NastyTavern')}</small></div></div><nav>${snapshot.signedIn ? `<span class="nt-home-community-online">● ${Number(snapshot.online||0)} ${t('online')}</span>${snapshot.mentions ? `<span class="nt-home-community-mentions" title="${t('Unread mention')}" aria-label="${t('Unread mention')}"></span>` : ''}` : ''}<button type="button" class="nt-home-community-open" data-nt-home-action="community">${icons.community}<span>${t('Open Community')}</span>${icons.arrowRight}</button></nav></header>
            ${this.renderCommunityFeed(snapshot)}
          </section>
          <section class="nt-home-section nt-home-shared-panel nt-home-shared-characters">
            <header><div><span>${icons.characters}</span><div><h2>${t('Latest Character Cards')}</h2><small>${t('Recently shared Character Cards')}</small></div></div></header>
            ${snapshot.signedIn ? this.renderSharedResources(snapshot.characterCards, 'character') : `<div class="nt-home-resource-empty"><span>${icons.characters}</span><small>${t('Sign in to Community to see shared resources.')}</small></div>`}
          </section>
          <section class="nt-home-section nt-home-shared-panel nt-home-shared-lorebooks">
            <header><div><span>${icons.lore}</span><div><h2>${t('Latest Lorebooks')}</h2><small>${t('Recently shared Lorebooks')}</small></div></div></header>
            ${snapshot.signedIn ? this.renderSharedResources(snapshot.lorebooks, 'lorebook') : `<div class="nt-home-resource-empty"><span>${icons.lore}</span><small>${t('Sign in to Community to see shared resources.')}</small></div>`}
          </section>
        </div>`;
    }

    render({ characters, recent, favorites, community }) {
        if (!this.root) return;
        const previousScroll = this.root.querySelector('.nt-home-scroll')?.scrollTop ?? 0;
        const version = this.getVersion();
        const hasCharacters = characters.length > 0;
        this.root.innerHTML = `
          <div class="nt-home-scroll">
            <div class="nt-home-layout">
              <section class="nt-home-hero" style="--nt-home-hero-image:url('${HERO_IMAGE}')">
                <div class="nt-home-hero-copy">
                  <small>NASTYTAVERN</small>
                  <h1>${t('Welcome to')} <em>NastyTavern</em></h1>
                  <p>${t('A cleaner way to chat, create characters and build worlds with SillyTavern.')}</p>
                  <div class="nt-home-hero-actions">
                    <button type="button" class="is-primary" data-nt-home-action="temporary">${icons.chat}<span>${t('Open temporary chat')}</span>${icons.arrowRight}</button>
                    <button type="button" data-nt-home-action="characters">${icons.characters}<span>${t('Browse characters')}</span></button>
                  </div>
                </div>
              </section>

              <div class="nt-home-content-grid">
                <section class="nt-home-section nt-home-recent-characters">
                  <header>
                    <div><span>${icons.history}</span><div><h2>${t('Recent Characters')}</h2><small>${t('One entry per character, ordered by your latest chats.')}</small></div></div>
                    ${hasCharacters ? `<button type="button" data-nt-home-action="characters" title="${t('Browse all characters')}">${icons.characters}</button>` : ''}
                  </header>
                  <div class="nt-home-character-list">${this.recentCharacterList(recent, hasCharacters)}</div>
                </section>

                <div class="nt-home-right-stack">
                  <section class="nt-home-section nt-home-favorites">
                    <header>
                      <div><span>${icons.bookmark}</span><div><h2>${t('Favorite Characters')}</h2><small>${t('Quickly jump back into your favorite cards.')}</small></div></div>
                      ${favorites.length > 0 ? `<nav><button type="button" data-nt-home-carousel="prev" title="${t('Previous')}">${icons.arrowLeft}</button><button type="button" data-nt-home-carousel="next" title="${t('Next')}">${icons.arrowRight}</button></nav>` : ''}
                    </header>
                    ${this.favoriteCarousel(favorites)}
                  </section>

                  <section class="nt-home-section nt-home-quick-section">
                    <header><div><span>${icons.command}</span><div><h2>${t('Quick Actions')}</h2><small>${t('Common actions, always within reach.')}</small></div></div></header>
                    <div class="nt-home-quick-grid">${this.quickActions()}</div>
                  </section>
                </div>
              </div>

              ${this.renderCommunityWidget(community)}

              <footer class="nt-home-footer">
                <div>
                  <a href="https://docs.sillytavern.app/" target="_blank" rel="noreferrer">${icons.note}<span>${t('Documentation')}</span>${icons.external}</a>
                  <a href="https://github.com/AnNastyLoneGirl/NastyTavern-UI" target="_blank" rel="noreferrer">${icons.external}<span>GitHub</span></a>
                  <a href="https://discord.gg/F4ps4dA7tB" target="_blank" rel="noreferrer">${icons.chat}<span>Discord</span>${icons.external}</a>
                </div>
                <small>${escapeHtml(version)} · NastyTavern UI v0.1.2</small>
              </footer>
            </div>
          </div>`;

        const scroll = this.root.querySelector('.nt-home-scroll');
        if (scroll && previousScroll > 0) {
            scroll.scrollTop = previousScroll;
            requestAnimationFrame(() => {
                if (scroll.isConnected) scroll.scrollTop = previousScroll;
            });
        }
    }

    clickNative(selector) {
        const el = document.querySelector(selector);
        if (!el) return false;
        try { el.click(); return true; } catch (_) { return false; }
    }

    async selectCharacter(characterIndex) {
        const context = ctx();
        if (!Number.isInteger(characterIndex) || characterIndex < 0) return false;
        try {
            if (typeof context?.selectCharacterById === 'function') {
                await context.selectCharacterById(characterIndex);
                return true;
            }
        } catch (_) {}
        this.navigate('characters');
        return false;
    }

    async openTemporaryChat() {
        const context = ctx();
        const execute = context?.executeSlashCommandsWithOptions;
        if (typeof execute !== 'function') {
            console.error('[NastyTavern] Slash command API unavailable; cannot open temporary chat.');
            this.toast?.(t('Could not open temporary chat.'));
            return false;
        }

        // Hide NastyTavern Home immediately so the native chat surface can transition.
        this.active = false;
        if (this.root) this.root.hidden = true;
        document.body?.classList.remove('nt-home-active');

        try {
            const result = await execute('/tempchat');
            if (result?.isError || result?.isAborted) {
                throw new Error(result?.errorMessage || result?.abortReason || 'Temporary chat command failed');
            }

            // Give SillyTavern one frame to replace the Welcome Screen with the temporary chat.
            await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            this.sync({ view: 'chat' });
            document.querySelector('#send_textarea')?.focus?.({ preventScroll: true });
            return true;
        } catch (error) {
            console.error('[NastyTavern] Could not open temporary chat', error);
            this.toast?.(t('Could not open temporary chat.'));
            this.sync({ view: 'chat' });
            return false;
        }
    }

    onClick(event) {
        const recent = event.target.closest('[data-nt-home-recent]');
        if (recent) {
            const index = Number(recent.dataset.ntHomeRecent);
            const original = this.recentNodes?.[index];
            if (original) original.click();
            else this.selectCharacter(Number(recent.dataset.ntHomeCharacter));
            return;
        }

        const favorite = event.target.closest('[data-nt-home-favorite]');
        if (favorite) {
            this.selectCharacter(Number(favorite.dataset.ntHomeFavorite));
            return;
        }

        const carousel = event.target.closest('[data-nt-home-carousel]')?.dataset.ntHomeCarousel;
        if (carousel) {
            const track = this.root?.querySelector('[data-nt-home-favorites-track]');
            track?.scrollBy?.({ left: (carousel === 'prev' ? -1 : 1) * Math.max(260, track.clientWidth * .7), behavior: 'smooth' });
            return;
        }

        const resource = event.target.closest('[data-nt-home-resource]');
        if (resource) {
            const id = String(resource.dataset.ntHomeResource || '');
            const snapshot = this.getCommunitySnapshot?.() || {};
            const item = [...(snapshot.characterCards || []), ...(snapshot.lorebooks || [])].find(entry => String(entry?.id) === id);
            if (item) this.openCommunityResource?.(item);
            return;
        }

        const action = event.target.closest('[data-nt-home-action]')?.dataset.ntHomeAction;
        if (!action) return;
        if (action === 'temporary') {
            void this.openTemporaryChat();
            return;
        }
        if (action === 'create') {
            this.navigate('characters');
            setTimeout(() => document.querySelector('#rm_button_create')?.click(), 180);
            return;
        }
        if (action === 'import') {
            this.navigate('characters');
            setTimeout(() => document.querySelector('#character_import_button')?.click(), 180);
            return;
        }
        if (action === 'community') {
            this.openCommunity?.();
            return;
        }
        if (['characters', 'models', 'lorebooks'].includes(action)) this.navigate(action);
    }
}
