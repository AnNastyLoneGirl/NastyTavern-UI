import { icons } from './icons.js';
import { t } from './i18n.js';


const openModalStack = [];
const MODAL_STACK_BASE_Z = 4200;
const MODAL_STACK_STEP_Z = 100;
let escapeHandlerInstalled = false;

const MODAL_OPACITY_MIN = 40;
const MODAL_OPACITY_MAX = 100;
const MODAL_OPACITY_STEP = 5;

function clampModalOpacity(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return MODAL_OPACITY_MAX;
    return Math.min(MODAL_OPACITY_MAX, Math.max(MODAL_OPACITY_MIN, Math.round(number / MODAL_OPACITY_STEP) * MODAL_OPACITY_STEP));
}

function applyModalOpacity(root, value) {
    if (!root) return;
    const opacity = clampModalOpacity(value);
    const ratio = opacity / 100;
    root.dataset.ntModalOpacity = String(opacity);
    root.style.setProperty('--nt-modal-window-opacity', String(ratio));
    root.style.setProperty('--nt-modal-backdrop-opacity', opacity < MODAL_OPACITY_MAX ? '0' : '1');

    const control = root._ntModalOpacityControl;
    if (!control) return;
    control.input.value = String(opacity);
    control.input.setAttribute('aria-valuetext', `${opacity}%`);
    control.output.value = `${opacity}%`;
    control.output.textContent = `${opacity}%`;
}

function installModalOpacityControl(root, modal, header) {
    if (!root || !modal || !header) return null;
    if (root._ntModalOpacityControl?.control?.isConnected) return root._ntModalOpacityControl.control;
    root._ntModalOpacityControl = null;

    const close = header.querySelector('.nt-modal-close');
    const actions = close?.parentElement || header.querySelector('.nt-modal-header-actions, .mt-settings-header-actions') || header;

    const control = document.createElement('label');
    control.className = 'nt-modal-opacity-control';
    control.title = t('Modal opacity');

    const icon = document.createElement('span');
    icon.className = 'nt-modal-opacity-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = icons.sliders;

    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(MODAL_OPACITY_MIN);
    input.max = String(MODAL_OPACITY_MAX);
    input.step = String(MODAL_OPACITY_STEP);
    input.value = root.dataset.ntModalOpacity || String(MODAL_OPACITY_MAX);
    input.setAttribute('aria-label', t('Modal opacity'));

    const output = document.createElement('output');
    output.setAttribute('aria-hidden', 'true');

    control.append(icon, input, output);
    if (close && close.parentElement === actions) actions.insertBefore(control, close);
    else actions.append(control);

    root._ntModalOpacityControl = { control, input, output };
    input.addEventListener('input', () => applyModalOpacity(root, input.value));
    input.addEventListener('dblclick', () => applyModalOpacity(root, MODAL_OPACITY_MAX));
    applyModalOpacity(root, input.value);
    return control;
}

export function ensureModalOpacityControl(root, {
    modalSelector = '.nt-modal-shell',
    headerSelector = '.nt-modal-header',
} = {}) {
    if (!root) return null;
    const modal = root.matches?.(modalSelector) ? root : root.querySelector?.(modalSelector);
    if (!modal) return null;
    const header = modal.matches?.(headerSelector) ? modal : modal.querySelector?.(headerSelector);
    if (!header) return null;
    return installModalOpacityControl(root, modal, header);
}

function removeFromModalStack(root) {
    const index = openModalStack.lastIndexOf(root);
    if (index >= 0) openModalStack.splice(index, 1);
}

function syncModalStackLayers() {
    openModalStack.forEach((root, index) => {
        if (!root?.isConnected || root.dataset.ntModalEmbedded === 'true') return;
        root.style.zIndex = String(MODAL_STACK_BASE_Z + (index * MODAL_STACK_STEP_Z));
    });
}

function currentModalRoot() {
    for (let index = openModalStack.length - 1; index >= 0; index--) {
        const root = openModalStack[index];
        if (!root?.isConnected || root.hidden || root.dataset.ntModalEmbedded === 'true') {
            openModalStack.splice(index, 1);
            continue;
        }
        return root;
    }
    return null;
}

