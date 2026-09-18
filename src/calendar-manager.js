import { icons } from './icons.js';
import { t, getLocale } from './i18n.js';
import { getContextSafe as getContext, escapeHtml as esc } from './utils.js';
import { createModalShell, showModalShell, hideModalShell } from './modal-shell.js';
import { emptyStateHtml, tabsHtml } from './ui-templates.js';

const PROMPT_KEY = 'NASTYTAVERN_CALENDAR';
const pad = value => String(value).padStart(2, '0');
const uid = () => globalThis.crypto?.randomUUID?.() || `nt-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const toDate = value => {
    const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0, 0);
    return Number.isNaN(date.getTime()) ? null : date;
};
const iso = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const todayIso = () => iso(new Date());
const addDays = (value, amount) => {
    const date = toDate(value) || new Date();
    return iso(new Date(date.getFullYear(), date.getMonth(), date.getDate() + Number(amount || 0), 12));
};
const diffDays = (from, to) => {
    const a = toDate(from), b = toDate(to);
    if (!a || !b) return Infinity;
    const au = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
    const bu = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
    return Math.round((bu - au) / 86400000);
};
const defaultStore = () => ({
    version: 1,
    currentDate: todayIso(),
    events: [],
    weekly: { '0': [], '1': [], '2': [], '3': [], '4': [], '5': [], '6': [] },
    settings: {
        includeCurrentDate: true,
        calendarEnabled: true,
        lookaheadDays: 6,
        weeklyEnabled: true,
        position: 1,
        depth: 4,
        role: 0,
    },
});
const localeTag = () => getLocale() === 'fr-fr' ? 'fr-FR' : 'en-US';
const dateLabel = (value, options = {}) => {
    const date = toDate(value);
    if (!date) return value || '';
    return new Intl.DateTimeFormat(localeTag(), { weekday: options.short ? 'short' : 'long', day: 'numeric', month: options.short ? 'short' : 'long', year: options.year === false ? undefined : 'numeric' }).format(date);
};
const monthLabel = value => {
    const date = toDate(value);
    if (!date) return '';
    return new Intl.DateTimeFormat(localeTag(), { month: 'long', year: 'numeric' }).format(date);
};
const weekdayLabels = () => {
    const base = new Date(2024, 0, 1, 12);
    return Array.from({ length: 7 }, (_, index) => new Intl.DateTimeFormat(localeTag(), { weekday: 'short' }).format(new Date(base.getFullYear(), base.getMonth(), base.getDate() + index, 12)));
};
const weekdayLong = index => {
    const base = new Date(2024, 0, 7, 12);
    return new Intl.DateTimeFormat(localeTag(), { weekday: 'long' }).format(new Date(base.getFullYear(), base.getMonth(), base.getDate() + Number(index), 12));
};

export class CalendarManager {
    constructor(toast) {
        this.toast = toast;
        this.button = null;
        this.root = null;
        this.tab = 'calendar';
        this.selectedDate = todayIso();
        this.monthDate = todayIso().slice(0, 7) + '-01';
        this.weekday = 1;
        this.editingEvent = '';
        this.editingRoutine = '';
        this.events = [];
        this.mounted = false;
        this.boundChat = () => setTimeout(() => this.onChatChanged(), 0);
        this.boundGeneration = () => this.refreshInjection();
    }

    mount() {
        if (this.mounted && this.root?.isConnected && this.button?.isConnected) {
            this.syncVisibility();
            return;
        }
        this.ensureButton();
        this.ensurePanel();
        this.bindEvents();
        this.syncVisibility();
        this.refreshFromChat(false);
        this.mounted = true;
    }

    unmount() {
        for (const event of this.events) {
            try { event.source?.removeListener?.(event.type, event.handler); } catch (_) {}
        }
        this.events = [];
        this.clearInjection();
        this.button?.remove();
        this.root?.remove();
        this.button = this.root = null;
        this.mounted = false;
        document.body?.classList.remove('nt-calendar-open');
    }

    bindEvents() {
        if (this.events.length) return;
        const context = getContext();
        const source = context?.eventSource;
        const types = context?.eventTypes || context?.event_types;
        if (!source || !types) return;
        for (const key of ['CHAT_CHANGED', 'CHAT_CREATED']) {
            if (!types[key]) continue;
            try { source.on(types[key], this.boundChat); this.events.push({ source, type: types[key], handler: this.boundChat }); } catch (_) {}
        }
        if (types.GENERATION_AFTER_COMMANDS) {
            try { source.on(types.GENERATION_AFTER_COMMANDS, this.boundGeneration); this.events.push({ source, type: types.GENERATION_AFTER_COMMANDS, handler: this.boundGeneration }); } catch (_) {}
        }
    }

    ensureStore() {
        const context = getContext();
        if (!context?.chatMetadata) return null;
        const metadata = context.chatMetadata;
        if (!metadata.nastyTavernCalendar || typeof metadata.nastyTavernCalendar !== 'object') metadata.nastyTavernCalendar = defaultStore();
        const store = metadata.nastyTavernCalendar;
        const defaults = defaultStore();
        store.version = 1;
        if (!toDate(store.currentDate)) store.currentDate = defaults.currentDate;
        if (!Array.isArray(store.events)) store.events = [];
        if (!store.weekly || typeof store.weekly !== 'object') store.weekly = defaults.weekly;
        for (let day = 0; day < 7; day++) if (!Array.isArray(store.weekly[String(day)])) store.weekly[String(day)] = [];
        if (!store.settings || typeof store.settings !== 'object') store.settings = defaults.settings;
        for (const [key, value] of Object.entries(defaults.settings)) if (!Object.hasOwn(store.settings, key)) store.settings[key] = value;
        return store;
    }

    save() {
        const context = getContext();
        try {
            if (context?.saveMetadataDebounced) context.saveMetadataDebounced();
            else context?.saveMetadata?.();
        } catch (_) {}
        this.refreshInjection();
    }

    ensureButton() {
        if (this.button = document.querySelector('#nt-calendar-button')) return this.button;
        const button = document.createElement('button');
        button.id = 'nt-calendar-button';
        button.type = 'button';
        button.title = t('Calendar & Schedule');
        button.setAttribute('aria-label', t('Calendar & Schedule'));
        button.innerHTML = `<span>${icons.calendar}</span>`;
        button.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); this.toggle(); });
        document.body.append(button);
        this.button = button;
        return button;
    }

    ensurePanel() {
        if (this.root = document.querySelector('#nt-calendar-manager')) return this.root;
        const { root, body } = createModalShell({
            id: 'nt-calendar-manager',
            title: t('Calendar & Schedule'),
            subtitle: t('Story dates, appointments and weekly routine'),
            icon: icons.calendar,
            size: 'large',
            modalClass: 'nt-tool-modal nt-calendar-modal',
            backdropClass: 'nt-tool-backdrop',
            bodyClass: 'nt-calendar-body',
            bodyAttrs: { 'data-nt-calendar-body': '' },
            closeAttrs: { 'data-nt-calendar-close': '' },
        });
        body.insertAdjacentHTML('beforebegin', `
            <div class="nt-calendar-datebar">
              <div class="nt-calendar-story-date">
                <button type="button" class="menu_button menu_button_icon" data-nt-date-step="-1" title="${t('Previous day')}">${icons.arrowLeft}</button>
                <label><span>${t('Current story date')}</span><input type="date" data-nt-current-date></label>
                <button type="button" class="menu_button menu_button_icon" data-nt-date-step="1" title="${t('Next day')}">${icons.arrowRight}</button>
              </div>
              <div class="nt-calendar-next" data-nt-next-event></div>
            </div>
            ${tabsHtml('nt-calendar-tab', [
                { id: 'calendar', label: t('Calendar'), active: true },
                { id: 'weekly', label: t('Weekly Schedule') },
                { id: 'injection', label: t('Prompt Injection') },
            ], { className: 'nt-calendar-tabs' })}`);
        root.addEventListener('click', event => this.onClick(event));
        root.addEventListener('input', event => this.onInput(event));
        root.addEventListener('change', event => this.onChange(event));
        root.addEventListener('submit', event => this.handleSubmit(event));
        document.body.append(root);
        this.root = root;
        this.render();
        return root;
    }

    syncVisibility() {
        if (this.button) this.button.hidden = document.body?.dataset?.mtView !== 'chat';
    }

    toggle() { this.root?.hidden ? this.open() : this.close(); }
    open() {
        this.ensurePanel();
        this.refreshFromChat(false);
        showModalShell(this.root);
        document.body.classList.add('nt-calendar-open');
        this.render();
    }
    close() {
        if (!this.root || this.root.hidden) return;
        hideModalShell(this.root, { immediate: false });
        document.body.classList.remove('nt-calendar-open');
    }

    onChatChanged() {
        this.editingEvent = '';
        this.editingRoutine = '';
        this.refreshFromChat(true);
    }

    refreshFromChat(resetSelection = true) {
        const store = this.ensureStore();
        if (!store) {
            this.clearInjection();
            this.render();
            return;
        }
        if (resetSelection || !toDate(this.selectedDate)) this.selectedDate = store.currentDate;
        this.monthDate = `${this.selectedDate.slice(0, 7)}-01`;
        this.weekday = toDate(store.currentDate)?.getDay() ?? 1;
        this.refreshInjection();
        this.render();
    }

    render() {
        if (!this.root) return;
        const store = this.ensureStore();
        const dateInput = this.root.querySelector('[data-nt-current-date]');
        if (dateInput) dateInput.value = store?.currentDate || todayIso();
        this.root.querySelectorAll('[data-nt-calendar-tab]').forEach(button => button.classList.toggle('is-active', button.dataset.ntCalendarTab === this.tab));
        const body = this.root.querySelector('[data-nt-calendar-body]');
        if (!store) {
            body.innerHTML = emptyStateHtml({ title: t('Open a chat first'), subtitle: t('Calendar data is stored independently for each chat.') });
            this.renderNextEvent(null);
            return;
        }
        if (this.tab === 'weekly') body.innerHTML = this.renderWeekly(store);
        else if (this.tab === 'injection') body.innerHTML = this.renderInjection(store);
        else body.innerHTML = this.renderCalendar(store);
        this.renderNextEvent(store);
    }

    renderCalendar(store) {
        const month = toDate(this.monthDate) || toDate(store.currentDate);
        const first = new Date(month.getFullYear(), month.getMonth(), 1, 12);
        const startOffset = (first.getDay() + 6) % 7;
        const gridStart = new Date(first.getFullYear(), first.getMonth(), 1 - startOffset, 12);
        const labels = weekdayLabels();
        const counts = new Map();
        for (const event of store.events) counts.set(event.date, (counts.get(event.date) || 0) + 1);
        const days = Array.from({ length: 42 }, (_, index) => {
            const date = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + index, 12);
            const value = iso(date);
            const outside = date.getMonth() !== first.getMonth();
            const count = counts.get(value) || 0;
            const classes = [outside ? 'is-outside' : '', value === this.selectedDate ? 'is-selected' : '', value === store.currentDate ? 'is-current' : '', count ? 'has-events' : ''].filter(Boolean).join(' ');
            return `<button type="button" class="nt-calendar-day ${classes}" data-nt-calendar-day="${value}"><span>${date.getDate()}</span>${count ? `<em>${count}</em>` : ''}</button>`;
        }).join('');
        const selected = store.events.filter(event => event.date === this.selectedDate).sort((a, b) => String(a.title).localeCompare(String(b.title)));
        const editing = store.events.find(event => event.id === this.editingEvent);
        return `
          <div class="nt-calendar-layout">
            <section class="nt-calendar-month-card">
              <div class="nt-calendar-month-head">
                <button type="button" class="menu_button menu_button_icon" data-nt-month-step="-1">${icons.arrowLeft}</button>
                <b>${esc(monthLabel(this.monthDate))}</b>
                <button type="button" class="menu_button menu_button_icon" data-nt-month-step="1">${icons.arrowRight}</button>
              </div>
              <div class="nt-calendar-weekdays">${labels.map(label => `<span>${esc(label)}</span>`).join('')}</div>
              <div class="nt-calendar-grid">${days}</div>
            </section>
            <section class="nt-calendar-day-panel">
              <header><div><small>${t('Selected day')}</small><b>${esc(dateLabel(this.selectedDate))}</b></div><button type="button" class="menu_button" data-nt-set-current ${this.selectedDate === store.currentDate ? 'disabled' : ''}>${this.selectedDate === store.currentDate ? t('Current date') : t('Set as current date')}</button></header>
              <div class="nt-calendar-event-list">${selected.length ? selected.map(event => this.eventCard(event)).join('') : `<div class="nt-calendar-empty"><span>${icons.calendar}</span><b>${t('Nothing planned')}</b><small>${t('Click Add event to plan this day.')}</small></div>`}</div>
              <form class="nt-calendar-editor" data-nt-event-form>
                <div class="nt-calendar-editor-title"><b>${editing ? t('Edit event') : t('Add event')}</b>${editing ? `<button type="button" class="menu_button" data-nt-event-cancel>${t('Cancel')}</button>` : ''}</div>
                <div class="nt-calendar-form-grid">
                  <label><span>${t('For')}</span><select data-nt-event-owner><option value="user" ${editing?.owner !== 'char' && editing?.owner !== 'general' ? 'selected' : ''}>{{user}}</option><option value="char" ${editing?.owner === 'char' ? 'selected' : ''}>{{char}}</option><option value="general" ${editing?.owner === 'general' ? 'selected' : ''}>${t('General')}</option></select></label>
                  <label class="is-wide"><span>${t('Title')}</span><input data-nt-event-title value="${esc(editing?.title || '')}" placeholder="${t('Dentist appointment, exam, birthday…')}"></label>
                  <label class="is-wide"><span>${t('Details (optional)')}</span><textarea data-nt-event-details rows="2" placeholder="${t('Short useful context for the model')}">${esc(editing?.details || '')}</textarea></label>
                  <label class="checkbox_label is-wide"><input type="checkbox" data-nt-event-inject ${editing?.inject === false ? '' : 'checked'}><span>${t('Allow this event in prompt injection')}</span></label>
                </div>
                <button type="submit" class="nt-calendar-primary">${editing ? t('Save event') : t('Add event')}</button>
              </form>
            </section>
          </div>`;
    }

    eventCard(event) {
        const owner = this.ownerLabel(event.owner);
        return `<article class="nt-calendar-event-card ${event.inject === false ? 'is-muted' : ''}"><div><span>${owner}</span><b>${esc(event.title || t('Untitled event'))}</b>${event.details ? `<p>${esc(event.details)}</p>` : ''}</div><div><button type="button" class="menu_button menu_button_icon" data-nt-event-edit="${esc(event.id)}" title="${t('Edit')}">${icons.edit}</button><button type="button" class="menu_button menu_button_icon is-danger" data-nt-event-delete="${esc(event.id)}" title="${t('Delete')}">${icons.trash}</button></div></article>`;
    }

    renderWeekly(store) {
        const labels = Array.from({ length: 7 }, (_, index) => ({ day: (index + 1) % 7, label: weekdayLong((index + 1) % 7) }));
        const currentWeekday = toDate(store.currentDate)?.getDay() ?? 0;
        if (!Number.isInteger(this.weekday) || this.weekday < 0 || this.weekday > 6) this.weekday = currentWeekday;
        const items = store.weekly[String(this.weekday)] || [];
        const editing = items.find(item => item.id === this.editingRoutine);
        return `
          <div class="nt-weekly-layout">
            <div class="nt-weekday-strip">${labels.map(item => `<button type="button" class="${this.weekday === item.day ? 'is-active' : ''} ${currentWeekday === item.day ? 'is-today' : ''}" data-nt-weekday="${item.day}"><span>${esc(item.label)}</span><em>${store.weekly[String(item.day)]?.length || 0}</em></button>`).join('')}</div>
            <section class="nt-weekly-panel">
              <header><div><small>${t('Recurring weekly plan')}</small><b>${esc(weekdayLong(this.weekday))}</b></div>${currentWeekday === this.weekday ? `<span>${t('Current story day')}</span>` : ''}</header>
              <div class="nt-weekly-list">${items.length ? items.map(item => this.routineCard(item)).join('') : `<div class="nt-calendar-empty"><span>${icons.calendar}</span><b>${t('No recurring items')}</b><small>${t('Add school, work, training or any regular activity.')}</small></div>`}</div>
              <form class="nt-calendar-editor" data-nt-routine-form>
                <div class="nt-calendar-editor-title"><b>${editing ? t('Edit weekly item') : t('Add weekly item')}</b>${editing ? `<button type="button" class="menu_button" data-nt-routine-cancel>${t('Cancel')}</button>` : ''}</div>
                <div class="nt-calendar-form-grid">
                  <label><span>${t('For')}</span><select data-nt-routine-owner><option value="user" ${editing?.owner !== 'char' && editing?.owner !== 'general' ? 'selected' : ''}>{{user}}</option><option value="char" ${editing?.owner === 'char' ? 'selected' : ''}>{{char}}</option><option value="general" ${editing?.owner === 'general' ? 'selected' : ''}>${t('General')}</option></select></label>
                  <label class="is-wide"><span>${t('Activity')}</span><input data-nt-routine-title value="${esc(editing?.title || '')}" placeholder="${t('University classes, work, gym…')}"></label>
                  <label class="is-wide"><span>${t('Details (optional)')}</span><textarea data-nt-routine-details rows="2" placeholder="${t('Short useful context for the model')}">${esc(editing?.details || '')}</textarea></label>
                  <label class="checkbox_label is-wide"><input type="checkbox" data-nt-routine-inject ${editing?.inject === false ? '' : 'checked'}><span>${t('Allow this item in prompt injection')}</span></label>
                </div>
                <button type="submit" class="nt-calendar-primary">${editing ? t('Save weekly item') : t('Add weekly item')}</button>
              </form>
            </section>
          </div>`;
    }

    routineCard(item) {
        return `<article class="nt-calendar-event-card ${item.inject === false ? 'is-muted' : ''}"><div><span>${this.ownerLabel(item.owner)}</span><b>${esc(item.title || t('Untitled item'))}</b>${item.details ? `<p>${esc(item.details)}</p>` : ''}</div><div><button type="button" class="menu_button menu_button_icon" data-nt-routine-edit="${esc(item.id)}" title="${t('Edit')}">${icons.edit}</button><button type="button" class="menu_button menu_button_icon is-danger" data-nt-routine-delete="${esc(item.id)}" title="${t('Delete')}">${icons.trash}</button></div></article>`;
    }

    renderInjection(store) {
        const settings = store.settings;
        const preview = this.buildPrompt(store) || t('Nothing would be injected with the current settings.');
        return `
          <div class="nt-calendar-injection">
            <section class="nt-calendar-settings-card">
              <header><div><b>${t('What to inject')}</b><small>${t('Only relevant information is added to keep token usage low.')}</small></div></header>
              <label class="checkbox_label"><input type="checkbox" data-nt-cal-setting="includeCurrentDate" ${settings.includeCurrentDate ? 'checked' : ''}><span>${t('Include the current story date')}</span></label>
              <label class="checkbox_label"><input type="checkbox" data-nt-cal-setting="calendarEnabled" ${settings.calendarEnabled ? 'checked' : ''}><span>${t('Inject upcoming calendar events')}</span></label>
              <label class="nt-calendar-number"><span>${t('Start injecting an event this many days before')}</span><input type="number" min="0" max="3650" step="1" value="${Number(settings.lookaheadDays ?? 6)}" data-nt-cal-setting="lookaheadDays"><small>${t('An event one year away stays out of context until it enters this window.')}</small></label>
              <label class="checkbox_label"><input type="checkbox" data-nt-cal-setting="weeklyEnabled" ${settings.weeklyEnabled ? 'checked' : ''}><span>${t('Inject today’s weekly schedule')}</span></label>
              <small class="nt-calendar-hint">${t('Weekly items are injected only on their matching story day.')}</small>
            </section>
            <section class="nt-calendar-settings-card">
              <header><div><b>${t('Injection position')}</b><small>${t('Uses SillyTavern’s native extension prompt injection.')}</small></div></header>
              <label><span>${t('Position')}</span><select data-nt-cal-setting="position"><option value="2" ${Number(settings.position) === 2 ? 'selected' : ''}>${t('Before Main Prompt / Story String')}</option><option value="0" ${Number(settings.position) === 0 ? 'selected' : ''}>${t('After Main Prompt / Story String')}</option><option value="1" ${Number(settings.position) === 1 ? 'selected' : ''}>${t('In-chat @ Depth')}</option></select></label>
              <div class="nt-calendar-depth-row ${Number(settings.position) === 1 ? '' : 'is-disabled'}">
                <label><span>${t('Depth')}</span><input type="number" min="0" max="10000" step="1" value="${Number(settings.depth ?? 4)}" data-nt-cal-setting="depth" ${Number(settings.position) === 1 ? '' : 'disabled'}></label>
                <label><span>${t('Role')}</span><select data-nt-cal-setting="role" ${Number(settings.position) === 1 ? '' : 'disabled'}><option value="0" ${Number(settings.role) === 0 ? 'selected' : ''}>${t('System')}</option><option value="1" ${Number(settings.role) === 1 ? 'selected' : ''}>${t('User')}</option><option value="2" ${Number(settings.role) === 2 ? 'selected' : ''}>${t('Assistant')}</option></select></label>
              </div>
            </section>
            <section class="nt-calendar-preview-card">
              <header><div><b>${t('Injection preview')}</b><small>${t('This is the compact context the model receives.')}</small></div><button type="button" class="menu_button" data-nt-calendar-copy>${icons.copy}<span>${t('Copy')}</span></button></header>
              <pre data-nt-calendar-preview>${esc(preview)}</pre>
            </section>
          </div>`;
    }

    renderNextEvent(store) {
        const host = this.root?.querySelector('[data-nt-next-event]');
        if (!host) return;
        if (!store) { host.innerHTML = ''; return; }
        const next = store.events.filter(event => diffDays(store.currentDate, event.date) >= 0).sort((a, b) => a.date.localeCompare(b.date))[0];
        if (!next) { host.innerHTML = `<small>${t('Next event')}</small><b>${t('Nothing scheduled')}</b>`; return; }
        const days = diffDays(store.currentDate, next.date);
        host.innerHTML = `<small>${t('Next event')}</small><b>${esc(next.title || t('Untitled event'))}</b><span>${esc(this.relativeDay(days, next.date))}</span>`;
    }

    ownerLabel(owner) {
        const context = getContext();
        if (owner === 'char') return esc(context?.name2 || t('Character'));
        if (owner === 'general') return esc(t('General'));
        return esc(context?.name1 || t('User'));
    }

    relativeDay(days, date) {
        const french = getLocale() === 'fr-fr';
        if (days === 0) return french ? 'aujourd’hui' : 'today';
        if (days === 1) return french ? 'demain' : 'tomorrow';
        return french ? `dans ${days} jours (${dateLabel(date, { short: true, year: false })})` : `in ${days} days (${dateLabel(date, { short: true, year: false })})`;
    }

    describe(item) {
        const title = String(item?.title || '').trim();
        const details = String(item?.details || '').trim().replace(/\s+/g, ' ');
        return details ? `${title} — ${details}` : title;
    }

    buildPrompt(store = this.ensureStore()) {
        if (!store) return '';
        const locale = getLocale();
        const french = locale === 'fr-fr';
        const settings = store.settings;
        const lines = [];
        if (settings.includeCurrentDate) lines.push(french ? `[Contexte planning | ${dateLabel(store.currentDate)}]` : `[Schedule context | ${dateLabel(store.currentDate)}]`);
        const lookahead = Math.max(0, Math.min(3650, Number(settings.lookaheadDays ?? 6)));
        if (settings.calendarEnabled) {
            const upcoming = store.events
                .filter(event => event.inject !== false)
                .map(event => ({ ...event, days: diffDays(store.currentDate, event.date) }))
                .filter(event => event.days >= 0 && event.days <= lookahead)
                .sort((a, b) => a.days - b.days || String(a.title).localeCompare(String(b.title)));
            if (upcoming.length) {
                const groups = new Map();
                for (const event of upcoming) {
                    if (!groups.has(event.days)) groups.set(event.days, []);
                    groups.get(event.days).push(event);
                }
                lines.push(french ? `À venir ≤${lookahead} j :` : `Upcoming ≤${lookahead}d:`);
                for (const [days, items] of groups) {
                    const pieces = items.map(item => `${this.ownerPromptLabel(item.owner)} — ${this.describe(item)}`).filter(Boolean);
                    lines.push(`- ${this.relativeDay(days, items[0]?.date)}: ${pieces.join('; ')}`);
                }
            }
        }
        if (settings.weeklyEnabled) {
            const weekday = toDate(store.currentDate)?.getDay() ?? 0;
            const routines = (store.weekly[String(weekday)] || []).filter(item => item.inject !== false && String(item.title || '').trim());
            if (routines.length) {
                const pieces = routines.map(item => `${this.ownerPromptLabel(item.owner)} — ${this.describe(item)}`);
                lines.push(`${french ? 'Routine du jour' : 'Today routine'}: ${pieces.join('; ')}`);
            }
        }
        if (!lines.length) return '';
        if (!settings.includeCurrentDate && lines.length) lines.unshift(french ? `[Contexte planning | ${dateLabel(store.currentDate)}]` : `[Schedule context | ${dateLabel(store.currentDate)}]`);
        return lines.join('\n');
    }

    ownerPromptLabel(owner) {
        const context = getContext();
        if (owner === 'char') return context?.name2 || (getLocale() === 'fr-fr' ? 'Personnage' : 'Character');
        if (owner === 'general') return getLocale() === 'fr-fr' ? 'Général' : 'General';
        return context?.name1 || (getLocale() === 'fr-fr' ? 'Utilisateur' : 'User');
    }

    refreshInjection() {
        const context = getContext();
        if (!context?.setExtensionPrompt) return;
        const store = this.ensureStore();
        if (!store) return this.clearInjection();
        const prompt = this.buildPrompt(store);
        const settings = store.settings;
        try {
            context.setExtensionPrompt(PROMPT_KEY, prompt, Number(settings.position ?? 1), Number(settings.depth ?? 4), false, Number(settings.role ?? 0));
        } catch (error) {
        }
        if (this.root && !this.root.hidden && this.tab === 'injection') {
            const preview = this.root.querySelector('[data-nt-calendar-preview]');
            if (preview) preview.textContent = prompt || t('Nothing would be injected with the current settings.');
        }
    }

    clearInjection() {
        const context = getContext();
        try { context?.setExtensionPrompt?.(PROMPT_KEY, '', 1, 4, false, 0); } catch (_) {}
    }

    async onClick(event) {
        if (event.target.closest('[data-nt-calendar-close]')) return this.close();
        const tab = event.target.closest('[data-nt-calendar-tab]');
        if (tab) { this.tab = tab.dataset.ntCalendarTab; this.render(); return; }
        const step = event.target.closest('[data-nt-date-step]');
        if (step) { const store = this.ensureStore(); if (!store) return; store.currentDate = addDays(store.currentDate, Number(step.dataset.ntDateStep)); this.selectedDate = store.currentDate; this.monthDate = `${store.currentDate.slice(0, 7)}-01`; this.weekday = toDate(store.currentDate)?.getDay() ?? 0; this.save(); this.render(); return; }
        const month = event.target.closest('[data-nt-month-step]');
        if (month) { const date = toDate(this.monthDate); this.monthDate = iso(new Date(date.getFullYear(), date.getMonth() + Number(month.dataset.ntMonthStep), 1, 12)); this.render(); return; }
        const day = event.target.closest('[data-nt-calendar-day]');
        if (day) { this.selectedDate = day.dataset.ntCalendarDay; this.editingEvent = ''; this.render(); return; }
        if (event.target.closest('[data-nt-set-current]')) { const store = this.ensureStore(); if (!store) return; store.currentDate = this.selectedDate; this.weekday = toDate(store.currentDate)?.getDay() ?? 0; this.save(); this.render(); return; }
        const editEvent = event.target.closest('[data-nt-event-edit]');
        if (editEvent) { this.editingEvent = editEvent.dataset.ntEventEdit; this.render(); return; }
        if (event.target.closest('[data-nt-event-cancel]')) { this.editingEvent = ''; this.render(); return; }
        const deleteEvent = event.target.closest('[data-nt-event-delete]');
        if (deleteEvent) { const store = this.ensureStore(); if (!store) return; store.events = store.events.filter(item => item.id !== deleteEvent.dataset.ntEventDelete); this.editingEvent = ''; this.save(); this.render(); return; }
        const weekday = event.target.closest('[data-nt-weekday]');
        if (weekday) { this.weekday = Number(weekday.dataset.ntWeekday); this.editingRoutine = ''; this.render(); return; }
        const editRoutine = event.target.closest('[data-nt-routine-edit]');
        if (editRoutine) { this.editingRoutine = editRoutine.dataset.ntRoutineEdit; this.render(); return; }
        if (event.target.closest('[data-nt-routine-cancel]')) { this.editingRoutine = ''; this.render(); return; }
        const deleteRoutine = event.target.closest('[data-nt-routine-delete]');
        if (deleteRoutine) { const store = this.ensureStore(); if (!store) return; store.weekly[String(this.weekday)] = (store.weekly[String(this.weekday)] || []).filter(item => item.id !== deleteRoutine.dataset.ntRoutineDelete); this.editingRoutine = ''; this.save(); this.render(); return; }
        if (event.target.closest('[data-nt-calendar-copy]')) { const prompt = this.buildPrompt(); await navigator.clipboard?.writeText?.(prompt); this.toast?.(t('Calendar injection copied.')); return; }
    }

    onInput(event) {
        const setting = event.target.closest('[data-nt-cal-setting]');
        if (!setting || ['checkbox', 'select-one'].includes(setting.type)) return;
        this.updateSetting(setting);
    }

    onChange(event) {
        const currentDate = event.target.closest('[data-nt-current-date]');
        if (currentDate) {
            const store = this.ensureStore();
            if (!store || !toDate(currentDate.value)) return;
            store.currentDate = currentDate.value;
            this.selectedDate = currentDate.value;
            this.monthDate = `${currentDate.value.slice(0, 7)}-01`;
            this.weekday = toDate(store.currentDate)?.getDay() ?? 0;
            this.save(); this.render(); return;
        }
        const setting = event.target.closest('[data-nt-cal-setting]');
        if (setting) { this.updateSetting(setting); this.render(); return; }
    }

    updateSetting(input) {
        const store = this.ensureStore();
        if (!store) return;
        const key = input.dataset.ntCalSetting;
        let value;
        if (input.type === 'checkbox') value = input.checked;
        else if (input.type === 'number' || ['position', 'role'].includes(key)) value = Number(input.value);
        else value = input.value;
        if (key === 'lookaheadDays') value = Math.max(0, Math.min(3650, Number(value || 0)));
        if (key === 'depth') value = Math.max(0, Math.min(10000, Number(value || 0)));
        store.settings[key] = value;
        this.save();
    }

    handleSubmit(event) {
        const eventForm = event.target.closest?.('[data-nt-event-form]');
        if (eventForm) {
            event.preventDefault();
            const store = this.ensureStore();
            if (!store) return;
            const title = eventForm.querySelector('[data-nt-event-title]')?.value.trim() || '';
            if (!title) { this.toast?.(t('Event title cannot be empty.')); return; }
            const data = { date: this.selectedDate, owner: eventForm.querySelector('[data-nt-event-owner]')?.value || 'user', title, details: eventForm.querySelector('[data-nt-event-details]')?.value.trim() || '', inject: !!eventForm.querySelector('[data-nt-event-inject]')?.checked, updatedAt: Date.now() };
            if (this.editingEvent) {
                const index = store.events.findIndex(item => item.id === this.editingEvent);
                if (index >= 0) store.events[index] = { ...store.events[index], ...data };
            } else store.events.push({ id: uid(), ...data, createdAt: Date.now() });
            this.editingEvent = '';
            this.save(); this.render(); return;
        }
        const routineForm = event.target.closest?.('[data-nt-routine-form]');
        if (routineForm) {
            event.preventDefault();
            const store = this.ensureStore();
            if (!store) return;
            const title = routineForm.querySelector('[data-nt-routine-title]')?.value.trim() || '';
            if (!title) { this.toast?.(t('Activity cannot be empty.')); return; }
            const data = { owner: routineForm.querySelector('[data-nt-routine-owner]')?.value || 'user', title, details: routineForm.querySelector('[data-nt-routine-details]')?.value.trim() || '', inject: !!routineForm.querySelector('[data-nt-routine-inject]')?.checked, updatedAt: Date.now() };
            const list = store.weekly[String(this.weekday)] || (store.weekly[String(this.weekday)] = []);
            if (this.editingRoutine) {
                const index = list.findIndex(item => item.id === this.editingRoutine);
                if (index >= 0) list[index] = { ...list[index], ...data };
            } else list.push({ id: uid(), ...data, createdAt: Date.now() });
            this.editingRoutine = '';
            this.save(); this.render();
        }
    }

    getStats() {
        const store = this.ensureStore();
        if (!store) return { events: 0, weekly: 0, injected: false };
        return { events: store.events.length, weekly: Object.values(store.weekly).reduce((sum, items) => sum + (Array.isArray(items) ? items.length : 0), 0), injected: !!this.buildPrompt(store) };
    }
}
