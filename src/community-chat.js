import { icons } from './icons.js';
import { t } from './i18n.js';
import { escapeHtml as esc, formatBytes, withViewOpeningState } from './utils.js';
import { avatarHtml, closeButtonHtml, confirmDialog, starsHtml } from './ui-templates.js';
import { createModalShell, showModalShell, hideModalShell } from './modal-shell.js';
import { saveSettings } from './settings.js';

const SDK_URL = new URL('../vendor/supabase-js/supabase.js', import.meta.url).href;
const COMMUNITY_SUPABASE_URL = 'https://egyzkywvuvlcaguirzdm.supabase.co';
const COMMUNITY_SUPABASE_KEY = 'sb_publishable_UBR44UD7dwhGHnPdQi-UAw_wyFQX0rK';

const renderInlineMarkdown = value => {
    let html = esc(value);
    const codeTokens = [];
    html = html.replace(/`([^`\n]+)`/g, (_match, code) => {
        const token = `@@NTCODE${codeTokens.length}@@`;
        codeTokens.push(`<code>${code}</code>`);
        return token;
    });
    html = html.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/gi, (_match, label, href) =>
        `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${label}</a>`);
    html = html.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/__([^_\n]+)__/g, '<strong>$1</strong>');
    html = html.replace(/~~([^~\n]+)~~/g, '<del>$1</del>');
    html = html.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    html = html.replace(/(^|[^_])_([^_\n]+)_/g, '$1<em>$2</em>');
    codeTokens.forEach((code, index) => { html = html.replace(`@@NTCODE${index}@@`, code); });
    return html;
};

const renderMarkdown = value => {
    const lines = String(value ?? '').replace(/\r\n?/g, '\n').split('\n');
    const out = [];
    let listType = null;
    let listItems = [];
    let inCode = false;
    let codeLines = [];

    const flushList = () => {
        if (!listType || !listItems.length) return;
        out.push(`<${listType}>${listItems.map(item => `<li>${renderInlineMarkdown(item)}</li>`).join('')}</${listType}>`);
        listType = null;
        listItems = [];
    };

    for (const line of lines) {
        if (/^```/.test(line.trim())) {
            flushList();
            if (inCode) {
                out.push(`<pre><code>${esc(codeLines.join('\n'))}</code></pre>`);
                codeLines = [];
                inCode = false;
            } else {
                inCode = true;
            }
            continue;
        }
        if (inCode) {
            codeLines.push(line);
            continue;
        }
        if (!line.trim()) {
            flushList();
            continue;
        }
        const unordered = line.match(/^\s*[-+*]\s+(.+)$/);
        if (unordered) {
            if (listType && listType !== 'ul') flushList();
            listType = 'ul';
            listItems.push(unordered[1]);
            continue;
        }
        const ordered = line.match(/^\s*\d+\.\s+(.+)$/);
        if (ordered) {
            if (listType && listType !== 'ol') flushList();
            listType = 'ol';
            listItems.push(ordered[1]);
            continue;
        }
        flushList();
        const quote = line.match(/^\s*>\s?(.*)$/);
        if (quote) {
            out.push(`<blockquote>${renderInlineMarkdown(quote[1])}</blockquote>`);
            continue;
        }
        out.push(`<p>${renderInlineMarkdown(line)}</p>`);
    }
    flushList();
    if (inCode) out.push(`<pre><code>${esc(codeLines.join('\n'))}</code></pre>`);
    return out.join('');
};

const shortTime = value => {
    try { return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(new Date(value)); }
    catch (_) { return ''; }
};

const OFFICIAL_CHANNEL_SLUGS = ['general', 'nastytavern', 'character-cards', 'lorebooks', 'extensions'];
const COMMUNITY_REACTION_EMOJIS = ['👍','❤️','😂','😊','😮','😢','😡','🔥','🎉','👏','💯','👀','🤔','🙏','✨','💜'];
const OFFICIAL_CHANNEL_ORDER = new Map(OFFICIAL_CHANNEL_SLUGS.map((slug, index) => [slug, index]));
const makeSessionToken = () => {
    try { return crypto.randomUUID(); } catch (_) { return `${Date.now()}-${Math.random().toString(36).slice(2)}`; }
};

const roleRank = role => role === 'admin' ? 2 : role === 'moderator' ? 1 : 0;
const roleLabel = role => role === 'admin' ? t('Admin') : role === 'moderator' ? t('Moderator') : role === 'vip' ? 'VIP' : t('Member');
const safeResourceName = value => {
    const cleaned = String(value || '')
        .replace(/[\u0000-\u001f<>:"/\\|?*]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/[. ]+$/g, '')
        .slice(0, 100);
    return cleaned || 'Shared resource';
};
const safeFileName = value => String(value || 'file').replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 120);
const stripResourceExtension = value => String(value || '').replace(/\.(?:png|json|lorebook)$/i, '').trim();
const resourceDownloadName = (name, kind, extension = kind === 'character' ? 'png' : 'json') => `${safeResourceName(name)}.${String(extension || (kind === 'character' ? 'png' : 'json')).replace(/^\./, '').toLowerCase()}`;
const canShareInChannel = slug => slug === 'character-cards' || slug === 'lorebooks';
const COMMUNITY_FILE_LIMIT_BYTES = 5767168; // 5.5 MiB

const decodeBase64Utf8 = value => {
    try {
        const bytes = Uint8Array.from(atob(String(value || '')), char => char.charCodeAt(0));
        return new TextDecoder().decode(bytes);
    } catch (_) { return ''; }
};

const parseJsonCandidate = value => {
    const text = String(value || '').trim();
    if (!text) return null;
    const candidates = [text, decodeBase64Utf8(text)].filter(Boolean);
    for (const candidate of candidates) {
        try { return JSON.parse(candidate); } catch (_) {}
    }
    return null;
};

const readCharacterDataFromPng = async file => {
    try {
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        if (bytes.length < 12 || bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47) return null;
        const view = new DataView(buffer);
        let offset = 8;
        while (offset + 12 <= bytes.length) {
            const length = view.getUint32(offset);
            const type = String.fromCharCode(...bytes.slice(offset + 4, offset + 8));
            const start = offset + 8;
            const end = start + length;
            if (end + 4 > bytes.length) break;
            if (type === 'tEXt') {
                const data = bytes.slice(start, end);
                const zero = data.indexOf(0);
                if (zero > 0) {
                    const keyword = new TextDecoder('latin1').decode(data.slice(0, zero)).toLowerCase();
                    const text = new TextDecoder('latin1').decode(data.slice(zero + 1));
                    if (keyword === 'chara' || keyword === 'ccv3') {
                        const parsed = parseJsonCandidate(text);
                        if (parsed) return parsed;
                    }
                }
            }
            offset = end + 4;
        }
    } catch (_) {}
    return null;
};

const readCharacterNameFromPng = async file => {
    const parsed = await readCharacterDataFromPng(file);
    return String(parsed?.data?.name || parsed?.name || '').trim();
};

const asText = value => typeof value === 'string' ? value.trim() : '';
const asArray = value => Array.isArray(value) ? value.filter(item => item !== undefined && item !== null && String(item).trim() !== '') : [];
const toEntryArray = entries => Array.isArray(entries) ? entries : (entries && typeof entries === 'object' ? Object.values(entries) : []);
const resourceDate = value => {
    try { return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)); }
    catch (_) { return String(value || ''); }
};
const inspectCommunityResource = async (blob, meta = {}) => {
    const kind = meta.kind === 'lorebook' ? 'lorebook' : 'character';
    const name = safeResourceName(meta.display_name || stripResourceExtension(meta.name) || (kind === 'character' ? 'Character Card' : 'Lorebook'));
    let parsed = null;
    try {
        const ext = String(meta.name || '').split('.').pop()?.toLowerCase();
        if (kind === 'character' && (meta.mime === 'image/png' || ext === 'png')) parsed = await readCharacterDataFromPng(blob);
        else parsed = JSON.parse(await blob.text());
    } catch (_) {}

    if (kind === 'character') {
        const root = parsed && typeof parsed === 'object' ? parsed : {};
        const data = root?.data && typeof root.data === 'object' ? root.data : root;
        const book = data?.character_book && typeof data.character_book === 'object' ? data.character_book : null;
        const knownCharacterFields = new Set(['name','nt_description','description','personality','scenario','first_mes','first_message','mes_example','example_dialogue','creator_notes','system_prompt','post_history_instructions','alternate_greetings','tags','creator','character_version','version','character_book','extensions','spec','spec_version']);
        const extraData = Object.fromEntries(Object.entries(data || {}).filter(([key]) => !knownCharacterFields.has(key)));
        return {
            kind, name, raw: root, data, extraData, characterBook: book,
            spec: asText(root.spec || data.spec),
            specVersion: asText(root.spec_version || data.spec_version),
            creator: asText(data.creator || root.creator),
            version: asText(data.character_version || data.version || root.character_version),
            tags: asArray(data.tags || root.tags),
            ntDescription: asText(data.nt_description || root.nt_description),
            description: asText(data.description),
            personality: asText(data.personality),
            scenario: asText(data.scenario),
            firstMessage: asText(data.first_mes || data.first_message),
            exampleMessages: asText(data.mes_example || data.example_dialogue),
            creatorNotes: asText(data.creator_notes),
            systemPrompt: asText(data.system_prompt),
            postHistory: asText(data.post_history_instructions),
            alternateGreetings: asArray(data.alternate_greetings),
            embeddedLorebookEntries: toEntryArray(book?.entries).length,
            extensions: data.extensions && typeof data.extensions === 'object' ? data.extensions : null,
        };
    }

    const root = parsed && typeof parsed === 'object' ? parsed : {};
    const entries = toEntryArray(root.entries).map((entry, index) => ({ ...(entry || {}), __index: index }));
    const enabled = entries.filter(entry => !entry.disable).length;
    const constant = entries.filter(entry => Boolean(entry.constant)).length;
    const totalChars = entries.reduce((sum, entry) => sum + String(entry.content || '').length, 0);
    const topLevel = Object.fromEntries(Object.entries(root).filter(([key]) => key !== 'entries'));
    return { kind, name, raw: root, entries, enabled, constant, totalChars, topLevel };
};

const inferResourceDisplayName = async (file, kind) => {
    const fallback = stripResourceExtension(file?.name) || (kind === 'character' ? 'Character Card' : 'Lorebook');
    if (!file) return safeResourceName(fallback);
    try {
        const ext = String(file.name || '').split('.').pop()?.toLowerCase();
        if (kind === 'character' && ext === 'png') {
            const pngName = await readCharacterNameFromPng(file);
            if (pngName) return safeResourceName(pngName);
        }
        if (ext === 'json' || ext === 'lorebook') {
            const parsed = JSON.parse(await file.text());
            const logical = kind === 'character'
                ? (parsed?.data?.name || parsed?.name || parsed?.char_name)
                : (parsed?.name || parsed?.world_name || parsed?.title);
            if (logical) return safeResourceName(logical);
        }
    } catch (_) {}
    return safeResourceName(fallback);
};


export class CommunityChat {
    constructor(settings, toast, callbacks = {}) {
        this.settings = settings;
        this.toast = toast;
        this.callbacks = callbacks;
        this.root = null;
        this.client = null;
        this.user = null;
        this.profile = null;
        this.channels = [];
        this.channelMembers = new Map();
        this.activeChannelId = null;
        this.messages = [];
        this.reactions = [];
        this.resourceStats = new Map();
        this.reactionPickerMessageId = null;
        this.reactionPending = new Set();
        this.presence = new Map();
        this.globalPresence = new Map();
        this.subscription = null;
        this.globalSubscription = null;
        this.authSubscription = null;
        this.loading = false;
        this.authMode = 'signin';
        this.needsProfileOnboarding = false;
        this.replyTo = null;
        this.notice = '';
        this.configFingerprint = '';
        this.refreshTimer = null;
        this.workspaceLoadPromise = null;
        this.communitySessionUserId = null;
        this.sessionJoinedChannels = new Set();
        this.unreadCounts = new Map();
        this.mentionCounts = new Map();
        this.notificationSubscription = null;
        this.reportSyncTimer = null;
        this.activitySubscription = null;
        this.typingUsers = new Map();
        this.typingTimers = new Map();
        this.typingStopTimer = null;
        this.searchOpen = false;
        this.searchQuery = '';
        this.searchResults = [];
        this.profileView = null;
        this.moderationOpen = false;
        this.reports = [];
        this.openReportCount = 0;
        this.reportMessages = new Map();
        this.reportProfiles = new Map();
        this.attachmentUrls = new Map();
        this.resourceDetailsMessage = null;
        this.resourceDetailsObjectUrl = '';
        this.homeSnapshot = { ready: false, signedIn: false, online: 0, messages: [], characterCards: [], lorebooks: [], mentions: 0 };
        this.backgroundInitPromise = null;
    }

    ensureCommunitySession(userId) {
        if (!userId) {
            this.communitySessionUserId = null;
                return;
        }
        if (this.communitySessionUserId !== userId) {
            this.communitySessionUserId = userId;
                this.activeChannelId = null;
            this.sessionJoinedChannels.clear();
            this.unreadCounts.clear();
            this.typingUsers.clear();
        }
    }

    communityEnabled() { return this.settings?.communityNetworkEnabled === true; }

    presenceEnabled() { return this.communityEnabled() && this.settings?.communityPresenceEnabled === true; }

    mount() {
        this.ensure();
        if (this.communityEnabled()) void this.initializeBackground();
        else {
            this.homeSnapshot = { ready: true, signedIn: false, online: 0, messages: [], characterCards: [], lorebooks: [], mentions: 0 };
            this.emitHomeChanged();
        }
        try {
            if (localStorage.getItem(COMMUNITY_OAUTH_RETURN_KEY) === '1') {
                localStorage.removeItem(COMMUNITY_OAUTH_RETURN_KEY);
                setTimeout(() => { void this.open(); }, 0);
            }
        } catch (_) {}
    }

