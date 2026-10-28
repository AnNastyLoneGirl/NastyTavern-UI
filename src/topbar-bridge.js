import { icons } from './icons.js';
import { t } from './i18n.js';

// These belong to SillyTavern, not third-party extensions. Native drawer
// controls already have their own NastyTavern navigation/settings counterparts.
const NATIVE_DRAWER_IDS = new Set([
    'top-bar', 'top-settings-holder', 'leftNavHolder', 'rightNavHolder',
    'ai-config-button', 'sys-settings-button', 'advanced-formatting-button',
    'WI-SP-button', 'user-settings-button', 'extensions-settings-button',
    'backgrounds-button', 'backgrounds-drawer-toggle', 'logo_block',
    'persona-management-button', 'extensionsMenuButton',
]);

// DataCat is deliberately managed by the character-library navigation group.
const OTHER_BRIDGES = new Set(['datacat_browser_topbar_button']);
const ICON_STYLES = ['fa-solid', 'fa-regular', 'fa-brands', 'fa-light', 'fa-thin', 'fa-duotone'];
const ICON_MODIFIERS = new Set(['fa-fw', 'fa-lg', 'fa-xs', 'fa-sm', 'fa-xl', 'fa-2xl', 'fa-spin', 'fa-pulse', 'fa-border']);
const safeId = value => typeof value === 'string' && /^[\w.:-]{1,100}$/.test(value);
const isElement = value => typeof Element !== 'undefined' && value instanceof Element;

function iconClasses(value) {
    const classes = typeof value === 'string' ? value.split(/\s+/) : isElement(value) ? [...value.classList] : [];
    const style = classes.find(name => ICON_STYLES.includes(name));
    const glyph = classes.find(name => /^fa-[a-z0-9-]+$/.test(name) && !ICON_STYLES.includes(name) && !ICON_MODIFIERS.has(name));
    return style && glyph ? `${style} ${glyph} fa-fw` : '';
}

function findIcon(source) {
    const icon = source.matches?.(ICON_STYLES.map(name => `.${name}`).join(','))
        ? source : source.querySelector?.(ICON_STYLES.map(name => `.${name}`).join(','));
    return iconClasses(icon);
}

function sourceLabel(source) {
    const candidates = [
        source.dataset.ntTopbarLabel,
        source.getAttribute('aria-label'), source.getAttribute('title'),
        source.querySelector('[aria-label]')?.getAttribute('aria-label'),
        source.querySelector('[title]')?.getAttribute('title'),
    ];
    const first = candidates.find(value => typeof value === 'string' && value.trim());
    if (first) return first.trim().slice(0, 100);
    return (source.id || 'Extension').replace(/(?:[_-]?top[_-]?bar|[_-]?toolbar|[_-]?button)$/gi, '').replace(/[_-]+/g, ' ').trim().slice(0, 100) || 'Extension';
}

/**
 * Generic opt-in API + conservative adapter for extensions which add a native
 * SillyTavern top-bar drawer. Source elements are NEVER moved or cloned:
 * their own listeners, preferences, and lifecycle stay authoritative.
 */
export class TopbarBridge {
    constructor(getHost) {
        this.getHost = getHost;
        this.registry = new Map();
        this.current = new Map();
        this.autoId = new WeakMap();
        this.nextId = 0;
        this.signature = '';
        this.api = Object.freeze({
            version: 1,
            register: action => this.register(action),
            unregister: id => this.unregister(id),
            refresh: () => this.refresh(),
        });
        this.boundResize = () => this.refresh();
        this.boundOutside = event => {
            if (!event.target?.closest?.('[data-mt-third-party-launchers]')) this.closeMenu();
        };
        this.boundEscape = event => {
            if (event.key === 'Escape' && this.isMenuOpen()) {
                event.preventDefault();
                this.closeMenu(true);
            }
        };
        this.started = false;
    }

