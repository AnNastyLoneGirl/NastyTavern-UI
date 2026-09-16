import { icons } from './icons.js';
import { t } from './i18n.js';
import { escapeHtml as esc } from './utils.js';
import { createModalShell, showModalShell, hideModalShell } from './modal-shell.js';

const asText = value => typeof value === 'string' ? value.trim() : '';
const asArray = value => Array.isArray(value) ? value.filter(item => item !== undefined && item !== null && String(item).trim() !== '') : [];
const toEntryArray = entries => Array.isArray(entries) ? entries : (entries && typeof entries === 'object' ? Object.values(entries) : []);
const jsonForDisplay = value => { try { return JSON.stringify(value, null, 2); } catch (_) { return ''; } };

function normalizeCharacterCard(card) {
    const root = card && typeof card === 'object' ? card : {};
    const data = root?.data && typeof root.data === 'object' ? root.data : root;
    const book = data?.character_book && typeof data.character_book === 'object' ? data.character_book : null;
    return {
        root,
        data,
        name: asText(data.name || root.name) || t('Character Card'),
        ntDescription: asText(data.nt_description),
        ntContext: asText(data.nt_contexte),
        tags: asArray(data.tags || root.tags),
        description: asText(data.description || root.description),
        personality: asText(data.personality || root.personality),
        scenario: asText(data.scenario || root.scenario),
        firstMessage: asText(data.first_mes || data.first_message || root.first_mes),
        exampleMessages: asText(data.mes_example || data.example_dialogue || root.mes_example),
        creatorNotes: asText(data.creator_notes || root.creatorcomment),
        systemPrompt: asText(data.system_prompt),
        postHistory: asText(data.post_history_instructions),
        alternateGreetings: asArray(data.alternate_greetings),
        creator: asText(data.creator || root.creator),
        version: asText(data.character_version || data.version || root.character_version),
        spec: asText(root.spec || data.spec),
        specVersion: asText(root.spec_version || data.spec_version),
        ntCreator: asText(root.nt_creator),
        ntSha: asText(root.nt_sha),
        embeddedLorebookEntries: toEntryArray(book?.entries).length,
        characterBook: book,
        extensions: data.extensions && typeof data.extensions === 'object' ? data.extensions : null,
    };
}

function normalizeLorebook(lorebook, title = '') {
    const root = lorebook && typeof lorebook === 'object' ? lorebook : {};
    const entries = toEntryArray(root.entries).map((entry, index) => ({ ...(entry || {}), __index: index }));
    return {
        root,
        name: asText(title || root.name || root.world_name || root.title) || t('Lorebook'),
        entries,
        enabled: entries.filter(entry => !entry.disable).length,
        constant: entries.filter(entry => Boolean(entry.constant)).length,
        totalChars: entries.reduce((sum, entry) => sum + String(entry.content || '').length, 0),
        topLevel: Object.fromEntries(Object.entries(root).filter(([key]) => key !== 'entries')),
    };
}

export class CharacterDetailsModal {
    constructor(toast) {
        this.toast = toast;
        this.root = null;
        this.actions = new Map();
        this.opener = null;
        this.onClose = null;
    }

    ensureRoot() {
        if (this.root?.isConnected) {
            if (this.root.querySelector('.nt-modal-shell')) return this.root;
            this.root.remove();
            this.root = null;
        }
        const { root } = createModalShell({
            id: 'nt-character-details-modal',
            title: t('Character Card'),
            icon: icons.characters,
            size: 'standard',
            rootClass: 'nt-modal-layer-secondary',
            modalClass: 'nt-resource-modal-card',
            bodyClass: 'nt-resource-modal-body',
            closeAttrs: { 'data-nt-character-details-close': '' },
        });
        root.tabIndex = -1;
        root.addEventListener('click', event => {
            if (event.target === root || event.target.closest('[data-nt-character-details-close]')) {
                this.close();
                return;
            }
            const button = event.target.closest('[data-nt-character-details-action]');
            if (!button) return;
            const action = this.actions.get(button.dataset.ntCharacterDetailsAction);
            if (!action?.run) return;
            void this.runAction(action, button);
        });
        document.body.append(root);
        this.root = root;
        return root;
    }