    unmount() {
        this.unsubscribeChannel();
        this.unsubscribeGlobalPresence();
        this.unsubscribeNotifications();
        this.unsubscribeActivity();
        try { this.authSubscription?.data?.subscription?.unsubscribe?.(); } catch (_) {}
        this.authSubscription = null;
        try { this.client?.auth?.stopAutoRefresh?.(); } catch (_) {}
        clearTimeout(this.refreshTimer);
        this.refreshTimer = null;
        clearTimeout(this.typingStopTimer);
        this.typingStopTimer = null;
        this.typingTimers.forEach(timer => clearTimeout(timer));
        this.typingTimers.clear();
        this.typingUsers.clear();
        this.reactionPending.clear();
        this.closeResourceDetails();
        this.root?.remove();
        this.root = null;
        this.client = null;
        this.workspaceLoadPromise = null;
    }

    ensure() {
        if (this.root = document.querySelector('#nt-community-panel')) return this.root;
        const { root, header } = createModalShell({
            id: 'nt-community-panel',
            title: t('NastyTavern Community'),
            subtitle: t('NastyTavern Community'),
            icon: icons.community || icons.chat,
            size: 'large',
            modalClass: 'nt-community-shell',
            backdropClass: 'nt-community-backdrop',
            headerClass: 'nt-community-header',
            headerActionsClass: 'nt-community-header-actions',
            bodyClass: 'nt-community-shell-body',
            bodyAttrs: { 'data-nt-community-shell': '' },
            closeAttrs: { 'data-nt-community-close': '' },
        });
        if (header) header.hidden = true;
        root.addEventListener('click', event => this.onClick(event));
        root.addEventListener('submit', event => this.onSubmit(event));
        root.addEventListener('keydown', event => this.onKeyDown(event));
        root.addEventListener('input', event => this.onInput(event));
        root.addEventListener('change', event => this.onChange(event));
        document.body.append(root);
        this.root = root;
        return root;
    }

    async open({ authMode = null, channelSlug = '' } = {}) {
        if (authMode === 'signup' || authMode === 'signin') {
            this.authMode = authMode;
            this.notice = '';
        }
        this.ensure();
        showModalShell(this.root);
        if (!this.communityEnabled()) {
            this.renderConsent();
            return;
        }
        await this.initialize();
        if (this.user) {
            await this.loadMentionCounts();
            this.subscribeNotifications();
            this.subscribeActivity();
            const requestedChannel = String(channelSlug || '').trim();
            const channel = requestedChannel ? this.channels.find(item => item.slug === requestedChannel) : null;
            if (channel) await this.selectChannel(channel.id);
            else await this.ensureGeneralChannelSelected();
        }
    }

    openPrivacyNotice() {
        this.ensure();
        showModalShell(this.root);
        this.renderConsent({ review: this.communityEnabled() });
    }

    async ensureGeneralChannelSelected() {
        if (!this.user || !this.profile || this.activeChannelId || !this.channels.length) return;
        const general = this.channels.find(channel => channel.slug === 'general');
        if (general) await this.selectChannel(general.id);
    }

    close() {
        if (!this.root || this.root.hidden) return;
        this.sendTyping(false);
        hideModalShell(this.root, { immediate: false });
    }

    config() {
        return {
            url: COMMUNITY_SUPABASE_URL,
            key: COMMUNITY_SUPABASE_KEY,
        };
    }

    hasConfig() {
        const { url, key } = this.config();
        return /^https:\/\/[^\s]+$/i.test(url) && key.length > 20;
    }

