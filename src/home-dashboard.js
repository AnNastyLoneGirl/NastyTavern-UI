import { icons } from './icons.js';
import { t } from './i18n.js';
import { getContextSafe as ctx, escapeHtml } from './utils.js';
import { starsHtml } from './ui-templates.js';

const HERO_IMAGE = new URL('../assets/home-hero.webp', import.meta.url).href;


const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const isFavorite = value => value === true || value === 1 || ['1', 'true', 'yes', 'on'].includes(String(value ?? '').toLowerCase());
const timestamp = value => {
    if (value === undefined || value === null || value === '') return 0;
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeTimestamp = value => {
    const raw = timestamp(value);
    if (!raw) return 0;
    return raw > 0 && raw < 1e11 ? raw * 1000 : raw;
};

const relativeTime = value => {
    const ms = normalizeTimestamp(value);
    if (!ms) return '';
    const diff = ms - Date.now();
    const abs = Math.abs(diff);
    const units = abs < 60_000
        ? ['second', 1_000]
        : abs < 3_600_000
            ? ['minute', 60_000]
            : abs < 86_400_000
                ? ['hour', 3_600_000]
                : abs < 2_592_000_000
                    ? ['day', 86_400_000]
                    : ['month', 2_592_000_000];
    try {
        return new Intl.RelativeTimeFormat(undefined, { numeric: 'auto', style: 'narrow' }).format(Math.round(diff / units[1]), units[0]);
    } catch (_) {
        return '';
    }
};

const compactNumber = value => {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return '0';
    try { return new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(n); }
    catch (_) { return String(Math.round(n)); }
};

const renderRatingStars = value => {
    const average = Number(value || 0);
    return `<span class="nt-home-shared-rating-stars" aria-label="${escapeHtml(`${average ? average.toFixed(2) : '0.00'} / 5`)}">${starsHtml(average)}</span>`;
};

export class HomeDashboard {
    constructor(options = {}) {
        this.navigate = options.navigate || (() => {});
        this.toast = options.toast || (() => {});
        this.getCommunitySnapshot = options.getCommunitySnapshot || (() => ({ ready:false, signedIn:false, online:0, messages:[], characterCards:[], lorebooks:[], mentions:0 }));
        this.openCommunity = options.openCommunity || (() => {});
        this.openCommunityResource = options.openCommunityResource || (() => {});
        this.openCatalogue = options.openCatalogue || (() => {});
        this.openCreateCharacter = options.openCreateCharacter || null;
        this.root = null;
        this.active = false;
        this.lastSignature = '';
        this.lastCommunitySignature = '';
        this.lastResourceSignature = '';
        this.recentNodes = [];
        this.collectionTab = 'favorites';
        this.collectionTrack = null;
        this.collectionResizeObserver = null;
        this.boundClick = event => this.onClick(event);
        this.boundResize = () => this.updateCollectionScroller();
        this.boundCollectionScroll = () => this.updateCollectionScrollState();
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
            window.addEventListener('resize', this.boundResize, { passive: true });
            document.body.append(root);
            this.root = root;
        }
        return this.root;
    }

    unmount() {
        this.root?.removeEventListener('click', this.boundClick);
        window.removeEventListener('resize', this.boundResize);
        if (this.collectionTrack) this.collectionTrack.removeEventListener('scroll', this.boundCollectionScroll);
        this.collectionResizeObserver?.disconnect();
        this.collectionResizeObserver = null;
        this.collectionTrack = null;
        this.root?.remove();
        this.root = null;
        this.active = false;
        this.lastSignature = '';
        this.lastCommunitySignature = '';
        this.lastResourceSignature = '';
        this.recentNodes = [];
        document.body?.classList.remove('nt-home-active');
        this.setShellHomeHeader(false);
    }

    setShellHomeHeader(enabled) {
        const shell = document.querySelector('#mt-root');
        if (!shell || document.body?.dataset?.mtView !== 'chat') return;
        const title = shell.querySelector('[data-mt-title]');
        if (title) title.textContent = enabled ? t('Home') : t('Chat');
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
            this.setShellHomeHeader(false);
            return;
        }

        this.active = true;
        this.root.hidden = false;
        document.body?.classList.add('nt-home-active');
        this.setShellHomeHeader(true);

        const characters = this.getCharacters();
        const recent = this.getRecentCharacters(characters);
        const favorites = this.getFavoriteCharacters(characters);
        const community = this.getCommunitySnapshot?.() || { ready:false, signedIn:false, online:0, messages:[], characterCards:[], lorebooks:[], mentions:0 };
        const signature = JSON.stringify({
            recent: recent.map(item => [item.characterIndex, item.file, item.avatar, item.title, item.preview, item.meta, item.character?.date_last_chat]),
            favorites: favorites.map(item => [item.characterIndex, item.avatar, item.title]),
            characterCount: characters.length,
            collectionTab: this.collectionTab,
            version: this.getVersion(),
        });
        const communitySignature = JSON.stringify([
            community.ready,
            community.signedIn,
            community.online,
            community.mentions,
            ...(community.messages || []).map(m => [m.id, m.channel_slug, m.content, m.created_at, m.profile?.username, m.profile?.avatar_url]),
            ...(community.characterCards || []).map(m => [m.id, m.metadata?.display_name, m.metadata?.name, m.metadata?.size, m.metadata?.path, m.metadata?.downloads, m.metadata?.download_count, m.metadata?.rating, m.download_count, m.rating, m.rating_count, m.preview_url, m.profile?.username]),
            ...(community.lorebooks || []).map(m => [m.id, m.metadata?.display_name, m.metadata?.name, m.metadata?.size, m.metadata?.path, m.metadata?.downloads, m.metadata?.download_count, m.metadata?.rating, m.download_count, m.rating, m.rating_count, m.preview_url, m.profile?.username]),
        ]);
        const resourceSignature = JSON.stringify([
            community.signedIn,
            ...(community.characterCards || []).map(m => [m.id, m.metadata?.display_name, m.metadata?.name, m.metadata?.size, m.metadata?.path, m.metadata?.downloads, m.metadata?.download_count, m.metadata?.rating, m.download_count, m.rating, m.rating_count, m.profile?.username]),
            ...(community.lorebooks || []).map(m => [m.id, m.metadata?.display_name, m.metadata?.name, m.metadata?.size, m.metadata?.path, m.metadata?.downloads, m.metadata?.download_count, m.metadata?.rating, m.download_count, m.rating, m.rating_count, m.profile?.username]),
        ]);

        // Realtime Community updates are frequent. Re-rendering the entire Home page here
        // recreates the scroll container and sends the user back to the top. When only
        // Community changed, update that widget in place and leave the rest of Home alone.
        if (signature === this.lastSignature) {
            if (communitySignature !== this.lastCommunitySignature) {
                const resourcesChanged = resourceSignature !== this.lastResourceSignature;
                this.lastCommunitySignature = communitySignature;
                this.lastResourceSignature = resourceSignature;
                this.updateCommunityWidget(community, { resourcesChanged });
            }
            return;
        }

        this.lastSignature = signature;
        this.lastCommunitySignature = communitySignature;
        this.lastResourceSignature = resourceSignature;
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

        return recent
            .sort((a, b) => {
                const lastUsedDiff = timestamp(b.character?.date_last_chat) - timestamp(a.character?.date_last_chat);
                if (lastUsedDiff) return lastUsedDiff;

                // Preserve SillyTavern's native Recent Chats order when no reliable
                // last-use timestamp is available for one or both entries.
                const aNativeIndex = a.nativeIndex >= 0 ? a.nativeIndex : Number.POSITIVE_INFINITY;
                const bNativeIndex = b.nativeIndex >= 0 ? b.nativeIndex : Number.POSITIVE_INFINITY;
                const nativeOrderDiff = aNativeIndex - bNativeIndex;
                if (nativeOrderDiff) return nativeOrderDiff;

                return clean(a.title).localeCompare(clean(b.title));
            })
            .slice(0, 12);
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

    cardImage(image, fallbackIcon, title) {
        return image
            ? `<img class="nt-home-media-image" src="${escapeHtml(image)}" alt="" loading="lazy">`
            : `<span class="nt-home-media-fallback" aria-hidden="true">${fallbackIcon}</span>`;
    }

    recentCharacterList(recent, hasCharacters) {
        if (!hasCharacters) return this.gettingStarted();
        if (!recent.length) {
            return `<div class="nt-home-list-empty"><span>${icons.characters}</span><b>${t('No recent characters')}</b><small>${t('Open a character from your library and it will appear here.')}</small><button type="button" data-nt-home-action="characters">${t('Browse characters')}</button></div>`;
        }

        const visible = recent.slice(0, 10);
        this.recentNodes = visible.map(item => item.node);
        const cards = visible.map((item, index) => {
            const elapsed = relativeTime(item.character?.date_last_chat) || item.meta || '';
            return `<article class="nt-home-media-card nt-home-media-card-recent">
              ${this.cardImage(item.image, icons.characters, item.title)}
              <button type="button" class="nt-home-media-hit" data-nt-home-recent="${index}" data-nt-home-character="${item.characterIndex}" aria-label="${escapeHtml(item.title)}"></button>
              <div class="nt-home-media-content">
                ${elapsed ? `<span class="nt-home-media-subline">${escapeHtml(elapsed)}</span>` : ''}
                <b class="nt-home-media-title">${escapeHtml(item.title)}</b>
              </div>
            </article>`;
        });
        if (recent.length > 10) cards.push(this.viewAllCard('characters', icons.characters));
        return `<div class="nt-home-card-track" data-nt-home-collection-track>${cards.join('')}</div>`;
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

        const cards = favorites.slice(0, 10).map(item => `
          <article class="nt-home-media-card nt-home-media-card-favorite">
            ${this.cardImage(item.image, icons.characters, item.title)}
            <button type="button" class="nt-home-media-hit" data-nt-home-favorite="${item.characterIndex}" aria-label="${escapeHtml(item.title)}"></button>
            <div class="nt-home-media-content">
              <b class="nt-home-media-title">${escapeHtml(item.title)}</b>
            </div>
          </article>`);
        if (favorites.length > 10) cards.push(this.viewAllCard('characters', icons.characters));
        return `<div class="nt-home-card-track" data-nt-home-collection-track>${cards.join('')}</div>`;
    }

    viewAllCard(action, icon) {
        return `<article class="nt-home-media-card nt-home-view-all-card">
          ${this.cardImage('', icon, t('View all'))}
          <button type="button" class="nt-home-media-hit" data-nt-home-action="${escapeHtml(action)}" aria-label="${escapeHtml(t('View all'))}"></button>
          <div class="nt-home-media-content nt-home-view-all-content">
            <b class="nt-home-media-title">${escapeHtml(t('View all'))}</b>
          </div>
        </article>`;
    }

    quickActions() {
        const actions = [
            ['create', icons.characters, t('Create Character')],
            ['import', icons.download, t('Import JSON')],
            ['cloud', icons.cloud, t('Import Cloud')],
            ['catalogue', icons.workspace, t('Nasty Catalogue')],
        ];
        return actions.map(([action, icon, label]) => `
          <button type="button" data-nt-home-action="${action}">
            <span>${icon}</span><b>${label}</b>
          </button>`).join('');
    }

    renderCommunityFeed(snapshot) {
        const messages = Array.isArray(snapshot.messages) ? snapshot.messages : [];
        if (!snapshot.ready) return `<div class="nt-home-community-loading"><span class="nt-community-spinner"></span><small>${t('Connecting to Community…')}</small></div>`;
        if (!snapshot.signedIn) return `<div class="nt-home-resource-empty nt-home-community-signed-out"><span>${icons.community}</span><small>${t('Sign in to Community to see recent messages.')}</small></div>`;
        return `<div class="nt-home-community-feed">${messages.length ? messages.map(message => `<button type="button" data-nt-home-action="community"><span class="nt-home-community-avatar">${message.profile?.avatar_url ? `<img src="${escapeHtml(message.profile.avatar_url)}" alt="">` : escapeHtml(String(message.profile?.username || '?').slice(0,2).toUpperCase())}</span><div><b>${escapeHtml(message.profile?.username || t('Unknown user'))}<em>#${escapeHtml(message.channel_slug === 'nastytavern' ? 'nastytavern' : t('General').toLowerCase())}</em></b><p>${escapeHtml(String(message.content || t('Shared a Community file')).slice(0,180))}</p></div></button>`).join('') : `<div class="nt-home-community-empty"><small>${t('No recent messages yet. Open Community and start the conversation.')}</small></div>`}</div>`;
    }

    renderSharedResources(resources, kind) {
        const rows = Array.isArray(resources) ? resources : [];
        const empty = kind === 'character' ? t('No Character Cards shared yet.') : t('No Lorebooks shared yet.');
        const fallbackIcon = kind === 'character' ? icons.characters : icons.lore;
        if (!rows.length) return `<div class="nt-home-resource-empty"><span>${fallbackIcon}</span><small>${empty}</small></div>`;
        const cards = rows.slice(0, 10).map(item => {
            const meta = item.metadata || {};
            const author = item.profile?.username || t('Unknown user');
            const logicalName = String(meta.display_name || meta.name || (kind === 'character' ? t('Character Card') : t('Lorebook'))).replace(/\.(?:png|json|lorebook)$/i, '');
            const downloads = compactNumber(meta.download_count ?? meta.downloads ?? item.download_count ?? item.downloads ?? 0);
            const ratingRaw = Number(meta.rating ?? item.rating ?? 0);
            const rating = Number(item.rating_count || 0) > 0 && Number.isFinite(ratingRaw) ? ratingRaw : 0;
            return `<article class="nt-home-media-card nt-home-media-card-shared">
              ${this.cardImage(item.preview_url, fallbackIcon, logicalName)}
              <div class="nt-home-shared-rating">${renderRatingStars(rating)}</div>
              <button type="button" class="nt-home-media-hit" data-nt-home-resource="${escapeHtml(item.id)}" aria-label="${escapeHtml(logicalName)}"></button>
              <div class="nt-home-media-content">
                <span class="nt-home-shared-downloads">${icons.download}<span>${escapeHtml(downloads)}</span></span>
                <b class="nt-home-media-title">${escapeHtml(logicalName)}</b>
                <span class="nt-home-media-subline">${escapeHtml(t('Shared by {name}', { name: author }))}</span>
              </div>
            </article>`;
        });
        if (rows.length > 10) {
            cards.push(this.viewAllCard(kind === 'character' ? 'community-character-cards' : 'community-lorebooks', fallbackIcon));
        }
        return `<div class="nt-home-card-track" data-nt-home-collection-track>${cards.join('')}</div>`;
    }

    updateCommunityWidget(community, { resourcesChanged = false } = {}) {
        if (!this.root?.isConnected) return;
        const current = this.root.querySelector('[data-nt-home-community-widget]');
        if (!current) return;

        const scroll = this.root.querySelector('.nt-home-scroll');
        const scrollTop = scroll?.scrollTop ?? 0;
        const template = document.createElement('template');
        template.innerHTML = this.renderCommunityWidget(community).trim();
        const next = template.content.firstElementChild;
        if (next) current.replaceWith(next);

        if (resourcesChanged && (this.collectionTab === 'shared-characters' || this.collectionTab === 'shared-lorebooks')) {
            const content = this.root.querySelector('[data-nt-home-collection-content]');
            if (content) {
                const hasCharacters = this.getCharacters().length > 0;
                const recent = this.getRecentCharacters(this.getCharacters());
                const favorites = this.getFavoriteCharacters(this.getCharacters());
                content.innerHTML = this.renderCollectionContent({ favorites, recent, community, hasCharacters });
                requestAnimationFrame(() => this.updateCollectionScroller());
            }
        }

        if (scroll) {
            scroll.scrollTop = scrollTop;
            requestAnimationFrame(() => {
                if (scroll.isConnected) scroll.scrollTop = scrollTop;
            });
        }
    }

    renderCommunityWidget(community) {
        const snapshot = community || { ready:false, signedIn:false, online:0, messages:[], characterCards:[], lorebooks:[], mentions:0 };
        return `<section class="nt-home-section nt-home-community" data-nt-home-community-widget>
          <header>
            <div><div><h2>${t('Community')}</h2></div></div>
            <nav>${snapshot.signedIn ? `<span class="nt-home-community-online">● ${Number(snapshot.online||0)} ${t('online')}</span>${snapshot.mentions ? `<span class="nt-home-community-mentions" title="${t('Unread mention')}" aria-label="${t('Unread mention')}"></span>` : ''}` : ''}<button type="button" class="nt-home-community-open" data-nt-home-action="community"><span>${t('Open')}</span>${icons.arrowRight}</button></nav>
          </header>
          ${this.renderCommunityFeed(snapshot)}
        </section>`;
    }

    renderCollectionContent({ favorites, recent, community, hasCharacters }) {
        const snapshot = community || { ready:false, signedIn:false, characterCards:[], lorebooks:[] };
        if (this.collectionTab === 'recent') {
            return this.recentCharacterList(recent, hasCharacters);
        }
        if (this.collectionTab === 'shared-characters') {
            return snapshot.signedIn
                ? this.renderSharedResources(snapshot.characterCards, 'character')
                : `<div class="nt-home-resource-empty nt-home-collection-empty"><small>${t('Sign in to Community to see shared resources.')}</small><button type="button" data-nt-home-action="community">${t('Open Community')}</button></div>`;
        }
        if (this.collectionTab === 'shared-lorebooks') {
            return snapshot.signedIn
                ? this.renderSharedResources(snapshot.lorebooks, 'lorebook')
                : `<div class="nt-home-resource-empty nt-home-collection-empty"><small>${t('Sign in to Community to see shared resources.')}</small><button type="button" data-nt-home-action="community">${t('Open Community')}</button></div>`;
        }
        return this.favoriteCarousel(favorites);
    }

    renderCollectionPanel({ favorites, recent, community, hasCharacters }) {
        const tabs = [
            ['favorites', t('Favorites')],
            ['recent', t('Recent Chats')],
            ['shared-characters', t('Shared Cards')],
            ['shared-lorebooks', t('Shared Lorebooks')],
        ];
        return `<section class="nt-home-section nt-home-collection-panel">
          <div class="nt-home-collection-nav">
            <div class="nt-home-collection-tabs" role="tablist" aria-label="${t('Library')}">
              ${tabs.map(([id, label]) => `<button type="button" role="tab" aria-selected="${this.collectionTab === id ? 'true' : 'false'}" class="${this.collectionTab === id ? 'is-active' : ''}" data-nt-home-collection-tab="${id}">${label}</button>`).join('')}
            </div>
            <div class="nt-home-collection-arrows" data-nt-home-collection-arrows hidden>
              <button type="button" data-nt-home-collection-scroll="prev" aria-label="${escapeHtml(t('Previous'))}">${icons.arrowLeft}</button>
              <button type="button" data-nt-home-collection-scroll="next" aria-label="${escapeHtml(t('Next'))}">${icons.arrowRight}</button>
            </div>
          </div>
          <div class="nt-home-collection-content" data-nt-home-collection-content>
            ${this.renderCollectionContent({ favorites, recent, community, hasCharacters })}
          </div>
        </section>`;
    }

    renderFooter(version) {
        return `<footer class="nt-home-footer">
          <div class="nt-home-resource-links">
            <a href="https://docs.sillytavern.app/" target="_blank" rel="noreferrer"><span>${t('Documentation')}</span>${icons.external}</a>
            <a href="https://github.com/AnNastyLoneGirl/NastyTavern-UI" target="_blank" rel="noreferrer"><span>GitHub</span>${icons.external}</a>
            <a href="https://discord.gg/F4ps4dA7tB" target="_blank" rel="noreferrer"><span>Discord</span>${icons.external}</a>
          </div>
          <small class="nt-home-build" title="${escapeHtml(`${version} · NastyTavern UI v0.1.4`)}">${escapeHtml(version)} · NastyTavern UI v0.1.4</small>
        </footer>`;
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
                  <h1>${t('Welcome to')} <span class="nt-home-hero-brand">NastyTavern</span></h1>
                  <p>${t('A reworked SillyTavern experience with a more modern, cohesive, and enjoyable interface.')}</p>
                  <div class="nt-home-hero-actions">
                    <button type="button" data-nt-home-action="temporary">${icons.chat}<span>${t('Open temporary chat')}</span></button>
                    <button type="button" class="is-primary" data-nt-home-action="community">${icons.community}<span>${t('Community')}</span>${icons.arrowRight}</button>
                  </div>
                </div>
              </section>

              <div class="nt-home-dashboard-grid">
                <main class="nt-home-main-column">
                  ${this.renderCollectionPanel({ favorites, recent, community, hasCharacters })}
                </main>

                <aside class="nt-home-side-column">
                  <section class="nt-home-section nt-home-quick-section" aria-label="${t('Quick Actions')}">
                    <div class="nt-home-quick-grid nt-quick-action-grid">${this.quickActions()}</div>
                  </section>
                  ${this.renderCommunityWidget(community)}
                </aside>
              </div>

            </div>
          </div>
          <div class="nt-home-footer-shell">
            ${this.renderFooter(version)}
          </div>`;

        requestAnimationFrame(() => this.updateCollectionScroller());

        const scroll = this.root.querySelector('.nt-home-scroll');
        if (scroll && previousScroll > 0) {
            scroll.scrollTop = previousScroll;
            requestAnimationFrame(() => {
                if (scroll.isConnected) scroll.scrollTop = previousScroll;
            });
        }
    }

    updateCollectionScroller() {
        if (!this.root?.isConnected) return;
        const track = this.root.querySelector('[data-nt-home-collection-track]');
        const arrows = this.root.querySelector('[data-nt-home-collection-arrows]');

        if (this.collectionTrack && this.collectionTrack !== track) {
            this.collectionTrack.removeEventListener('scroll', this.boundCollectionScroll);
            this.collectionResizeObserver?.disconnect();
        }

        this.collectionTrack = track || null;
        if (!track || !arrows) {
            if (arrows) arrows.hidden = true;
            return;
        }

        track.removeEventListener('scroll', this.boundCollectionScroll);
        track.addEventListener('scroll', this.boundCollectionScroll, { passive: true });

        if (typeof ResizeObserver === 'function') {
            this.collectionResizeObserver ??= new ResizeObserver(() => this.refreshCollectionOverflow());
            this.collectionResizeObserver.disconnect();
            this.collectionResizeObserver.observe(track);
        }

        this.refreshCollectionOverflow();
        requestAnimationFrame(() => this.refreshCollectionOverflow());
    }

    refreshCollectionOverflow() {
        const track = this.collectionTrack;
        const arrows = this.root?.querySelector('[data-nt-home-collection-arrows]');
        if (!track || !arrows) return;

        const viewportWidth = track.clientWidth;
        const overflowWidth = track.scrollWidth - viewportWidth;
        const hasOverflow = viewportWidth > 0 && overflowWidth > 4;
        arrows.hidden = !hasOverflow;
        if (hasOverflow) this.updateCollectionScrollState();
    }

    updateCollectionScrollState() {
        const track = this.collectionTrack;
        const arrows = this.root?.querySelector('[data-nt-home-collection-arrows]');
        if (!track || !arrows || arrows.hidden) return;
        const prev = arrows.querySelector('[data-nt-home-collection-scroll="prev"]');
        const next = arrows.querySelector('[data-nt-home-collection-scroll="next"]');
        if (prev) prev.disabled = track.scrollLeft <= 2;
        if (next) next.disabled = track.scrollLeft + track.clientWidth >= track.scrollWidth - 2;
    }

    scrollCollection(direction) {
        const track = this.root?.querySelector('[data-nt-home-collection-track]');
        const card = track?.querySelector('.nt-home-media-card');
        if (!track || !card) return;
        const styles = getComputedStyle(track);
        const gap = Number.parseFloat(styles.columnGap || styles.gap || '0') || 0;
        const distance = card.getBoundingClientRect().width + gap;
        track.scrollBy({ left: (direction === 'prev' ? -1 : 1) * distance, behavior: 'smooth' });
        setTimeout(() => this.updateCollectionScrollState(), 260);
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
        const collectionTab = event.target.closest('[data-nt-home-collection-tab]')?.dataset.ntHomeCollectionTab;
        if (collectionTab && ['favorites', 'recent', 'shared-characters', 'shared-lorebooks'].includes(collectionTab)) {
            if (this.collectionTab !== collectionTab) {
                this.collectionTab = collectionTab;
                this.lastSignature = '';
                this.sync({ view: 'chat' });
            }
            return;
        }

        const collectionScroll = event.target.closest('[data-nt-home-collection-scroll]')?.dataset.ntHomeCollectionScroll;
        if (collectionScroll) {
            this.scrollCollection(collectionScroll);
            return;
        }

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
            if (this.openCreateCharacter) {
                void Promise.resolve(this.openCreateCharacter());
                return;
            }
            void Promise.resolve(this.navigate('characters')).then(opened => {
                if (opened === false) return;
                requestAnimationFrame(() => document.querySelector('#rm_button_create')?.click());
            });
            return;
        }
        if (action === 'import') {
            if (this.clickNative('#character_import_button')) return;

            // Fallback for layouts where SillyTavern mounts the character controls lazily.
            void Promise.resolve(this.navigate('characters')).then(opened => {
                if (opened === false) return;
                requestAnimationFrame(() => this.clickNative('#character_import_button'));
            });
            return;
        }
        if (action === 'community') {
            this.openCommunity?.();
            return;
        }
        if (action === 'community-character-cards') {
            this.openCommunity?.('character-cards');
            return;
        }
        if (action === 'community-lorebooks') {
            this.openCommunity?.('lorebooks');
            return;
        }
        if (action === 'cloud') {
            if (this.clickNative('#external_import_button')) return;

            // Fallback for layouts where SillyTavern mounts the character controls lazily.
            void Promise.resolve(this.navigate('characters')).then(opened => {
                if (opened === false) return;
                requestAnimationFrame(() => this.clickNative('#external_import_button'));
            });
            return;
        }
        if (action === 'catalogue') {
            this.openCatalogue?.();
            return;
        }
        if (['characters', 'models', 'lorebooks'].includes(action)) this.navigate(action);
    }
}