    async runAction(action, button) {
        try {
            button.disabled = true;
            await action.run();
            if (action.close !== false) this.close({ restoreFocus: false });
        } catch (error) {
            this.toast?.(error?.message || String(error));
        } finally {
            if (button?.isConnected) button.disabled = false;
        }
    }

    section(label, value) {
        if (!String(value || '').trim()) return '';
        return `<details class="nt-resource-info-section"><summary><span>${esc(label)}</span></summary><div class="nt-resource-info-section-body"><div class="nt-resource-info-text">${esc(value)}</div></div></details>`;
    }

    renderLorebookEntries(book) {
        const entries = toEntryArray(book?.entries).map((entry, index) => ({ ...(entry || {}), __index: index }));
        if (!entries.length) return '';
        return `<details class="nt-resource-info-section nt-resource-info-entry-section"><summary><span>${t('Lorebook')}</span><em>${entries.length}</em></summary>
          <div class="nt-resource-info-section-body"><div class="nt-resource-info-entries">${entries.map((entry, index) => {
            const title = String(entry.comment || entry.name || entry.title || `${t('Entry')} ${index + 1}`).trim();
            const keys = asArray(entry.key || entry.keys);
            const secondary = asArray(entry.keysecondary || entry.secondary_keys);
            const advanced = Object.fromEntries(Object.entries(entry).filter(([key]) => !['__index','content','key','keys','keysecondary','secondary_keys','comment','name','title'].includes(key)));
            return `<details class="nt-resource-info-entry"><summary><span><b>${esc(title)}</b><small>${entry.disable ? t('Disabled') : t('Enabled')}${entry.constant ? ` · ${t('Always active')}` : ''}</small></span><em>#${index + 1}</em></summary>
              <div class="nt-resource-info-entry-body">
                ${keys.length ? `<div class="nt-resource-info-keyline"><small>${t('Primary keys')}</small><div>${keys.map(key => `<span>${esc(key)}</span>`).join('')}</div></div>` : ''}
                ${secondary.length ? `<div class="nt-resource-info-keyline"><small>${t('Secondary keys')}</small><div>${secondary.map(key => `<span>${esc(key)}</span>`).join('')}</div></div>` : ''}
                ${entry.content ? `<div class="nt-resource-info-text">${esc(entry.content)}</div>` : ''}
                ${Object.keys(advanced).length ? `<details class="nt-resource-info-advanced"><summary>${t('Advanced settings')}</summary><pre>${esc(jsonForDisplay(advanced))}</pre></details>` : ''}
              </div></details>`;
        }).join('')}</div></div></details>`;
    }

    renderTags(info) {
        return info.tags.length
            ? `<div class="nt-resource-info-tags nt-character-details-cover-tags">${info.tags.map(tag => `<span>${esc(tag)}</span>`).join('')}</div>`
            : '';
    }

    renderCharacterDetails(info, { hideStats = false } = {}) {
        const alternate = info.alternateGreetings.length
            ? `<details class="nt-resource-info-section"><summary><span>${t('Alternate Greetings')}</span><em>${info.alternateGreetings.length}</em></summary><div class="nt-resource-info-section-body"><div class="nt-resource-info-greetings">${info.alternateGreetings.map((greeting, index) => `<details><summary>${t('Greeting')} ${index + 1}</summary><div class="nt-resource-info-text">${esc(greeting)}</div></details>`).join('')}</div></div></details>`
            : '';
        const stats = [
            info.creator ? [t('Creator'), info.creator] : null,
            info.ntCreator ? [t('NT Creator'), info.ntCreator] : null,
            info.version ? [t('Version'), info.version] : null,
            info.specVersion ? [t('Card spec'), [info.spec, info.specVersion].filter(Boolean).join(' ')] : null,
        ].filter(Boolean);
        const statsHtml = !hideStats && stats.length
            ? `<div class="nt-resource-info-stats">${stats.map(([label, value]) => `<div><small>${esc(label)}</small><b>${esc(value)}</b></div>`).join('')}</div>`
            : '';

        return `${statsHtml}
            ${this.section(t('Short description'), info.ntDescription)}
            ${this.section(t('Context'), info.ntContext)}
            ${this.section(t('Description'), info.description)}
            ${this.section(t('Personality'), info.personality)}
            ${this.section(t('Scenario'), info.scenario)}
            ${this.section(t('First message'), info.firstMessage)}
            ${alternate}
            ${this.section(t('Example messages'), info.exampleMessages)}
            ${this.section(t("Creator's Notes"), info.creatorNotes)}
            ${this.section(t('System Prompt'), info.systemPrompt)}
            ${this.section(t('Post-History Instructions'), info.postHistory)}
            ${this.renderLorebookEntries(info.characterBook)}
            <details class="nt-resource-info-technical"><summary>${t('Full card data')}</summary><pre>${esc(jsonForDisplay(info.root))}</pre></details>`;
    }

