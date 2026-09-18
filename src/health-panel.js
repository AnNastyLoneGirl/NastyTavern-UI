import { icons } from './icons.js';
import { t } from './i18n.js';
import { getContextSafe as ctx, escapeHtml as esc } from './utils.js';
import { createModalShell, showModalShell, hideModalShell } from './modal-shell.js';

export class HealthPanel {
    constructor(toast, getSnapshot) {
        this.toast = toast;
        this.getSnapshot = getSnapshot;
        this.root = null;
    }

    mount() {
        this.ensure();
    }

    unmount() {
        this.root?.remove();
        this.root = null;
    }

    open() {
        this.ensure();
        this.render();
        showModalShell(this.root);
    }

    close() {
        if (!this.root) return;
        hideModalShell(this.root, { immediate: false });
    }

    ensure() {
        if (this.root = document.querySelector('#nt-health-panel')) return this.root;

        const { root } = createModalShell({
            id: 'nt-health-panel',
            title: t('Health & Performance'),
            subtitle: t('Diagnostics for SillyTavern and NastyTavern'),
            icon: icons.health,
            size: 'standard',
            rootClass: 'nt-health-root',
            modalClass: 'nt-health-modal',
            bodyClass: 'nt-health-body',
            bodyAttrs: { 'data-nt-health-body': '' },
            closeAttrs: { 'data-nt-health-close': '' },
            headerActionsHtml: `<button type="button" class="nt-health-refresh" data-nt-health-refresh title="${esc(t('Refresh'))}" aria-label="${esc(t('Refresh'))}">${icons.refresh}</button>`,
            footerClass: 'nt-health-footer',
            footerHtml: `<button type="button" class="nt-health-copy" data-nt-health-copy>${icons.copy}<span>${t('Copy diagnostic report')}</span></button>`,
        });

        root.addEventListener('click', event => {
            if (event.target.closest('[data-nt-health-close]')) this.close();
            if (event.target.closest('[data-nt-health-refresh]')) this.render();
            if (event.target.closest('[data-nt-health-copy]')) this.copy();
        });

        document.body.append(root);
        this.root = root;
        return root;
    }

    snapshot() {
        const c = ctx();
        const extra = this.getSnapshot?.() || {};
        const selectors = {
            'Chat': '#chat',
            'Composer': '#send_form',
            'Characters': '#right-nav-panel',
            'Personas': '#PersonaManagement',
            'World Info': '#WorldInfo',
            'Advanced Formatting': '#AdvancedFormatting',
        };

        return {
            stVersion: document.querySelector('#version_display')?.textContent?.trim() || 'Unknown',
            nastyVersion: '0.1.7',
            view: document.body?.dataset?.mtView || 'chat',
            chatId: c?.getCurrentChatId?.() || c?.chatId || '',
            messages: Array.isArray(c?.chat) ? c.chat.length : 0,
            dom: document.getElementsByTagName('*').length,
            extensions: Object.keys(c?.extensionSettings || {}).length,
            localVars: Object.keys(c?.chatMetadata?.variables || {}).length,
            globalVars: Object.keys(c?.extensionSettings?.variables?.global || {}).length,
            selectors: Object.fromEntries(Object.entries(selectors).map(([key, selector]) => [key, !!document.querySelector(selector)])),
            ...extra,
        };
    }

    render() {
        const s = this.snapshot();
        const body = this.root?.querySelector('[data-nt-health-body]');
        if (!body) return;

        const metric = (name, value, className = '') => `
            <article class="nt-health-metric ${className}">
                <span>${esc(t(name))}</span>
                <b title="${esc(String(value))}">${esc(value)}</b>
            </article>`;

        const contextPercent = Math.max(0, Math.min(100, Number(s.contextPercent) || 0));
        const selectorEntries = Object.entries(s.selectors || {});
        const selectorOk = selectorEntries.filter(([, value]) => value).length;

        body.innerHTML = `
            <section class="nt-health-section">
                <div class="nt-health-section-head">
                    <h3>${t('Runtime')}</h3>
                    <span class="nt-health-section-summary">${esc(s.view || 'chat')}</span>
                </div>
                <div class="nt-health-metrics nt-health-runtime-grid">
                    ${metric('SillyTavern', s.stVersion)}
                    ${metric('NastyTavern', s.nastyVersion)}
                    ${metric('Active view', s.view)}
                    ${metric('Chat', s.chatId || t('None'))}
                </div>
            </section>

            <section class="nt-health-section">
                <div class="nt-health-section-head">
                    <h3>${t('Performance')}</h3>
                    <span class="nt-health-section-summary">${esc(`${contextPercent}%`)}</span>
                </div>
                <div class="nt-health-metrics nt-health-performance-grid">
                    ${metric('Messages loaded', s.messages)}
                    ${metric('DOM elements', Number(s.dom || 0).toLocaleString())}
                    ${metric('Extension settings namespaces', s.extensions)}
                    ${metric('Timeline nodes', s.timelineNodes || 0)}
                    ${metric('Context tokens', s.contextTokens || 0)}
                    ${metric('Context usage', `${contextPercent}%`, 'nt-health-context-metric')}
                </div>
                <div class="nt-health-context-bar" aria-label="${esc(t('Context usage'))}: ${contextPercent}%">
                    <div class="nt-health-context-track"><span style="width:${contextPercent}%"></span></div>
                </div>
            </section>

            <section class="nt-health-section">
                <div class="nt-health-section-head">
                    <h3>${t('State')}</h3>
                </div>
                <div class="nt-health-metrics nt-health-state-grid">
                    ${metric('Active World Info entries', s.worldInfoEntries || 0)}
                    ${metric('Local variables', s.localVars)}
                    ${metric('Global variables', s.globalVars)}
                    ${metric('Bookmarks', s.bookmarks || 0)}
                    ${metric('Session notes', s.notes || 0)}
                    ${metric('Calendar events', s.calendarEvents || 0)}
                    ${metric('Weekly schedule items', s.weeklyItems || 0)}
                </div>
            </section>

            <section class="nt-health-section nt-health-selector-section">
                <div class="nt-health-section-head">
                    <h3>${t('Selector health')}</h3>
                    <span class="nt-health-section-summary ${selectorOk === selectorEntries.length ? 'is-ok' : 'is-warning'}">${selectorOk}/${selectorEntries.length}</span>
                </div>
                <div class="nt-health-selectors">
                    ${selectorEntries.map(([key, value]) => `<span class="${value ? 'is-ok' : 'is-bad'}"><i aria-hidden="true">${value ? '✓' : '×'}</i><b>${esc(key)}</b></span>`).join('')}
                </div>
            </section>`;
    }

    async copy() {
        const snapshot = this.snapshot();
        const text = `NastyTavern diagnostic\n${JSON.stringify(snapshot, null, 2)}`;
        try {
            await navigator.clipboard.writeText(text);
            this.toast?.(t('Diagnostic report copied.'));
        } catch (_) {
            this.toast?.(t('Could not copy diagnostic report.'));
        }
    }
}