function ensureEscapeHandler() {
    if (escapeHandlerInstalled) return;
    escapeHandlerInstalled = true;
    document.addEventListener('keydown', event => {
        if (event.key !== 'Escape' || event.defaultPrevented) return;
        const root = currentModalRoot();
        if (!root) return;

        const request = new CustomEvent('nt:modal-escape-request', {
            cancelable: true,
            detail: { keyboardEvent: event },
        });
        root.dispatchEvent(request);
        if (request.defaultPrevented) {
            event.preventDefault();
            return;
        }
        if (event.defaultPrevented) return;

        if (typeof root._ntModalRequestClose === 'function') {
            event.preventDefault();
            root._ntModalRequestClose();
            return;
        }
        const close = root._ntModalCloseButton || root.querySelector('.nt-modal-close');
        if (!close) return;
        event.preventDefault();
        close.click();
    });
}

function setAttrs(element, attrs = {}) {
    for (const [name, value] of Object.entries(attrs || {})) {
        if (value === false || value == null) continue;
        if (value === true || value === '') element.setAttribute(name, '');
        else element.setAttribute(name, String(value));
    }
}

/**
 * Shared NastyTavern top-level modal shell.
 *
 * Feature modules own their content and behaviour. This primitive owns the
 * repeated modal structure only: root, backdrop, header, body, optional footer,
 * close control and the shared size variant hook.
 */
export function createModalShell({
    id,
    title = '',
    subtitle = '',
    eyebrow = '',
    icon = '',
    size = 'standard',
    rootClass = '',
    modalClass = '',
    backdropClass = '',
    headerClass = '',
    headingClass = '',
    iconClass = '',
    copyClass = '',
    headerActionsClass = '',
    closeClass = '',
    bodyClass = '',
    bodyAttrs = {},
    footerClass = '',
    ariaLabel = '',
    titleId = `${id}-title`,
    closeLabel = t('Close'),
    closeIcon = icons.close,
    closeAttrs = { 'data-nt-modal-close': '' },
    backdropAttrs = null,
    leadingHtml = '',
    headerActionsHtml = '',
    bodyHtml = '',
    footerHtml = null,
    includeHeader = true,
    includeOpacityControl = true,
} = {}) {
    if (!id) throw new Error('createModalShell requires an id');

    const root = document.createElement('div');
    root.id = id;
    root.hidden = true;
    root.className = ['nt-modal-root', rootClass].filter(Boolean).join(' ');

    const backdrop = document.createElement('div');
    backdrop.className = ['nt-modal-backdrop', backdropClass].filter(Boolean).join(' ');
    setAttrs(backdrop, backdropAttrs || closeAttrs);
    root.append(backdrop);

    const modal = document.createElement('section');
    modal.className = ['nt-modal-shell', `nt-modal-size-${size}`, modalClass].filter(Boolean).join(' ');
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    if (includeHeader && title) modal.setAttribute('aria-labelledby', titleId);
    else if (ariaLabel) modal.setAttribute('aria-label', ariaLabel);
    root.append(modal);

    let header = null;
    let closeButton = null;
    if (includeHeader) {
        header = document.createElement('header');
        header.className = ['nt-modal-header', 'nt-tool-header', headerClass].filter(Boolean).join(' ');

        const heading = document.createElement('div');
        heading.className = ['nt-modal-heading', headingClass].filter(Boolean).join(' ');
        if (leadingHtml) heading.insertAdjacentHTML('beforeend', leadingHtml);
        if (icon) {
            const iconWrap = document.createElement('span');
            iconWrap.className = ['nt-modal-heading-icon', iconClass].filter(Boolean).join(' ');
            iconWrap.setAttribute('aria-hidden', 'true');
            iconWrap.innerHTML = icon;
            heading.append(iconWrap);
        }
        const copy = document.createElement('div');
        copy.className = ['nt-modal-heading-copy', copyClass].filter(Boolean).join(' ');
        if (eyebrow) {
            const eyebrowNode = document.createElement('small');
            eyebrowNode.className = 'nt-modal-eyebrow';
            eyebrowNode.textContent = eyebrow;
            copy.append(eyebrowNode);
        }
        const strong = document.createElement('b');
        strong.id = titleId;
        strong.textContent = title;
        copy.append(strong);
        if (subtitle) {
            const small = document.createElement('small');
            small.textContent = subtitle;
            copy.append(small);
        }
        heading.append(copy);
        header.append(heading);

        const actions = document.createElement('div');
        actions.className = ['nt-modal-header-actions', headerActionsClass].filter(Boolean).join(' ');
        if (headerActionsHtml) actions.insertAdjacentHTML('beforeend', headerActionsHtml);
        closeButton = document.createElement('button');
        closeButton.type = 'button';
        closeButton.className = ['nt-modal-close', closeClass].filter(Boolean).join(' ');
        closeButton.title = closeLabel;
        closeButton.setAttribute('aria-label', closeLabel);
        closeButton.innerHTML = closeIcon;
        setAttrs(closeButton, closeAttrs);
        root._ntModalCloseButton = closeButton;
        actions.append(closeButton);
        header.append(actions);
        modal.append(header);
        if (includeOpacityControl) ensureModalOpacityControl(root, { modalSelector: '.nt-modal-shell', headerSelector: '.nt-modal-header' });
    }

    const body = document.createElement('div');
    body.className = ['nt-modal-body', bodyClass].filter(Boolean).join(' ');
    setAttrs(body, bodyAttrs);
    if (bodyHtml) body.innerHTML = bodyHtml;
    modal.append(body);

    let footer = null;
    if (footerHtml !== null) {
        footer = document.createElement('footer');
        footer.className = ['nt-modal-footer', footerClass].filter(Boolean).join(' ');
        footer.innerHTML = footerHtml;
        modal.append(footer);
    }

    return { root, backdrop, modal, header, body, footer, closeButton };
}