    renderLorebookDetails(info) {
        const entries = info.entries || [];
        return `<div class="nt-resource-info-stats nt-resource-info-stats-lorebook">
            <div><small>${t('Entries')}</small><b>${entries.length}</b></div>
            <div><small>${t('Enabled')}</small><b>${info.enabled}</b></div>
            <div><small>${t('Always active')}</small><b>${info.constant}</b></div>
            <div><small>${t('Content size')}</small><b>${info.totalChars.toLocaleString()} ${t('characters')}</b></div>
          </div>
          <details class="nt-resource-info-section nt-resource-info-entry-section"><summary><span>${t('Lorebook')}</span><em>${entries.length}</em></summary>
            <div class="nt-resource-info-section-body"><div class="nt-resource-info-entries">${entries.length ? entries.map((entry, index) => {
                const title = String(entry.comment || entry.name || entry.title || `${t('Entry')} ${index + 1}`).trim();
                const keys = asArray(entry.key || entry.keys);
                const secondary = asArray(entry.keysecondary || entry.secondary_keys);
                const advanced = Object.fromEntries(Object.entries(entry).filter(([key]) => !['__index','content','key','keys','keysecondary','secondary_keys','comment','name','title'].includes(key)));
                return `<details class="nt-resource-info-entry"><summary><span><b>${esc(title)}</b><small>${entry.disable ? t('Disabled') : t('Enabled')}${entry.constant ? ` · ${t('Always active')}` : ''}</small></span><em>#${index + 1}</em></summary>
                  <div class="nt-resource-info-entry-body">
                    ${keys.length ? `<div class="nt-resource-info-keyline"><small>${t('Primary keys')}</small><div>${keys.map(key => `<span>${esc(key)}</span>`).join('')}</div></div>` : ''}
                    ${secondary.length ? `<div class="nt-resource-info-keyline"><small>${t('Secondary keys')}</small><div>${secondary.map(key => `<span>${esc(key)}</span>`).join('')}</div></div>` : ''}
                    ${entry.content ? `<div class="nt-resource-info-text">${esc(entry.content)}</div>` : ''}
                    ${Object.keys(advanced).length ? `<details class="nt-resource-info-advanced"><summary>${t('Advanced settings')}</summary><pre>${esc(jsonForDisplay(advanced))}</pre></details>` : ''}
                  </div></details>`;
            }).join('') : `<small>${t('No Lorebook entries found.')}</small>`}</div></div>
          </details>
          ${info.topLevel && Object.keys(info.topLevel).length ? `<details class="nt-resource-info-technical"><summary>${t('Lorebook metadata')}</summary><pre>${esc(jsonForDisplay(info.topLevel))}</pre></details>` : ''}`;
    }

