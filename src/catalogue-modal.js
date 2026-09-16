import { icons } from './icons.js';
import { createModalShell, showModalShell, hideModalShell } from './modal-shell.js';
import { t } from './i18n.js';
import { debounce, escapeHtml as esc, formatBytes as humanBytes, withViewOpeningState } from './utils.js';
import { avatarHtml, confirmDialog, emptyStateHtml, starsHtml } from './ui-templates.js';

const isModeratorRole = role => ['moderator', 'admin'].includes(String(role || '').trim().toLowerCase());
const CATALOGUE_MEMBER_FILE_LIMIT = 2 * 1024 * 1024;
const CATALOGUE_PRIVILEGED_FILE_LIMIT = Math.round(5.5 * 1024 * 1024);
const isUnlimitedCatalogueRole = role => ['vip', 'moderator', 'admin'].includes(String(role || '').trim().toLowerCase());
const catalogueUploadPolicy = role => ({
    unlimited: isUnlimitedCatalogueRole(role),
    uploadLimit: isUnlimitedCatalogueRole(role) ? null : 5,
    maxFileBytes: isUnlimitedCatalogueRole(role) ? CATALOGUE_PRIVILEGED_FILE_LIMIT : CATALOGUE_MEMBER_FILE_LIMIT,
});
const catalogueProfileRoleLabel = role => String(role || '').trim().toLowerCase() === 'vip' ? 'VIP' : String(role || '').trim().toLowerCase() === 'moderator' ? t('Moderator') : String(role || '').trim().toLowerCase() === 'admin' ? t('Admin') : '';

const fileStem = file => String(file?.name || 'Untitled').replace(/\.(?:png|json|lorebook)$/i, '').trim() || 'Untitled';