/** Show a shared shell without changing feature-specific state. */
export function showModalShell(root) {
    if (!root) return;
    ensureEscapeHandler();
    root.hidden = false;
    if (root.dataset.ntModalEmbedded !== 'true') {
        removeFromModalStack(root);
        openModalStack.push(root);
        syncModalStackLayers();
    }
    requestAnimationFrame(() => root?.classList.add('is-open'));
}

/** Hide a shared shell. Feature modules remain responsible for restoring any native DOM they moved. */
export function hideModalShell(root, { immediate = true, duration = 160 } = {}) {
    if (!root) return;
    removeFromModalStack(root);
    root.style.removeProperty('z-index');
    syncModalStackLayers();
    root.classList.remove('is-open');
    if (immediate || root.dataset.ntModalEmbedded === 'true') {
        root.hidden = true;
        return;
    }
    setTimeout(() => {
        if (root && !root.classList.contains('is-open')) root.hidden = true;
    }, duration);
}

/**
 * Migration helper for complex existing surfaces whose feature markup must stay
 * intact. It attaches the canonical shell classes without duplicating geometry.
 */
export function adoptModalShell(root, {
    modalSelector,
    backdropSelector = null,
    headerSelector = null,
    bodySelector = null,
    footerSelector = null,
    size = 'standard',
} = {}) {
    if (!root || !modalSelector) return null;
    const modal = root.querySelector(modalSelector);
    if (!modal) return null;
    root.classList.add('nt-modal-root');
    modal.classList.add('nt-modal-shell', `nt-modal-size-${size}`);
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    const backdrop = backdropSelector ? root.querySelector(backdropSelector) : null;
    backdrop?.classList.add('nt-modal-backdrop');
    const header = headerSelector ? modal.querySelector(headerSelector) : null;
    header?.classList.add('nt-modal-header');
    const body = bodySelector ? modal.querySelector(bodySelector) : null;
    body?.classList.add('nt-modal-body');
    const footer = footerSelector ? modal.querySelector(footerSelector) : null;
    footer?.classList.add('nt-modal-footer');
    root._ntModalCloseButton = modal.querySelector('.nt-modal-close');
    if (header) ensureModalOpacityControl(root, { modalSelector, headerSelector });
    return { root, modal, backdrop, header, body, footer };
}


/** Register a feature-specific close request without reimplementing keyboard handling. */
export function setModalShellCloseHandler(root, handler) {
    if (!root) return;
    root._ntModalRequestClose = typeof handler === 'function' ? handler : null;
}