    open({ kind = 'character', card = null, lorebook = null, title = '', imageUrl = '', context = 'default', contextLabel = '', metaItems = [], topHtml = '', coverOverlayHtml = '', coverBelowHtml = '', hideCharacterStats = false, actions = [], opener = null, onClose = null } = {}) {
        if (this.root && !this.root.hidden) this.close({ restoreFocus: false });
        const isLorebook = kind === 'lorebook';
        const info = isLorebook ? normalizeLorebook(lorebook, title) : normalizeCharacterCard(card);
        const root = this.ensureRoot();
        this.actions = new Map(actions.map(action => [action.id, action]));
        this.opener = opener instanceof HTMLElement ? opener : document.activeElement instanceof HTMLElement ? document.activeElement : null;
        this.onClose = typeof onClose === 'function' ? onClose : null;
        const meta = Array.isArray(metaItems) ? metaItems.filter(value => String(value || '').trim()) : [];
        const metaHtml = meta.length ? `<div class="nt-resource-modal-meta">${meta.map((value, index) => `${index ? '<i></i>' : ''}<span>${esc(value)}</span>`).join('')}</div>` : '';
        const displayTitle = title || info.name;
        const label = contextLabel || (isLorebook ? t('Lorebook') : t('Character Card'));
        const icon = isLorebook ? icons.lore : icons.characters;
        const coverOverlay = typeof coverOverlayHtml === 'string' ? coverOverlayHtml : '';
        const coverBelow = typeof coverBelowHtml === 'string' ? coverBelowHtml : '';
        const topContent = typeof topHtml === 'string' ? topHtml : '';
        const cover = isLorebook
            ? `<aside class="nt-resource-modal-cover nt-character-details-cover nt-resource-details-lorebook-cover"><div class="nt-character-details-avatar-frame">${imageUrl ? `<img src="${esc(imageUrl)}" alt="${esc(displayTitle)}">` : `<span>${icon}</span>`}${coverOverlay}</div>${coverBelow}</aside>`
            : `<aside class="nt-resource-modal-cover nt-character-details-cover"><div class="nt-character-details-avatar-frame">${imageUrl ? `<img src="${esc(imageUrl)}" alt="${esc(displayTitle)}">` : `<span>${icon}</span>`}${coverOverlay}</div>${coverBelow}${this.renderTags(info)}</aside>`;
        root.dataset.ntCharacterDetailsContext = context;
        root.dataset.ntResourceKind = isLorebook ? 'lorebook' : 'character';
        const shell = root.querySelector('.nt-modal-shell');
        const header = root.querySelector('.nt-modal-header');
        const headingCopy = root.querySelector('.nt-modal-heading-copy');
        const headingIcon = root.querySelector('.nt-modal-heading-icon');
        const titleNode = root.querySelector('[id="nt-character-details-modal-title"]');
        const body = root.querySelector('.nt-modal-body');
        shell?.classList.toggle('has-meta', Boolean(meta.length));
        if (headingIcon) headingIcon.innerHTML = icon;
        if (headingCopy) headingCopy.innerHTML = `<small class="nt-modal-eyebrow">${esc(label)}</small><b id="nt-character-details-title">${esc(displayTitle)}</b>`;
        shell?.setAttribute('aria-labelledby', 'nt-character-details-title');
        if (titleNode) titleNode.removeAttribute('id');
        header?.classList.add('nt-resource-modal-header');
        if (body) {
            body.innerHTML = `${metaHtml}${topContent}<div class="nt-resource-modal-content">${cover}<main>${isLorebook ? this.renderLorebookDetails(info) : this.renderCharacterDetails(info, { hideStats: hideCharacterStats })}</main></div>`;
        }
        root.querySelector('.nt-modal-footer')?.remove();
        const visibleActions = actions.filter(action => !action.hidden);
        if (visibleActions.length && shell) {
            const footerNode = document.createElement('footer');
            footerNode.className = 'nt-modal-footer nt-resource-modal-footer';
            footerNode.innerHTML = visibleActions.map(action => `<button type="button" class="${action.primary ? 'is-primary' : ''} ${action.destructive ? 'is-destructive' : ''}" data-nt-character-details-action="${esc(action.id)}">${action.icon || ''}<span>${esc(action.label)}</span></button>`).join('');
            shell.append(footerNode);
        }
        showModalShell(root);
        requestAnimationFrame(() => root.focus({ preventScroll: true }));
        return true;
    }

    close({ restoreFocus = true } = {}) {
        const opener = this.opener;
        const onClose = this.onClose;
        this.actions.clear();
        this.opener = null;
        this.onClose = null;
        if (!this.root) {
            onClose?.();
            return;
        }
        hideModalShell(this.root);
        const body = this.root.querySelector('.nt-modal-body');
        body?.replaceChildren();
        this.root.querySelector('.nt-resource-modal-footer')?.remove();
        this.root.querySelector('.nt-modal-shell')?.classList.remove('has-meta');
        delete this.root.dataset.ntResourceKind;
        delete this.root.dataset.ntCharacterDetailsContext;
        try { onClose?.(); } catch (_) {}
        if (restoreFocus && opener?.isConnected) requestAnimationFrame(() => opener.focus?.({ preventScroll: true }));
    }

    unmount() {
        this.close({ restoreFocus: false });
        this.root?.remove();
        this.root = null;
    }
}
