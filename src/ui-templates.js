import { icons } from './icons.js';
import { t } from './i18n.js';
import { escapeHtml as esc, getContextSafe } from './utils.js';

const dataAttribute = value => {
    const name = String(value || '').trim();
    if (!name) return '';
    return name.startsWith('data-') ? name : `data-${name}`;
};

const attrsHtml = attrs => Object.entries(attrs || {}).map(([name, value]) => {
    if (!/^[A-Za-z_:][A-Za-z0-9:_.-]*$/.test(name) || value === false || value == null) return '';
    if (value === true || value === '') return ` ${name}`;
    return ` ${name}="${esc(value)}"`;
}).join('');

export function initials(value) {
    return String(value || '?').trim().slice(0, 2).toUpperCase();
}

export function avatarHtml(url, name, { size = null, alt = '', wrapInitials = false, initialsClass = '' } = {}) {
    const source = String(url || '').trim();
    const px = Number(size);
    const sizeAttrs = Number.isFinite(px) && px > 0 ? ` width="${Math.round(px)}" height="${Math.round(px)}"` : '';
    if (source) return `<img src="${esc(source)}" alt="${esc(alt)}"${sizeAttrs}>`;
    const fallback = esc(initials(name));
    if (!wrapInitials) return fallback;
    return `<span${initialsClass ? ` class="${esc(initialsClass)}"` : ''}>${fallback}</span>`;
}

export function starsHtml(average) {
    const value = Number(average || 0);
    const rounded = Math.max(0, Math.min(5, Math.round(value * 2) / 2));
    return [1, 2, 3, 4, 5].map(star => {
        const state = rounded >= star ? 'is-filled' : (rounded >= star - 0.5 ? 'is-half' : 'is-empty');
        return `<span class="${state}" aria-hidden="true">★</span>`;
    }).join('');
}

export function tabsHtml(dataAttr, tabs = [], { className = '' } = {}) {
    const attr = dataAttribute(dataAttr);
    const classes = ['nt-tool-tabs', className].filter(Boolean).join(' ');
    return `<div class="${esc(classes)}">${tabs.map(tab => {
        const id = esc(tab?.id ?? '');
        const label = esc(tab?.label ?? '');
        const active = tab?.active ? ' class="is-active"' : '';
        return `<button type="button"${active}${attr ? ` ${attr}="${id}"` : ''}>${label}</button>`;
    }).join('')}</div>`;
}

export function emptyStateHtml({
    icon = '',
    title = '',
    subtitle = '',
    actionHtml = '',
    className = '',
    attrs = {},
    iconClass = '',
    iconAttrs = {},
    titleAttrs = {},
    subtitleAttrs = {},
} = {}) {
    const classes = ['nt-tool-empty', className].filter(Boolean).join(' ');
    const iconMarkup = icon ? `<span${iconClass ? ` class="${esc(iconClass)}"` : ''}${attrsHtml(iconAttrs)}>${icon}</span>` : '';
    const titleMarkup = title || Object.keys(titleAttrs || {}).length ? `<b${attrsHtml(titleAttrs)}>${esc(title)}</b>` : '';
    const subtitleMarkup = subtitle || Object.keys(subtitleAttrs || {}).length ? `<small${attrsHtml(subtitleAttrs)}>${esc(subtitle)}</small>` : '';
    return `<div class="${esc(classes)}"${attrsHtml(attrs)}>${iconMarkup}${titleMarkup}${subtitleMarkup}${actionHtml || ''}</div>`;
}

export function closeButtonHtml(dataAttr, { label = t('Close'), className = '', icon = icons.close, attrs = {} } = {}) {
    const attr = dataAttribute(dataAttr);
    const classes = ['nt-modal-close', className].filter(Boolean).join(' ');
    return `<button type="button" class="${esc(classes)}"${attr ? ` ${attr}` : ''} title="${esc(label)}" aria-label="${esc(label)}"${attrsHtml(attrs)}>${icon}</button>`;
}

export async function confirmDialog(message) {
    const text = String(message ?? '');
    const context = getContextSafe();
    try {
        if (context?.Popup?.show?.confirm) return Boolean(await context.Popup.show.confirm(text));
    } catch (_) {}
    try {
        return Boolean(window.confirm(text));
    } catch (_) {
        return false;
    }
}