    start() {
        if (this.started) return;
        this.started = true;
        if (!window.NastyTavernTopbar) window.NastyTavernTopbar = this.api;
        window.addEventListener('resize', this.boundResize);
        document.addEventListener('pointerdown', this.boundOutside, true);
        document.addEventListener('keydown', this.boundEscape, true);
        this.refresh();
        // Extensions loaded before NastyTavern can register on this notification.
        window.dispatchEvent(new CustomEvent('nastytavern:topbar-ready', { detail: this.api }));
    }

    stop() {
        if (!this.started) return;
        this.started = false;
        window.removeEventListener('resize', this.boundResize);
        document.removeEventListener('pointerdown', this.boundOutside, true);
        document.removeEventListener('keydown', this.boundEscape, true);
        if (window.NastyTavernTopbar === this.api) delete window.NastyTavernTopbar;
        const host = this.getHost();
        host?.replaceChildren();
        if (host) host.hidden = true;
        this.current.clear();
        this.signature = '';
        // Retain registrations on disable/re-enable; extensions do not have to
        // reinitialize their entire code just because the UI was toggled.
    }

    register(action) {
        if (!action || !safeId(action.id) || typeof action.label !== 'string' || !action.label.trim()) {
            console.warn('[NastyTavern] Invalid top-bar action (requires id and label).');
            return () => {};
        }
        if (typeof action.onClick !== 'function' && typeof action.sourceSelector !== 'string') {
            console.warn('[NastyTavern] Top-bar action requires onClick or sourceSelector.');
            return () => {};
        }
        const entry = {
            id: action.id,
            label: action.label.trim().slice(0, 100),
            icon: iconClasses(action.icon),
            onClick: typeof action.onClick === 'function' ? action.onClick : null,
            sourceSelector: typeof action.sourceSelector === 'string' ? action.sourceSelector : '',
        };
        this.registry.set(entry.id, entry);
        this.refresh();
        // Safe even when a different registration replaced this one later.
        return () => { if (this.registry.get(entry.id) === entry) this.unregister(entry.id); };
    }

    unregister(id) {
        this.registry.delete(id);
        this.refresh();
    }

    isUsable(source) {
        return isElement(source) && source.isConnected && !source.closest('#mt-root')
            && !source.hidden && !source.closest('[hidden]')
            && source.getAttribute('aria-disabled') !== 'true'
            && source.dataset.ntTopbarDisabled !== 'true';
    }

    sourceAction(source) {
        if (!this.isUsable(source)) return null;
        let id = source.dataset.ntTopbarAction || source.id;
        if (!safeId(id)) {
            if (!this.autoId.has(source)) this.autoId.set(source, `dom-${++this.nextId}`);
            id = this.autoId.get(source);
        }
        return {
            id, label: sourceLabel(source),
            icon: iconClasses(source.dataset.ntTopbarIcon) || findIcon(source),
            source,
        };
    }

    discover() {
        const result = new Map();
        const claimedSources = new Set();
        for (const action of this.registry.values()) {
            let source = null;
            if (action.sourceSelector) {
                try { source = document.querySelector(action.sourceSelector); } catch (_) { continue; }
                if (!this.isUsable(source)) continue;
                claimedSources.add(source);
            }
            result.set(action.id, { ...action, source });
        }

        // Explicit one-line DOM opt-in works even if the extension booted before us.
        for (const source of document.querySelectorAll('[data-nt-topbar-action]')) {
            if (!this.isUsable(source) || claimedSources.has(source)) continue;
            const action = this.sourceAction(source);
            if (action && !result.has(action.id)) result.set(action.id, action);
            claimedSources.add(source);
        }

        // Legacy compatibility: discover third-party native drawer buttons by
        // their placement, not by the name of an individual extension.
        const candidates = document.querySelectorAll(
            '#top-settings-holder > [id], #top-bar > [id], '
            + '#top-settings-holder [id*="topbar" i], #top-settings-holder [id*="top-bar" i], '
            + '#top-bar [id*="topbar" i], #top-bar [id*="top-bar" i]'
        );
        for (const source of candidates) {
            if (!this.isUsable(source) || claimedSources.has(source) || !source.id
                || NATIVE_DRAWER_IDS.has(source.id) || OTHER_BRIDGES.has(source.id)) continue;
            // Ignore descendants of native drawers and nested duplicates.
            const parentDrawer = source.parentElement?.closest('.drawer[id]');
            if (parentDrawer && parentDrawer !== source) continue;
            if (source.querySelector('[data-nt-topbar-action]')) continue;
            if (!source.matches('button,[role="button"],.drawer')
                && !source.querySelector('.drawer-toggle,.drawer-icon,.fa-solid,.fa-regular,.fa-brands')) continue;
            const action = this.sourceAction(source);
            if (action && !result.has(action.id)) result.set(action.id, action);
        }
        return result;
    }