    async loadSdk() {
        if (!this.communityEnabled()) throw new Error(t('Community network access is disabled.'));
        if (window.supabase?.createClient) return window.supabase;
        const existing = document.querySelector('script[data-nt-supabase-sdk]');
        if (existing) {
            await new Promise((resolve, reject) => {
                if (window.supabase?.createClient) return resolve();
                existing.addEventListener('load', resolve, { once: true });
                existing.addEventListener('error', reject, { once: true });
            });
            if (window.supabase?.createClient) return window.supabase;
        }
        await new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = SDK_URL;
            script.async = true;
            script.dataset.ntSupabaseSdk = '1';
            script.onload = resolve;
            script.onerror = () => reject(new Error('Could not load Supabase client.'));
            document.head.append(script);
        });
        if (!window.supabase?.createClient) throw new Error('Supabase client did not initialize.');
        return window.supabase;
    }

    async makeClient() {
        if (!this.communityEnabled()) throw new Error(t('Community network access is disabled.'));
        const { url, key } = this.config();
        const fingerprint = `${url}|${key}`;
        if (this.client && this.configFingerprint === fingerprint) return this.client;
        const sdk = await this.loadSdk();
        this.client = sdk.createClient(url, key, {
            auth: {
                persistSession: true,
                autoRefreshToken: true,
                detectSessionInUrl: true,
                storageKey: `nastytavern-community-${new URL(url).hostname}`,
            },
        });
        this.configFingerprint = fingerprint;
        this.authSubscription = this.client.auth.onAuthStateChange((_event, session) => {
            this.user = session?.user || null;
            this.ensureCommunitySession(this.user?.id || null);
            setTimeout(() => this.handleAuthChange(), 0);
        });
        return this.client;
    }

    async initialize() {
        if (!this.root) return;
        if (!this.communityEnabled()) {
            this.renderConsent();
            return;
        }
        if (!this.hasConfig()) {
            this.renderSetup();
            return;
        }
        this.loading = true;
        this.renderLoading();
        try {
            const client = await this.makeClient();
            const { data, error } = await client.auth.getSession();
            if (error) throw error;
            this.user = data?.session?.user || null;
            this.ensureCommunitySession(this.user?.id || null);
            if (!this.user) {
                this.loading = false;
                this.renderAuth();
                return;
            }
            await this.loadWorkspace();
        } catch (error) {
            console.error('[NastyTavern] Community init failed', error);
            this.loading = false;
            this.renderError(error);
        }
    }

    async handleAuthChange() {
        if (!this.root || this.root.hidden) return;
        if (!this.user) {
            this.unsubscribeChannel();
            this.unsubscribeGlobalPresence();
            this.profile = null;
            this.needsProfileOnboarding = false;
            this.channels = [];
            this.channelMembers.clear();
            this.activeChannelId = null;
            this.messages = [];
            this.reactions = [];
            this.resourceStats.clear();
            this.presence.clear();
            this.globalPresence.clear();
            this.renderAuth();
            return;
        }
        try {
            await this.loadWorkspace();
            await this.ensureGeneralChannelSelected();
        } catch (error) { this.renderError(error); }
    }


    async initializeBackground() {
        if (!this.communityEnabled()) return;
        if (this.backgroundInitPromise) return this.backgroundInitPromise;
        const task = (async () => {
            if (!this.hasConfig()) return;
            try {
                const client = await this.makeClient();
                const { data } = await client.auth.getSession();
                this.user = data?.session?.user || null;
                this.ensureCommunitySession(this.user?.id || null);
                if (!this.user) {
                    this.homeSnapshot = { ready: true, signedIn: false, online: 0, messages: [], characterCards: [], lorebooks: [], mentions: 0 };
                    this.emitHomeChanged();
                    return;
                }
                const { data: profile } = await client.from('nt_profiles')
                    .select('id,username,avatar_url,bio,role,created_at,muted_until,banned_at,ban_reason')
                    .eq('id', this.user.id).maybeSingle();
                if (profile) this.profile = profile;
                else {
                    this.profile = null;
                    this.needsProfileOnboarding = true;
                    this.homeSnapshot = { ready: true, signedIn: false, online: 0, messages: [], characterCards: [], lorebooks: [], mentions: 0 };
                    this.emitHomeChanged();
                    return;
                }
                await this.loadMentionCounts();
                this.subscribeNotifications();
                this.subscribeActivity();
                this.subscribeGlobalPresence();
                await this.refreshHomeSnapshot();
            } catch (error) {
                console.warn('[NastyTavern] Community background init failed', error);
            }
        })();
        this.backgroundInitPromise = task;
        try { return await task; } finally { if (this.backgroundInitPromise === task) this.backgroundInitPromise = null; }
    }

    async handlePrivacySettingsChanged() {
        if (!this.communityEnabled()) {
            this.disconnectNetwork();
            this.callbacks.accountChanged?.(this.getAccountSnapshot());
            if (this.root && !this.root.hidden) this.renderConsent();
            return;
        }
        if (!this.presenceEnabled()) {
            this.unsubscribeGlobalPresence();
            this.presence.clear();
            this.typingUsers.clear();
            this.typingTimers.forEach(timer => clearTimeout(timer));
            this.typingTimers.clear();
            clearTimeout(this.typingStopTimer);
            this.typingStopTimer = null;
            if (this.subscription) this.subscribeChannel();
            this.updateDynamicAreas({ scrollMessagesToBottom: false });
        } else if (this.client && this.user && this.profile) {
            this.subscribeGlobalPresence();
            if (this.activeChannelId) this.subscribeChannel();
        }
        if (!this.client) await this.initializeBackground();
        if (this.root && !this.root.hidden) await this.initialize();
        this.callbacks.accountChanged?.(this.getAccountSnapshot());
    }

    disconnectNetwork() {
        this.unsubscribeChannel();
        this.unsubscribeGlobalPresence();
        this.unsubscribeNotifications();
        this.unsubscribeActivity();
        try { this.authSubscription?.data?.subscription?.unsubscribe?.(); } catch (_) {}
        this.authSubscription = null;
        try { this.client?.auth?.stopAutoRefresh?.(); } catch (_) {}
        this.client = null;
        this.configFingerprint = '';
        this.backgroundInitPromise = null;
        this.workspaceLoadPromise = null;
        this.user = null;
        this.profile = null;
        this.needsProfileOnboarding = false;
        this.channels = [];
        this.channelMembers.clear();
        this.activeChannelId = null;
        this.messages = [];
        this.reactions = [];
        this.resourceStats.clear();
        this.presence.clear();
        this.globalPresence.clear();
        this.unreadCounts.clear();
        this.mentionCounts.clear();
        this.homeSnapshot = { ready: true, signedIn: false, online: 0, messages: [], characterCards: [], lorebooks: [], mentions: 0 };
        this.emitBadgeChanged();
        this.emitHomeChanged();
    }

    async enableCommunityFromConsent() {
        this.settings.communityNetworkEnabled = true;
        const presenceInput = this.root?.querySelector('[data-nt-community-consent-presence]');
        this.settings.communityPresenceEnabled = !!presenceInput?.checked;
        saveSettings();
        await this.initialize();
    }

    getAccountSnapshot() {
        const signedIn = Boolean(this.user && this.profile);
        return {
            signedIn,
            username: signedIn ? String(this.profile?.username || '').trim() : '',
            avatarUrl: signedIn ? String(this.profile?.avatar_url || '').trim() : '',
            role: signedIn ? String(this.profile?.role || 'member').trim().toLowerCase() : '',
            communityEnabled: this.communityEnabled(),
            presenceEnabled: this.presenceEnabled(),
        };
    }

    getHomeSnapshot() { return structuredClone(this.homeSnapshot); }

    async setPresenceEnabled(enabled) {
        if (!this.communityEnabled()) {
            this.settings.communityPresenceEnabled = false;
            saveSettings();
            return false;
        }
        this.settings.communityPresenceEnabled = enabled === true;
        saveSettings();
        await this.handlePrivacySettingsChanged();
        return this.presenceEnabled();
    }

    async togglePresenceEnabled() {
        return this.setPresenceEnabled(!this.presenceEnabled());
    }

    emitHomeChanged() { this.callbacks.homeChanged?.(this.getHomeSnapshot()); }

    emitBadgeChanged() {
        const mentions = [...this.mentionCounts.values()].reduce((a, b) => a + Number(b || 0), 0);
        const unread = [...this.unreadCounts.values()].reduce((a, b) => a + Number(b || 0), 0);
        this.callbacks.badgeChanged?.({ total: mentions + unread, mentions, unread });
        this.homeSnapshot.mentions = mentions;
        this.emitHomeChanged();
    }

    async loadMentionCounts() {
        if (!this.client || !this.user) return;
        const { data, error } = await this.client.from('nt_mentions')
            .select('id,channel_id,read_at')
            .eq('mentioned_user_id', this.user.id)
            .is('read_at', null);
        if (error) { console.warn('[NastyTavern] Could not load mentions', error); return; }
        this.mentionCounts.clear();
        for (const row of data || []) this.mentionCounts.set(row.channel_id, (this.mentionCounts.get(row.channel_id) || 0) + 1);
        this.emitBadgeChanged();
    }

    async markChannelMentionsRead(channelId) {
        if (!this.client || !this.user || !channelId || !this.mentionCounts.get(channelId)) return;
        const { error } = await this.client.from('nt_mentions')
            .update({ read_at: new Date().toISOString() })
            .eq('mentioned_user_id', this.user.id)
            .eq('channel_id', channelId)
            .is('read_at', null);
        if (!error) {
            this.mentionCounts.delete(channelId);
            this.emitBadgeChanged();
        }
    }

    subscribeNotifications() {
        if (!this.client || !this.user || this.notificationSubscription) return;
        const channel = this.client.channel(`nt-community:notifications:${this.user.id}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'nt_mentions', filter: `mentioned_user_id=eq.${this.user.id}` }, async payload => {
                await this.loadMentionCounts();
                if (payload.eventType === 'INSERT') {
                    const row = payload.new || {};
                    if (row.channel_id === this.activeChannelId && this.root && !this.root.hidden) {
                        setTimeout(() => this.markChannelMentionsRead(row.channel_id), 900);
                    }
                }
                this.updateChannelBadges();
            })
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'nt_profiles', filter: `id=eq.${this.user.id}` }, payload => this.handleOwnProfileChange(payload.new || {}));
        if (roleRank(this.profile?.role) >= 1) {
            channel.on('postgres_changes', { event: '*', schema: 'public', table: 'nt_reports' }, async () => {
                await this.loadOpenReportCount();
                this.syncModerationIndicator();
                if (this.moderationOpen) await this.loadReports();
            });
        }
        channel.subscribe();
        this.notificationSubscription = channel;
        if (roleRank(this.profile?.role) >= 1 && !this.reportSyncTimer) {
            // Realtime remains the primary path. This narrow fallback covers deployments where
            // nt_reports is not included in the Realtime publication or a transient event is missed.
            this.reportSyncTimer = window.setInterval(async () => {
                const before = this.openReportCount;
                await this.loadOpenReportCount();
                if (before !== this.openReportCount) this.syncModerationIndicator();
            }, 5000);
        }
    }

    unsubscribeNotifications() {
        if (this.notificationSubscription && this.client) try { this.client.removeChannel(this.notificationSubscription); } catch (_) {}
        this.notificationSubscription = null;
        if (this.reportSyncTimer) window.clearInterval(this.reportSyncTimer);
        this.reportSyncTimer = null;
    }

    syncModerationIndicator() {
        const button = this.root?.querySelector('[data-nt-community-moderation]');
        if (!button) return;
        button.classList.toggle('has-open-reports', this.openReportCount > 0);
    }

    handleOwnProfileChange(next = {}) {
        if (!this.user || next.id !== this.user.id) return;
        const wasBanned = Boolean(this.profile?.banned_at);
        this.profile = { ...(this.profile || {}), ...next };
        const isBanned = Boolean(this.profile?.banned_at);
        if (isBanned) {
            this.sendTyping(false);
            this.unsubscribeChannel();
            this.unsubscribeGlobalPresence();
            this.activeChannelId = null;
            this.presence.clear();
            this.sessionJoinedChannels.clear();
        } else if (wasBanned && !isBanned) {
            this.subscribeGlobalPresence();
        }
        if (this.root && !this.root.hidden) this.renderWorkspace();
        void this.refreshHomeSnapshot();
    }

    subscribeActivity() {
        if (!this.client || !this.user || this.activitySubscription) return;
        const channel = this.client.channel('nt-community:activity')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'nt_messages' }, payload => this.handleBackgroundMessage(payload.new || {}))
            .on('postgres_changes', { event: '*', schema: 'public', table: 'nt_resource_stats_live' }, payload => this.handleResourceStatsRealtime(payload))
            .subscribe();
        this.activitySubscription = channel;
    }

    unsubscribeActivity() {
        if (this.activitySubscription && this.client) try { this.client.removeChannel(this.activitySubscription); } catch (_) {}
        this.activitySubscription = null;
    }

    handleBackgroundMessage(message) {
        if (!message?.channel_id || message.user_id === this.user?.id) return;
        if (this.sessionJoinedChannels.has(message.channel_id)) {
            const isReading = message.channel_id === this.activeChannelId && this.root && !this.root.hidden;
            if (!isReading) this.unreadCounts.set(message.channel_id, (this.unreadCounts.get(message.channel_id) || 0) + 1);
        }
        this.emitBadgeChanged();
        this.updateChannelBadges();
        const relevant = this.channels.find(c => c.id === message.channel_id && ['general','nastytavern','character-cards','lorebooks'].includes(c.slug));
        if (relevant || !this.channels.length) setTimeout(() => this.refreshHomeSnapshot(), 160);
    }

    handleResourceStatsRealtime(payload) {
        const row = payload?.new || payload?.old || {};
        const id = Number(row.resource_message_id);
        if (!Number.isFinite(id)) return;
        const key = String(id);
        const previous = this.resourceStatsFor(id);
        if (payload?.eventType === 'DELETE') {
            this.resourceStats.set(key, { rating_average: 0, rating_count: 0, acquisition_count: 0, my_rating: previous.my_rating });
        } else {
            this.resourceStats.set(key, {
                rating_average: Number(row.rating_average || 0),
                rating_count: Number(row.rating_count || 0),
                acquisition_count: Number(row.acquisition_count || 0),
                my_rating: previous.my_rating,
            });
        }
        if (this.messages.some(message => Number(message.id) === id)) {
            this.updateDynamicAreas({ scrollMessagesToBottom: false });
        }
        void this.refreshHomeSnapshot();
    }

    updateChannelBadges() {
        if (!this.root) return;
        this.root.querySelectorAll('[data-nt-community-channel]').forEach(button => {
            const id = button.dataset.ntCommunityChannel;
            const unread = Number(this.unreadCounts.get(id) || 0);
            const mentions = Number(this.mentionCounts.get(id) || 0);
            const slot = button.querySelector('[data-nt-channel-badges]');
            if (slot) {
                const active = mentions > 0 || unread > 0;
                slot.innerHTML = active ? '<span class="nt-community-unread-dot" aria-hidden="true"></span>' : '';
                slot.hidden = !active;
                slot.title = mentions > 0 ? t('Unread mention') : (unread > 0 ? t('Unread messages') : '');
            }
        });
    }

    async refreshHomeSnapshot() {
        if (!this.client || !this.user) {
            this.homeSnapshot = { ready: true, signedIn: false, online: 0, messages: [], characterCards: [], lorebooks: [], mentions: 0 };
            return this.emitHomeChanged();
        }
        try {
            const { data: channels } = await this.client.from('nt_channels')
                .select('id,slug,name')
                .in('slug', ['general','nastytavern','character-cards','lorebooks']);
            const channelMap = new Map((channels || []).map(channel => [channel.slug, channel]));
            const feedIds = ['general','nastytavern'].map(slug => channelMap.get(slug)?.id).filter(Boolean);
            const cardsId = channelMap.get('character-cards')?.id;
            const lorebooksId = channelMap.get('lorebooks')?.id;
            const select = 'id,channel_id,user_id,content,created_at,message_type,metadata,profile:nt_profiles!nt_messages_user_id_fkey(id,username,avatar_url,bio,role,created_at)';

            const [feedResult, cardResult, loreResult] = await Promise.all([
                feedIds.length
                    ? this.client.from('nt_messages').select(select).in('channel_id', feedIds).order('created_at', { ascending: false }).limit(5)
                    : Promise.resolve({ data: [] }),
                cardsId
                    ? this.client.from('nt_messages').select(select).eq('channel_id', cardsId).in('message_type', ['attachment','character_card']).order('created_at', { ascending: false }).limit(11)
                    : Promise.resolve({ data: [] }),
                lorebooksId
                    ? this.client.from('nt_messages').select(select).eq('channel_id', lorebooksId).in('message_type', ['attachment','lorebook']).order('created_at', { ascending: false }).limit(11)
                    : Promise.resolve({ data: [] }),
            ]);

            const resourceRows = [...(cardResult.data || []), ...(loreResult.data || [])];
            await this.loadResourceStats(resourceRows.map(row => row.id));

            const decorateResources = async (rows, expectedKind) => {
                const filtered = (rows || []).filter(row => !row.metadata?.kind || row.metadata.kind === expectedKind).slice(0, 11);
                return Promise.all(filtered.map(async row => {
                    let preview_url = '';
                    const path = row.metadata?.path;
                    const name = String(row.metadata?.name || '');
                    if (path && (row.metadata?.mime === 'image/png' || /\.png$/i.test(name))) {
                        preview_url = this.attachmentUrls.get(path) || '';
                        if (!preview_url) {
                            try {
                                const { data } = await this.client.storage.from('community-files').createSignedUrl(path, 3600);
                                preview_url = data?.signedUrl || '';
                                if (preview_url) this.attachmentUrls.set(path, preview_url);
                            } catch (_) {}
                        }
                    }
                    const stats = this.resourceStatsFor(row.id);
                    return {
                        ...row,
                        preview_url,
                        rating: stats.rating_average,
                        rating_count: stats.rating_count,
                        download_count: stats.acquisition_count,
                        acquisition_count: stats.acquisition_count,
                        my_rating: stats.my_rating,
                    };
                }));
            };

            const [characterCards, lorebooks] = await Promise.all([
                decorateResources(cardResult.data || [], 'character'),
                decorateResources(loreResult.data || [], 'lorebook'),
            ]);
            const idToSlug = new Map((channels || []).map(channel => [channel.id, channel.slug]));
            const mentions = [...this.mentionCounts.values()].reduce((total, count) => total + Number(count || 0), 0);
            this.homeSnapshot = {
                ready: true,
                signedIn: true,
                online: this.globalPresence.size,
                mentions,
                messages: (feedResult.data || []).map(row => ({ ...row, channel_slug: idToSlug.get(row.channel_id) || 'general' })).reverse(),
                characterCards,
                lorebooks,
            };
            this.emitHomeChanged();
        } catch (error) { console.warn('[NastyTavern] Home Community snapshot failed', error); }
    }

    setShellMode(mode = 'workspace') {
        const auth = mode === 'auth';
        this.root?.classList.toggle('is-auth-modal', auth);
        const modal = this.root?.querySelector('.nt-community-shell');
        modal?.classList.toggle('nt-modal-size-compact', auth);
        modal?.classList.toggle('nt-modal-size-large', !auth);
        const body = this.shell();
        body?.classList.toggle('nt-community-auth-modal-body', auth);
        if (!auth) body?.classList.remove('nt-community-auth-onboarding');
        this.root?.querySelector('.nt-community-header')?.classList.toggle('nt-community-auth-header', auth);
    }

    configureShellHeader({ title = t('NastyTavern Community'), subtitle = '', actionsHtml = '', visible = true } = {}) {
        const header = this.root?.querySelector('.nt-community-header');
        if (!header) return;
        header.hidden = !visible;
        const titleNode = header.querySelector('.nt-modal-heading-copy > b');
        const subtitleNode = header.querySelector('.nt-modal-heading-copy > small');
        if (titleNode) titleNode.textContent = title;
        if (subtitleNode) {
            subtitleNode.textContent = subtitle;
            subtitleNode.hidden = !subtitle;
        }
        const actions = header.querySelector('.nt-community-header-actions');
        if (actions) actions.innerHTML = `${actionsHtml}${closeButtonHtml('nt-community-close')}`;
    }

    renderConsent({ review = false } = {}) {
        const reviewing = review && this.communityEnabled();
        this.setShellMode('auth');
        this.configureShellHeader({ title: t('NastyTavern Community'), subtitle: t('Privacy & network access') });
        this.shell()?.classList.remove('nt-community-auth-onboarding');
        this.shell().innerHTML = `
          <div class="nt-community-auth-intro"><b>${t(reviewing ? 'Community network access is enabled' : 'Community is off by default')}</b><p>${t(reviewing ? 'Review the services Community can contact and change your optional presence setting at any time.' : 'NastyTavern will not contact Supabase or load the Supabase client until you explicitly enable Community network access.')}</p></div>
          <div class="nt-community-auth-card nt-community-consent-card">
            <h3>${t('What enabling Community connects to')}</h3>
            <p>${t('Supabase is used for Community authentication, messages, profiles, Realtime and Community Storage. Nasty Catalogue binary files are stored on Cloudflare R2. Google is contacted only if you choose Google sign-in. The Supabase JavaScript client is bundled with NastyTavern and loaded locally from the extension.')}</p>
            <p>${t('Character Cards, Lorebooks and SillyTavern chats are not uploaded automatically. Sharing or catalogue upload requires an explicit action.')}</p>
            <label class="nt-community-consent-presence"><input type="checkbox" data-nt-community-consent-presence ${this.presenceEnabled() ? 'checked' : ''}><span><b>${t('Also share my online presence and typing status')}</b><small>${t('Optional. You can change this independently later in NastyTavern Settings → Modules.')}</small></span></label>
            ${reviewing
                ? `<button type="button" class="is-primary" data-nt-community-privacy-save>${t('Save & return')}</button>`
                : `<button type="button" class="is-primary" data-nt-community-enable>${t('Enable Community')}</button>`}
            <small>${t(reviewing ? 'Community network access stays enabled while you review this notice. You can disable it from NastyTavern Settings → Modules.' : 'You can disable Community again at any time. Disabling it closes active Community connections but does not delete your Supabase account or previously shared content.')}</small>
          </div>`;
    }

    renderLoading() {
        this.setShellMode('workspace');
        this.configureShellHeader({ visible: false });
        this.shell().innerHTML = `<div class="nt-community-center"><span class="nt-community-spinner"></span><b>${t('Connecting to Community Chat…')}</b><small>${t('Loading your community workspace.')}</small></div>`;
    }

    renderSetup() {
        this.setShellMode('workspace');
        this.configureShellHeader({ visible: false });
        this.shell().innerHTML = `
          <div class="nt-community-center nt-community-setup">
            <span class="nt-community-big-icon">${icons.community || icons.chat}</span>
            <b>${t('Community Chat could not connect')}</b>
            <small>${t('The official NastyTavern Community service is temporarily unavailable.')}</small>
            <button type="button" data-nt-community-retry>${icons.refresh}<span>${t('Retry')}</span></button>
          </div>`;
    }

    renderError(error) {
        this.setShellMode('workspace');
        this.configureShellHeader({ visible: false });
        const message = String(error?.message || error || t('Unknown error'));
        const schemaMissing = /relation .*nt_|does not exist|schema cache/i.test(message);
        this.shell().innerHTML = `
          <div class="nt-community-center nt-community-error">
            <span class="nt-community-big-icon">${icons.health}</span>
            <b>${schemaMissing ? t('Community database is not initialized') : t('Community Chat could not connect')}</b>
            <small>${esc(schemaMissing ? t('Apply the Community database migration to your Supabase project, then try again.') : message)}</small>
            <div class="nt-community-center-actions">
              <button type="button" data-nt-community-retry>${icons.refresh}<span>${t('Retry')}</span></button>
            </div>
          </div>`;
    }

    renderAuth() {
        const signup = this.authMode === 'signup';
        const googleIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.91h5.38a4.6 4.6 0 0 1-2 3.02v2.54h3.24c1.9-1.75 2.98-4.34 2.98-7.4Z"/><path fill="#34A853" d="M12 22c2.7 0 4.97-.9 6.63-2.37l-3.24-2.54c-.9.6-2.05.96-3.39.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.62A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.39 13.92A6.02 6.02 0 0 1 6.08 12c0-.67.11-1.31.31-1.92V7.46H3.04A10 10 0 0 0 2 12c0 1.61.39 3.13 1.04 4.54l3.35-2.62Z"/><path fill="#EA4335" d="M12 5.95c1.47 0 2.79.51 3.83 1.5l2.87-2.88A9.64 9.64 0 0 0 12 2a10 10 0 0 0-8.96 5.46l3.35 2.62C7.18 7.71 9.39 5.95 12 5.95Z"/></svg>`;
        this.setShellMode('auth');
        this.configureShellHeader({ title: signup ? t('Create account') : t('Sign in'), subtitle: t('NastyTavern Community'), actionsHtml: `<button type="button" data-nt-community-privacy title="${t('Privacy & network access')}">${icons.info}</button>` });
        this.shell()?.classList.remove('nt-community-auth-onboarding');
        this.shell().innerHTML = `
            <div class="nt-community-auth-intro"><b>${signup ? t('Join NastyTavern Community') : t('Welcome back')}</b><p>${signup ? t('Create your Community account to chat with other NastyTavern users.') : t('Sign in to access Community Chat and your shared spaces.')}</p></div>
            <div class="nt-community-auth-card">
              <button type="button" class="nt-community-google" data-nt-community-google>${googleIcon}<span>${t('Continue with Google')}</span></button>
              <div class="nt-community-auth-divider"><span>${t('or')}</span></div>
              <form data-nt-community-auth-form>
                ${signup ? `<label><span>${t('Username')}</span><input name="username" autocomplete="nickname" minlength="2" maxlength="32" required placeholder="${t('Choose a username')}"><small class="nt-community-field-hint">${t('This username is permanent. Letter case is preserved exactly as entered.')}</small></label>` : ''}
                <label><span>${t('Email')}</span><input name="email" type="email" autocomplete="email" required placeholder="name@example.com"></label>
                <label><span>${t('Password')}</span><input name="password" type="password" autocomplete="${signup ? 'new-password' : 'current-password'}" minlength="6" required></label>
                ${this.notice ? `<p class="nt-community-notice">${esc(this.notice)}</p>` : ''}
                <button type="submit" class="is-primary nt-community-auth-submit">${signup ? t('Create account') : t('Sign in')}</button>
              </form>
              <button type="button" class="nt-community-auth-switch" data-nt-community-auth-tab="${signup ? 'signin' : 'signup'}">${signup ? t('Sign in') : t('Create account')}</button>
            </div>`;
    }

    renderUsernameOnboarding() {
        this.setShellMode('auth');
        this.configureShellHeader({ title: t('Community profile'), subtitle: t('NastyTavern Community'), actionsHtml: `<button type="button" data-nt-community-privacy title="${t('Privacy & network access')}">${icons.info}</button>` });
        const avatar = this.user?.user_metadata?.avatar_url || this.user?.user_metadata?.picture || '';
        const email = this.user?.email || '';
        this.shell()?.classList.add('nt-community-auth-onboarding');
        this.shell().innerHTML = `
            <div class="nt-community-auth-intro"><b>${t('Choose your Community username')}</b><p>${t('Choose the permanent identity you will use in Community.')}</p></div>
            <div class="nt-community-auth-card nt-community-username-card">
              <div class="nt-community-oauth-user">${avatarHtml(avatar, email || 'G', { wrapInitials: true })}<div><b>${t('Google account connected')}</b><small>${esc(email)}</small></div></div>
              <h3>${t('Choose your Community username')}</h3>
              <p>${t('Your Google name is not used automatically. Pick the unique username other Community members will see.')}</p>
              <form data-nt-community-username-form>
                <label><span>${t('Username')}</span><input name="username" autocomplete="nickname" minlength="2" maxlength="32" pattern="[A-Za-z0-9_-]{2,32}" required autofocus placeholder="${t('Choose a username')}"><small class="nt-community-field-hint">${t('2–32 characters: letters, numbers, underscore or hyphen. This username is permanent.')}</small></label>
                ${this.notice ? `<p class="nt-community-notice">${esc(this.notice)}</p>` : ''}
                <button type="submit" class="is-primary nt-community-auth-submit">${t('Join Community')}</button>
              </form>
              <button type="button" class="nt-community-config-link" data-nt-community-signout>${t('Use another account')}</button>
            </div>`;
    }

    getAuthRedirectUrl() {
        const redirect = new URL(window.location.href);
        redirect.hash = '';
        redirect.search = '';
        return redirect.toString();
    }

    async signInWithGoogle() {
        this.notice = '';
        try {
            const client = await this.makeClient();
            try { localStorage.setItem(COMMUNITY_OAUTH_RETURN_KEY, '1'); } catch (_) {}
            const { error } = await client.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: this.getAuthRedirectUrl(),
                    queryParams: { prompt: 'select_account' },
                },
            });
            if (error) throw error;
        } catch (error) {
            try { localStorage.removeItem(COMMUNITY_OAUTH_RETURN_KEY); } catch (_) {}
            this.notice = error?.message || t('Google sign-in failed.');
            this.renderAuth();
        }
    }

    async claimCommunityUsername(form) {
        const username = String(form.get('username') || '').trim();
        this.notice = '';
        if (!/^[A-Za-z0-9_-]{2,32}$/.test(username)) {
            this.notice = t('Use 2–32 letters, numbers, underscores or hyphens.');
            this.renderUsernameOnboarding();
            return;
        }
        try {
            const client = await this.makeClient();
            const { error } = await client.rpc('nt_claim_username', { p_username: username });
            if (error) throw error;
            this.needsProfileOnboarding = false;
            await this.loadWorkspace();
            await this.ensureGeneralChannelSelected();
        } catch (error) {
            this.notice = error?.message || t('Could not create Community profile.');
            this.renderUsernameOnboarding();
        }
    }

    async loadWorkspace() {
        if (this.workspaceLoadPromise) return this.workspaceLoadPromise;
        const task = this.performWorkspaceLoad();
        this.workspaceLoadPromise = task;
        try {
            return await task;
        } finally {
            if (this.workspaceLoadPromise === task) this.workspaceLoadPromise = null;
        }
    }

    async performWorkspaceLoad() {
        this.loading = true;
        this.renderLoading();
        const client = await this.makeClient();
        const [{ data: profile, error: profileError }, { data: channels, error: channelError }] = await Promise.all([
            client.from('nt_profiles').select('id,username,avatar_url,bio,role,created_at,muted_until,banned_at,ban_reason').eq('id', this.user.id).maybeSingle(),
            client.from('nt_channels').select('id,name,slug,type,created_by,created_at').in('slug', OFFICIAL_CHANNEL_SLUGS),
        ]);
        if (profileError) throw profileError;
        if (channelError) throw channelError;
        this.profile = profile || null;
        this.needsProfileOnboarding = !profile;
        this.channels = (Array.isArray(channels) ? channels : [])
            .filter(channel => channel.type === 'public' && OFFICIAL_CHANNEL_ORDER.has(channel.slug))
            .sort((a, b) => (OFFICIAL_CHANNEL_ORDER.get(a.slug) ?? 99) - (OFFICIAL_CHANNEL_ORDER.get(b.slug) ?? 99));
        if (!this.profile) {
            this.loading = false;
            this.renderUsernameOnboarding();
            return;
        }
        await this.loadChannelMembersIndex();
        if (roleRank(this.profile?.role) >= 1) await this.loadOpenReportCount();
        if (this.activeChannelId && !this.channels.some(channel => channel.id === this.activeChannelId)) {
            this.activeChannelId = null;
        }
        this.subscribeGlobalPresence();
        this.loading = false;
        this.renderWorkspace();
        if (this.activeChannelId) await this.selectChannel(this.activeChannelId, false);
    }

    async loadChannelMembersIndex() {
        if (!this.channels.length) {
            this.channelMembers = new Map();
            return;
        }
        const { data, error } = await this.client.from('nt_channel_members')
            .select('channel_id,user_id,role,joined_at,profile:nt_profiles!nt_channel_members_user_id_fkey(id,username,avatar_url,bio,role,created_at,muted_until,banned_at)')
            .in('channel_id', this.channels.map(channel => channel.id));
        if (error) throw error;

        const nextMembers = new Map();
        const seen = new Set();
        for (const row of data || []) {
            const key = `${row.channel_id}:${row.user_id}`;
            if (seen.has(key)) continue;
            seen.add(key);
            if (!nextMembers.has(row.channel_id)) nextMembers.set(row.channel_id, []);
            nextMembers.get(row.channel_id).push(row);
        }
        this.channelMembers = nextMembers;
    }

    channelMeta(channel) {
        const slug = channel?.slug || '';
        if (slug === 'nastytavern') return { label: 'NastyTavern', icon: icons.community || icons.chat };
        if (slug === 'character-cards') return { label: t('Character Cards'), icon: icons.characters || icons.persona };
        if (slug === 'lorebooks') return { label: t('Lorebooks'), icon: icons.lore || icons.bookmark };
        if (slug === 'extensions') return { label: t('Extensions'), icon: icons.extensions || icons.plug };
        return { label: t('General'), icon: icons.chat };
    }

    renderWorkspace() {
        this.setShellMode('workspace');
        const active = this.channels.find(channel => channel.id === this.activeChannelId) || null;
        const activeMeta = this.channelMeta(active);
        const globalOnlineCount = this.globalPresence.size;
        const channelOnlineCount = this.presence.size;
        const canUpload = canShareInChannel(active?.slug);
        const role = this.profile?.role || 'member';
        const isMod = roleRank(role) >= 1;
        const muted = this.profile?.muted_until && Date.parse(this.profile.muted_until) > Date.now();
        const banned = Boolean(this.profile?.banned_at);
        this.configureShellHeader({
            title: t('NastyTavern Community'),
            actionsHtml: `${isMod ? `<button type="button" data-nt-community-moderation class="${this.openReportCount > 0 ? 'has-open-reports' : ''}" title="${t('Moderation')}">${icons.alertWarning}</button>` : ''}<button type="button" data-nt-community-privacy title="${t('Privacy & network access')}">${icons.info}</button><button type="button" class="nt-community-user-pill" data-nt-community-profile-self title="${t('Open your Community profile')}"><span class="nt-community-mini-avatar">${avatarHtml(this.profile?.avatar_url, this.profile?.username)}</span><b>${esc(this.profile?.username || '')}</b>${role !== 'member' ? `<em>${esc(roleLabel(role))}</em>` : ''}</button><button type="button" data-nt-community-signout title="${t('Sign out')}">${icons.disconnect}</button>`,
        });
        this.shell().innerHTML = `
          <div class="nt-community-workspace">
            <aside class="nt-community-channels"><nav class="nt-community-channel-list nt-community-official-list">${this.channels.map(channel => this.channelButton(channel)).join('')}</nav></aside>
            <main class="nt-community-main">
              <header class="nt-community-room-header">
                <div class="nt-community-room-title"><span>${activeMeta.icon}</span><div><b>${active ? `# ${esc(activeMeta.label)}` : t('Community Chat')}</b>${active ? '' : `<small>${t('Choose a channel')}</small>`}</div></div>
                <div class="nt-community-room-meta">
                  <span title="${t('Online in Community')}">${icons.community || icons.persona}<b data-nt-community-global-online-count>${globalOnlineCount}</b></span>
                  <span class="is-online" title="${t('Online in this channel')}">● <b data-nt-community-online-count>${channelOnlineCount}</b></span>
                  <button type="button" data-nt-community-search-toggle title="${t('Search messages')}">${icons.search}</button>
                  <button type="button" data-nt-community-mobile-channels>${icons.history}</button>
                </div>
              </header>
              ${this.renderSearchPanel()}
              ${banned ? `<div class="nt-community-account-alert is-danger"><b>${t('Community access suspended')}</b><span>${esc(this.profile?.ban_reason || t('This account is banned from Community Chat.'))}</span></div>` : muted ? `<div class="nt-community-account-alert"><b>${t('You are temporarily muted')}</b><span>${t('You can read messages, but cannot send until the mute expires.')}</span></div>` : ''}
              <div class="nt-community-messages" data-nt-community-messages>${this.renderMessages()}</div>
              <div class="nt-community-typing" data-nt-community-typing>${this.renderTyping()}</div>
              <div class="nt-community-reply" data-nt-community-reply ${this.replyTo ? '' : 'hidden'}>${this.renderReplyBar()}</div>
              <form class="nt-community-composer" data-nt-community-message-form>
                <span class="nt-community-composer-channel">#</span>
                ${canUpload ? `<button type="button" class="nt-community-attach" data-nt-community-attach title="${active?.slug === 'character-cards' ? t('Share a Character Card') : t('Share a Lorebook')}">${icons.upload}</button><input type="file" data-nt-community-share-file hidden accept="${active?.slug === 'character-cards' ? '.png,.json,application/json,image/png' : '.json,.lorebook,.png,application/json,image/png'}">` : ''}
                <textarea data-nt-community-composer rows="1" maxlength="8000" placeholder="${active ? `${t('Message')} #${esc(activeMeta.label)}…` : t('Message the community…')}" ${(active && !muted && !banned) ? '' : 'disabled'}></textarea>
                <button type="submit" class="is-primary nt-community-send" ${(active && !muted && !banned) ? '' : 'disabled'}>${icons.arrowRight}</button>
              </form>
            </main>
            <aside class="nt-community-members"><div data-nt-community-members>${this.renderMembers()}</div></aside>
          </div>
          ${this.renderProfileOverlay()}
          ${this.renderModerationOverlay()}`;
        this.updateChannelBadges();
    }

    renderSearchPanel() {
        if (!this.searchOpen) return '';
        return `<section class="nt-community-search-panel">
          <form data-nt-community-search-form><span>${icons.search}</span><input name="query" value="${esc(this.searchQuery)}" placeholder="${t('Search this channel…')}" autocomplete="off"><button type="submit">${t('Search')}</button><button type="button" data-nt-community-search-close>${icons.close}</button></form>
          <div class="nt-community-search-results">${this.searchQuery ? (this.searchResults.length ? this.searchResults.map(row => `<button type="button" data-nt-search-message="${row.id}"><b>${esc(row.profile?.username || t('Unknown user'))}</b><span>${esc(String(row.content || '').slice(0,180))}</span><small>${shortTime(row.created_at)}</small></button>`).join('') : `<small>${t('No matching messages.')}</small>`) : `<small>${t('Search the current channel history.')}</small>`}</div>
        </section>`;
    }

    renderTyping() {
        const names = [...this.typingUsers.values()].map(v => v.username).filter(Boolean).filter(name => name !== this.profile?.username);
        if (!names.length) return '';
        if (names.length === 1) return `${esc(names[0])} ${t('is typing…')}`;
        if (names.length === 2) return `${esc(names[0])} & ${esc(names[1])} ${t('are typing…')}`;
        return t('{count} people are typing…', { count: names.length });
    }

    channelButton(channel) {
        const active = channel.id === this.activeChannelId;
        const meta = this.channelMeta(channel);
        const unread = Number(this.unreadCounts.get(channel.id) || 0);
        const mentions = Number(this.mentionCounts.get(channel.id) || 0);
        const hasNotice = mentions > 0 || unread > 0;
        return `<button type="button" class="nt-community-channel ${active ? 'is-active' : ''}" data-nt-community-channel="${esc(channel.id)}"><div><b># ${esc(meta.label)}</b></div><span class="nt-community-channel-badges" data-nt-channel-badges ${hasNotice ? '' : 'hidden'}>${hasNotice ? '<span class="nt-community-unread-dot" aria-hidden="true"></span>' : ''}</span></button>`;
    }

    renderMessages() {
        if (!this.activeChannelId) return `<div class="nt-community-empty"><span>${icons.chat}</span><b>${t('Choose a channel')}</b><small>${t('Choose one of the SillyTavern spaces on the left.')}</small></div>`;
        if (!this.messages.length) return `<div class="nt-community-empty"><span>${icons.chat}</span><b>${t('No messages yet')}</b><small>${t('Be the first to say hello.')}</small></div>`;
        const map = new Map(this.messages.map(message => [String(message.id), message]));
        const isMod = roleRank(this.profile?.role) >= 1;
        return this.messages.map(message => {
            const own = message.user_id === this.user?.id;
            const profile = message.profile || {};
            const reply = message.reply_to ? map.get(String(message.reply_to)) : null;
            const reactions = this.reactionSummary(message.id);
            const attachment = message.message_type === 'attachment' ? this.renderAttachment(message) : '';
            const role = profile.role || 'member';
            return `<article class="nt-community-message ${own ? 'is-own' : ''}" data-nt-community-message="${message.id}">
              <button type="button" class="nt-community-avatar" data-nt-community-profile="${esc(message.user_id)}">${avatarHtml(profile.avatar_url, profile.username)}</button>
              <div class="nt-community-message-body">
                <header><b>${esc(profile.username || t('Unknown user'))}${role !== 'member' ? `<em>${esc(roleLabel(role))}</em>` : ''}</b><small>${shortTime(message.created_at)}${message.edited_at ? ` · ${t('edited')}` : ''}</small><div>
                  <button type="button" class="nt-community-reaction-action" data-nt-reaction-picker-toggle="${message.id}" title="${t('React')}" aria-label="${t('React')}" aria-expanded="${String(this.reactionPickerMessageId) === String(message.id)}">☺</button>
                  <button type="button" data-nt-message-action="reply" title="${t('Reply')}">${icons.arrowLeft}</button>
                  ${own ? `<button type="button" data-nt-message-action="edit" title="${t('Edit')}">${icons.edit}</button>` : `<button type="button" data-nt-message-action="report" title="${t('Report')}">${icons.alertWarning}</button>`}
                  ${(own || isMod) ? `<button type="button" data-nt-message-action="delete" title="${isMod && !own ? t('Moderator delete') : t('Delete')}">${icons.trash}</button>` : ''}
                  ${String(this.reactionPickerMessageId) === String(message.id) ? `<div class="nt-community-reaction-picker" data-nt-reaction-picker role="menu" aria-label="${t('React')}">${COMMUNITY_REACTION_EMOJIS.map(emoji => `<button type="button" data-nt-message-reaction="${emoji}" data-nt-reaction-picker-option role="menuitem" title="${emoji}"><span class="nt-community-reaction-picker-emoji" aria-hidden="true">${emoji}</span></button>`).join('')}</div>` : ''}
                </div></header>
                ${reply ? `<blockquote><b>${esc(reply.profile?.username || '')}</b><span>${esc(String(reply.content || '').slice(0,140))}</span></blockquote>` : ''}
                ${message.message_type !== 'attachment' && message.content ? `<div class="nt-community-markdown">${renderMarkdown(message.content)}</div>` : ''}
                ${attachment}
                ${reactions ? `<div class="nt-community-reactions">${reactions}</div>` : ''}
              </div>
            </article>`;
        }).join('');
    }

    renderAttachment(message) {
        const meta = message.metadata || {};
        const path = String(meta.path || '');
        const url = this.attachmentUrls.get(path) || '';
        const kind = meta.kind === 'lorebook' ? 'lorebook' : 'character';
        const legacyTitle = stripResourceExtension(String(message.content || '').replace(/^\s*(?:Character Card|Lorebook)\s*:\s*/i, ''));
        const title = meta.display_name || stripResourceExtension(meta.name) || legacyTitle || (kind === 'character' ? t('Character Card') : t('Lorebook'));
        const hasImage = kind === 'character' && url && (meta.mime === 'image/png' || /\.png$/i.test(meta.name || ''));
        const stats = this.resourceStatsFor(message.id);
        const resourceDescription = kind === 'character'
            ? asText(meta.nt_description || meta.description)
            : asText(meta.description);
        return `<div class="nt-community-attachment ${kind === 'character' ? 'is-character' : 'is-lorebook'}">
          <button type="button" class="nt-community-attachment-media" data-nt-resource-info="${message.id}" title="${t('View resource details')}">
            ${hasImage ? `<img src="${esc(url)}" alt="${esc(title)}">${this.resourceRatingSummary(message.id)}` : `<span>${kind === 'character' ? icons.characters : icons.lore}</span>`}
          </button>
          <div class="nt-community-attachment-body">
            <div class="nt-community-attachment-main">
              <div class="nt-community-attachment-copy">
                <b>${esc(title)}</b>
                ${resourceDescription ? `<em>${esc(resourceDescription)}</em>` : ''}
              </div>
              ${this.resourceRatingInput(message.id)}
            </div>
            <div class="nt-community-attachment-footer">
              <div class="nt-community-attachment-actions">
                <button type="button" data-nt-resource-info="${message.id}" title="${t('View resource details')}" aria-label="${t('Details')}">${icons.info}<span>${t('Details')}</span></button>
                <button type="button" data-nt-attachment-import="${message.id}" title="${t('Import')}" aria-label="${t('Import')}">${icons.download}<span>${t('Import')}</span></button>
              </div>
              <span class="nt-community-resource-acquisitions" title="${esc(t('Unique imports/downloads'))}" aria-label="${esc(t('Unique imports/downloads'))}: ${stats.acquisition_count}">${icons.download}<span>${stats.acquisition_count}</span></span>
            </div>
          </div>
        </div>`;
    }

    findResourceMessage(resourceOrId) {
        if (resourceOrId && typeof resourceOrId === 'object') return resourceOrId;
        const id = String(resourceOrId || '');
        if (!id) return null;
        const pooled = [
            ...(this.messages || []),
            ...(this.homeSnapshot?.characterCards || []),
            ...(this.homeSnapshot?.lorebooks || []),
        ];
        return pooled.find(item => String(item?.id) === id) || null;
    }

    async openResourceDetails(resourceOrId) {
        const message = this.findResourceMessage(resourceOrId);
        if (!message?.metadata?.path) return false;
        this.closeResourceDetails();
        this.resourceDetailsMessage = message;
        try {
            await this.initializeBackground();
            if (!this.client || !this.user) throw new Error(t('Sign in to Community to view this resource.'));
            const { data, error } = await this.client.storage.from('community-files').download(message.metadata.path);
            if (error) throw error;
            const info = await inspectCommunityResource(data, message.metadata);
            if (this.resourceDetailsMessage !== message) return false;

            let previewUrl = '';
            if (message.metadata?.mime === 'image/png' || /\.png$/i.test(message.metadata?.name || '')) {
                this.resourceDetailsObjectUrl = URL.createObjectURL(data);
                previewUrl = this.resourceDetailsObjectUrl;
            }

            const kind = message.metadata?.kind === 'lorebook' ? 'lorebook' : 'character';
            const author = message?.profile?.username || t('Unknown user');
            const stats = this.resourceStatsFor(message.id);
            const metaItems = [
                t('{count} downloads', { count: Number(stats.acquisition_count || 0) }),
                t('Shared by {name}', { name: author }),
                formatBytes(message.metadata?.size),
                message?.created_at ? resourceDate(message.created_at) : '',
            ].filter(Boolean);
            const actions = [
                {
                    id: 'community-import',
                    label: t('Import'),
                    icon: icons.download,
                    primary: true,
                    run: async () => this.downloadAttachment(message, true),
                },
                {
                    id: 'community-download',
                    label: t('Download'),
                    icon: icons.download,
                    close: false,
                    run: async () => this.downloadAttachment(message, false),
                },
            ];
            const onClose = () => {
                if (this.resourceDetailsObjectUrl) {
                    URL.revokeObjectURL(this.resourceDetailsObjectUrl);
                    this.resourceDetailsObjectUrl = '';
                }
                if (this.resourceDetailsMessage === message) this.resourceDetailsMessage = null;
            };
            const opened = this.callbacks.openResourceDetails?.({
                kind,
                card: kind === 'character' ? info.raw : null,
                lorebook: kind === 'lorebook' ? info.raw : null,
                title: info.name,
                imageUrl: previewUrl,
                context: kind === 'character' ? 'community-character' : 'community-lorebook',
                contextLabel: kind === 'character' ? t('Character Card') : t('Lorebook'),
                metaItems,
                coverOverlayHtml: kind === 'character' ? this.resourceRatingSummary(message.id) : '',
                actions,
                onClose,
            });
            if (!opened) onClose();
            return Boolean(opened);
        } catch (error) {
            this.closeResourceDetails();
            this.toast?.(error?.message || String(error));
            return false;
        }
    }

    closeResourceDetails() {
        this.callbacks.closeResourceDetails?.();
        if (this.resourceDetailsObjectUrl) {
            URL.revokeObjectURL(this.resourceDetailsObjectUrl);
            this.resourceDetailsObjectUrl = '';
        }
        this.resourceDetailsMessage = null;
    }

    reactionSummary(messageId) {
        const rows = this.reactions.filter(row => String(row.message_id) === String(messageId));
        const groups = new Map();
        for (const row of rows) {
            if (!groups.has(row.emoji)) groups.set(row.emoji, { count: 0, own: false });
            const item = groups.get(row.emoji); item.count += 1; if (row.user_id === this.user?.id) item.own = true;
        }
        return [...groups.entries()].map(([emoji, item]) => `<button type="button" class="nt-community-reaction ${item.own ? 'is-own' : ''}" data-nt-message-reaction="${emoji}">${emoji}<span>${item.count}</span></button>`).join('');
    }

    renderReplyBar() {
        if (!this.replyTo) return '';
        const target = this.messages.find(message => String(message.id) === String(this.replyTo));
        if (!target) return '';
        return `<div><span>${icons.arrowLeft}</span><p><b>${t('Replying to')} ${esc(target.profile?.username || '')}</b><small>${esc(String(target.content || '').slice(0,100))}</small></p></div><button type="button" data-nt-community-cancel-reply>${icons.close}</button>`;
    }

    renderMembers() {
        const members = (this.channelMembers.get(this.activeChannelId) || []).filter(member => this.globalPresence.has(member.user_id));
        if (!members.length) return `<small class="nt-community-empty-side">${t('No members to show.')}</small>`;
        return members.map(member => {
            const profile = member.profile || {};
            const online = this.presence.has(member.user_id);
            const role = profile.role || 'member';
            return `<button type="button" class="nt-community-member" data-nt-community-profile="${esc(member.user_id)}"><span class="nt-community-mini-avatar">${avatarHtml(profile.avatar_url, profile.username)}</span><div><b>${esc(profile.username || '')}</b><small>${esc(roleLabel(role))}</small></div><i class="${online ? 'is-online' : ''}" title="${online ? t('Online') : t('Offline')}"></i></button>`;
        }).join('');
    }

    renderProfileOverlay() {
        if (!this.profileView) return '';
        const p = this.profileView;
        const own = p.id === this.user?.id;
        const role = p.role || 'member';
        const canMod = roleRank(this.profile?.role) >= 1 && !own && roleRank(role) < roleRank(this.profile?.role);
        const canBan = this.profile?.role === 'admin' && !own && role !== 'admin';
        return `<div class="nt-community-overlay" data-nt-profile-overlay><section class="nt-community-profile-card">
          <header><b>${t('Community Profile')}</b>${closeButtonHtml('nt-profile-close')}</header>
          <div class="nt-community-profile-hero"><span class="nt-community-profile-avatar">${avatarHtml(p.avatar_url, p.username)}</span><div><h3>${esc(p.username || '')}</h3><span>${esc(roleLabel(role))}</span><small>${p.created_at ? `${t('Member since')} ${new Date(p.created_at).toLocaleDateString()}` : ''}</small></div></div>
          ${own ? `<form data-nt-community-profile-form><label><span>${t('Bio')}</span><textarea name="bio" maxlength="160" rows="3" placeholder="${t('A short Community bio…')}">${esc(p.bio || '')}</textarea></label><label class="nt-community-avatar-upload"><span>${t('Avatar')}</span><input type="file" data-nt-profile-avatar accept="image/png,image/jpeg,image/webp,image/gif"><small>${t('PNG, JPG, WEBP or GIF · 2 MB max')}</small></label><button type="submit" class="is-primary">${t('Save profile')}</button></form>` : `<p class="nt-community-profile-bio">${esc(p.bio || t('No bio yet.'))}</p>`}
          ${(canMod || canBan || (this.profile?.role === 'admin' && !own)) ? `<div class="nt-community-mod-actions">${canMod ? `<button type="button" data-nt-mod-mute="10" data-user="${p.id}">${t('Mute 10 min')}</button><button type="button" data-nt-mod-mute="60" data-user="${p.id}">${t('Mute 1 hour')}</button><button type="button" data-nt-mod-mute="0" data-user="${p.id}">${t('Unmute')}</button>` : ''}${this.profile?.role === 'admin' && !own ? `${role !== 'member' ? `<button type="button" data-nt-mod-role="member" data-user="${p.id}">${t('Make member')}</button>` : ''}${role !== 'vip' ? `<button type="button" data-nt-mod-role="vip" data-user="${p.id}">${t('Make VIP')}</button>` : ''}${role !== 'moderator' ? `<button type="button" data-nt-mod-role="moderator" data-user="${p.id}">${t('Make moderator')}</button>` : ''}` : ''}${canBan ? `<button type="button" class="is-danger" data-nt-mod-ban data-user="${p.id}">${p.banned_at ? t('Unban') : t('Ban')}</button>` : ''}</div>` : ''}
        </section></div>`;
    }

    renderModerationOverlay() {
        if (!this.moderationOpen) return '';
        return `<div class="nt-community-overlay" data-nt-moderation-overlay><section class="nt-community-moderation-card"><header><div><b>${t('Moderation')}</b><small>${t('Open reports and Community safety tools')}</small></div>${closeButtonHtml('nt-moderation-close')}</header><div class="nt-community-report-list">${this.reports.length ? this.reports.map(report => {
            const msg = this.reportMessages.get(String(report.message_id));
            const author = msg ? this.reportProfiles.get(msg.user_id) : null;
            const reporter = this.reportProfiles.get(report.reporter_id);
            return `<article><div><b>${esc(author?.username || t('Unknown user'))}</b><small>${t('Reported by')} ${esc(reporter?.username || t('Unknown user'))} · ${shortTime(report.created_at)}</small></div><p>${esc(String(msg?.content || t('Message unavailable')).slice(0,300))}</p><blockquote>${esc(report.reason || t('No reason provided.'))}</blockquote><footer>${msg ? `<button type="button" data-nt-mod-delete-message="${msg.id}">${t('Delete message')}</button><button type="button" data-nt-mod-mute="60" data-user="${msg.user_id}">${t('Mute 1 hour')}</button>` : ''}<button type="button" data-nt-report-resolve="${report.id}">${t('Resolve')}</button></footer></article>`;
        }).join('') : `<small>${t('No open reports.')}</small>`}</div></section></div>`;
    }

    async selectChannel(id, render = true) {
        if (!id) return;
        this.sendTyping(false);
        this.activeChannelId = id;
        this.sessionJoinedChannels.add(id);
        this.unreadCounts.delete(id);
        this.emitBadgeChanged();
        const channel = this.channels.find(item => item.id === id);
        if (channel?.type === 'public') {
            try { await this.client.rpc('nt_join_channel', { p_channel: id }); } catch (_) {}
        }
        await this.markChannelMentionsRead(id);
        if (render) this.renderWorkspace();
        await this.loadMessages();
        await this.loadChannelMembersIndex();
        this.subscribeChannel();
        this.updateDynamicAreas();
    }

    async loadMessages() {
        if (!this.activeChannelId) return;
        const { data, error } = await this.client.from('nt_messages')
            .select('id,channel_id,user_id,content,reply_to,message_type,metadata,edited_at,created_at,profile:nt_profiles!nt_messages_user_id_fkey(id,username,avatar_url,bio,role,created_at)')
            .eq('channel_id', this.activeChannelId)
            .order('created_at', { ascending: true })
            .limit(150);
        if (error) throw error;
        this.messages = data || [];
        const resourceIds = this.messages
            .filter(message => ['attachment','character_card','lorebook'].includes(message.message_type))
            .map(message => message.id);
        await Promise.all([this.loadReactions(), this.hydrateAttachmentUrls(), this.loadResourceStats(resourceIds)]);
    }

    resourceStatsFor(messageId) {
        return this.resourceStats.get(String(messageId)) || {
            rating_average: 0,
            rating_count: 0,
            acquisition_count: 0,
            my_rating: null,
        };
    }

    async loadResourceStats(messageIds = []) {
        if (!this.client || !this.user) return;
        const ids = [...new Set((messageIds || []).map(Number).filter(Number.isFinite))];
        if (!ids.length) return;
        const { data, error } = await this.client.rpc('nt_resource_stats', { p_messages: ids });
        if (error) {
            console.warn('[NastyTavern] Could not load Community resource stats', error);
            return;
        }
        for (const row of data || []) {
            this.resourceStats.set(String(row.message_id), {
                rating_average: Number(row.rating_average || 0),
                rating_count: Number(row.rating_count || 0),
                acquisition_count: Number(row.acquisition_count || 0),
                my_rating: row.my_rating == null ? null : Number(row.my_rating),
            });
        }
    }

    resourceRatingInput(messageId) {
        const stats = this.resourceStatsFor(messageId);
        const selected = Number(stats.my_rating || 0);
        const star = '<span class="nt-community-resource-rate-star" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="m12 2.8 2.76 5.59 6.17.9-4.46 4.35 1.05 6.14L12 16.88 6.48 19.78l1.05-6.14L3.07 9.29l6.17-.9L12 2.8Z"/></svg></span>';
        return `<div class="nt-community-resource-rate" role="group" aria-label="${esc(t('Rate this resource'))}">${[1,2,3,4,5].map(value => `<button type="button" data-nt-resource-rating="${value}" data-nt-resource-rating-message="${messageId}" class="${value <= selected ? 'is-selected' : ''}" title="${esc(t('Rate {value} stars', { value }))}" aria-label="${esc(t('Rate {value} stars', { value }))}" aria-pressed="${value === selected}">${star}</button>`).join('')}</div>`;
    }

    resourceRatingSummary(messageId) {
        const stats = this.resourceStatsFor(messageId);
        const average = Number(stats.rating_average || 0);
        const stars = starsHtml(average);
        return `<span class="nt-community-resource-rating-summary" title="${esc(t('Average rating {value} out of 5', { value: average ? average.toFixed(2) : '0.00' }))}" aria-label="${esc(t('Average rating {value} out of 5', { value: average ? average.toFixed(2) : '0.00' }))}"><span class="nt-community-resource-rating-stars">${stars}</span></span>`;
    }

    async rateResource(messageId, rating) {
        const id = Number(messageId);
        const value = Number(rating);
        if (!Number.isFinite(id) || !Number.isInteger(value) || value < 1 || value > 5) return;

        const key = String(id);
        const previous = { ...this.resourceStatsFor(id) };
        this.resourceStats.set(key, { ...previous, my_rating: value });
        this.updateDynamicAreas({ scrollMessagesToBottom: false });

        const { error } = await this.client.rpc('nt_rate_resource', { p_message: id, p_rating: value });
        if (error) {
            this.resourceStats.set(key, previous);
            this.updateDynamicAreas({ scrollMessagesToBottom: false });
            return this.toast?.(error.message);
        }
        await this.loadResourceStats([id]);
        this.updateDynamicAreas({ scrollMessagesToBottom: false });
        void this.refreshHomeSnapshot();
    }

    async recordResourceAcquisition(message, action) {
        const id = Number(message?.id);
        if (!Number.isFinite(id) || !this.client || !this.user) return;
        const { error } = await this.client.rpc('nt_record_resource_acquisition', { p_message: id, p_action: action === 'download' ? 'download' : 'import' });
        if (error) {
            console.warn('[NastyTavern] Could not record Community resource acquisition', error);
            return;
        }
        await this.loadResourceStats([id]);
        this.updateDynamicAreas({ scrollMessagesToBottom: false });
        void this.refreshHomeSnapshot();
    }

    async loadReactions() {
        if (!this.messages.length) { this.reactions = []; return; }
        const { data } = await this.client.from('nt_message_reactions').select('message_id,user_id,emoji').in('message_id', this.messages.map(message => message.id));
        this.reactions = data || [];
    }


    async hydrateAttachmentUrls() {
        const paths = [...new Set(this.messages.filter(m => m.message_type === 'attachment').map(m => m.metadata?.path).filter(Boolean))];
        for (const path of paths) {
            if (this.attachmentUrls.has(path)) continue;
            const { data } = await this.client.storage.from('community-files').createSignedUrl(path, 3600);
            if (data?.signedUrl) this.attachmentUrls.set(path, data.signedUrl);
        }
    }

    async ensureReadyForDirectShare({ signedOutAuthMode = 'signin' } = {}) {
        this.ensure();
        await this.initializeBackground();
        if (!this.user) {
            await this.open({ authMode: signedOutAuthMode });
            return false;
        }
        if (!this.channels.length || !this.profile) await this.loadWorkspace();
        return true;
    }

    async shareResourceFile(file, kind, displayName, channelSlug = kind === 'character' ? 'character-cards' : 'lorebooks') {
        if (!file || !this.client || !this.user) return false;
        const channel = this.channels.find(item => item.slug === channelSlug);
        if (!channel || !canShareInChannel(channel.slug)) throw new Error(t('Community sharing channel is unavailable.'));
        const ext = String(file.name || '').split('.').pop()?.toLowerCase();
        const allowed = kind === 'character' ? ['png','json'] : ['json','lorebook','png'];
        if (!allowed.includes(ext)) throw new Error(kind === 'character' ? t('Character Cards must be PNG or JSON files.') : t('Lorebooks must be JSON, Lorebook or PNG files.'));
        if (file.size > COMMUNITY_FILE_LIMIT_BYTES) throw new Error(t('Community files are limited to 5.5 MB.'));

        const logicalName = safeResourceName(displayName || await inferResourceDisplayName(file, kind));
        let sharedDescription = '';
        if (kind === 'character') {
            try {
                const resourceInfo = await inspectCommunityResource(file, { kind, display_name: logicalName, name: file.name, mime: file.type });
                sharedDescription = asText(resourceInfo?.ntDescription || resourceInfo?.description);
            } catch (_) {}
        }
        const normalizedExt = ext === 'lorebook' ? 'json' : ext;
        const downloadName = resourceDownloadName(logicalName, kind, normalizedExt);
        const storageExt = normalizedExt;
        const path = `${this.user.id}/${Date.now()}-${makeSessionToken()}.${storageExt}`;
        const contentType = normalizedExt === 'png' ? 'image/png' : 'application/json';
        const uploadFile = file.name === downloadName && (file.type || contentType) === contentType
            ? file
            : new File([file], downloadName, { type: contentType });

        try { await this.client.rpc('nt_join_channel', { p_channel: channel.id }); } catch (_) {}
        this.sessionJoinedChannels.add(channel.id);

        const { error: uploadError } = await this.client.storage.from('community-files').upload(path, uploadFile, { upsert: false, contentType });
        if (uploadError) throw uploadError;
        const metadata = {
            kind,
            bucket: 'community-files',
            path,
            display_name: logicalName,
            name: downloadName,
            size: uploadFile.size,
            mime: contentType,
            ...(kind === 'character' && sharedDescription ? { nt_description: sharedDescription } : {}),
        };
        const content = `${kind === 'character' ? 'Character Card' : 'Lorebook'}: ${logicalName}`;
        const { error } = await this.client.from('nt_messages').insert({ channel_id: channel.id, user_id: this.user.id, content, message_type: 'attachment', metadata });
        if (error) {
            await this.client.storage.from('community-files').remove([path]).catch(() => {});
            throw error;
        }
        void this.refreshHomeSnapshot();
        if (this.activeChannelId === channel.id) {
            await this.loadMessages();
            this.updateDynamicAreas();
        }
        return true;
    }

    async shareFile(file) {
        const channel = this.channels.find(c => c.id === this.activeChannelId);
        if (!file || !channel || !canShareInChannel(channel.slug)) return;
        const kind = channel.slug === 'character-cards' ? 'character' : 'lorebook';
        const displayName = await inferResourceDisplayName(file, kind);
        const shared = await this.shareResourceFile(file, kind, displayName, channel.slug);
        if (shared) this.toast?.(t('Shared {name} to Community.', { name: displayName }));
    }

    async shareCurrentCharacterCard({ signedOutAuthMode = 'signin' } = {}) {
        if (!await this.ensureReadyForDirectShare({ signedOutAuthMode })) return false;
        const context = window.SillyTavern?.getContext?.();
        const rawName = String(document.querySelector('#character_name_pole')?.value || context?.characters?.[context?.characterId]?.name || '').trim();
        const avatar = String(document.querySelector('#avatar_url_pole')?.value || context?.characters?.[context?.characterId]?.avatar || '').trim();
        if (!rawName || !avatar) {
            this.toast?.(t('Select an existing Character Card before sharing it.'));
            return false;
        }
        const name = safeResourceName(rawName);
        const headers = context?.getRequestHeaders?.() || { 'Content-Type': 'application/json' };
        const response = await fetch('/api/characters/export', {
            method: 'POST',
            headers,
            body: JSON.stringify({ format: 'png', avatar_url: avatar }),
        });
        if (!response.ok) throw new Error(t('Could not export this Character Card.'));
        const blob = await response.blob();
        const file = new File([blob], resourceDownloadName(name, 'character'), { type: 'image/png' });
        const shared = await this.shareResourceFile(file, 'character', name, 'character-cards');
        if (shared) this.toast?.(t('Shared {name} to Community.', { name }));
        return shared;
    }

    async shareCurrentLorebook() {
        if (!await this.ensureReadyForDirectShare()) return false;
        const select = document.querySelector('#world_editor_select');
        const selectedValue = String(select?.value || '').trim();
        const rawName = selectedValue ? String(select?.selectedOptions?.[0]?.textContent || '').trim() : '';
        if (!rawName) {
            this.toast?.(t('Select a Lorebook before sharing it.'));
            return false;
        }
        const name = safeResourceName(rawName);
        let data;
        try {
            const module = await import('/scripts/world-info.js');
            data = await module.loadWorldInfo?.(rawName);
        } catch (_) {}
        if (!data) throw new Error(t('Could not load this Lorebook.'));
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const file = new File([blob], resourceDownloadName(name, 'lorebook'), { type: 'application/json' });
        const shared = await this.shareResourceFile(file, 'lorebook', name, 'lorebooks');
        if (shared) this.toast?.(t('Shared {name} to Community.', { name }));
        return shared;
    }

    async downloadAttachment(message, importIntoSillyTavern = false) {
        const meta = message?.metadata || {};
        if (!meta.path) return;
        const { data, error } = await this.client.storage.from('community-files').download(meta.path);
        if (error) throw error;
        const kind = meta.kind === 'lorebook' ? 'lorebook' : 'character';
        const logicalName = safeResourceName(meta.display_name || stripResourceExtension(meta.name) || (kind === 'character' ? 'Character Card' : 'Lorebook'));
        const metaExt = String(meta.name || '').split('.').pop()?.toLowerCase();
        const extension = ['png','json'].includes(metaExt) ? metaExt : (meta.mime === 'image/png' ? 'png' : (kind === 'character' ? 'png' : 'json'));
        const file = new File([data], resourceDownloadName(logicalName, kind, extension), { type: meta.mime || data.type || (extension === 'png' ? 'image/png' : 'application/json') });
        if (importIntoSillyTavern) {
            const selector = meta.kind === 'lorebook' ? '#world_import_file' : '#character_import_file';
            const input = document.querySelector(selector);
            if (!input) throw new Error(t('SillyTavern import control was not found.'));
            const dt = new DataTransfer();
            dt.items.add(file);
            input.files = dt.files;
            input.dispatchEvent(new Event('change', { bubbles: true }));
            await this.recordResourceAcquisition(message, 'import');
            this.close();
            this.toast?.(meta.kind === 'lorebook' ? t('Lorebook sent to SillyTavern importer.') : t('Character Card sent to SillyTavern importer.'));
            return;
        }
        const url = URL.createObjectURL(file);
        const a = document.createElement('a'); a.href = url; a.download = file.name; a.click();
        await this.recordResourceAcquisition(message, 'download');
        setTimeout(() => URL.revokeObjectURL(url), 1200);
    }

    async searchMessages(query) {
        const q = String(query || '').trim();
        this.searchQuery = q;
        this.searchResults = [];
        if (!q || !this.activeChannelId) return;
        const pattern = `%${q.replaceAll('\\','\\\\').replaceAll('%','\\%').replaceAll('_','\\_')}%`;
        const { data, error } = await this.client.from('nt_messages')
            .select('id,user_id,content,created_at,profile:nt_profiles!nt_messages_user_id_fkey(username,avatar_url)')
            .eq('channel_id', this.activeChannelId).ilike('content', pattern).order('created_at', { ascending: false }).limit(50);
        if (error) throw error;
        this.searchResults = data || [];
    }

    async openProfile(userId) {
        if (!userId) return;
        const { data, error } = await this.client.from('nt_profiles')
            .select('id,username,avatar_url,bio,role,created_at,muted_until,banned_at,ban_reason').eq('id', userId).maybeSingle();
        if (error) return this.toast?.(error.message);
        this.profileView = data || null;
        this.renderWorkspace();
    }

    async saveProfile(form) {
        const bio = String(form.get('bio') || '').trim().slice(0,160);
        const { data, error } = await this.client.from('nt_profiles').update({ bio }).eq('id', this.user.id).select('id,username,avatar_url,bio,role,created_at,muted_until,banned_at,ban_reason').single();
        if (error) throw error;
        this.profile = data;
        this.profileView = data;
        this.renderWorkspace();
        this.toast?.(t('Community profile saved.'));
    }

    async uploadProfileAvatar(file) {
        if (!file) return;
        if (!/^image\/(png|jpeg|webp|gif)$/i.test(file.type) || file.size > 2 * 1024 * 1024) return this.toast?.(t('Avatar must be a PNG, JPG, WEBP or GIF under 2 MB.'));
        const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
        const path = `${this.user.id}/avatar.${safeFileName(ext)}`;
        const { error } = await this.client.storage.from('community-avatars').upload(path, file, { upsert: true, contentType: file.type });
        if (error) throw error;
        const { data } = this.client.storage.from('community-avatars').getPublicUrl(path);
        const avatar_url = `${data.publicUrl}?v=${Date.now()}`;
        const { data: profile, error: updateError } = await this.client.from('nt_profiles').update({ avatar_url }).eq('id', this.user.id).select('id,username,avatar_url,bio,role,created_at,muted_until,banned_at,ban_reason').single();
        if (updateError) throw updateError;
        this.profile = profile;
        this.profileView = profile;
        this.renderWorkspace();
    }

    async loadOpenReportCount() {
        if (roleRank(this.profile?.role) < 1 || !this.client) {
            this.openReportCount = 0;
            return 0;
        }
        const { count, error } = await this.client.from('nt_reports').select('id', { count: 'exact', head: true }).eq('status', 'open');
        if (error) {
            console.warn('[NastyTavern] Could not load open report count', error);
            return this.openReportCount || 0;
        }
        this.openReportCount = Number(count || 0);
        return this.openReportCount;
    }

    async loadReports() {
        if (roleRank(this.profile?.role) < 1) return;
        const { data, error } = await this.client.from('nt_reports').select('id,reporter_id,message_id,reason,status,created_at').eq('status','open').order('created_at',{ascending:false}).limit(50);
        if (error) throw error;
        this.reports = data || [];
        this.openReportCount = this.reports.length;
        const messageIds = [...new Set(this.reports.map(r => r.message_id))];
        this.reportMessages.clear(); this.reportProfiles.clear();
        if (messageIds.length) {
            const { data: messages } = await this.client.from('nt_messages').select('id,user_id,content,channel_id').in('id', messageIds);
            for (const row of messages || []) this.reportMessages.set(String(row.id), row);
            const userIds = [...new Set([...(messages || []).map(m=>m.user_id), ...this.reports.map(r=>r.reporter_id)])];
            if (userIds.length) {
                const { data: profiles } = await this.client.from('nt_profiles').select('id,username,avatar_url,role').in('id', userIds);
                for (const row of profiles || []) this.reportProfiles.set(row.id,row);
            }
        }
    }

    sendTyping(isTyping = true) {
        if (!this.presenceEnabled() || !this.subscription || !this.activeChannelId || !this.user) return;
        try { this.subscription.send({ type:'broadcast', event:'typing', payload:{ user_id:this.user.id, username:this.profile?.username || '', typing:!!isTyping } }); } catch (_) {}
        clearTimeout(this.typingStopTimer);
        if (isTyping) this.typingStopTimer = setTimeout(() => this.sendTyping(false), 2200);
    }

    receiveTyping(payload) {
        const data = payload?.payload || payload || {};
        if (!data.user_id || data.user_id === this.user?.id) return;
        clearTimeout(this.typingTimers.get(data.user_id));
        if (!data.typing) this.typingUsers.delete(data.user_id);
        else {
            this.typingUsers.set(data.user_id, data);
            this.typingTimers.set(data.user_id, setTimeout(() => { this.typingUsers.delete(data.user_id); this.updateTypingArea(); }, 2800));
        }
        this.updateTypingArea();
    }

    updateTypingArea() {
        const el = this.root?.querySelector('[data-nt-community-typing]');
        if (el) el.innerHTML = this.renderTyping();
    }

    updateRoomMeta() {
        if (!this.root) return;
        const globalOnlineCount = this.globalPresence.size;
        const channelOnlineCount = this.presence.size;
        const globalOnline = this.root.querySelector('[data-nt-community-global-online-count]');
        const channelOnline = this.root.querySelector('[data-nt-community-online-count]');
        if (globalOnline) globalOnline.textContent = String(globalOnlineCount);
        if (channelOnline) channelOnline.textContent = String(channelOnlineCount);
    }

    updateDynamicAreas({ scrollMessagesToBottom = true } = {}) {
        if (!this.root) return;
        const messages = this.root.querySelector('[data-nt-community-messages]');
        if (messages) {
            const previousScrollTop = messages.scrollTop;
            messages.innerHTML = this.renderMessages();
            requestAnimationFrame(() => {
                messages.scrollTop = scrollMessagesToBottom ? messages.scrollHeight : previousScrollTop;
            });
        }
        const members = this.root.querySelector('[data-nt-community-members]');
        if (members) members.innerHTML = this.renderMembers();
        const reply = this.root.querySelector('[data-nt-community-reply]');
        if (reply) { reply.innerHTML = this.renderReplyBar(); reply.hidden = !this.replyTo; }
        this.updateTypingArea();
        this.updateChannelBadges();
        this.updateRoomMeta();
    }

    subscribeGlobalPresence() {
        if (!this.presenceEnabled() || !this.client || !this.user || this.profile?.banned_at) return;
        if (this.globalSubscription) return;
        const channel = this.client.channel('nt-community:global-presence', { config: { presence: { key: this.user.id } } });
        channel
            .on('presence', { event: 'sync' }, () => this.syncGlobalPresence(channel.presenceState()))
            .subscribe(status => {
                if (status === 'SUBSCRIBED') {
                    channel.track({
                        user_id: this.user.id,
                        username: this.profile?.username || '',
                        online_at: new Date().toISOString(),
                    });
                }
            });
        this.globalSubscription = channel;
    }

    unsubscribeGlobalPresence() {
        if (this.globalSubscription && this.client) {
            try { this.client.removeChannel(this.globalSubscription); } catch (_) {}
        }
        this.globalSubscription = null;
        this.globalPresence.clear();
        this.updateRoomMeta();
    }

    syncGlobalPresence(state) {
        this.globalPresence.clear();
        for (const entries of Object.values(state || {})) {
            for (const entry of entries || []) {
                if (!entry?.user_id) continue;
                const current = this.globalPresence.get(entry.user_id);
                const currentAt = current?.online_at ? Date.parse(current.online_at) : 0;
                const nextAt = entry?.online_at ? Date.parse(entry.online_at) : 0;
                if (!current || nextAt >= currentAt) this.globalPresence.set(entry.user_id, entry);
            }
        }
        const members = this.root?.querySelector('[data-nt-community-members]');
        if (members) members.innerHTML = this.renderMembers();
        this.updateRoomMeta();
        this.homeSnapshot.online = this.globalPresence.size;
        this.emitHomeChanged();
    }

    subscribeChannel() {
        this.unsubscribeChannel();
        if (!this.activeChannelId || !this.client || !this.user) return;
        const id = this.activeChannelId;
        const config = this.presenceEnabled() ? { config: { presence: { key: this.user.id } } } : undefined;
        const channel = this.client.channel(`nt-community:${id}`, config);
        const schedule = () => this.scheduleRefresh();
        channel
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'nt_messages', filter: `channel_id=eq.${id}` }, schedule)
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'nt_messages', filter: `channel_id=eq.${id}` }, schedule)
            .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'nt_messages' }, payload => this.handleRealtimeMessageDelete(payload))
            .on('postgres_changes', { event: '*', schema: 'public', table: 'nt_message_reactions' }, schedule)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'nt_channel_members', filter: `channel_id=eq.${id}` }, schedule);
        if (this.presenceEnabled()) {
            channel
                .on('broadcast', { event: 'typing' }, payload => this.receiveTyping(payload))
                .on('presence', { event: 'sync' }, () => this.syncPresence(channel.presenceState()));
        }
        channel.subscribe(status => {
            if (status === 'SUBSCRIBED' && this.presenceEnabled()) {
                channel.track({ user_id: this.user.id, username: this.profile?.username || '', online_at: new Date().toISOString() });
            }
        });
        this.subscription = channel;
    }

    handleRealtimeMessageDelete(payload) {
        const old = payload?.old || {};
        const deletedId = old.id;
        if (deletedId !== undefined && deletedId !== null) {
            const before = this.messages.length;
            this.messages = this.messages.filter(message => String(message.id) !== String(deletedId));
            this.reactions = this.reactions.filter(row => String(row.message_id) !== String(deletedId));
            if (this.replyTo && String(this.replyTo) === String(deletedId)) this.replyTo = null;
            if (this.messages.length !== before) this.updateDynamicAreas();
        }
        this.scheduleRefresh();
    }

    unsubscribeChannel() {
        if (this.subscription && this.client) {
            try { this.client.removeChannel(this.subscription); } catch (_) {}
        }
        this.subscription = null;
        this.presence.clear();
        this.typingUsers.clear();
        this.updateTypingArea();
    }

    syncPresence(state) {
        this.presence.clear();
        for (const entries of Object.values(state || {})) {
            for (const entry of entries || []) if (entry?.user_id) this.presence.set(entry.user_id, entry);
        }
        const members = this.root?.querySelector('[data-nt-community-members]');
        if (members) members.innerHTML = this.renderMembers();
        this.updateRoomMeta();
    }

    scheduleRefresh() {
        clearTimeout(this.refreshTimer);
        this.refreshTimer = setTimeout(async () => {
            try {
                await Promise.all([this.loadMessages(), this.loadChannelMembersIndex()]);
                this.updateDynamicAreas();
            } catch (error) { console.warn('[NastyTavern] Community refresh failed', error); }
        }, 120);
    }

    async sendMessage(content) {
        const text = String(content || '').trim();
        if (!text || !this.activeChannelId) return;
        const { error } = await this.client.from('nt_messages').insert({ channel_id: this.activeChannelId, user_id: this.user.id, content: text, reply_to: this.replyTo || null });
        if (error) throw error;
        this.replyTo = null;
        void this.refreshHomeSnapshot();
    }

    async onSubmit(event) {
        const profileForm = event.target.closest('[data-nt-community-profile-form]');
        if (profileForm) { event.preventDefault(); try { await this.saveProfile(new FormData(profileForm)); } catch (error) { this.toast?.(error.message); } return; }
        const searchForm = event.target.closest('[data-nt-community-search-form]');
        if (searchForm) { event.preventDefault(); try { await this.searchMessages(new FormData(searchForm).get('query')); this.renderWorkspace(); } catch (error) { this.toast?.(error.message); } return; }
        const usernameForm = event.target.closest('[data-nt-community-username-form]');
        if (usernameForm) {
            event.preventDefault();
            await this.claimCommunityUsername(new FormData(usernameForm));
            return;
        }
        const authForm = event.target.closest('[data-nt-community-auth-form]');
        if (authForm) {
            event.preventDefault();
            const data = new FormData(authForm);
            await this.submitAuth(data);
            return;
        }
        const messageForm = event.target.closest('[data-nt-community-message-form]');
        if (messageForm) {
            event.preventDefault();
            const input = messageForm.querySelector('[data-nt-community-composer]');
            if (!input?.value.trim()) return;
            const value = input.value;
            input.value = '';
            this.sendTyping(false);
            try { await this.sendMessage(value); await this.loadMessages(); this.updateDynamicAreas(); }
            catch (error) { input.value = value; this.toast?.(error.message || t('Could not send message.')); }
        }
    }

    async submitAuth(form) {
        this.notice = '';
        const email = String(form.get('email') || '').trim();
        const password = String(form.get('password') || '');
        try {
            const client = await this.makeClient();
            if (this.authMode === 'signup') {
                const username = String(form.get('username') || '').trim();
                const { data, error } = await client.auth.signUp({
                    email,
                    password,
                    options: {
                        data: { username },
                        emailRedirectTo: this.getAuthRedirectUrl(),
                    },
                });
                if (error) throw error;
                if (!data?.session) {
                    this.notice = t('Account created. Check your email to confirm it, then sign in.');
                    this.authMode = 'signin';
        this.needsProfileOnboarding = false;
                    this.renderAuth();
                }
            } else {
                const { error } = await client.auth.signInWithPassword({ email, password });
                if (error) throw error;
            }
        } catch (error) {
            this.notice = error.message || t('Authentication failed.');
            this.renderAuth();
        }
    }

    async signOutCommunity() {
        if (!this.client) return;
        try {
            if (this.user) {
                const { error } = await this.client.rpc('nt_leave_all_channels');
                if (error) throw error;
            }
        } catch (error) {
            console.warn('[NastyTavern] Could not clear Community memberships before sign out', error);
            this.toast?.(t('Could not clear channel memberships before sign out.'));
        }

        this.unsubscribeChannel();
        this.unsubscribeGlobalPresence();
        this.unsubscribeNotifications();
        this.unsubscribeActivity();
        const { error } = await this.client.auth.signOut();
        if (error) {
            this.toast?.(error.message || t('Could not sign out.'));
            return;
        }
        this.user = null;
        this.profile = null;
        this.needsProfileOnboarding = false;
        this.channelMembers.clear();
        this.activeChannelId = null;
        this.messages = [];
        this.reactions = [];
        this.resourceStats.clear();
        this.presence.clear();
        this.globalPresence.clear();
        this.communitySessionUserId = null;
        this.sessionJoinedChannels.clear();
        this.unreadCounts.clear();
        this.mentionCounts.clear();
        this.emitBadgeChanged();
        this.homeSnapshot = { ready: true, signedIn: false, online: 0, messages: [], characterCards: [], lorebooks: [], mentions: 0 };
        this.emitHomeChanged();
    }

    async onClick(event) {
        if (this.reactionPickerMessageId && !event.target.closest('[data-nt-reaction-picker], [data-nt-reaction-picker-toggle]')) {
            this.reactionPickerMessageId = null;
            this.root?.querySelector('[data-nt-reaction-picker]')?.remove();
        }
        if (event.target.closest('[data-nt-community-close]')) return this.close();
        if (event.target.closest('[data-nt-community-privacy]')) return this.openPrivacyNotice();
        if (event.target.closest('[data-nt-community-enable]')) return this.enableCommunityFromConsent();
        if (event.target.closest('[data-nt-community-privacy-save]')) {
            const presenceInput = this.root?.querySelector('[data-nt-community-consent-presence]');
            this.settings.communityPresenceEnabled = !!presenceInput?.checked;
            saveSettings();
            await this.handlePrivacySettingsChanged();
            return;
        }
        if (event.target.closest('[data-nt-community-retry]')) return this.initialize();
        if (event.target.closest('[data-nt-community-google]')) { await this.signInWithGoogle(); return; }
        if (event.target.closest('[data-nt-community-signout]')) { await this.signOutCommunity(); return; }
        const authTab = event.target.closest('[data-nt-community-auth-tab]');
        if (authTab) { this.authMode = authTab.dataset.ntCommunityAuthTab; this.notice = ''; return this.renderAuth(); }
        if (event.target.closest('[data-nt-community-signout]')) { await this.signOutCommunity(); return; }
        if (event.target.closest('[data-nt-community-profile-self]')) return this.openProfile(this.user?.id);
        const profile = event.target.closest('[data-nt-community-profile]');
        if (profile) return this.openProfile(profile.dataset.ntCommunityProfile);
        if (event.target.closest('[data-nt-profile-close]')) { this.profileView = null; return this.renderWorkspace(); }
        if (event.target.closest('[data-nt-community-moderation]')) { this.moderationOpen = true; try { await this.loadReports(); } catch (error) { this.toast?.(error.message); } return this.renderWorkspace(); }
        if (event.target.closest('[data-nt-moderation-close]')) { this.moderationOpen = false; return this.renderWorkspace(); }
        if (event.target.closest('[data-nt-community-search-toggle]')) { this.searchOpen = !this.searchOpen; return this.renderWorkspace(); }
        if (event.target.closest('[data-nt-community-search-close]')) { this.searchOpen = false; this.searchQuery=''; this.searchResults=[]; return this.renderWorkspace(); }
        const searchHit = event.target.closest('[data-nt-search-message]');
        if (searchHit) { const el=this.root?.querySelector(`[data-nt-community-message="${searchHit.dataset.ntSearchMessage}"]`); if(el){this.searchOpen=false;this.renderWorkspace();requestAnimationFrame(()=>this.root?.querySelector(`[data-nt-community-message="${searchHit.dataset.ntSearchMessage}"]`)?.scrollIntoView({behavior:'smooth',block:'center'}));} return; }
        const channel = event.target.closest('[data-nt-community-channel]');
        if (channel) {
            this.root?.classList.remove('show-channels');
            return this.selectChannel(channel.dataset.ntCommunityChannel);
        }
        if (event.target.closest('[data-nt-community-cancel-reply]')) { this.replyTo = null; return this.updateDynamicAreas(); }
        if (event.target.closest('[data-nt-community-attach]')) return this.root?.querySelector('[data-nt-community-share-file]')?.click();
        const resourceRating = event.target.closest('[data-nt-resource-rating]');
        if (resourceRating) {
            await this.rateResource(resourceRating.dataset.ntResourceRatingMessage, resourceRating.dataset.ntResourceRating);
            return;
        }
        const resourceInfo = event.target.closest('[data-nt-resource-info]');
        if (resourceInfo) {
            const resourceCard = resourceInfo.closest('.nt-community-attachment') || resourceInfo;
            await withViewOpeningState(resourceCard, () => this.openResourceDetails(resourceInfo.dataset.ntResourceInfo));
            return;
        }
        const importAttachment = event.target.closest('[data-nt-attachment-import]');
        if (importAttachment) { const m=this.messages.find(x=>String(x.id)===String(importAttachment.dataset.ntAttachmentImport)); try{await this.downloadAttachment(m,true);}catch(e){this.toast?.(e.message);} return; }
        const downloadAttachment = event.target.closest('[data-nt-attachment-download]');
        if (downloadAttachment) { const m=this.messages.find(x=>String(x.id)===String(downloadAttachment.dataset.ntAttachmentDownload)); try{await this.downloadAttachment(m,false);}catch(e){this.toast?.(e.message);} return; }
        const mute = event.target.closest('[data-nt-mod-mute]');
        if (mute) { const { error }=await this.client.rpc('nt_mute_user',{p_user:mute.dataset.user,p_minutes:Number(mute.dataset.ntModMute)}); if(error)this.toast?.(error.message); else {this.toast?.(t('Moderation action applied.')); if(this.profileView) await this.openProfile(mute.dataset.user); if(this.moderationOpen){await this.loadReports();this.renderWorkspace();}} return; }
        const roleButton = event.target.closest('[data-nt-mod-role]');
        if (roleButton) { const { error }=await this.client.rpc('nt_set_role',{p_user:roleButton.dataset.user,p_role:roleButton.dataset.ntModRole}); if(error)this.toast?.(error.message); else await this.openProfile(roleButton.dataset.user); return; }
        const ban = event.target.closest('[data-nt-mod-ban]');
        if (ban) { const p=this.profileView; if(!p)return; const rpc=p.banned_at?'nt_unban_user':'nt_ban_user'; const args=p.banned_at?{p_user:p.id}:{p_user:p.id,p_reason:window.prompt(t('Ban reason'), '')||''}; const {error}=await this.client.rpc(rpc,args); if(error)this.toast?.(error.message); else await this.openProfile(p.id); return; }
        const modDelete = event.target.closest('[data-nt-mod-delete-message]');
        if(modDelete){const {error}=await this.client.rpc('nt_moderate_delete_message',{p_message:Number(modDelete.dataset.ntModDeleteMessage)});if(error)this.toast?.(error.message);else{void this.refreshHomeSnapshot();await this.loadReports();this.renderWorkspace();}return;}
        const resolve = event.target.closest('[data-nt-report-resolve]');
        if(resolve){const {error}=await this.client.rpc('nt_resolve_report',{p_report:Number(resolve.dataset.ntReportResolve)});if(error)this.toast?.(error.message);else{await this.loadReports();this.renderWorkspace();}return;}
        const action = event.target.closest('[data-nt-message-action]');
        if (action) return this.messageAction(action.closest('[data-nt-community-message]')?.dataset.ntCommunityMessage, action.dataset.ntMessageAction);
        const reactionPickerToggle = event.target.closest('[data-nt-reaction-picker-toggle]');
        if (reactionPickerToggle) {
            const messageId = reactionPickerToggle.dataset.ntReactionPickerToggle;
            this.reactionPickerMessageId = String(this.reactionPickerMessageId) === String(messageId) ? null : messageId;
            this.updateDynamicAreas({ scrollMessagesToBottom: false });
            if (this.reactionPickerMessageId) requestAnimationFrame(() => this.root?.querySelector('[data-nt-reaction-picker] button')?.focus());
            return;
        }
        const reaction = event.target.closest('[data-nt-message-reaction]');
        if (reaction) {
            this.reactionPickerMessageId = null;
            return this.toggleReaction(reaction.closest('[data-nt-community-message]')?.dataset.ntCommunityMessage, reaction.dataset.ntMessageReaction);
        }
        if (event.target.closest('[data-nt-community-mobile-channels]')) this.root?.classList.toggle('show-channels');
    }

    onKeyDown(event) {
        if (event.key === 'Escape' && this.reactionPickerMessageId) {
            const messageId = this.reactionPickerMessageId;
            this.reactionPickerMessageId = null;
            this.root?.querySelector('[data-nt-reaction-picker]')?.remove();
            this.root?.querySelector(`[data-nt-reaction-picker-toggle="${messageId}"]`)?.focus();
            event.preventDefault();
            return;
        }
        const input = event.target.closest('[data-nt-community-composer]');
        if (!input) return;
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            input.closest('form')?.requestSubmit();
        }
    }


    onInput(event) {
        if (event.target.closest('[data-nt-community-composer]')) this.sendTyping(Boolean(event.target.value.trim()));
    }

    async onChange(event) {
        const share = event.target.closest('[data-nt-community-share-file]');
        if (share?.files?.[0]) { try { await this.shareFile(share.files[0]); } catch (error) { this.toast?.(error.message); } finally { share.value=''; } return; }
        const avatar = event.target.closest('[data-nt-profile-avatar]');
        if (avatar?.files?.[0]) { try { await this.uploadProfileAvatar(avatar.files[0]); } catch (error) { this.toast?.(error.message); } finally { avatar.value=''; } }
    }

    async messageAction(messageId, action) {
        const message = this.messages.find(item => String(item.id) === String(messageId));
        if (!message) return;
        const own = message.user_id === this.user?.id;
        const isMod = roleRank(this.profile?.role) >= 1;
        if (action === 'reply') { this.replyTo = message.id; this.updateDynamicAreas(); this.root?.querySelector('[data-nt-community-composer]')?.focus(); return; }
        if (action === 'report') {
            const reason = window.prompt(t('Why are you reporting this message?'), '') || '';
            if (!reason.trim()) return;
            const { error } = await this.client.rpc('nt_report_message', { p_message: Number(message.id), p_reason: reason.trim() });
            if (error) return this.toast?.(error.message);
            if (roleRank(this.profile?.role) >= 1) {
                await this.loadOpenReportCount();
                this.syncModerationIndicator();
            }
            return this.toast?.(t('Report sent to the moderation team.'));
        }
        if (action === 'edit' && own) {
            const next = window.prompt(t('Edit message'), message.content);
            if (!next?.trim() || next.trim() === message.content) return;
            const { error } = await this.client.from('nt_messages').update({ content: next.trim(), edited_at: new Date().toISOString() }).eq('id', message.id).eq('user_id', this.user.id);
            if (error) return this.toast?.(error.message);
        }
        if (action === 'delete') {
            if (!await confirmDialog(t('Delete this message?'))) return;
            if (isMod && !own) {
                const { error } = await this.client.rpc('nt_moderate_delete_message', { p_message: Number(message.id) });
                if (error) return this.toast?.(error.message);
            } else if (own) {
                const resourcePath = message.metadata?.path;
                const resourceBucket = message.metadata?.bucket || 'community-files';
                const isSharedResource = ['attachment', 'character_card', 'lorebook'].includes(message.message_type)
                    || ['character', 'lorebook'].includes(message.metadata?.kind);
                if (isSharedResource && resourcePath && resourceBucket === 'community-files') {
                    try {
                        const { error: storageError } = await this.client.storage.from(resourceBucket).remove([resourcePath]);
                        if (storageError) console.warn('[NastyTavern] Direct Community resource cleanup failed; queued cleanup will retry.', storageError);
                    } catch (storageError) {
                        console.warn('[NastyTavern] Direct Community resource cleanup failed; queued cleanup will retry.', storageError);
                    }
                }
                const { error } = await this.client.from('nt_messages').delete().eq('id', message.id).eq('user_id', this.user.id);
                if (error) return this.toast?.(error.message);
            } else return;
                void this.refreshHomeSnapshot();
        }
        await this.loadMessages(); this.updateDynamicAreas();
    }

    async toggleReaction(messageId, emoji) {
        if (!messageId || !emoji || !this.user?.id) return;
        const pendingKey = `${messageId}:${emoji}`;
        if (this.reactionPending.has(pendingKey)) return;
        this.reactionPending.add(pendingKey);
        try {
            const existing = this.reactions.find(row => String(row.message_id) === String(messageId) && row.user_id === this.user.id && row.emoji === emoji);
            const query = existing
                ? this.client.from('nt_message_reactions').delete().eq('message_id', messageId).eq('user_id', this.user.id).eq('emoji', emoji)
                : this.client.from('nt_message_reactions').insert({ message_id: Number(messageId), user_id: this.user.id, emoji });
            const { error } = await query;
            if (error) return this.toast?.(error.message);
            await this.loadReactions();
            this.updateDynamicAreas({ scrollMessagesToBottom: false });
        } finally {
            this.reactionPending.delete(pendingKey);
        }
    }

    shell() { return this.root?.querySelector('[data-nt-community-shell]'); }
}