const safeLocalFileName = (value, extension) => {
    const base = String(value || 'resource').trim().replace(/[\\/:*?\"<>|]+/g, '_').replace(/\s+/g, ' ').slice(0, 96) || 'resource';
    return `${base}.${extension}`;
};

const bytesToText = bytes => new TextDecoder('utf-8', { fatal: false }).decode(bytes);

const sha256Hex = async fileOrBlob => {
    const bytes = await fileOrBlob.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
};

const inflateBytes = async bytes => {
    if (typeof DecompressionStream !== 'function') return null;
    try {
        const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
        return new Uint8Array(await new Response(stream).arrayBuffer());
    } catch (_) {
        return null;
    }
};

const decodeCardPayload = async raw => {
    const value = String(raw || '').trim();
    if (!value) return null;
    const attempts = [value];
    try {
        const decoded = Uint8Array.from(atob(value.replace(/\s+/g, '')), char => char.charCodeAt(0));
        attempts.push(bytesToText(decoded));
        const inflated = await inflateBytes(decoded);
        if (inflated) attempts.push(bytesToText(inflated));
    } catch (_) {}
    for (const attempt of attempts) {
        try {
            const parsed = JSON.parse(attempt);
            if (parsed && typeof parsed === 'object') return parsed;
        } catch (_) {}
    }
    return null;
};

const readPngCharacterMetadata = async fileOrBlob => {
    const bytes = new Uint8Array(await fileOrBlob.arrayBuffer());
    const signature = [137,80,78,71,13,10,26,10];
    if (bytes.length < 12 || signature.some((value, index) => bytes[index] !== value)) return null;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const decoder = new TextDecoder('latin1');
    let offset = 8;
    const chunks = [];
    while (offset + 12 <= bytes.length) {
        const length = view.getUint32(offset, false);
        const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);
        const dataStart = offset + 8;
        const dataEnd = dataStart + length;
        if (dataEnd + 4 > bytes.length) break;
        const data = bytes.slice(dataStart, dataEnd);
        if (type === 'tEXt') {
            const separator = data.indexOf(0);
            if (separator > 0) {
                const key = decoder.decode(data.slice(0, separator));
                if (key === 'ccv3' || key === 'chara') chunks.push([key, decoder.decode(data.slice(separator + 1))]);
            }
        } else if (type === 'zTXt') {
            const separator = data.indexOf(0);
            if (separator > 0) {
                const key = decoder.decode(data.slice(0, separator));
                if (key === 'ccv3' || key === 'chara') {
                    const inflated = await inflateBytes(data.slice(separator + 2));
                    if (inflated) chunks.push([key, bytesToText(inflated)]);
                }
            }
        } else if (type === 'iTXt') {
            const first = data.indexOf(0);
            if (first > 0) {
                const key = decoder.decode(data.slice(0, first));
                if (key === 'ccv3' || key === 'chara') {
                    let cursor = first + 1;
                    const compressionFlag = data[cursor++];
                    cursor += 1;
                    const languageEnd = data.indexOf(0, cursor);
                    cursor = languageEnd >= 0 ? languageEnd + 1 : data.length;
                    const translatedEnd = data.indexOf(0, cursor);
                    cursor = translatedEnd >= 0 ? translatedEnd + 1 : data.length;
                    let payload = data.slice(cursor);
                    if (compressionFlag === 1) payload = await inflateBytes(payload) || payload;
                    chunks.push([key, bytesToText(payload)]);
                }
            }
        }
        offset = dataEnd + 4;
        if (type === 'IEND') break;
    }
    chunks.sort(([a], [b]) => (a === 'ccv3' ? -1 : b === 'ccv3' ? 1 : 0));
    for (const [, raw] of chunks) {
        const parsed = await decodeCardPayload(raw);
        if (parsed) return parsed;
    }
    return null;
};

const readResourceData = async (fileOrBlob, fileName = '') => {
    const name = String(fileName || fileOrBlob?.name || '');
    const ext = name.split('.').pop()?.toLowerCase();
    if (ext === 'png' || fileOrBlob?.type === 'image/png') return await readPngCharacterMetadata(fileOrBlob);
    if (ext === 'json' || ext === 'lorebook' || String(fileOrBlob?.type || '').includes('json')) {
        try {
            const parsed = JSON.parse(await fileOrBlob.text());
            return parsed && typeof parsed === 'object' ? parsed : null;
        } catch (_) {}
    }
    return null;
};

const metadataFields = (resource, fallback = 'Untitled') => {
    const root = resource && typeof resource === 'object' ? resource : {};
    const data = root?.data && typeof root.data === 'object' ? root.data : root;
    const rawTags = data?.tags ?? root?.tags ?? [];
    const tags = Array.isArray(rawTags)
        ? rawTags.map(value => String(value || '').trim()).filter(Boolean)
        : String(rawTags || '').split(',').map(value => value.trim()).filter(Boolean);
    return {
        name: String(data?.name || root?.name || root?.world_name || root?.title || fallback).trim().slice(0, 120) || fallback,
        ntDescription: String(data?.nt_description || root?.nt_description || '').trim().slice(0, 4000),
        tags: tags.slice(0, 16),
        ntUuid: String(root?.nt_uuid || data?.nt_uuid || '').trim(),
        ntCreator: String(root?.nt_creator || data?.nt_creator || '').trim(),
    };
};

const inferKindFromResource = (file, resource) => {
    const ext = String(file?.name || '').split('.').pop()?.toLowerCase();
    if (ext === 'png') return 'character_card';
    if (ext === 'lorebook') return 'lorebook';
    const root = resource && typeof resource === 'object' ? resource : {};
    if (root?.spec?.toLowerCase?.().includes('chara') || root?.data?.name || root?.first_mes || root?.data?.first_mes) return 'character_card';
    if (root?.entries || root?.world_name) return 'lorebook';
    return 'character_card';
};

const inspectUploadFile = async file => {
    const fallback = fileStem(file);
    const resource = await readResourceData(file, file?.name || '');
    const fields = metadataFields(resource, fallback);
    return {
        resource,
        kind: inferKindFromResource(file, resource),
        title: fields.name || fallback,
        description: fields.ntDescription,
        tags: fields.tags,
        ntUuid: fields.ntUuid,
        ntCreator: fields.ntCreator,
    };
};

export class CatalogueModal {
    constructor(community, toast, characterDetails = null) {
        this.community = community;
        this.toast = toast;
        this.characterDetails = characterDetails;
        this.root = null;
        this.items = [];
        this.total = 0;
        this.loading = false;
        this.status = { r2_configured: false, uploads_used: 0, upload_limit: 5, max_file_bytes: CATALOGUE_MEMBER_FILE_LIMIT, unlimited: false, role: 'member' };
        this.pendingModerationCount = 0;
        this.pendingReportCount = 0;
        this.rejectionNotices = [];
        this.reportRows = [];
        this.auditRows = [];
        this.collections = [];
        this.publicCollections = [];
        this.activeCollection = null;
        this.creatorSummary = null;
        this.state = { query: '', kind: 'all', sort: 'popular', contentRating: 'sfw', owner: null, offset: 0, limit: 24, section: 'discover', creator: '' };
        this.uploadRoot = null;
        this.confirmRoot = null;
        this.libraryRoot = null;
        this.reportRoot = null;
        this.collectionEditorRoot = null;
        this.collectionPickerRoot = null;
        this.libraryState = { kind: 'character_card', query: '', items: [], loading: false };
        this.pendingFile = null;
        this.pendingInfo = null;
        this.lastFocus = null;
        this.detailObjectUrl = null;
        this.activeDetail = null;
        this.realtimeSubscription = null;
        this.realtimeConnected = false;
        this.realtimeRefreshTimer = null;
        this.realtimeRetryTimer = null;
        this.realtimeLastSyncAt = 0;
        this.visibilityHandler = () => {
            if (document.visibilityState !== 'visible' || !this.root || this.root.hidden) return;
            if (Date.now() - this.realtimeLastSyncAt > 30000) this.scheduleRealtimeRefresh(0);
            if (!this.realtimeConnected) void this.subscribeRealtime({ force: true });
        };
        this.onlineHandler = () => {
            if (!this.root || this.root.hidden) return;
            void this.subscribeRealtime({ force: true });
            this.scheduleRealtimeRefresh(0);
        };
        this.searchDebounced = debounce(() => { this.state.offset = 0; void this.loadItems(); }, 260);
    }

    get client() { return this.community?.client || null; }
    get user() { return this.community?.user || null; }
    get profile() { return this.community?.profile || null; }
    get isModerator() { return isModeratorRole(this.profile?.role); }

    mount() {
        this.ensure();
        document.addEventListener('visibilitychange', this.visibilityHandler);
        window.addEventListener('online', this.onlineHandler);
    }

    unmount() {
        this.unsubscribeRealtime();
        document.removeEventListener('visibilitychange', this.visibilityHandler);
        window.removeEventListener('online', this.onlineHandler);
        this.uploadRoot?.remove();
        this.uploadRoot = null;
        this.confirmRoot?.remove();
        this.confirmRoot = null;
        this.libraryRoot?.remove();
        this.libraryRoot = null;
        this.reportRoot?.remove();
        this.reportRoot = null;
        this.collectionEditorRoot?.remove();
        this.collectionEditorRoot = null;
        this.collectionPickerRoot?.remove();
        this.collectionPickerRoot = null;
        this.root?.remove();
        this.root = null;
    }

    ensure() {
        if (this.root?.isConnected) return this.root;
        const { root, body } = createModalShell({
            id: 'nt-catalogue-modal',
            title: t('Nasty Catalogue'),
            icon: icons.workspace,
            size: 'large',
            modalClass: 'nt-catalogue-modal',
            bodyClass: 'nt-catalogue-modal-body',
            closeAttrs: { 'data-nt-catalogue-close': '' },
        });
        body.innerHTML = `
            <div class="nt-catalogue-toolbar">
                <label class="nt-catalogue-search">
                    <span aria-hidden="true">${icons.search}</span>
                    <input type="search" data-nt-catalogue-search placeholder="${esc(t('Search cards, lorebooks, creators or tags…'))}" autocomplete="off">
                </label>
                <div class="nt-catalogue-toolbar-filters">
                    <select data-nt-catalogue-kind aria-label="${esc(t('Type'))}">
                        <option value="all">${esc(t('All'))}</option>
                        <option value="character_card">${esc(t('Character Cards'))}</option>
                        <option value="lorebook">${esc(t('Lorebooks'))}</option>
                    </select>
                    <select data-nt-catalogue-sort aria-label="${esc(t('Sort'))}">
                        <option value="popular">${esc(t('Popular'))}</option>
                        <option value="newest">${esc(t('Newest'))}</option>
                        <option value="rating">${esc(t('Top rated'))}</option>
                        <option value="downloads">${esc(t('Most downloaded'))}</option>
                        <option value="relevance">${esc(t('Relevance'))}</option>
                    </select>
                    <select data-nt-catalogue-content-rating aria-label="${esc(t('Content rating'))}">
                        <option value="all">${esc(t('All content'))}</option>
                        <option value="sfw" selected>SFW</option>
                        <option value="nsfw">NSFW</option>
                    </select>
                    <button type="button" class="nt-catalogue-upload-button" data-nt-catalogue-upload>${icons.upload}<span>${esc(t('Upload'))}</span><small data-nt-catalogue-quota>0/5</small></button>
                </div>
            </div>
            <div class="nt-catalogue-layout">
                <aside class="nt-catalogue-nav" aria-label="${esc(t('Catalogue library'))}">
                    <div class="nt-catalogue-nav-head"><b>${esc(t('Library'))}</b><button type="button" data-nt-catalogue-nav-close aria-label="${esc(t('Close library'))}">${icons.close}</button></div>
                    <nav>
                        <button type="button" class="is-active" data-nt-catalogue-section="discover">${icons.search}<span>${esc(t('Discover'))}</span></button>
                        <button type="button" data-nt-catalogue-section="popular">${icons.target}<span>${esc(t('Popular'))}</span></button>
                        <button type="button" data-nt-catalogue-section="newest">${icons.history}<span>${esc(t('Newest'))}</span></button>
                        <button type="button" data-nt-catalogue-section="rating">${icons.check}<span>${esc(t('Top rated'))}</span></button>
                        <div class="nt-catalogue-nav-divider"></div>
                        <button type="button" data-nt-catalogue-section="characters">${icons.characters}<span>${esc(t('Character Cards'))}</span></button>
                        <button type="button" data-nt-catalogue-section="lorebooks">${icons.lore}<span>${esc(t('Lorebooks'))}</span></button>
                        <button type="button" data-nt-catalogue-section="mine">${icons.folder}<span>${esc(t('My uploads'))}</span><small data-nt-catalogue-quota-side>0/5</small></button>
                        <button type="button" data-nt-catalogue-section="collections">${icons.bookmark}<span>${esc(t('Collections'))}</span></button>
                        <div class="nt-catalogue-nav-divider"></div>
                        <button type="button" data-nt-catalogue-section="moderation" data-nt-catalogue-mod-nav hidden>${icons.check}<span>${esc(t('Review'))}</span><small data-nt-catalogue-moderation-count>0</small></button>
                        <button type="button" data-nt-catalogue-section="reports" data-nt-catalogue-mod-nav hidden>${icons.alertWarning}<span>${esc(t('Reports'))}</span><small data-nt-catalogue-report-count>0</small></button>
                        <button type="button" data-nt-catalogue-section="audit" data-nt-catalogue-mod-nav hidden>${icons.history}<span>${esc(t('Audit log'))}</span></button>
                    </nav>
                </aside>
                <main class="nt-catalogue-main">
                    <div class="nt-catalogue-main-head">
                        <button type="button" class="nt-catalogue-mobile-nav" data-nt-catalogue-nav-toggle>${icons.panel}<span>${esc(t('Library'))}</span></button>
                        <div><b data-nt-catalogue-heading>${esc(t('Discover'))}</b><small data-nt-catalogue-summary>${esc(t('Community Character Cards and Lorebooks.'))}</small></div>
                        <button type="button" class="nt-catalogue-refresh" data-nt-catalogue-refresh title="${esc(t('Refresh'))}">${icons.refresh}</button>
                    </div>
                    <div class="nt-catalogue-content" data-nt-catalogue-content></div>
                    <div class="nt-catalogue-footer" data-nt-catalogue-footer hidden>
                        <span data-nt-catalogue-range></span>
                        <div><button type="button" data-nt-catalogue-prev>${icons.arrowLeft}</button><button type="button" data-nt-catalogue-next>${icons.arrowRight}</button></div>
                    </div>
                </main>
            </div>`;

        root.addEventListener('click', event => this.onClick(event));
        root.addEventListener('input', event => this.onInput(event));
        root.addEventListener('change', event => this.onChange(event));
        root.addEventListener('nt:modal-escape-request', event => {
            if (!root.classList.contains('show-library')) return;
            root.classList.remove('show-library');
            event.preventDefault();
        });
        document.body.append(root);
        this.root = root;
        return root;
    }

    async open() {
        this.lastFocus = document.activeElement;
        await this.community?.initializeBackground?.();
        if (!this.user || !this.profile) {
            if (this.community) {
                this.community.authMode = 'signup';
                await this.community.open();
                if (!this.community.user) this.community.renderAuth?.();
            }
            return false;
        }
        this.ensure();
        showModalShell(this.root);
        document.body?.classList.add('nt-catalogue-modal-open');
        await Promise.all([this.loadStatus(), this.loadModerationCount(), this.loadReportCount()]);
        await this.reloadCurrentSection();
        this.realtimeLastSyncAt = Date.now();
        void this.subscribeRealtime();
        requestAnimationFrame(() => this.root?.querySelector('[data-nt-catalogue-search]')?.focus?.({ preventScroll: true }));
        return true;
    }

    close() {
        if (!this.root || this.root.hidden) return;
        hideModalShell(this.root, { immediate: false });
        document.body?.classList.remove('nt-catalogue-modal-open');
        this.root.classList.remove('show-library');
        this.unsubscribeRealtime();
        requestAnimationFrame(() => this.lastFocus?.focus?.({ preventScroll: true }));
    }

    async subscribeRealtime({ force = false } = {}) {
        const client = this.client || await this.community?.makeClient?.();
        if (!client || !this.user) return;
        if (this.realtimeSubscription && !force) return;
        if (force) this.unsubscribeRealtime();
        const channel = client.channel(`nt-catalogue:live:${this.user.id}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'nt_catalog_items' }, payload => this.handleRealtimeItemChange(payload))
            .on('postgres_changes', { event: '*', schema: 'public', table: 'nt_catalog_rejections', filter: `owner_id=eq.${this.user.id}` }, payload => this.handleRealtimeRejectionChange(payload))
            .on('postgres_changes', { event: '*', schema: 'public', table: 'nt_catalog_reports' }, () => this.handleRealtimeReportChange())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'nt_catalog_audit_log' }, () => { if (this.isModerator && this.state.section === 'audit') void this.loadAudit({ silent: true }); })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'nt_catalog_collections' }, () => this.handleRealtimeCollectionChange())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'nt_catalog_collection_items' }, () => this.handleRealtimeCollectionChange())
            .subscribe(status => {
                if (status === 'SUBSCRIBED') {
                    const wasDisconnected = !this.realtimeConnected;
                    this.realtimeConnected = true;
                    if (wasDisconnected && this.root && !this.root.hidden && Date.now() - this.realtimeLastSyncAt > 1500) this.scheduleRealtimeRefresh(80);
                    return;
                }
                if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)) {
                    this.realtimeConnected = false;
                    if (!this.root || this.root.hidden || this.realtimeRetryTimer) return;
                    this.realtimeRetryTimer = window.setTimeout(() => {
                        this.realtimeRetryTimer = null;
                        void this.subscribeRealtime({ force: true });
                    }, 2500);
                }
            });
        this.realtimeSubscription = channel;
    }

    unsubscribeRealtime() {
        if (this.realtimeRefreshTimer) window.clearTimeout(this.realtimeRefreshTimer);
        this.realtimeRefreshTimer = null;
        if (this.realtimeRetryTimer) window.clearTimeout(this.realtimeRetryTimer);
        this.realtimeRetryTimer = null;
        if (this.realtimeSubscription && this.client) {
            try { this.client.removeChannel(this.realtimeSubscription); } catch (_) {}
        }
        this.realtimeSubscription = null;
        this.realtimeConnected = false;
    }

    scheduleRealtimeRefresh(delay = 180) {
        if (!this.root || this.root.hidden) return;
        if (this.realtimeRefreshTimer) window.clearTimeout(this.realtimeRefreshTimer);
        this.realtimeRefreshTimer = window.setTimeout(async () => {
            this.realtimeRefreshTimer = null;
            if (!this.root || this.root.hidden) return;
            try {
                if (this.state.section === 'moderation') await this.loadModerationQueue({ silent: true });
                else if (this.state.section === 'reports') await this.loadReports({ silent: true });
                else if (this.state.section === 'audit') await this.loadAudit({ silent: true });
                else if (this.state.section === 'collections') await this.loadCollections({ silent: true });
                else if (this.state.section === 'collection' && this.activeCollection) await this.openCollection(this.activeCollection, { silent: true });
                else if (this.state.section === 'creator' && this.state.creator) await this.openCreatorPage(this.state.creator, { silent: true });
                else await this.loadItems({ silent: true });
                await this.loadStatus();
                if (this.isModerator) await Promise.all([this.loadModerationCount(), this.loadReportCount()]);
                this.realtimeLastSyncAt = Date.now();
            } catch (_) {}
        }, Math.max(0, Number(delay || 0)));
    }

    realtimeChangedKeys(payload) {
        const before = payload?.old || {};
        const after = payload?.new || {};
        const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
        return [...keys].filter(key => {
            try { return JSON.stringify(before?.[key]) !== JSON.stringify(after?.[key]); }
            catch (_) { return before?.[key] !== after?.[key]; }
        });
    }

    patchRealtimeStats(row = {}) {
        const id = String(row.id || '');
        if (!id) return;
        const patch = {
            downloads: Number(row.downloads || 0),
            rating_average: Number(row.rating_average || 0),
            rating_count: Number(row.rating_count || 0),
            last_download_at: row.last_download_at || null,
            updated_at: row.updated_at || null,
        };
        const visible = this.items.find(item => String(item.id) === id);
        if (visible) {
            const myRating = visible.my_rating;
            Object.assign(visible, patch);
            if (myRating !== undefined) visible.my_rating = myRating;
        }
        const articles = this.root?.querySelectorAll(`[data-nt-catalogue-item="${id}"]`) || [];
        articles.forEach(article => {
            const downloads = article.querySelector('[data-nt-catalogue-card-downloads]');
            const rating = article.querySelector('[data-nt-catalogue-card-top-rating]');
            if (downloads) downloads.textContent = patch.downloads.toLocaleString();
            if (rating) {
                const holder = document.createElement('div');
                holder.innerHTML = this.cardRatingMarkup({ ...(visible || {}), ...patch });
                rating.replaceWith(holder.firstElementChild);
            }
        });
        const detailVersion = this.activeDetail?.family?.find(version => String(version.id) === id);
        if (detailVersion) {
            const myRating = detailVersion.my_rating;
            Object.assign(detailVersion, patch);
            if (myRating !== undefined) detailVersion.my_rating = myRating;
            if (String(this.activeDetail?.item?.id) === id) {
                this.syncDetailDownloads(detailVersion);
                this.syncDetailRating(detailVersion);
            }
        }
    }

    removeRealtimeItem(id) {
        const key = String(id || '');
        if (!key) return;
        const index = this.items.findIndex(item => String(item.id) === key);
        if (index >= 0) {
            this.items.splice(index, 1);
            this.total = Math.max(0, this.total - 1);
            const article = this.root?.querySelector(`[data-nt-catalogue-item="${key}"]`);
            article?.remove();
            if (!this.items.length) this.renderItems();
            else this.syncFooter();
        }
        if (String(this.activeDetail?.item?.id || '') === key) {
            this.characterDetails?.close?.({ restoreFocus: false });
            this.activeDetail = null;
            this.toast?.(t('This catalogue resource was deleted.'));
        } else if (this.activeDetail?.family?.some(version => String(version.id) === key)) {
            this.scheduleActiveDetailRefresh(80);
        }
    }

    scheduleActiveDetailRefresh(delay = 140) {
        if (!this.activeDetail?.item || !this.characterDetails?.root || this.characterDetails.root.hidden) return;
        const currentId = this.activeDetail.item.id;
        const opener = this.activeDetail.opener || null;
        window.clearTimeout(this.activeDetail.refreshTimer);
        this.activeDetail.refreshTimer = window.setTimeout(async () => {
            if (!this.activeDetail?.item || this.characterDetails?.root?.hidden) return;
            try {
                const family = await this.loadLineage(this.activeDetail.item);
                const current = family.find(version => version.id === currentId) || family[0];
                if (current) await this.openItemDetails(current, opener, family);
                else this.characterDetails?.close?.({ restoreFocus: false });
            } catch (_) {}
        }, Math.max(0, Number(delay || 0)));
    }

    handleRealtimeItemChange(payload) {
        const eventType = String(payload?.eventType || '').toUpperCase();
        const next = payload?.new || {};
        const previous = payload?.old || {};
        const id = next.id || previous.id;
        if (!id) return;

        if (eventType === 'DELETE') {
            this.removeRealtimeItem(id);
            this.scheduleRealtimeRefresh(120);
            return;
        }

        if (eventType === 'INSERT') {
            this.scheduleRealtimeRefresh(90);
            return;
        }

        if (eventType !== 'UPDATE') return;
        const changed = this.realtimeChangedKeys(payload);
        const statKeys = new Set(['downloads', 'last_download_at', 'rating_average', 'rating_count', 'updated_at']);
        const statsOnly = changed.length > 0 && changed.every(key => statKeys.has(key));

        if (statsOnly) {
            this.patchRealtimeStats(next);
            if (['popular', 'downloads', 'rating'].includes(this.state.sort)) this.scheduleRealtimeRefresh(260);
            return;
        }

        const visible = this.items.find(item => String(item.id) === String(id));
        if (visible) {
            const myRating = visible.my_rating;
            Object.assign(visible, next);
            if (myRating !== undefined) visible.my_rating = myRating;
        }
        const detailVersion = this.activeDetail?.family?.find(version => String(version.id) === String(id));
        if (detailVersion) {
            const myRating = detailVersion.my_rating;
            Object.assign(detailVersion, next);
            if (myRating !== undefined) detailVersion.my_rating = myRating;
            this.scheduleActiveDetailRefresh(90);
        }
        this.scheduleRealtimeRefresh(120);
    }

    async handleRealtimeRejectionChange(payload) {
        if (!this.user) return;
        const eventType = String(payload?.eventType || '').toUpperCase();
        const next = payload?.new || {};
        const previous = payload?.old || {};
        const id = String(next.id || previous.id || '');
        if (!id) return;

        if (eventType === 'DELETE') {
            this.rejectionNotices = this.rejectionNotices.filter(entry => String(entry.id) !== id);
            if (this.state.section === 'mine') this.renderItems();
            return;
        }

        try {
            await this.loadRejectionNotices();
            if (this.state.section === 'mine') this.renderItems();
        } catch (_) {}
    }

    async invoke(body, functionName = null) {
        const client = this.client || await this.community?.makeClient?.();
        if (!client) throw new Error(t('Community connection unavailable.'));
        // Uploads stay on the storage backend. JSON actions go through the
        // access gateway, which enforces moderation visibility server-side.
        const targetFunction = functionName || (body instanceof FormData ? 'nasty-catalogue-upload-v2' : 'nasty-catalogue-access');
        const { data, error } = await client.functions.invoke(targetFunction, { body });
        if (error) {
            let message = error.message;
            let payload = null;
            try {
                payload = await error.context?.json?.();
                message = payload?.error || message;
            } catch (_) {}
            const failure = new Error(message);
            failure.code = payload?.code || '';
            failure.payload = payload || null;
            throw failure;
        }
        if (data?.error) {
            const failure = new Error(data.error);
            failure.code = data?.code || '';
            failure.payload = data;
            throw failure;
        }
        return data;
    }

    async invokeBinary(body) {
        const client = this.client || await this.community?.makeClient?.();
        if (!client) throw new Error(t('Community connection unavailable.'));

        // Do not use functions.invoke() for catalogue files. Supabase's invoke
        // helper may deserialize a binary Edge Function response depending on
        // the SDK/content-type combination, which changes the PNG bytes and
        // produces a file SillyTavern sees as corrupted. Fetch the function
        // response directly and keep its ArrayBuffer byte-for-byte intact.
        const config = this.community?.config?.() || {};
        const endpoint = String(config.url || client.supabaseUrl || '').replace(/\/$/, '');
        const apiKey = String(config.key || client.supabaseKey || '');
        const { data: sessionData, error: sessionError } = await client.auth.getSession();
        const accessToken = sessionData?.session?.access_token || '';
        if (sessionError) throw sessionError;
        if (!endpoint || !apiKey || !accessToken) throw new Error(t('Community connection unavailable.'));

        const response = await fetch(`${endpoint}/functions/v1/nasty-catalogue-access`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                apikey: apiKey,
                'Content-Type': 'application/json',
                'x-client-info': 'NastyTavern-Catalogue',
            },
            body: JSON.stringify(body || {}),
            cache: 'no-store',
        });

        if (!response.ok) {
            let message = `${t('Nasty Catalogue request failed.')} (${response.status})`;
            try {
                const payload = await response.clone().json();
                message = payload?.error || message;
            } catch (_) {
                try {
                    const text = await response.text();
                    if (text?.trim()) message = text.trim();
                } catch (_) {}
            }
            throw new Error(message);
        }

        const bytes = await response.arrayBuffer();
        const mimeType = response.headers.get('content-type') || 'application/octet-stream';
        return new Blob([bytes], { type: mimeType });
    }

    async loadStatus() {
        const fallback = catalogueUploadPolicy(this.profile?.role);
        try {
            const client = this.client || await this.community?.makeClient?.();
            if (!client) throw new Error('Community connection unavailable.');
            const [{ data: policyData, error: policyError }, accessStatus] = await Promise.all([
                client.rpc('nt_catalog_my_upload_policy'),
                this.invoke({ action: 'status' }).catch(() => null),
            ]);
            if (policyError) throw policyError;
            const policy = Array.isArray(policyData) ? policyData[0] : policyData;
            this.status = {
                r2_configured: Boolean(accessStatus?.r2_configured),
                uploads_used: Number(policy?.uploads_used || accessStatus?.uploads_used || 0),
                upload_limit: policy?.upload_limit == null ? null : Number(policy.upload_limit),
                max_file_bytes: Number(policy?.max_file_bytes || fallback.maxFileBytes),
                unlimited: Boolean(policy?.unlimited),
                role: String(policy?.role || this.profile?.role || 'member'),
            };
        } catch (_) {
            this.status = {
                r2_configured: false,
                uploads_used: 0,
                upload_limit: fallback.uploadLimit,
                max_file_bytes: fallback.maxFileBytes,
                unlimited: fallback.unlimited,
                role: this.profile?.role || 'member',
            };
        }
        this.syncQuota();
    }

    async loadModerationCount() {
        const button = this.root?.querySelector('[data-nt-catalogue-section="moderation"]');
        if (!this.isModerator) {
            this.pendingModerationCount = 0;
            if (button) button.hidden = true;
            return;
        }
        if (button) button.hidden = false;
        try {
            const client = this.client || await this.community.makeClient();
            const { data, error } = await client.rpc('nt_catalog_moderation_count');
            if (error) throw error;
            this.pendingModerationCount = Number(data || 0);
        } catch (_) {
            this.pendingModerationCount = 0;
        }
        const badge = this.root?.querySelector('[data-nt-catalogue-moderation-count]');
        if (badge) badge.textContent = String(this.pendingModerationCount);
    }

    async loadReportCount() {
        const buttons = this.root?.querySelectorAll('[data-nt-catalogue-mod-nav]') || [];
        if (!this.isModerator) {
            this.pendingReportCount = 0;
            buttons.forEach(button => { button.hidden = true; });
            return 0;
        }
        buttons.forEach(button => { button.hidden = false; });
        try {
            const client = this.client || await this.community.makeClient();
            const { data, error } = await client.rpc('nt_catalog_report_count');
            if (error) throw error;
            this.pendingReportCount = Number(data || 0);
        } catch (_) {
            this.pendingReportCount = 0;
        }
        const badge = this.root?.querySelector('[data-nt-catalogue-report-count]');
        if (badge) badge.textContent = String(this.pendingReportCount);
        return this.pendingReportCount;
    }

    handleRealtimeReportChange() {
        if (!this.isModerator) return;
        void this.loadReportCount();
        if (this.state.section === 'reports') void this.loadReports({ silent: true });
    }

    handleRealtimeCollectionChange() {
        if (!this.root || this.root.hidden) return;
        if (this.state.section === 'collections') void this.loadCollections({ silent: true });
        else if (this.state.section === 'collection' && this.activeCollection) void this.openCollection(this.activeCollection, { silent: true });
    }

    syncQuota() {
        const used = Number(this.status?.uploads_used || 0);
        const unlimited = Boolean(this.status?.unlimited);
        const limit = this.status?.upload_limit == null ? null : Number(this.status.upload_limit);
        const quota = unlimited ? `${used}/∞` : `${used}/${Number.isFinite(limit) ? limit : 5}`;
        this.root?.querySelectorAll('[data-nt-catalogue-quota], [data-nt-catalogue-quota-side]').forEach(node => node.textContent = quota);
        this.root?.querySelector('[data-nt-catalogue-upload]')?.removeAttribute('disabled');
        const uploadLimit = this.uploadRoot?.querySelector('[data-nt-catalogue-upload-limit]');
        if (uploadLimit) uploadLimit.textContent = unlimited ? t('maximum 5.5 MiB') : t('maximum 2 MiB');
        const uploadSubtitle = this.uploadRoot?.querySelector('[data-nt-catalogue-upload-policy]');
        if (uploadSubtitle) uploadSubtitle.textContent = unlimited
            ? t('Unlimited catalogue files · maximum 5.5 MiB per file.')
            : t('Up to 5 catalogue files · maximum 2 MiB per file.');
    }

    sectionConfig(section = this.state.section) {
        const userId = this.user?.id || null;
        const configs = {
            discover: { label: t('Discover'), summary: t('Community Character Cards and Lorebooks.'), kind: 'all', sort: this.state.query ? 'relevance' : 'popular', owner: null },
            popular: { label: t('Popular'), summary: t('What the community is downloading and rating.'), kind: 'all', sort: 'popular', owner: null },
            newest: { label: t('Newest'), summary: t('Fresh uploads from NastyTavern members.'), kind: 'all', sort: 'newest', owner: null },
            rating: { label: t('Top rated'), summary: t('The highest-rated resources in the catalogue.'), kind: 'all', sort: 'rating', owner: null },
            characters: { label: t('Character Cards'), summary: t('Browse permanent Character Card uploads.'), kind: 'character_card', sort: this.state.query ? 'relevance' : 'popular', owner: null },
            lorebooks: { label: t('Lorebooks'), summary: t('Browse permanent Lorebook uploads.'), kind: 'lorebook', sort: this.state.query ? 'relevance' : 'popular', owner: null },
            mine: { label: t('My uploads'), summary: t('Manage your permanent Nasty Catalogue files.'), kind: 'all', sort: 'newest', owner: userId },
            collections: { label: t('Collections'), summary: t('Organize catalogue resources into personal or public collections.'), kind: 'all', sort: 'newest', owner: null },
            moderation: { label: t('Review'), summary: t('Review pending uploads before they appear in the public catalogue.'), kind: 'all', sort: 'newest', owner: null },
            reports: { label: t('Reports'), summary: t('Review reports submitted on already-published catalogue resources.'), kind: 'all', sort: 'newest', owner: null },
            audit: { label: t('Audit log'), summary: t('Moderation actions and catalogue safety history.'), kind: 'all', sort: 'newest', owner: null },
            creator: { label: t('Creator'), summary: t('Creator profile and catalogue publications.'), kind: 'all', sort: 'newest', owner: null },
            collection: { label: t('Collection'), summary: t('Resources saved in this collection.'), kind: 'all', sort: 'newest', owner: null },
        };
        return configs[section] || configs.discover;
    }

    applySection(section) {
        if (['moderation','reports','audit'].includes(section) && !this.isModerator) section = 'discover';
        this.state.section = section;
        this.state.offset = 0;
        const config = this.sectionConfig(section);
        this.state.kind = config.kind;
        this.state.sort = config.sort;
        this.state.owner = config.owner;
        const kind = this.root?.querySelector('[data-nt-catalogue-kind]');
        const sort = this.root?.querySelector('[data-nt-catalogue-sort]');
        const contentRating = this.root?.querySelector('[data-nt-catalogue-content-rating]');
        if (kind) kind.value = this.state.kind;
        if (sort) sort.value = this.state.sort;
        if (contentRating) {
            contentRating.value = this.state.contentRating || 'sfw';
            contentRating.disabled = section === 'moderation';
        }
        this.root?.querySelectorAll('[data-nt-catalogue-section]').forEach(button => button.classList.toggle('is-active', button.dataset.ntCatalogueSection === section));
        const heading = this.root?.querySelector('[data-nt-catalogue-heading]');
        const summary = this.root?.querySelector('[data-nt-catalogue-summary]');
        if (heading) heading.textContent = config.label;
        if (summary) summary.textContent = config.summary;
        this.root?.classList.remove('show-library');
        if (section === 'moderation') void this.loadModerationQueue();
        else if (section === 'reports') void this.loadReports();
        else if (section === 'audit') void this.loadAudit();
        else if (section === 'collections') void this.loadCollections();
        else void this.loadItems();
    }

    async loadItems({ silent = false } = {}) {
        if (!this.root || !this.user) return;
        this.loading = true;
        if (!silent) this.renderLoading();
        try {
            const client = this.client || await this.community.makeClient();
            const { data, error } = await client.rpc('nt_catalog_search', {
                p_query: this.state.query || '',
                p_kind: this.state.kind || 'all',
                p_sort: this.state.sort || 'popular',
                p_limit: this.state.limit,
                p_offset: this.state.offset,
                p_owner: this.state.owner,
                p_content_rating: this.state.contentRating || 'sfw',
            });
            if (error) throw error;
            this.items = Array.isArray(data) ? data : [];
            this.total = Number(this.items[0]?.total_count || 0);
            await Promise.all([
                this.loadMyRatings(),
                this.loadPreviewUrls(),
                this.state.section === 'mine' ? this.loadRejectionNotices() : Promise.resolve((this.rejectionNotices = [])),
            ]);
            this.renderItems();
        } catch (error) {
            this.items = [];
            this.total = 0;
            this.renderError(error);
        } finally {
            this.loading = false;
        }
    }

    async loadRejectionNotices() {
        if (!this.user) return [];
        if (this.state.section !== 'mine') {
            this.rejectionNotices = [];
            return [];
        }
        const client = this.client || await this.community.makeClient();
        const { data, error } = await client.from('nt_catalog_rejections')
            .select('id,original_item_id,nt_uuid,title,kind,publisher_name,reason,rejected_by_name,rejected_at')
            .order('rejected_at', { ascending: false })
            .limit(100);
        if (error) throw error;
        this.rejectionNotices = Array.isArray(data) ? data : [];
        return this.rejectionNotices;
    }

    async loadModerationQueue({ silent = false } = {}) {
        if (!this.root || !this.isModerator) return;
        this.loading = true;
        if (!silent) this.renderLoading();
        try {
            const client = this.client || await this.community.makeClient();
            const { data, error } = await client.rpc('nt_catalog_moderation_queue', {
                p_limit: this.state.limit,
                p_offset: this.state.offset,
            });
            if (error) throw error;
            this.items = Array.isArray(data) ? data : [];
            this.total = Number(this.items[0]?.total_count || 0);
            await Promise.all([this.loadMyRatings(), this.loadPreviewUrls()]);
            this.renderItems();
        } catch (error) {
            this.items = [];
            this.total = 0;
            this.renderError(error);
        } finally {
            this.loading = false;
        }
    }

    async loadMyRatings() {
        const ids = this.items.map(item => item.id).filter(Boolean);
        if (!ids.length || !this.client) return;
        const { data } = await this.client.from('nt_catalog_ratings').select('item_id,rating').in('item_id', ids);
        const ratings = new Map((data || []).map(row => [row.item_id, Number(row.rating || 0)]));
        this.items.forEach(item => { item.my_rating = ratings.get(item.id) || 0; });
    }

    async loadPreviewUrlsFor(items = []) {
        const rows = Array.isArray(items) ? items : [];
        const ids = rows
            .filter(item => item.kind === 'character_card' && String(item.file_extension || '').toLowerCase() === 'png')
            .map(item => item.id)
            .filter(Boolean);
        if (!ids.length) return;
        try {
            const result = await this.invoke({ action: 'preview_batch', item_ids: ids });
            const urls = result?.urls && typeof result.urls === 'object' ? result.urls : {};
            rows.forEach(item => { if (urls[item.id]) item.preview_url = urls[item.id]; });
        } catch (_) {}
    }

    async loadPreviewUrls() {
        return this.loadPreviewUrlsFor(this.items);
    }

    async openCreatorPage(username, { silent = false } = {}) {
        const name = String(username || '').trim();
        if (!name || name.toLowerCase() === 'unknown') return;
        this.state.section = 'creator';
        this.state.creator = name;
        this.state.offset = 0;
        this.root?.querySelectorAll('[data-nt-catalogue-section]').forEach(button => button.classList.remove('is-active'));
        const heading = this.root?.querySelector('[data-nt-catalogue-heading]'); if (heading) heading.textContent = name;
        const summary = this.root?.querySelector('[data-nt-catalogue-summary]'); if (summary) summary.textContent = t('Creator profile and catalogue publications.');
        this.characterDetails?.close?.({ restoreFocus: false });
        if (!silent) this.renderLoading();
        try {
            const client = this.client || await this.community.makeClient();
            const [summaryResult, itemsResult] = await Promise.all([
                client.rpc('nt_catalog_creator_summary', { p_username: name }),
                client.rpc('nt_catalog_creator_items', { p_username: name, p_limit: this.state.limit, p_offset: this.state.offset }),
            ]);
            if (summaryResult.error) throw summaryResult.error;
            if (itemsResult.error) throw itemsResult.error;
            this.creatorSummary = Array.isArray(summaryResult.data) ? summaryResult.data[0] : summaryResult.data;
            this.items = Array.isArray(itemsResult.data) ? itemsResult.data : [];
            this.total = Number(this.items[0]?.total_count || this.items.length);
            await Promise.all([this.loadMyRatings(), this.loadPreviewUrlsFor(this.items)]);
            this.renderCreatorPage();
        } catch (error) { this.renderError(error); }
    }

    renderCreatorPage() {
        const content = this.root?.querySelector('[data-nt-catalogue-content]'); if (!content) return;
        const c = this.creatorSummary || { username: this.state.creator };
        content.innerHTML = `<div class="nt-catalogue-creator-page"><section class="nt-catalogue-creator-profile"><button type="button" class="nt-catalogue-back" data-nt-catalogue-section="discover">${icons.arrowLeft}<span>${esc(t('Discover'))}</span></button><div class="nt-catalogue-creator-avatar">${avatarHtml(c.avatar_url, c.username, { wrapInitials: true })}</div><div class="nt-catalogue-creator-copy"><small>${esc(c.role === 'unverified' ? t('Unverified creator identity') : `${t('Community creator')}${catalogueProfileRoleLabel(c.role) ? ` · ${catalogueProfileRoleLabel(c.role)}` : ''}`)}</small><h2>${esc(c.username || this.state.creator)}</h2>${c.bio ? `<p>${esc(c.bio)}</p>` : ''}<div class="nt-catalogue-creator-stats"><span><b>${Number(c.upload_count || 0)}</b><small>${esc(t('uploads'))}</small></span><span><b>${Number(c.total_downloads || 0).toLocaleString()}</b><small>${esc(t('downloads'))}</small></span><span><b>${Number(c.rating_average || 0).toFixed(1)}</b><small>${esc(t('rating'))}</small></span></div></div></section>${this.items.length ? `<div class="nt-catalogue-grid">${this.items.map(item => this.cardMarkup(item)).join('')}</div>` : `<div class="nt-catalogue-home-empty">${esc(t('No approved publications from this creator yet.'))}</div>`}</div>`;
        this.syncFooter();
    }

    async loadCollections({ silent = false } = {}) {
        if (!this.root || !this.user) return;
        if (!silent) this.renderLoading();
        try {
            const client = this.client || await this.community.makeClient();
            const [mine, publicRows, ownItems] = await Promise.all([
                client.from('nt_catalog_collections').select('id,owner_id,name,description,is_public,created_at,updated_at').eq('owner_id', this.user.id).order('updated_at', { ascending: false }),
                client.rpc('nt_catalog_public_collections', { p_limit: 30 }),
                client.from('nt_catalog_collection_items').select('collection_id,item_id'),
            ]);
            if (mine.error) throw mine.error; if (publicRows.error) throw publicRows.error; if (ownItems.error) throw ownItems.error;
            const counts = new Map(); (ownItems.data || []).forEach(row => counts.set(row.collection_id, (counts.get(row.collection_id) || 0) + 1));
            this.collections = (mine.data || []).map(row => ({ ...row, item_count: counts.get(row.id) || 0 }));
            this.publicCollections = (publicRows.data || []).filter(row => row.owner_id !== this.user.id);
            this.renderCollections();
        } catch (error) { this.renderError(error); }
    }

    renderCollections() {
        const content = this.root?.querySelector('[data-nt-catalogue-content]'); if (!content) return;
        const own = this.collections || []; const pub = this.publicCollections || [];
        const card = (c, mine = false) => `<article class="nt-catalogue-collection-tile" data-nt-catalogue-open-collection="${esc(c.id)}" tabindex="0"><span class="nt-catalogue-collection-icon">${icons.folder}</span><div><div class="nt-catalogue-collection-title"><b>${esc(c.name)}</b><em>${mine ? (c.is_public ? esc(t('Public')) : esc(t('Private'))) : esc(c.owner_name || '')}</em></div>${c.description ? `<p>${esc(c.description)}</p>` : ''}<small>${Number(c.item_count || 0)} ${esc(t('items'))}</small></div>${mine ? `<div class="nt-catalogue-collection-actions"><button type="button" data-nt-catalogue-edit-collection="${esc(c.id)}" title="${esc(t('Edit'))}">${icons.edit}</button><button type="button" class="danger" data-nt-catalogue-delete-collection="${esc(c.id)}" title="${esc(t('Delete'))}">${icons.trash}</button></div>` : ''}</article>`;
        content.innerHTML = `<div class="nt-catalogue-collections-page"><section><header><div><b>${esc(t('My collections'))}</b><small>${esc(t('Save and organize catalogue resources.'))}</small></div><button type="button" class="primary" data-nt-catalogue-new-collection>${icons.plus}<span>${esc(t('New collection'))}</span></button></header><div class="nt-catalogue-collection-grid">${own.length ? own.map(c => card(c, true)).join('') : `<div class="nt-catalogue-home-empty">${esc(t('You have no collections yet.'))}</div>`}</div></section><section><header><div><b>${esc(t('Public collections'))}</b><small>${esc(t('Collections shared by the community.'))}</small></div></header><div class="nt-catalogue-collection-grid">${pub.length ? pub.map(c => card(c, false)).join('') : `<div class="nt-catalogue-home-empty">${esc(t('No public collections yet.'))}</div>`}</div></section></div>`;
        const footer = this.root.querySelector('[data-nt-catalogue-footer]'); if (footer) footer.hidden = true;
    }

    ensureCollectionEditorModal() {
        if (this.collectionEditorRoot?.isConnected) return this.collectionEditorRoot;
        const { root, body } = createModalShell({ id: 'nt-catalogue-collection-editor', title: t('Collection'), subtitle: t('Create or edit a catalogue collection.'), icon: icons.folder, size: 'standard', modalClass: 'nt-catalogue-collection-editor', closeAttrs: { 'data-nt-collection-editor-close': '' } });
        body.innerHTML = `<form data-nt-collection-editor-form><input type="hidden" name="id"><label><span>${esc(t('Name'))}</span><input name="name" maxlength="80" required></label><label><span>${esc(t('Description'))}</span><textarea name="description" maxlength="1000" rows="4"></textarea></label><label class="nt-catalogue-collection-public"><input type="checkbox" name="is_public"><span>${esc(t('Public collection'))}</span></label><div class="nt-catalogue-upload-actions"><button type="button" data-nt-collection-editor-close>${esc(t('Cancel'))}</button><button type="submit" class="primary">${icons.check}<span>${esc(t('Save'))}</span></button></div></form>`;
        root.addEventListener('click', e => { if (e.target.closest('[data-nt-collection-editor-close]')) hideModalShell(root, { immediate: false }); });
        root.addEventListener('submit', e => { const form = e.target.closest('[data-nt-collection-editor-form]'); if (!form) return; e.preventDefault(); void this.saveCollection(form); });
        document.body.append(root); this.collectionEditorRoot = root; return root;
    }

    openCollectionEditor(collection = null) {
        const root = this.ensureCollectionEditorModal(); const form = root.querySelector('[data-nt-collection-editor-form]');
        form.reset(); form.elements.id.value = collection?.id || ''; form.elements.name.value = collection?.name || ''; form.elements.description.value = collection?.description || ''; form.elements.is_public.checked = Boolean(collection?.is_public); showModalShell(root);
    }

    async saveCollection(form) {
        try {
            const client = this.client || await this.community.makeClient(); const id = String(form.elements.id.value || '');
            const payload = { owner_id: this.user.id, name: String(form.elements.name.value || '').trim().slice(0,80), description: String(form.elements.description.value || '').trim().slice(0,1000), is_public: Boolean(form.elements.is_public.checked), updated_at: new Date().toISOString() };
            if (!payload.name) return;
            const query = id ? client.from('nt_catalog_collections').update(payload).eq('id', id).eq('owner_id', this.user.id) : client.from('nt_catalog_collections').insert(payload);
            const { error } = await query; if (error) throw error; hideModalShell(this.collectionEditorRoot, { immediate: false }); await this.loadCollections({ silent: true });
        } catch (error) { this.toast?.(error?.message || String(error)); }
    }

    async deleteCollection(collection) {
        if (!collection || collection.owner_id !== this.user?.id) return;
        if (!await confirmDialog(t('Delete collection “{title}”?', { title: collection.name }))) return;
        try { const client = this.client || await this.community.makeClient(); const { error } = await client.from('nt_catalog_collections').delete().eq('id', collection.id).eq('owner_id', this.user.id); if (error) throw error; await this.loadCollections({ silent: true }); } catch (error) { this.toast?.(error?.message || String(error)); }
    }

    async openCollection(collection, { silent = false } = {}) {
        if (!collection?.id) return;
        this.state.section = 'collection'; this.activeCollection = collection; this.root?.querySelectorAll('[data-nt-catalogue-section]').forEach(button => button.classList.remove('is-active'));
        const heading = this.root?.querySelector('[data-nt-catalogue-heading]'); if (heading) heading.textContent = collection.name || t('Collection');
        const summary = this.root?.querySelector('[data-nt-catalogue-summary]'); if (summary) summary.textContent = collection.description || t('Catalogue collection.');
        if (!silent) this.renderLoading();
        try { const client = this.client || await this.community.makeClient(); const { data, error } = await client.rpc('nt_catalog_collection_items_view', { p_collection: collection.id }); if (error) throw error; this.items = data || []; this.total = this.items.length; await Promise.all([this.loadMyRatings(), this.loadPreviewUrlsFor(this.items)]); this.renderCollection(); } catch (error) { this.renderError(error); }
    }

    renderCollection() {
        const content = this.root?.querySelector('[data-nt-catalogue-content]'); if (!content || !this.activeCollection) return;
        const own = this.activeCollection.owner_id === this.user?.id;
        content.innerHTML = `<div class="nt-catalogue-collection-page"><header><button type="button" class="nt-catalogue-back" data-nt-catalogue-section="collections">${icons.arrowLeft}<span>${esc(t('Collections'))}</span></button><div><small>${esc(own ? (this.activeCollection.is_public ? t('Public collection') : t('Private collection')) : this.activeCollection.owner_name || t('Public collection'))}</small><h2>${esc(this.activeCollection.name || t('Collection'))}</h2>${this.activeCollection.description ? `<p>${esc(this.activeCollection.description)}</p>` : ''}</div>${own ? `<button type="button" data-nt-catalogue-edit-collection="${esc(this.activeCollection.id)}">${icons.edit}<span>${esc(t('Edit'))}</span></button>` : ''}</header>${this.items.length ? `<div class="nt-catalogue-grid">${this.items.map(item => this.cardMarkup(item)).join('')}</div>` : `<div class="nt-catalogue-home-empty">${esc(t('This collection is empty.'))}</div>`}</div>`;
        const footer = this.root.querySelector('[data-nt-catalogue-footer]'); if (footer) footer.hidden = true;
    }

    async removeItemFromCollection(item) {
        if (!item || !this.activeCollection || this.activeCollection.owner_id !== this.user?.id) return;
        try { const client = this.client || await this.community.makeClient(); const { error } = await client.from('nt_catalog_collection_items').delete().eq('collection_id', this.activeCollection.id).eq('item_id', item.id); if (error) throw error; await this.openCollection(this.activeCollection, { silent: true }); } catch (error) { this.toast?.(error?.message || String(error)); }
    }

    ensureCollectionPickerModal() {
        if (this.collectionPickerRoot?.isConnected) return this.collectionPickerRoot;
        const { root, body } = createModalShell({ id: 'nt-catalogue-collection-picker', title: t('Add to collection'), subtitle: t('Choose one of your collections.'), icon: icons.bookmark, size: 'standard', modalClass: 'nt-catalogue-collection-picker', closeAttrs: { 'data-nt-collection-picker-close': '' } });
        body.innerHTML = `<div data-nt-collection-picker-list></div><div class="nt-catalogue-upload-actions"><button type="button" data-nt-collection-picker-new>${icons.plus}<span>${esc(t('New collection'))}</span></button><button type="button" data-nt-collection-picker-close>${esc(t('Close'))}</button></div>`;
        root.addEventListener('click', e => { if (e.target.closest('[data-nt-collection-picker-close]')) hideModalShell(root,{ immediate:false }); const add=e.target.closest('[data-nt-collection-pick-id]'); if(add) void this.addItemToCollection(add.dataset.ntCollectionPickId, root._ntItem); if(e.target.closest('[data-nt-collection-picker-new]')) { hideModalShell(root,{immediate:false}); this.openCollectionEditor(); } });
        document.body.append(root); this.collectionPickerRoot=root; return root;
    }

    async openCollectionPicker(item) {
        const root=this.ensureCollectionPickerModal(); root._ntItem=item;
        try { const client=this.client || await this.community.makeClient(); const { data,error }=await client.from('nt_catalog_collections').select('id,name,is_public').eq('owner_id',this.user.id).order('updated_at',{ascending:false}); if(error) throw error; const list=root.querySelector('[data-nt-collection-picker-list]'); list.innerHTML=(data||[]).length ? (data||[]).map(c=>`<button type="button" class="nt-catalogue-picker-row" data-nt-collection-pick-id="${esc(c.id)}">${icons.folder}<span><b>${esc(c.name)}</b><small>${esc(c.is_public?t('Public'):t('Private'))}</small></span>${icons.plus}</button>`).join('') : `<div class="nt-catalogue-home-empty">${esc(t('Create a collection first.'))}</div>`; showModalShell(root); } catch(error){ this.toast?.(error?.message||String(error)); }
    }

    async addItemToCollection(collectionId, item) {
        if (!collectionId || !item?.id) return;
        try { const client=this.client || await this.community.makeClient(); const { error }=await client.from('nt_catalog_collection_items').upsert({ collection_id: collectionId, item_id: item.id },{ onConflict:'collection_id,item_id', ignoreDuplicates:true }); if(error) throw error; hideModalShell(this.collectionPickerRoot,{immediate:false}); this.toast?.(t('Added to collection.')); } catch(error){ this.toast?.(error?.message||String(error)); }
    }

    ensureReportModal() {
        if (this.reportRoot?.isConnected) return this.reportRoot;
        const { root, body } = createModalShell({ id:'nt-catalogue-report-modal', title:t('Report resource'), subtitle:t('Send this published resource to the moderation team.'), icon:icons.alertWarning, size:'standard', modalClass:'nt-catalogue-report-modal', closeAttrs:{'data-nt-report-close':''} });
        body.innerHTML=`<form data-nt-catalogue-report-form><input type="hidden" name="item_id"><label><span>${esc(t('Reason'))}</span><select name="reason"><option value="wrong_rating">${esc(t('Wrong SFW / NSFW category'))}</option><option value="stolen_copy">${esc(t('Stolen or copied resource'))}</option><option value="misleading">${esc(t('Misleading metadata'))}</option><option value="prohibited">${esc(t('Prohibited content'))}</option><option value="other">${esc(t('Other'))}</option></select></label><label><span>${esc(t('Details'))}</span><textarea name="details" maxlength="1000" rows="5" placeholder="${esc(t('Explain what moderators should check.'))}"></textarea></label><div class="nt-catalogue-upload-actions"><button type="button" data-nt-report-close>${esc(t('Cancel'))}</button><button type="submit" class="danger">${icons.alertWarning}<span>${esc(t('Submit report'))}</span></button></div></form>`;
        root.addEventListener('click',e=>{if(e.target.closest('[data-nt-report-close]')) hideModalShell(root,{immediate:false});});
        root.addEventListener('submit',e=>{const form=e.target.closest('[data-nt-catalogue-report-form]'); if(!form)return; e.preventDefault(); void this.submitReport(form);});
        document.body.append(root); this.reportRoot=root; return root;
    }

    openReportModal(item) { if (!item || item.owner_id===this.user?.id || item.moderation_status==='pending') return; const root=this.ensureReportModal(); const form=root.querySelector('[data-nt-catalogue-report-form]'); form.reset(); form.elements.item_id.value=item.id; showModalShell(root); }

    async submitReport(form) {
        try { const client=this.client || await this.community.makeClient(); const { error }=await client.rpc('nt_catalog_report_item',{p_item:String(form.elements.item_id.value||''),p_reason:String(form.elements.reason.value||'other'),p_details:String(form.elements.details.value||'').trim()}); if(error) throw error; hideModalShell(this.reportRoot,{immediate:false}); this.toast?.(t('Report sent to moderators.')); } catch(error){ this.toast?.(error?.message||String(error)); }
    }

    async loadReports({ silent=false }={}) {
        if(!this.isModerator) return this.applySection('discover'); if(!silent)this.renderLoading();
        try { const client=this.client||await this.community.makeClient(); const {data,error}=await client.rpc('nt_catalog_report_queue',{p_limit:this.state.limit,p_offset:this.state.offset}); if(error)throw error; const rows=data||[]; const ids=rows.map(r=>r.item_id); let itemMap=new Map(); if(ids.length){const q=await client.from('nt_catalog_items').select('*').in('id',ids); if(q.error)throw q.error; itemMap=new Map((q.data||[]).map(i=>[i.id,i]));} this.reportRows=rows.map(r=>({...r,item:itemMap.get(r.item_id)||null})); this.items=this.reportRows.map(r=>r.item).filter(Boolean); this.total=Number(rows[0]?.total_count||0); await this.loadPreviewUrlsFor(this.items); this.renderReports(); } catch(error){this.renderError(error);}
    }

    reportReasonLabel(reason){ return ({wrong_rating:t('Wrong SFW / NSFW category'),stolen_copy:t('Stolen or copied resource'),misleading:t('Misleading metadata'),prohibited:t('Prohibited content'),other:t('Other')})[String(reason||'')]||t('Other'); }

    renderReports() {
        const content=this.root?.querySelector('[data-nt-catalogue-content]'); if(!content)return;
        content.innerHTML=this.reportRows.length?`<div class="nt-catalogue-report-list">${this.reportRows.map(r=>{const i=r.item||{}; return `<article class="nt-catalogue-report-card" data-nt-report-id="${esc(r.report_id)}"><div class="nt-catalogue-report-media">${i.preview_url?`<img src="${esc(i.preview_url)}" alt="">`:`<span>${i.kind==='lorebook'?icons.lore:icons.characters}</span>`}</div><div class="nt-catalogue-report-copy"><div><b>${esc(r.title)}</b><span>${esc(this.reportReasonLabel(r.reason))}</span></div><small>${esc(t('Reported by'))} ${esc(r.reporter_name)} · ${new Date(r.report_created_at).toLocaleString()}</small>${r.details?`<p>${esc(r.details)}</p>`:''}<em>${esc(this.contentRatingLabel(i))}</em></div><div class="nt-catalogue-report-actions"><button type="button" data-nt-report-view="${esc(r.report_id)}">${icons.info}<span>${esc(t('View Card'))}</span></button><button type="button" data-nt-report-resolve="${esc(r.report_id)}" class="primary">${icons.check}<span>${esc(t('Resolved'))}</span></button><button type="button" data-nt-report-dismiss="${esc(r.report_id)}">${icons.close}<span>${esc(t('Dismiss'))}</span></button><button type="button" data-nt-report-delete="${esc(r.report_id)}" class="danger icon-only" title="${esc(t('Delete'))}" aria-label="${esc(t('Delete'))}">${icons.trash}</button></div></article>`;}).join('')}</div>`:emptyStateHtml({ icon: icons.check, title: t('No open reports'), subtitle: t('Published catalogue resources currently have no unresolved reports.'), className: 'nt-catalogue-empty' });
        this.syncFooter();
    }

    async resolveReport(row, resolution='resolved') { if(!row?.report_id)return; try{const client=this.client||await this.community.makeClient(); const {data,error}=await client.rpc('nt_catalog_resolve_report',{p_report:row.report_id,p_resolution:resolution,p_note:''}); if(error)throw error; if(data===false)throw new Error(t('Report not found.')); await Promise.all([this.loadReportCount(),this.loadReports({silent:true})]);}catch(error){this.toast?.(error?.message||String(error));} }

    async loadAudit({silent=false}={}) { if(!this.isModerator)return this.applySection('discover'); if(!silent)this.renderLoading(); try{const client=this.client||await this.community.makeClient(); const {data,error}=await client.rpc('nt_catalog_audit_queue',{p_limit:50,p_offset:this.state.offset}); if(error)throw error; this.auditRows=data||[]; this.items=this.auditRows; this.total=Number(this.auditRows[0]?.total_count||0); this.renderAudit();}catch(error){this.renderError(error);} }

    auditActionLabel(action){ return ({approve:t('Approved'),reclassify:t('Reclassified'),reject:t('Rejected'),delete:t('Deleted'),delete_lineage:t('Deleted lineage'),report_resolved:t('Resolved report'),report_dismissed:t('Dismissed report')})[String(action||'')]||String(action||'').replaceAll('_',' '); }

    renderAudit(){const content=this.root?.querySelector('[data-nt-catalogue-content]'); if(!content)return; content.innerHTML=this.auditRows.length?`<div class="nt-catalogue-audit-list">${this.auditRows.map(row=>`<article><span>${icons.history}</span><div><b>${esc(this.auditActionLabel(row.action))} · ${esc(row.title||t('Catalogue resource'))}</b><small>${esc(row.actor_name||'system')} (${esc(row.actor_role||'system')}) · ${new Date(row.created_at).toLocaleString()}</small>${row.details&&Object.keys(row.details).length?`<code>${esc(JSON.stringify(row.details))}</code>`:''}</div></article>`).join('')}</div>`:emptyStateHtml({ icon: icons.history, title: t('No moderation history yet'), className: 'nt-catalogue-empty' }); this.syncFooter(); }

    async logModerationAction(action,item,details={}){if(!this.isModerator||!item)return; try{const client=this.client||await this.community.makeClient(); await client.rpc('nt_catalog_log_moderation_action',{p_action:action,p_item:item.id||null,p_nt_uuid:item.nt_uuid||null,p_title:item.title||'',p_details:details||{}});}catch(_){} }

    async openItemById(id){if(!id)return; try{const client=this.client||await this.community.makeClient(); const {data,error}=await client.from('nt_catalog_items').select('*').eq('id',id).maybeSingle(); if(error)throw error; if(!data)throw new Error(t('Catalogue item not found.')); await this.loadPreviewUrlsFor([data]); return this.openItemDetails(data,this.root?.querySelector(`[data-nt-catalogue-item="${id}"]`)||null);}catch(error){this.toast?.(error?.message||String(error));}}

    renderLoading() {
        const content = this.root?.querySelector('[data-nt-catalogue-content]');
        if (!content) return;
        content.innerHTML = `<div class="nt-catalogue-loading"><span></span><b>${esc(t('Loading Nasty Catalogue…'))}</b></div>`;
    }

    renderError(error) {
        const content = this.root?.querySelector('[data-nt-catalogue-content]');
        if (!content) return;
        content.innerHTML = emptyStateHtml({
            icon: icons.alertWarning,
            title: t('Could not load Nasty Catalogue'),
            subtitle: error?.message || String(error || ''),
            className: 'nt-catalogue-empty',
            actionHtml: `<button type="button" data-nt-catalogue-refresh>${icons.refresh}<span>${esc(t('Retry'))}</span></button>`,
        });
        this.syncFooter();
    }

    isOriginalVersion(item) {
        return ['original', 'legacy_original', 'unknown_origin'].includes(String(item?.variant_role || ''));
    }

    canDeleteItem(item) {
        return Boolean(item && (item.owner_id === this.user?.id || this.isModerator));
    }

    variantLabel(item) {
        const role = String(item?.variant_role || '');
        if (role === 'original' || role === 'legacy_original') return t('Original');
        if (role === 'creator_revision') return t('Creator update');
        if (role === 'community_modification') return t('Community modification');
        return t('Unverified origin');
    }

    moderationStatusLabel(item) {
        const status = String(item?.moderation_status || 'approved');
        if (status === 'pending') return t('Pending review');
        if (status === 'rejected') return t('Rejected');
        return t('Approved');
    }

    contentRatingLabel(item) {
        return String(item?.content_rating || item?.declared_content_rating || 'sfw').toLowerCase() === 'nsfw' ? 'NSFW' : 'SFW';
    }

    moderationBadgeMarkup(item) {
        const status = String(item?.moderation_status || 'approved');
        const rating = this.contentRatingLabel(item);
        const ratingLabel = `${t('Content rating')}: ${rating}`;
        const showStatus = this.state.section === 'mine' || this.state.section === 'moderation';
        return `<div class="nt-catalogue-card-badges" aria-label="${esc(ratingLabel)}"><span class="nt-catalogue-rating-badge is-${rating.toLowerCase()}" title="${esc(ratingLabel)}">${rating}</span>${showStatus ? `<span class="nt-catalogue-review-badge is-${esc(status)}">${esc(this.moderationStatusLabel(item))}</span>` : ''}</div>`;
    }

    cardRatingMarkup(item) {
        const average = Math.max(0, Math.min(5, Number(item?.rating_average || 0)));
        const count = Math.max(0, Number(item?.rating_count || 0));
        const stars = starsHtml(average);
        const label = count
            ? `${t('Average rating {value} out of 5', { value: average.toFixed(2) })} · ${count} ${t('ratings')}`
            : t('No ratings yet');
        return `<div class="nt-catalogue-card-top-rating" data-nt-catalogue-card-top-rating title="${esc(label)}" aria-label="${esc(label)}">
            <span class="nt-catalogue-card-rating-stars" data-nt-catalogue-card-rating-stars>${stars}</span>
            <b data-nt-catalogue-card-rating-average>${average.toFixed(1)}</b>
        </div>`;
    }

    provenanceMarkup(item, { compact = false } = {}) {
        const original = String(item?.nt_creator || 'unknown').trim() || 'unknown';
        const publisher = String(item?.publisher_name || item?.nt_creator || 'unknown').trim() || 'unknown';
        const creatorButton = value => String(value || '').toLowerCase() === 'unknown'
            ? esc(value || 'unknown')
            : `<button type="button" data-nt-catalogue-creator="${esc(value)}">${esc(value)}</button>`;
        if (compact) {
            return `<span><b>${esc(t('Original creator'))}:</b> ${creatorButton(original)}</span><span><b>${esc(t('Published by'))}:</b> ${creatorButton(publisher)}</span>`;
        }
        return `<div class="nt-catalogue-provenance-grid">
            <div><small>${esc(t('Original creator'))}</small><b>${creatorButton(original)}</b></div>
            <div><small>${esc(t('This version published by'))}</small><b>${creatorButton(publisher)}</b></div>
            <div><small>${esc(t('Version type'))}</small><b>${esc(this.variantLabel(item))}</b></div>
        </div>`;
    }

    copyRiskMarkup(item) {
        const score = Number(item?.copy_risk_score || 0);
        if (!this.isModerator || score < 0.82) return '';
        return `<button type="button" class="nt-catalogue-copy-risk" data-nt-catalogue-copy-source="${esc(item?.copy_source_item || '')}" title="${esc(t('Possible copy detected'))}">${icons.alertWarning}<span>${Math.round(score * 100)}%</span></button>`;
    }

    rejectionNoticeMarkup(notice) {
        const title = String(notice?.title || t('Rejected upload')).trim() || t('Rejected upload');
        const reason = String(notice?.reason || t('No reason provided.')).trim() || t('No reason provided.');
        return `<article class="nt-catalogue-rejection-card" data-nt-catalogue-rejection="${esc(notice?.id || '')}" aria-label="${esc(title)}">
            <div class="nt-catalogue-rejection-icon">${icons.close}</div>
            <div class="nt-catalogue-rejection-copy">
                <div class="nt-catalogue-rejection-heading"><b>${esc(title)}</b><span>${esc(t('Rejected'))}</span></div>
                <small>${esc(t('Reason for rejection'))}</small>
                <p>${esc(reason)}</p>
            </div>
            <button type="button" class="primary" data-nt-catalogue-ack-rejection="${esc(notice?.id || '')}">${icons.check}<span>${esc(t('Acknowledge'))}</span></button>
        </article>`;
    }

    cardMarkup(item) {
        const mine = item.owner_id === this.user?.id;
        const canDelete = this.canDeleteItem(item);
        const preview = item.preview_url
            ? `<img src="${esc(item.preview_url)}" alt="" loading="lazy">`
            : `<div class="nt-catalogue-card-fallback ${item.kind === 'lorebook' ? 'is-lorebook' : ''}"><span>${item.kind === 'lorebook' ? icons.lore : icons.characters}</span></div>`;
        return `<article class="nt-catalogue-card ${item.preview_url ? 'has-cover' : 'no-cover'}" data-nt-catalogue-item="${esc(item.id)}" tabindex="0" role="button" aria-label="${esc(`${item.title} · ${this.contentRatingLabel(item)}`)}">
            <div class="nt-catalogue-card-media">${preview}${this.moderationBadgeMarkup(item)}${this.cardRatingMarkup(item)}${this.copyRiskMarkup(item)}</div>
            <div class="nt-catalogue-card-overlay">
                <div class="nt-catalogue-card-copy">
                    <b>${esc(item.title)}</b>
                    <small class="nt-catalogue-card-provenance">${this.provenanceMarkup(item, { compact: true })}</small>
                    ${item.description ? `<p>${esc(item.description)}</p>` : ''}
                </div>
                <div class="nt-catalogue-stats">
                    <span>${icons.download}<b data-nt-catalogue-card-downloads>${Number(item.downloads || 0).toLocaleString()}</b></span>
                </div>
                <div class="nt-catalogue-card-actions">
                    ${this.state.section === 'moderation' && this.isModerator ? `
                        <button type="button" class="primary" data-nt-catalogue-approve="sfw">${icons.check}<span>SFW</span></button>
                        <button type="button" class="primary" data-nt-catalogue-approve="nsfw">${icons.check}<span>NSFW</span></button>
                        <button type="button" class="danger" data-nt-catalogue-reject title="${esc(t('Reject'))}">${icons.close}</button>
                        ${item.copy_source_item ? `<button type="button" data-nt-catalogue-copy-source="${esc(item.copy_source_item)}" title="${esc(t('Compare possible copy'))}">${icons.copy}</button>` : ''}
                        ${canDelete ? `<button type="button" class="danger" data-nt-catalogue-delete title="${esc(t('Delete'))}">${icons.trash}</button>` : ''}
                    ` : `
                        <button type="button" class="primary" data-nt-catalogue-import>${icons.download}<span>${esc(t('Import'))}</span></button>
                        <button type="button" data-nt-catalogue-download title="${esc(t('Download'))}">${icons.download}</button>
                        ${String(item.moderation_status || 'approved') === 'approved' ? `<button type="button" data-nt-catalogue-add-collection title="${esc(t('Add to collection'))}">${icons.bookmark}</button>` : ''}
                        ${!mine && String(item.moderation_status || 'approved') === 'approved' ? `<button type="button" data-nt-catalogue-report title="${esc(t('Report'))}">${icons.alertWarning}</button>` : ''}
                        ${this.state.section === 'collection' && this.activeCollection?.owner_id === this.user?.id ? `<button type="button" data-nt-catalogue-collection-remove title="${esc(t('Remove from collection'))}">${icons.close}</button>` : ''}
                        ${canDelete ? `<button type="button" class="danger" data-nt-catalogue-delete title="${esc(t('Delete'))}">${icons.trash}</button>` : ''}
                    `}
                </div>
            </div>
        </article>`;
    }

    renderItems() {
        const content = this.root?.querySelector('[data-nt-catalogue-content]');
        if (!content) return;
        const rejectionCards = this.state.section === 'mine' ? this.rejectionNotices : [];
        if (!this.items.length && !rejectionCards.length) {
            content.innerHTML = emptyStateHtml({
                icon: this.state.section === 'mine' ? icons.folder : this.state.section === 'moderation' ? (icons.check || icons.info) : icons.search,
                title: this.state.section === 'moderation' ? t('No uploads waiting for review') : this.state.query ? t('No matching resources') : this.state.section === 'mine' ? t('Your catalogue is empty') : t('Nothing has been published yet'),
                subtitle: this.state.section === 'moderation' ? t('The moderation queue is currently empty.') : this.state.section === 'mine' ? t('Upload a Character Card or Lorebook to start your permanent library.') : t('Try another search or filter.'),
                className: 'nt-catalogue-empty',
                actionHtml: this.state.section === 'mine' ? `<button type="button" data-nt-catalogue-upload>${icons.upload}<span>${esc(t('Upload a file'))}</span></button>` : '',
            });
        } else {
            content.innerHTML = `<div class="nt-catalogue-grid">${rejectionCards.map(entry => this.rejectionNoticeMarkup(entry)).join('')}${this.items.map(item => this.cardMarkup(item)).join('')}</div>`;
        }
        this.syncFooter();
    }

    syncFooter() {
        const footer = this.root?.querySelector('[data-nt-catalogue-footer]');
        if (!footer) return;
        footer.hidden = this.total <= this.state.limit;
        const start = this.total ? this.state.offset + 1 : 0;
        const end = Math.min(this.state.offset + this.items.length, this.total);
        const range = footer.querySelector('[data-nt-catalogue-range]');
        if (range) range.textContent = `${start}–${end} / ${this.total}`;
        footer.querySelector('[data-nt-catalogue-prev]')?.toggleAttribute('disabled', this.state.offset <= 0);
        footer.querySelector('[data-nt-catalogue-next]')?.toggleAttribute('disabled', this.state.offset + this.state.limit >= this.total);
    }

    ensureUploadModal() {
        if (this.uploadRoot?.isConnected) return this.uploadRoot;
        const { root, body } = createModalShell({
            id: 'nt-catalogue-upload-modal',
            title: t('Upload to Nasty Catalogue'),
            subtitle: t('Nasty Catalogue upload limits depend on your Community role.'),
            icon: icons.upload,
            size: 'standard',
            modalClass: 'nt-catalogue-upload-modal',
            bodyClass: 'nt-catalogue-upload-body',
            closeAttrs: { 'data-nt-catalogue-upload-close': '' },
        });
        body.innerHTML = `<form data-nt-catalogue-upload-form>
            <div class="nt-catalogue-upload-source-grid">
                <button type="button" class="nt-catalogue-upload-source-card primary" data-nt-catalogue-library-pick>
                    <span>${icons.folder}</span><div><b>${esc(t('From NastyTavern library'))}</b><small>${esc(t('Choose an existing Character Card or Lorebook already installed in SillyTavern.'))}</small></div>
                </button>
                <button type="button" class="nt-catalogue-upload-source-card" data-nt-catalogue-file-pick>
                    <span>${icons.upload}</span><div><b>${esc(t('From a file'))}</b><small>${esc(t('PNG, JSON or .lorebook · '))}<span data-nt-catalogue-upload-limit>${esc(t('maximum 2 MiB'))}</span></small></div>
                </button>
            </div>
            <div class="nt-catalogue-upload-selected">
                <span>${icons.info}</span><div><small>${esc(t('Selected resource'))}</small><em data-nt-catalogue-file-name>${esc(t('No resource selected'))}</em></div>
            </div>
            <input type="file" data-nt-catalogue-file accept=".png,.json,.lorebook,application/json,image/png" hidden>
            <div class="nt-catalogue-upload-grid">
                <label><span>${esc(t('Type'))}</span><select name="kind" data-nt-catalogue-upload-kind><option value="character_card">${esc(t('Character Card'))}</option><option value="lorebook">${esc(t('Lorebook'))}</option></select></label>
                <label class="wide"><span>${esc(t('Title'))}</span><input name="title" maxlength="120" required></label>
                <label class="wide"><span>${esc(t('Description'))}</span><textarea name="description" maxlength="4000" rows="4" placeholder="${esc(t('What should people know before downloading?'))}"></textarea></label>
                <label class="wide"><span>${esc(t('Tags'))}</span><input name="tags" placeholder="roleplay, fantasy, rpg"></label>
                <label><span>${esc(t('Language'))}</span><input name="language" value="en" maxlength="16"></label>
                <label><span>${esc(t('Content rating'))}</span><select name="content_rating"><option value="sfw">SFW</option><option value="nsfw">NSFW</option></select></label>
            </div>
            <div class="nt-catalogue-upload-notice"><span>${icons.info}</span><div><b>${esc(t('Permanent catalogue storage'))}</b><small data-nt-catalogue-upload-policy>${esc(t('Up to 5 catalogue files · maximum 2 MiB per file.'))}</small><small>${esc(t('Uploads are reviewed by moderators before they become visible in the public catalogue.'))}</small></div></div>
            <div class="nt-catalogue-upload-actions"><button type="button" data-nt-catalogue-upload-close>${esc(t('Cancel'))}</button><button type="submit" class="primary" data-nt-catalogue-submit disabled>${icons.upload}<span>${esc(t('Submit for review'))}</span></button></div>
        </form>`;
        root.addEventListener('click', event => {
            if (event.target.closest('[data-nt-catalogue-upload-close]')) return this.closeUpload();
            if (event.target.closest('[data-nt-catalogue-library-pick]')) return void this.openLibraryPicker();
            if (event.target.closest('[data-nt-catalogue-file-pick]')) body.querySelector('[data-nt-catalogue-file]')?.click();
        });
        root.addEventListener('change', event => {
            const input = event.target.closest('[data-nt-catalogue-file]');
            if (input) void this.selectUploadFile(input.files?.[0] || null);
        });
        root.addEventListener('submit', event => {
            const form = event.target.closest('[data-nt-catalogue-upload-form]');
            if (!form) return;
            event.preventDefault();
            void this.submitUpload(form);
        });
        document.body.append(root);
        this.uploadRoot = root;
        return root;
    }

    async openUpload() {
        if (!this.status?.r2_configured) {
            this.toast?.(t('Cloudflare R2 storage is not configured yet for Nasty Catalogue.'));
        }
        const root = this.ensureUploadModal();
        this.pendingFile = null;
        this.pendingInfo = null;
        root.querySelector('[data-nt-catalogue-upload-form]')?.reset();
        const language = root.querySelector('[name="language"]'); if (language) language.value = 'en';
        const name = root.querySelector('[data-nt-catalogue-file-name]'); if (name) name.textContent = t('No resource selected');
        root.querySelector('[data-nt-catalogue-submit]')?.setAttribute('disabled', '');
        this.syncQuota();
        showModalShell(root);
    }

    closeUpload() {
        if (!this.uploadRoot) return;
        hideModalShell(this.uploadRoot, { immediate: false });
        this.pendingFile = null;
        this.pendingInfo = null;
    }

    async selectUploadFile(file) {
        this.pendingFile = file;
        if (!this.uploadRoot) return;
        const name = this.uploadRoot.querySelector('[data-nt-catalogue-file-name]');
        if (name) name.textContent = file ? `${file.name} · ${humanBytes(file.size)}` : t('No file selected');
        const submit = this.uploadRoot.querySelector('[data-nt-catalogue-submit]');
        submit?.toggleAttribute('disabled', !file);
        if (!file) return;
        const maxFileBytes = Number(this.status?.max_file_bytes || catalogueUploadPolicy(this.profile?.role).maxFileBytes);
        if (file.size > maxFileBytes) {
            this.pendingFile = null;
            this.pendingInfo = null;
            submit?.setAttribute('disabled', '');
            this.toast?.(t('This file is too large. Your Community role allows a maximum of {size} per catalogue file.', { size: humanBytes(maxFileBytes) }));
            if (name) name.textContent = `${file.name} · ${humanBytes(file.size)} · ${t('too large')}`;
            return;
        }
        try {
            const info = await inspectUploadFile(file);
            this.pendingInfo = info;
            const kindInput = this.uploadRoot.querySelector('[data-nt-catalogue-upload-kind]');
            const titleInput = this.uploadRoot.querySelector('[name="title"]');
            const descriptionInput = this.uploadRoot.querySelector('[name="description"]');
            const tagsInput = this.uploadRoot.querySelector('[name="tags"]');
            if (kindInput) kindInput.value = info.kind;
            if (titleInput) titleInput.value = info.title || fileStem(file);
            if (descriptionInput && info.description) descriptionInput.value = info.description;
            if (tagsInput && info.tags?.length) tagsInput.value = info.tags.join(', ');
        } catch (_) {
            const titleInput = this.uploadRoot.querySelector('[name="title"]');
            if (titleInput) titleInput.value = fileStem(file);
        }
    }

    characterLibraryItems() {
        const context = window.SillyTavern?.getContext?.();
        const characters = Array.isArray(context?.characters) ? context.characters : [];
        return characters.map((character, chid) => {
            const name = String(character?.name || character?.data?.name || `Character ${chid + 1}`).trim();
            const creator = String(character?.data?.creator || character?.creator || '').trim();
            const avatar = String(character?.avatar || '').trim();
            const tags = Array.isArray(character?.data?.tags) ? character.data.tags : Array.isArray(character?.tags) ? character.tags : [];
            const nativeImage = document.querySelector(`#rm_print_characters_block .character_select[data-chid="${chid}"] img`);
            const imageUrl = nativeImage?.currentSrc || nativeImage?.src || (avatar ? `/thumbnail?type=avatar&file=${encodeURIComponent(avatar)}` : '');
            return { kind: 'character_card', id: `character:${chid}`, chid, name, creator, avatar, imageUrl, search: [name, creator, ...tags].join(' ').toLocaleLowerCase() };
        }).filter(item => item.avatar);
    }

    async lorebookLibraryItems() {
        const context = window.SillyTavern?.getContext?.();
        try {
            const response = await fetch('/api/worldinfo/list', {
                method: 'POST',
                headers: context?.getRequestHeaders?.() || { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
            });
            if (!response.ok) throw new Error(`World Info list failed (${response.status})`);
            const rows = await response.json();
            return (Array.isArray(rows) ? rows : []).map((row, index) => {
                const fileId = String(row?.file_id || row?.name || '').trim();
                const name = String(row?.name || row?.file_id || `Lorebook ${index + 1}`).trim();
                return { kind: 'lorebook', id: `lorebook:${fileId}`, fileId, name, search: `${name} ${fileId}`.toLocaleLowerCase() };
            }).filter(item => item.fileId);
        } catch (error) {
            console.warn('[NastyTavern] Could not list Lorebooks for catalogue upload.', error);
            const select = document.querySelector('#world_editor_select');
            return [...(select?.options || [])].map(option => {
                const fileId = String(option.value || '').trim();
                const name = String(option.textContent || option.value || '').trim();
                return { kind: 'lorebook', id: `lorebook:${fileId}`, fileId, name, search: `${name} ${fileId}`.toLocaleLowerCase() };
            }).filter(item => item.fileId);
        }
    }

    ensureLibraryPicker() {
        if (this.libraryRoot?.isConnected) return this.libraryRoot;
        const { root, body } = createModalShell({
            id: 'nt-catalogue-library-picker',
            title: t('Choose from NastyTavern'),
            subtitle: t('Select a resource already installed in your SillyTavern library.'),
            icon: icons.folder,
            size: 'standard',
            modalClass: 'nt-catalogue-library-picker',
            bodyClass: 'nt-catalogue-library-picker-body',
            closeAttrs: { 'data-nt-catalogue-library-close': '' },
        });
        body.innerHTML = `
            <div class="nt-catalogue-library-toolbar">
                <div class="nt-catalogue-library-tabs" role="tablist">
                    <button type="button" data-nt-catalogue-library-kind="character_card">${icons.characters}<span>${esc(t('Character Cards'))}</span></button>
                    <button type="button" data-nt-catalogue-library-kind="lorebook">${icons.lore}<span>${esc(t('Lorebooks'))}</span></button>
                </div>
                <label class="nt-catalogue-library-search">${icons.search}<input type="search" data-nt-catalogue-library-search placeholder="${esc(t('Search your library…'))}" autocomplete="off"></label>
            </div>
            <div class="nt-catalogue-library-results" data-nt-catalogue-library-results></div>`;
        root.addEventListener('click', event => {
            if (event.target.closest('[data-nt-catalogue-library-close]')) return this.closeLibraryPicker();
            const kindButton = event.target.closest('[data-nt-catalogue-library-kind]');
            if (kindButton) return void this.setLibraryKind(kindButton.dataset.ntCatalogueLibraryKind);
            const itemButton = event.target.closest('[data-nt-catalogue-library-item]');
            if (itemButton) return void this.selectLibraryItem(itemButton.dataset.ntCatalogueLibraryItem);
        });
        root.addEventListener('input', event => {
            const input = event.target.closest('[data-nt-catalogue-library-search]');
            if (!input) return;
            this.libraryState.query = String(input.value || '').trim().toLocaleLowerCase();
            this.renderLibraryPicker();
        });
        document.body.append(root);
        this.libraryRoot = root;
        return root;
    }

    async openLibraryPicker() {
        const root = this.ensureLibraryPicker();
        const selectedKind = this.uploadRoot?.querySelector('[data-nt-catalogue-upload-kind]')?.value;
        this.libraryState.kind = selectedKind === 'lorebook' ? 'lorebook' : 'character_card';
        this.libraryState.query = '';
        const search = root.querySelector('[data-nt-catalogue-library-search]');
        if (search) search.value = '';
        showModalShell(root);
        await this.loadLibraryPickerItems();
        requestAnimationFrame(() => search?.focus?.({ preventScroll: true }));
    }

    closeLibraryPicker() {
        if (!this.libraryRoot) return;
        hideModalShell(this.libraryRoot, { immediate: false });
    }

    async setLibraryKind(kind) {
        const normalized = kind === 'lorebook' ? 'lorebook' : 'character_card';
        if (normalized === this.libraryState.kind && this.libraryState.items.length) return;
        this.libraryState.kind = normalized;
        this.libraryState.query = '';
        const search = this.libraryRoot?.querySelector('[data-nt-catalogue-library-search]');
        if (search) search.value = '';
        await this.loadLibraryPickerItems();
    }

    async loadLibraryPickerItems() {
        this.libraryState.loading = true;
        this.renderLibraryPicker();
        try {
            this.libraryState.items = this.libraryState.kind === 'lorebook' ? await this.lorebookLibraryItems() : this.characterLibraryItems();
        } catch (error) {
            console.warn('[NastyTavern] Could not load local catalogue resources.', error);
            this.libraryState.items = [];
        } finally {
            this.libraryState.loading = false;
            this.renderLibraryPicker();
        }
    }

    renderLibraryPicker() {
        const root = this.libraryRoot;
        if (!root) return;
        root.querySelectorAll('[data-nt-catalogue-library-kind]').forEach(button => button.classList.toggle('is-active', button.dataset.ntCatalogueLibraryKind === this.libraryState.kind));
        const host = root.querySelector('[data-nt-catalogue-library-results]');
        if (!host) return;
        if (this.libraryState.loading) {
            host.innerHTML = `<div class="nt-catalogue-library-empty"><span class="nt-catalogue-mini-spinner"></span><b>${esc(t('Loading your library…'))}</b></div>`;
            return;
        }
        const query = this.libraryState.query;
        const items = this.libraryState.items.filter(item => !query || item.search.includes(query));
        if (!items.length) {
            host.innerHTML = `<div class="nt-catalogue-library-empty"><span>${this.libraryState.kind === 'lorebook' ? icons.lore : icons.characters}</span><b>${esc(query ? t('No matching resources') : this.libraryState.kind === 'lorebook' ? t('No Lorebooks found') : t('No Character Cards found'))}</b><small>${esc(query ? t('Try another search.') : t('Your SillyTavern library has no resource of this type yet.'))}</small></div>`;
            return;
        }
        host.innerHTML = `<div class="nt-catalogue-library-grid">${items.map(item => {
            if (item.kind === 'character_card') {
                return `<button type="button" class="nt-catalogue-library-item character" data-nt-catalogue-library-item="${esc(item.id)}">
                    <span class="nt-catalogue-library-thumb">${item.imageUrl ? `<img src="${esc(item.imageUrl)}" alt="">` : icons.characters}</span>
                    <span class="nt-catalogue-library-item-copy"><b>${esc(item.name)}</b><small>${esc(item.creator ? `${t('Creator')}: ${item.creator}` : t('Character Card'))}</small></span>
                    <span class="nt-catalogue-library-use">${esc(t('Use'))}</span>
                </button>`;
            }
            return `<button type="button" class="nt-catalogue-library-item lorebook" data-nt-catalogue-library-item="${esc(item.id)}">
                <span class="nt-catalogue-library-thumb">${icons.lore}</span>
                <span class="nt-catalogue-library-item-copy"><b>${esc(item.name)}</b><small>${esc(t('Lorebook'))}</small></span>
                <span class="nt-catalogue-library-use">${esc(t('Use'))}</span>
            </button>`;
        }).join('')}</div>`;
    }

    async fileFromLibraryItem(item) {
        const context = window.SillyTavern?.getContext?.();
        if (item.kind === 'character_card') {
            const character = context?.characters?.[item.chid];
            const avatar = String(character?.avatar || item.avatar || '').trim();
            if (!character || !avatar) throw new Error(t('Could not export this Character Card.'));
            const response = await fetch('/api/characters/export', {
                method: 'POST',
                headers: context?.getRequestHeaders?.() || { 'Content-Type': 'application/json' },
                body: JSON.stringify({ format: 'png', avatar_url: avatar }),
            });
            if (!response.ok) throw new Error(t('Could not export this Character Card.'));
            const blob = await response.blob();
            return new File([blob], safeLocalFileName(item.name, 'png'), { type: 'image/png' });
        }

        let data = null;
        try {
            const module = await import('/scripts/world-info.js');
            data = await module.loadWorldInfo?.(item.fileId);
        } catch (_) {}
        if (!data) {
            const response = await fetch('/api/worldinfo/get', {
                method: 'POST',
                headers: context?.getRequestHeaders?.() || { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: item.fileId }),
            });
            if (response.ok) data = await response.json();
        }
        if (!data || typeof data !== 'object') throw new Error(t('Could not load this Lorebook.'));
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        return new File([blob], safeLocalFileName(item.name, 'json'), { type: 'application/json' });
    }

    async selectLibraryItem(itemId) {
        const item = this.libraryState.items.find(candidate => candidate.id === itemId);
        if (!item) return;
        const button = this.libraryRoot?.querySelector(`[data-nt-catalogue-library-item="${CSS.escape(itemId)}"]`);
        button?.setAttribute('disabled', '');
        button?.classList.add('is-loading');
        try {
            const file = await this.fileFromLibraryItem(item);
            await this.selectUploadFile(file);
            this.closeLibraryPicker();
            const kind = this.uploadRoot?.querySelector('[data-nt-catalogue-upload-kind]');
            if (kind) kind.value = item.kind;
        } catch (error) {
            console.error('[NastyTavern] Could not prepare library resource for catalogue upload.', error);
            this.toast?.(error?.message || t('Could not load this resource.'));
        } finally {
            button?.removeAttribute('disabled');
            button?.classList.remove('is-loading');
        }
    }

    async confirmReplacement(payload = {}) {
        this.confirmRoot?.remove();
        this.confirmRoot = null;
        return await new Promise(resolve => {
            const isOriginal = payload?.replace_scope === 'original';
            const { root, body } = createModalShell({
                id: 'nt-catalogue-replace-confirm',
                title: isOriginal ? t('Replace original card data?') : t('Replace your modification?'),
                subtitle: t('The original Character Card image is permanent and will not be changed.'),
                icon: icons.alertWarning,
                size: 'compact',
                modalClass: 'nt-catalogue-replace-modal',
                bodyClass: 'nt-catalogue-replace-body',
                closeAttrs: { 'data-nt-catalogue-replace-cancel': '' },
            });
            const imageWarning = payload?.incoming_image_differs
                ? `<div class="nt-catalogue-replace-image-warning"><span>${icons.info}</span><div><b>${esc(t('Different image detected'))}</b><small>${esc(t('Only the metadata will be replaced. Nasty Catalogue will keep the original PNG unchanged.'))}</small></div></div>`
                : '';
            body.innerHTML = `
                <div class="nt-catalogue-replace-summary">
                    <span>${isOriginal ? icons.characters : icons.edit}</span>
                    <div>
                        <b>${esc(payload?.replace_target_title || t('Existing catalogue version'))}</b>
                        <small>${esc(isOriginal
                            ? t('Your Community username matches the original creator stored for this lineage.')
                            : t('You already have a modification published under this Community account.'))}</small>
                    </div>
                </div>
                ${imageWarning}
                <div class="nt-catalogue-replace-tracking">
                    <div><small>${esc(t('NT UUID'))}</small><code>${esc(payload?.nt_uuid || '—')}</code></div>
                    <div><small>${esc(t('Original creator'))}</small><b>${esc(payload?.nt_creator || 'unknown')}</b></div>
                </div>
                <div class="nt-catalogue-replace-actions">
                    <button type="button" data-nt-catalogue-replace-cancel>${esc(t('Keep existing'))}</button>
                    <button type="button" class="primary" data-nt-catalogue-replace-confirm>${esc(t('Replace my data'))}</button>
                </div>`;
            let settled = false;
            const finish = value => {
                if (settled) return;
                settled = true;
                hideModalShell(root, { immediate: false });
                setTimeout(() => root.remove(), 180);
                if (this.confirmRoot === root) this.confirmRoot = null;
                resolve(value);
            };
            root.addEventListener('click', event => {
                if (event.target.closest('[data-nt-catalogue-replace-confirm]')) return finish(true);
                if (event.target.closest('[data-nt-catalogue-replace-cancel]')) return finish(false);
            });
            document.body.append(root);
            this.confirmRoot = root;
            showModalShell(root);
            setTimeout(() => root.querySelector('[data-nt-catalogue-replace-confirm]')?.focus(), 30);
        });
    }

    async submitUpload(form) {
        if (!this.pendingFile) return;
        const submit = form.querySelector('[data-nt-catalogue-submit]');
        const original = submit?.innerHTML;
        const setBusy = busy => {
            if (!submit) return;
            submit.disabled = busy;
            submit.innerHTML = busy ? `<span class="nt-catalogue-mini-spinner"></span><span>${esc(t('Submitting…'))}</span>` : (original || `${icons.upload}<span>${esc(t('Submit for review'))}</span>`);
        };
        const buildData = (confirmReplace = false) => {
            const data = new FormData(form);
            data.set('action', 'upload');
            data.set('file', this.pendingFile, this.pendingFile.name);
            if (confirmReplace) data.set('confirm_replace', 'true');
            data.set('metadata', JSON.stringify({
                source: 'NastyTavern',
                uploaded_at: new Date().toISOString(),
                detected_nt_uuid: this.pendingInfo?.ntUuid || null,
                detected_nt_creator: this.pendingInfo?.ntCreator || null,
                declared_content_rating: String(form.elements?.content_rating?.value || 'sfw').toLowerCase() === 'nsfw' ? 'nsfw' : 'sfw',
            }));
            return data;
        };
        const complete = async result => {
            if (!result?.item) throw new Error(t('Upload failed.'));
            if (result.replaced) this.toast?.(t('Your updated version was submitted for moderator review.'));
            else this.toast?.(t('Submitted to Nasty Catalogue for moderator review.'));
            if (result.image_ignored) this.toast?.(t('The uploaded image was different, so Nasty Catalogue kept the original PNG unchanged.'));
            this.closeUpload();
            await Promise.all([this.loadStatus(), this.loadModerationCount()]);
            this.applySection('mine');
        };

        setBusy(true);
        try {
            // Fast duplicate guard before sending the file to the Edge Function/R2.
            // The database also enforces this server-side, so bypassing the UI
            // cannot create an exact SHA duplicate.
            try {
                const client = this.client || await this.community.makeClient();
                const sha = await sha256Hex(this.pendingFile);
                const { data: duplicate, error: duplicateError } = await client.rpc('nt_catalog_sha_exists', { p_sha: sha });
                if (duplicateError) throw duplicateError;
                if (duplicate === true) {
                    const failure = new Error(t('Duplicate detected: this exact resource already exists in Nasty Catalogue. Upload is not allowed.'));
                    failure.code = 'DUPLICATE_SHA';
                    throw failure;
                }
            } catch (error) {
                if (error?.code === 'DUPLICATE_SHA') throw error;
                // If the preflight check itself is unavailable, continue. The
                // server-side duplicate constraint remains authoritative.
                console.warn('[NastyTavern] Catalogue duplicate preflight unavailable:', error);
            }

            // Canonical duplicate preflight ignores tracking metadata. This catches
            // the same card re-exported with a different file SHA before R2 upload.
            try {
                const resource = this.pendingInfo?.resource;
                if (resource && typeof resource === 'object') {
                    const client = this.client || await this.community.makeClient();
                    const { data: canonicalData, error: canonicalError } = await client.rpc('nt_catalog_make_canonical', { p_payload: resource });
                    if (canonicalError) throw canonicalError;
                    const canonical = Array.isArray(canonicalData) ? canonicalData[0] : canonicalData;
                    const embeddedLineage = String(this.pendingInfo?.ntUuid || '').trim();
                    const lineageHint = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(embeddedLineage) ? embeddedLineage : null;
                    const { data: candidates, error: copyError } = await client.rpc('nt_catalog_detect_copy', {
                        p_canonical_sha: canonical?.canonical_sha || null,
                        p_canonical_text: canonical?.canonical_text || '',
                        p_kind: String(form.elements.kind.value || this.pendingInfo?.kind || 'character_card'),
                        p_exclude_nt_uuid: lineageHint,
                    });
                    if (copyError) throw copyError;
                    const exact = (candidates || []).find(row => row?.exact);
                    if (exact) {
                        const failure = new Error(t('Duplicate detected: the same card data already exists in Nasty Catalogue. Upload is not allowed.'));
                        failure.code = 'CANONICAL_DUPLICATE';
                        throw failure;
                    }
                }
            } catch (error) {
                if (error?.code === 'CANONICAL_DUPLICATE') throw error;
                console.warn('[NastyTavern] Catalogue canonical duplicate preflight unavailable:', error);
            }

            try {
                const result = await this.invoke(buildData(false));
                await complete(result);
            } catch (error) {
                const duplicateMessage = String(error?.message || '');
                if (error?.code === 'DUPLICATE_SHA' || error?.code === 'CANONICAL_DUPLICATE' || duplicateMessage.includes('Duplicate detected: this exact resource already exists in Nasty Catalogue') || duplicateMessage.includes('same canonical card data already exists')) {
                    throw new Error(t('Duplicate detected: this exact resource already exists in Nasty Catalogue. Upload is not allowed.'));
                }
                if (error?.code !== 'REPLACE_CONFIRMATION_REQUIRED') throw error;
                setBusy(false);
                const confirmed = await this.confirmReplacement(error.payload || {});
                if (!confirmed) return;
                setBusy(true);
                const result = await this.invoke(buildData(true));
                await complete(result);
            }
        } catch (error) {
            this.toast?.(error?.message || String(error));
        } finally {
            setBusy(false);
        }
    }

    async fetchItemBlob(item, purpose = 'inspect') {
        if (!item?.id) throw new Error(t('Catalogue item not found.'));
        const blob = await this.invokeBinary({ action: 'file', item_id: item.id, purpose });
        const result = blob instanceof Blob ? blob : new Blob([blob]);
        const ext = String(item.file_extension || '').toLowerCase();

        // Validate the exact bytes before handing them to Download or the
        // native SillyTavern importer. This prevents an API error body or an
        // accidentally decoded response from being saved as a .png/.json.
        if (ext === 'png') {
            const head = new Uint8Array(await result.slice(0, 8).arrayBuffer());
            const png = [137, 80, 78, 71, 13, 10, 26, 10];
            if (head.length !== 8 || png.some((value, index) => head[index] !== value)) {
                throw new Error(t('Nasty Catalogue returned an invalid PNG.'));
            }
        } else if (ext === 'json' || ext === 'lorebook') {
            try {
                JSON.parse(await result.text());
            } catch (_) {
                throw new Error(t('Nasty Catalogue returned an invalid JSON resource.'));
            }
        }
        return result;
    }

    async fetchItemResourceData(item) {
        if (!item?.id) throw new Error(t('Catalogue item not found.'));
        const client = this.client || await this.community?.makeClient?.();
        if (!client) throw new Error(t('Community connection unavailable.'));
        const { data, error } = await client
            .from('nt_catalog_items')
            .select('resource_payload')
            .eq('id', item.id)
            .maybeSingle();
        if (error) throw error;
        const resource = data?.resource_payload;
        if (resource && typeof resource === 'object' && Object.keys(resource).length) return resource;

        // Legacy fallback only: newer catalogue entries keep their metadata in Supabase,
        // so View Card never has to decode the reconstructed PNG just to display details.
        const blob = await this.fetchItemBlob(item, 'inspect');
        return await readResourceData(blob, item.file_name || '');
    }

    async getItemPreviewUrl(item) {
        if (!item || item.kind !== 'character_card' || String(item.file_extension || '').toLowerCase() !== 'png') return '';
        if (item.preview_url) return item.preview_url;
        try {
            const result = await this.invoke({ action: 'preview_batch', item_ids: [item.id] });
            const url = result?.urls?.[item.id] || '';
            if (url) item.preview_url = url;
            return url;
        } catch (_) {
            return '';
        }
    }

    applyItemStats(item, patch = {}) {
        if (!item) return;
        Object.assign(item, patch);
        const cached = this.items.find(entry => entry.id === item.id);
        if (cached && cached !== item) Object.assign(cached, patch);
    }

    async recordAcquisition(item, action = 'import') {
        if (!item?.id) return null;
        if (item.moderation_status && item.moderation_status !== 'approved') return null;
        const client = this.client || await this.community.makeClient();
        const { data, error } = await client.rpc('nt_catalog_record_my_acquisition', {
            p_item: item.id,
            p_action: action === 'download' ? 'download' : 'import',
        });
        if (error) throw error;
        const row = Array.isArray(data) ? data[0] : data;
        if (row) {
            this.applyItemStats(item, { downloads: Number(row.downloads || 0) });
            this.syncDetailDownloads(item);
        }
        return row;
    }

    async downloadItem(item) {
        if (!item) return;
        try {
            const blob = await this.fetchItemBlob(item, 'download');
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = item.file_name || item.title;
            document.body.append(anchor);
            anchor.click();
            anchor.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1500);
            await this.recordAcquisition(item, 'download');
            this.renderItems();
        } catch (error) { this.toast?.(error?.message || String(error)); }
    }

    async importItem(item) {
        if (!item) return;
        try {
            const blob = await this.fetchItemBlob(item, 'import');
            const file = new File([blob], item.file_name || `${item.title}.${item.file_extension || 'json'}`, {
                type: item.mime_type || blob.type || (item.file_extension === 'png' ? 'image/png' : 'application/json'),
            });
            const selector = item.kind === 'lorebook' ? '#world_import_file' : '#character_import_file';
            const input = document.querySelector(selector);
            if (!input) throw new Error(t('SillyTavern import control was not found.'));
            const dt = new DataTransfer();
            dt.items.add(file);
            input.files = dt.files;
            input.dispatchEvent(new Event('change', { bubbles: true }));
            await this.recordAcquisition(item, 'import');
            this.characterDetails?.close?.({ restoreFocus: false });
            this.close();
            this.toast?.(item.kind === 'lorebook' ? t('Lorebook sent to SillyTavern importer.') : t('Character Card sent to SillyTavern importer.'));
        } catch (error) { this.toast?.(error?.message || String(error)); }
    }

    async loadLineage(item) {
        const result = await this.invoke({ action: 'lineage', item_id: item.id });
        const versions = Array.isArray(result?.versions) ? result.versions : [];
        if (!versions.length) return [item];
        versions.forEach(version => {
            version.kind = version.kind || item.kind;
            version.mime_type = version.mime_type || (version.file_extension === 'png' ? 'image/png' : 'application/json');
        });
        if (this.client) {
            const ids = versions.map(version => version.id).filter(Boolean);
            if (ids.length) {
                const [{ data: ratingRows }, { data: moderationRows }] = await Promise.all([
                    this.client.from('nt_catalog_ratings').select('item_id,rating').in('item_id', ids),
                    this.client.from('nt_catalog_items').select('id,moderation_status,declared_content_rating,content_rating,moderation_note,submitted_at,copy_risk_score,copy_source_item').in('id', ids),
                ]);
                const ratings = new Map((ratingRows || []).map(row => [row.item_id, Number(row.rating || 0)]));
                const moderation = new Map((moderationRows || []).map(row => [row.id, row]));
                versions.forEach(version => {
                    version.my_rating = ratings.get(version.id) || 0;
                    if (moderation.has(version.id)) Object.assign(version, moderation.get(version.id));
                });
            }
        }
        return versions;
    }

    detailVersionLabel(version, index, originalId) {
        if (version.id === originalId) return t('Original');
        const role = String(version.variant_role || '');
        const creator = String(version.publisher_name || version.nt_creator || t('Unknown')).trim() || t('Unknown');
        if (role === 'creator_revision') return `${t('Creator update')} · ${creator}`;
        if (role === 'community_modification') return `${t('Modification')} · ${creator}`;
        return `${t('Version')} ${index + 1} · ${creator}`;
    }

    detailAvatarRatingMarkup(item) {
        const average = Math.max(0, Math.min(5, Number(item?.rating_average || 0)));
        const stars = starsHtml(average);
        const label = t('Average rating {value} out of 5', { value: average.toFixed(2) });
        return `<div class="nt-catalogue-avatar-rating" data-nt-catalogue-avatar-rating title="${esc(label)}" aria-label="${esc(label)}">
            <span class="nt-catalogue-avatar-rating-stars">${stars}</span>
            <b data-nt-catalogue-avatar-rating-value>${average.toFixed(1)}</b>
        </div>`;
    }

    detailRatingMarkup(item) {
        const own = item.owner_id === this.user?.id;
        const mine = Number(item.my_rating || 0);
        const average = Number(item.rating_average || 0);
        const count = Number(item.rating_count || 0);
        const star = '<span class="nt-catalogue-rate-star" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="m12 2.8 2.76 5.59 6.17.9-4.46 4.35 1.05 6.14L12 16.88 6.48 19.78l1.05-6.14L3.07 9.29l6.17-.9L12 2.8Z"/></svg></span>';
        return `<div class="nt-catalogue-detail-rating" data-nt-catalogue-detail-rating>
            <div class="nt-catalogue-detail-rating-head"><small>${esc(t('Rate this resource'))}</small><em>${average.toFixed(1)} · ${count} ${esc(t('ratings'))}</em></div>
            <div class="nt-catalogue-detail-rate-stars" role="group" aria-label="${esc(t('Rate this resource'))}">${Array.from({ length: 5 }, (_, index) => {
                const value = index + 1;
                const selected = mine >= value;
                return `<button type="button" data-nt-character-details-action="catalogue-rate-${value}" class="${selected ? 'is-selected' : ''}" ${own ? 'disabled' : ''} title="${esc(t('Rate {value} stars', { value }))}" aria-label="${esc(t('Rate {value} stars', { value }))}" aria-pressed="${mine === value}">${star}</button>`;
            }).join('')}</div>
            ${own ? `<small class="nt-catalogue-detail-own-rating-note">${esc(t('You cannot rate your own upload.'))}</small>` : ''}
        </div>`;
    }

    detailCoverMarkup(item, family) {
        const versions = Array.isArray(family) && family.length ? family : [item];
        const original = versions.find(version => ['original', 'legacy_original', 'unknown_origin'].includes(String(version.variant_role || ''))) || versions[0] || item;
        const isOriginal = item.id === original.id;
        const originalCreator = String(original.nt_creator || item.nt_creator || 'unknown').trim() || 'unknown';
        const versionCreator = String(item.publisher_name || item.nt_creator || 'unknown').trim() || 'unknown';
        const versionPicker = versions.length > 1 ? `<label class="nt-catalogue-detail-version-picker">
            <span>${esc(t('Version'))}</span>
            <select data-nt-catalogue-detail-version aria-label="${esc(t('Version'))}">
                ${versions.map((version, index) => `<option value="${esc(version.id)}" ${version.id === item.id ? 'selected' : ''}>${esc(this.detailVersionLabel(version, index, original.id))}</option>`).join('')}
            </select>
        </label>` : '';
        return `<div class="nt-catalogue-detail-cover-info">
            ${versionPicker}
            <div class="nt-catalogue-detail-creators">
                <div><small>${esc(t('Original creator'))}</small><b>${originalCreator.toLowerCase() === 'unknown' ? esc(originalCreator) : `<button type="button" data-nt-catalogue-creator="${esc(originalCreator)}">${esc(originalCreator)}</button>`}</b></div>
                ${isOriginal ? '' : `<div><small>${esc(t('Version creator'))}</small><b>${versionCreator.toLowerCase() === 'unknown' ? esc(versionCreator) : `<button type="button" data-nt-catalogue-creator="${esc(versionCreator)}">${esc(versionCreator)}</button>`}</b></div>`}
            </div>
            <div class="nt-catalogue-detail-community-stats">
                <div class="nt-catalogue-detail-acquisitions" title="${esc(t('Unique imports/downloads'))}">
                    <span>${icons.download}</span>
                    <div><b data-nt-catalogue-detail-downloads>${Number(item.downloads || 0).toLocaleString()}</b><small>${esc(t('Unique imports/downloads'))}</small></div>
                </div>
                ${this.detailRatingMarkup(item)}
            </div>
        </div>`;
    }

    syncDetailAvatarRating(item) {
        const root = this.characterDetails?.root;
        if (!root || root.hidden) return;
        const panel = root.querySelector('[data-nt-catalogue-avatar-rating]');
        if (!panel) return;
        const replacement = document.createElement('div');
        replacement.innerHTML = this.detailAvatarRatingMarkup(item);
        panel.replaceWith(replacement.firstElementChild);
    }

    syncDetailRating(item) {
        const root = this.characterDetails?.root;
        if (!root || root.hidden) return;
        const panel = root.querySelector('[data-nt-catalogue-detail-rating]');
        if (panel) {
            const replacement = document.createElement('div');
            replacement.innerHTML = this.detailRatingMarkup(item);
            panel.replaceWith(replacement.firstElementChild);
        }
        this.syncDetailAvatarRating(item);
    }

    syncDetailDownloads(item) {
        const root = this.characterDetails?.root;
        if (!root || root.hidden) return;
        const value = root.querySelector('[data-nt-catalogue-detail-downloads]');
        if (value) value.textContent = Number(item.downloads || 0).toLocaleString();
    }

    async openItemDetails(item, opener = null, prefetchedFamily = null) {
        if (!item || !this.characterDetails) return;
        try {
            const family = prefetchedFamily || await this.loadLineage(item);
            const liveItem = family.find(version => version.id === item.id) || item;
            const previousDetailTimer = this.activeDetail?.refreshTimer || null;
            const resource = await this.fetchItemResourceData(liveItem);
            if (!resource) throw new Error(t('Could not read this resource metadata.'));
            if (this.detailObjectUrl) URL.revokeObjectURL(this.detailObjectUrl);
            this.detailObjectUrl = null;
            const detailPreviewUrl = await this.getItemPreviewUrl(liveItem);
            const ratingActions = Array.from({ length: 5 }, (_, index) => {
                const value = index + 1;
                return {
                    id: `catalogue-rate-${value}`,
                    label: `${value}/5`,
                    hidden: true,
                    close: false,
                    run: async () => {
                        await this.rateItem(liveItem, value, { rerender: false });
                        this.syncDetailRating(liveItem);
                    },
                };
            });
            const moderationActions = !this.isModerator ? [] : liveItem.moderation_status === 'pending' ? [
                { id: 'catalogue-approve-sfw', label: t('SFW'), icon: icons.check, primary: true, close: false, run: async () => this.moderateItem(liveItem, 'approve', 'sfw') },
                { id: 'catalogue-approve-nsfw', label: t('NSFW'), icon: icons.check, close: false, run: async () => this.moderateItem(liveItem, 'approve', 'nsfw') },
                { id: 'catalogue-reject-review', label: t('Reject'), icon: icons.close, destructive: true, close: false, run: async () => this.moderateItem(liveItem, 'reject') },
            ] : liveItem.moderation_status === 'approved' ? [
                { id: 'catalogue-switch-content-rating', label: this.contentRatingLabel(liveItem) === 'SFW' ? t('Switch to NSFW') : t('Switch to SFW'), icon: icons.refresh, close: false, run: async () => this.reclassifyItem(liveItem, this.contentRatingLabel(liveItem) === 'SFW' ? 'nsfw' : 'sfw') },
            ] : [];
            const actions = [
                ...moderationActions,
                ...(this.isModerator && liveItem.copy_source_item ? [{ id: 'catalogue-copy-source', label: `${t('Possible copy')} · ${Math.round(Number(liveItem.copy_risk_score || 0) * 100)}%`, icon: icons.copy, close: false, run: async () => this.openItemById(liveItem.copy_source_item) }] : []),
                { id: 'catalogue-import', label: t('Import'), icon: icons.download, primary: !this.isModerator, run: async () => this.importItem(liveItem) },
                { id: 'catalogue-download', label: t('Download'), icon: icons.download, close: false, run: async () => this.downloadItem(liveItem) },
                ...((String(liveItem.moderation_status || 'approved') === 'approved') ? [{ id: 'catalogue-collection', label: t('Add to collection'), icon: icons.bookmark, close: false, run: async () => this.openCollectionPicker(liveItem) }] : []),
                ...((liveItem.owner_id !== this.user?.id && String(liveItem.moderation_status || 'approved') === 'approved') ? [{ id: 'catalogue-report', label: t('Report'), icon: icons.alertWarning, close: false, run: async () => this.openReportModal(liveItem) }] : []),
                ...(this.canDeleteItem(liveItem) ? [{ id: 'catalogue-delete', label: t('Delete'), icon: icons.trash, destructive: true, run: async () => this.deleteItem(liveItem) }] : []),
                ...ratingActions,
            ];
            this.characterDetails.open({
                kind: liveItem.kind === 'lorebook' ? 'lorebook' : 'character',
                card: liveItem.kind === 'lorebook' ? null : resource,
                lorebook: liveItem.kind === 'lorebook' ? resource : null,
                title: liveItem.title,
                imageUrl: detailPreviewUrl || liveItem.preview_url || '',
                context: 'catalogue',
                contextLabel: t('Nasty Catalogue'),
                metaItems: [],
                topHtml: '',
                coverOverlayHtml: liveItem.kind === 'character_card' ? this.detailAvatarRatingMarkup(liveItem) : '',
                coverBelowHtml: this.detailCoverMarkup(liveItem, family),
                hideCharacterStats: true,
                actions,
                opener,
                onClose: () => {
                    if (this.detailObjectUrl) URL.revokeObjectURL(this.detailObjectUrl);
                    this.detailObjectUrl = null;
                    if (this.activeDetail?.refreshTimer) window.clearTimeout(this.activeDetail.refreshTimer);
                    this.activeDetail = null;
                },
            });
            this.activeDetail = { item: liveItem, family, opener, refreshTimer: previousDetailTimer };
            const versionSelect = this.characterDetails.root?.querySelector('[data-nt-catalogue-detail-version]');
            versionSelect?.addEventListener('change', event => {
                const version = family.find(entry => entry.id === event.currentTarget.value);
                if (version) void this.openItemDetails(version, opener, family);
            });
            this.characterDetails.root?.querySelectorAll('[data-nt-catalogue-creator]').forEach(button => button.addEventListener('click', event => {
                event.preventDefault(); event.stopPropagation(); const name = button.dataset.ntCatalogueCreator; if (name) void this.openCreatorPage(name);
            }));
        } catch (error) {
            this.toast?.(error?.message || String(error));
        }
    }

    async moderateItem(item, decision, contentRating = null) {
        if (!this.isModerator || !item?.id) return;
        if (decision === 'reject') {
            const value = window.prompt(t('Reason for rejection') + ':', '');
            if (value === null) return;
            const reason = String(value || '').trim().slice(0, 1000);
            if (!reason) {
                this.toast?.(t('A rejection reason is required.'));
                return;
            }
            try {
                const result = await this.invoke({ action: 'reject', item_id: item.id, reason }, 'nasty-catalogue-delete');
                this.toast?.(t('Upload rejected and removed from the catalogue.'));
                if (this.activeDetail?.item && (this.activeDetail.item.id === item.id || (result?.deleted_scope === 'lineage' && this.activeDetail.item.nt_uuid === item.nt_uuid))) {
                    this.characterDetails?.close?.({ restoreFocus: false });
                }
                await Promise.all([this.loadStatus(), this.loadModerationCount()]);
                if (this.state.section === 'moderation') await this.loadModerationQueue();
                else await this.loadItems();
            } catch (error) {
                this.toast?.(error?.message || String(error));
            }
            return;
        }

        try {
            const client = this.client || await this.community.makeClient();
            const { data, error } = await client.rpc('nt_catalog_moderate_item', {
                p_item: item.id,
                p_decision: 'approve',
                p_content_rating: contentRating === 'nsfw' ? 'nsfw' : 'sfw',
                p_note: '',
            });
            if (error) throw error;
            const row = Array.isArray(data) ? data[0] : data;
            if (row) Object.assign(item, row);
            this.toast?.(`${t('Approved')} · ${String(contentRating || 'sfw').toUpperCase()}`);
            await this.loadModerationCount();
            if (this.activeDetail?.item?.id === item.id) this.scheduleActiveDetailRefresh(0);
            if (this.state.section === 'moderation') await this.loadModerationQueue();
            else await this.loadItems();
        } catch (error) {
            this.toast?.(error?.message || String(error));
        }
    }

    async reclassifyItem(item, contentRating) {
        if (!this.isModerator || !item?.id || item.moderation_status !== 'approved') return;
        const nextRating = contentRating === 'nsfw' ? 'nsfw' : 'sfw';
        try {
            const client = this.client || await this.community.makeClient();
            const { data, error } = await client.rpc('nt_catalog_set_content_rating', {
                p_item: item.id,
                p_content_rating: nextRating,
            });
            if (error) throw error;
            const row = Array.isArray(data) ? data[0] : data;
            if (row) Object.assign(item, row);
            item.content_rating = nextRating;
            this.toast?.(`${t('Content rating')} · ${nextRating.toUpperCase()}`);
            if (this.activeDetail?.item?.id === item.id) this.scheduleActiveDetailRefresh(0);
            await this.loadItems({ silent: true });
        } catch (error) {
            this.toast?.(error?.message || String(error));
        }
    }

    async acknowledgeRejection(rejectionId) {
        const id = String(rejectionId || '');
        if (!id) return;
        try {
            const client = this.client || await this.community.makeClient();
            const { data, error } = await client.rpc('nt_catalog_acknowledge_rejection', { p_rejection: id });
            if (error) throw error;
            if (!data) throw new Error(t('Rejection notice not found.'));
            this.rejectionNotices = this.rejectionNotices.filter(entry => String(entry.id) !== id);
            this.renderItems();
        } catch (error) {
            this.toast?.(error?.message || String(error));
        }
    }

    async deleteItem(item) {
        if (!this.canDeleteItem(item)) return;
        const deletesLineage = this.isOriginalVersion(item);
        const message = deletesLineage
            ? t('Delete “{title}” and every version linked to it? This permanently removes the original card, all modifications, ratings and download history.', { title: item.title })
            : t('Delete “{title}” permanently?', { title: item.title });
        const confirmed = await confirmDialog(message);
        if (!confirmed) return;
        try {
            const result = await this.invoke({ action: 'delete', item_id: item.id }, 'nasty-catalogue-delete');
            const deletedCount = Math.max(1, Number(result?.deleted_count || 1));
            this.toast?.(result?.deleted_scope === 'lineage'
                ? t('{count} catalogue versions deleted.', { count: deletedCount })
                : t('Catalogue item deleted.'));
            if (this.activeDetail?.item && (this.activeDetail.item.id === item.id || (result?.deleted_scope === 'lineage' && this.activeDetail.item.nt_uuid === item.nt_uuid))) {
                this.characterDetails?.close?.({ restoreFocus: false });
            }
            await Promise.all([this.loadStatus(), this.isModerator ? this.loadModerationCount() : Promise.resolve()]);
            if (this.state.section === 'moderation' && this.isModerator) await this.loadModerationQueue();
            else await this.loadItems();
        } catch (error) { this.toast?.(error?.message || String(error)); }
    }

    async rateItem(item, rating, { rerender = true } = {}) {
        if (!item || item.owner_id === this.user?.id) {
            if (item?.owner_id === this.user?.id) this.toast?.(t('You cannot rate your own upload.'));
            return;
        }
        try {
            const client = this.client || await this.community.makeClient();
            const { data, error } = await client.rpc('nt_catalog_rate_item', { p_item: item.id, p_rating: rating });
            if (error) throw error;
            const row = Array.isArray(data) ? data[0] : data;
            if (row) {
                this.applyItemStats(item, {
                    rating_average: Number(row.rating_average || 0),
                    rating_count: Number(row.rating_count || 0),
                    my_rating: Number(row.my_rating || rating),
                });
                if (rerender) this.renderItems();
            }
        } catch (error) { this.toast?.(error?.message || String(error)); }
    }

    async reloadCurrentSection({ silent = false } = {}) {
        if (this.state.section === 'moderation') return this.loadModerationQueue({ silent });
        if (this.state.section === 'reports') return this.loadReports({ silent });
        if (this.state.section === 'audit') return this.loadAudit({ silent });
        if (this.state.section === 'collections') return this.loadCollections({ silent });
        if (this.state.section === 'collection' && this.activeCollection) return this.openCollection(this.activeCollection, { silent });
        if (this.state.section === 'creator' && this.state.creator) return this.openCreatorPage(this.state.creator, { silent });
        return this.loadItems({ silent });
    }

    onInput(event) {
        const search = event.target.closest('[data-nt-catalogue-search]');
        if (!search) return;
        this.state.query = String(search.value || '').trim();
        if (this.state.query && ['collections','collection','creator','reports','audit','moderation'].includes(this.state.section)) {
            this.state.section = 'discover'; this.state.owner = null; this.state.kind = 'all'; this.state.offset = 0;
            this.root?.querySelectorAll('[data-nt-catalogue-section]').forEach(button => button.classList.toggle('is-active', button.dataset.ntCatalogueSection === 'discover'));
            const config = this.sectionConfig('discover');
            const heading = this.root?.querySelector('[data-nt-catalogue-heading]'); if (heading) heading.textContent = config.label;
            const summary = this.root?.querySelector('[data-nt-catalogue-summary]'); if (summary) summary.textContent = config.summary;
        }
        if (this.state.query && this.state.sort === 'popular') {
            this.state.sort = 'relevance';
            const sort = this.root?.querySelector('[data-nt-catalogue-sort]'); if (sort) sort.value = 'relevance';
        }
        this.searchDebounced();
    }

    onChange(event) {
        const kind = event.target.closest('[data-nt-catalogue-kind]');
        if (kind) { this.state.kind = kind.value; this.state.owner = null; this.state.section = 'discover'; this.state.offset = 0; return void this.loadItems(); }
        const sort = event.target.closest('[data-nt-catalogue-sort]');
        if (sort) { this.state.sort = sort.value; this.state.offset = 0; if (['collections','collection','creator','reports','audit'].includes(this.state.section)) { this.state.section = 'discover'; const config=this.sectionConfig('discover'); const heading=this.root?.querySelector('[data-nt-catalogue-heading]'); if(heading)heading.textContent=config.label; const summary=this.root?.querySelector('[data-nt-catalogue-summary]'); if(summary)summary.textContent=config.summary; } return void this.reloadCurrentSection(); }
        const contentRating = event.target.closest('[data-nt-catalogue-content-rating]');
        if (contentRating) { this.state.contentRating = contentRating.value; this.state.offset = 0; return void this.reloadCurrentSection(); }
    }

    onClick(event) {
        if (event.target.closest('[data-nt-catalogue-close]')) return this.close();
        if (event.target.closest('[data-nt-catalogue-nav-toggle]')) return this.root?.classList.add('show-library');
        if (event.target.closest('[data-nt-catalogue-nav-close]')) return this.root?.classList.remove('show-library');
        if (event.target.closest('[data-nt-catalogue-refresh]')) return void Promise.all([this.loadStatus(), this.loadModerationCount(), this.loadReportCount(), this.reloadCurrentSection()]);
        if (event.target.closest('[data-nt-catalogue-upload]')) return void this.openUpload();

        const creator = event.target.closest('[data-nt-catalogue-creator]');
        if (creator) { event.preventDefault(); event.stopPropagation(); return void this.openCreatorPage(creator.dataset.ntCatalogueCreator); }

        const newCollection = event.target.closest('[data-nt-catalogue-new-collection]');
        if (newCollection) return this.openCollectionEditor();
        const editCollection = event.target.closest('[data-nt-catalogue-edit-collection]');
        if (editCollection) { event.preventDefault(); event.stopPropagation(); const c=this.collections.find(row=>row.id===editCollection.dataset.ntCatalogueEditCollection)||this.activeCollection; return this.openCollectionEditor(c); }
        const deleteCollection = event.target.closest('[data-nt-catalogue-delete-collection]');
        if (deleteCollection) { event.preventDefault(); event.stopPropagation(); const c=this.collections.find(row=>row.id===deleteCollection.dataset.ntCatalogueDeleteCollection); return void this.deleteCollection(c); }
        const openCollection = event.target.closest('[data-nt-catalogue-open-collection]');
        if (openCollection) { const id=openCollection.dataset.ntCatalogueOpenCollection; const c=[...(this.collections||[]),...(this.publicCollections||[])].find(row=>row.id===id); if(c)return void this.openCollection(c); }

        const reportView = event.target.closest('[data-nt-report-view]');
        if (reportView) { const row=this.reportRows.find(r=>r.report_id===reportView.dataset.ntReportView); if(row?.item)return void this.openItemDetails(row.item,reportView); }
        const reportResolve = event.target.closest('[data-nt-report-resolve]');
        if (reportResolve) { const row=this.reportRows.find(r=>r.report_id===reportResolve.dataset.ntReportResolve); return void this.resolveReport(row,'resolved'); }
        const reportDismiss = event.target.closest('[data-nt-report-dismiss]');
        if (reportDismiss) { const row=this.reportRows.find(r=>r.report_id===reportDismiss.dataset.ntReportDismiss); return void this.resolveReport(row,'dismissed'); }
        const reportDelete = event.target.closest('[data-nt-report-delete]');
        if (reportDelete) { const row=this.reportRows.find(r=>r.report_id===reportDelete.dataset.ntReportDelete); if(row?.item)return void this.deleteItem(row.item); }

        const section = event.target.closest('[data-nt-catalogue-section]');
        if (section) {
            const targetSection = section.dataset.ntCatalogueSection;
            if (['moderation','reports','audit'].includes(targetSection) && !this.isModerator) return;
            return this.applySection(targetSection);
        }
        if (event.target.closest('[data-nt-catalogue-prev]')) { this.state.offset = Math.max(0, this.state.offset - this.state.limit); return void this.reloadCurrentSection(); }
        if (event.target.closest('[data-nt-catalogue-next]')) { this.state.offset += this.state.limit; return void this.reloadCurrentSection(); }
        const acknowledge = event.target.closest('[data-nt-catalogue-ack-rejection]');
        if (acknowledge) return void this.acknowledgeRejection(acknowledge.dataset.ntCatalogueAckRejection);
        const copySource = event.target.closest('[data-nt-catalogue-copy-source]');
        if (copySource) { event.preventDefault(); event.stopPropagation(); return void this.openItemById(copySource.dataset.ntCatalogueCopySource); }

        const article = event.target.closest('[data-nt-catalogue-item]');
        if (!article) return;
        const item = this.items.find(row => row.id === article.dataset.ntCatalogueItem);
        if (!item) return;
        const approve = event.target.closest('[data-nt-catalogue-approve]');
        if (approve) return void this.moderateItem(item, 'approve', approve.dataset.ntCatalogueApprove);
        if (event.target.closest('[data-nt-catalogue-reject]')) return void this.moderateItem(item, 'reject');
        if (event.target.closest('[data-nt-catalogue-import]')) return void this.importItem(item);
        if (event.target.closest('[data-nt-catalogue-download]')) return void this.downloadItem(item);
        if (event.target.closest('[data-nt-catalogue-add-collection]')) return void this.openCollectionPicker(item);
        if (event.target.closest('[data-nt-catalogue-report]')) return this.openReportModal(item);
        if (event.target.closest('[data-nt-catalogue-collection-remove]')) return void this.removeItemFromCollection(item);
        if (event.target.closest('[data-nt-catalogue-delete]')) return void this.deleteItem(item);
        return void withViewOpeningState(article, () => this.openItemDetails(item, article));
    }
}