    makeIcon(entry) {
        if (entry.icon) {
            const element = document.createElement('i');
            element.className = entry.icon;
            element.setAttribute('aria-hidden', 'true');
            return element;
        }
        const element = document.createElement('span');
        element.innerHTML = icons.extensions; // Own trusted SVG, never extension HTML.
        element.setAttribute('aria-hidden', 'true');
        return element;
    }

    button(entry, inMenu = false) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = inMenu ? 'nt-third-party-menu-item' : 'mt-appbar-icon nt-third-party-action';
        button.dataset.ntNoI18n = '';
        button.dataset.ntThirdPartyLauncher = entry.id;
        button.title = entry.label;
        button.setAttribute('aria-label', entry.label);
        button.append(this.makeIcon(entry));
        if (inMenu) {
            const text = document.createElement('span');
            text.textContent = entry.label;
            button.append(text);
        }
        button.addEventListener('click', () => {
            this.closeMenu();
            this.invoke(entry.id);
        });
        return button;
    }

    invoke(id) {
        const action = this.current.get(id);
        if (!action) return;
        try {
            if (action.onClick) action.onClick();
            else if (this.isUsable(action.source)) action.source.click();
        } catch (error) {
            console.error(`[NastyTavern] Third-party top-bar action ${id} failed:`, error);
        }
    }

    isMenuOpen() {
        const menu = this.getHost()?.querySelector('[data-nt-topbar-overflow]');
        return !!menu && !menu.hidden;
    }

    closeMenu(focusToggle = false) {
        const host = this.getHost();
        const menu = host?.querySelector('[data-nt-topbar-overflow]');
        const toggle = host?.querySelector('[data-nt-topbar-overflow-toggle]');
        if (!menu || menu.hidden) return;
        menu.hidden = true;
        toggle?.setAttribute('aria-expanded', 'false');
        if (focusToggle) toggle?.focus();
    }

    refresh() {
        if (!this.started) return;
        const host = this.getHost();
        if (!host) return;
        this.current = this.discover();
        const entries = [...this.current.values()];
        const limit = window.innerWidth <= 680 ? 1 : 3;
        const signature = JSON.stringify([limit, ...entries.map(entry => [entry.id, entry.label, entry.icon])]);
        if (this.signature === signature && host.childElementCount) return;
        this.signature = signature;
        host.replaceChildren();
        host.hidden = entries.length === 0;
        for (const entry of entries.slice(0, limit)) host.append(this.button(entry));
        if (entries.length <= limit) return;

        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'mt-appbar-icon nt-third-party-overflow-toggle';
        toggle.dataset.ntTopbarOverflowToggle = '';
        toggle.title = t('More extension actions');
        toggle.setAttribute('aria-label', toggle.title);
        toggle.setAttribute('aria-expanded', 'false');
        toggle.setAttribute('aria-haspopup', 'menu');
        toggle.append(this.makeIcon({ icon: '' }));
        const menu = document.createElement('div');
        menu.className = 'nt-third-party-overflow';
        menu.dataset.ntTopbarOverflow = '';
        menu.setAttribute('role', 'menu');
        menu.hidden = true;
        for (const entry of entries.slice(limit)) {
            const menuItem = this.button(entry, true);
            menuItem.setAttribute('role', 'menuitem');
            menu.append(menuItem);
        }
        toggle.addEventListener('click', () => {
            menu.hidden = !menu.hidden;
            toggle.setAttribute('aria-expanded', String(!menu.hidden));
            if (!menu.hidden) menu.querySelector('button')?.focus();
        });
        host.append(toggle, menu);
    }
}
