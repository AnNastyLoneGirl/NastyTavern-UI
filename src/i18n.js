let messages = {};
let locale = 'en';
let observer = null;

const roots = '#mt-root,#mt-command-palette,#mt-settings-panel,.mt-workspace-chrome,#character_popup.mt-advanced-character-popup,#nt-chat-toolbar,#nt-chat-history,#nt-variable-manager,#nt-variable-manager-quick-button,#nt-world-info-info,#nt-world-info-info-button,#nt-timeline-panel,#nt-timeline-button,#nt-context-inspector,#nt-context-inspector-button,#nt-chat-tools,#nt-chat-tools-button,#nt-calendar-manager,#nt-calendar-button,#nt-preferences,#nt-health-panel,#nt-about-panel';
const skip = '.mes_text,.nt-wii-content,.nt-wii-book-title span,.nt-wii-entry-main,.nt-wii-entry pre,.nt-wii-live b,.nt-wii-keychips,.nt-var-name,.nt-var-value,[data-nt-var-chat],.nt-chat-history-item b,.nt-timeline-node-text,.nt-timeline-node-top b,.nt-timeline-message-preview,.nt-timeline-inspector-head b,.nt-timeline-session>div>b,.nt-timeline-swipes article p,.nt-context-prompt pre,.nt-note-title,.nt-note-text,.nt-chat-bookmarks p,[data-nt-timeline-subtitle],[data-mt-profile-current],.nt-calendar-event-card b,.nt-calendar-event-card p,[data-nt-calendar-preview],.nt-calendar-next b,[data-nt-no-i18n]';

const normalizeLocale = value => {
    const code = String(value || 'en').trim().toLowerCase().replace('_', '-');
    if (code.startsWith('fr')) return 'fr-fr';
    return code || 'en';
};

const loadLocale = async code => {
    if (!code || code === 'en') return {};
    try {
        const url = new URL(`../locales/${code}.json`, import.meta.url);
        const response = await fetch(url, { cache: 'no-cache' });
        if (!response.ok) return {};
        const data = await response.json();
        return data && typeof data === 'object' ? data : {};
    } catch (_) {
        return {};
    }
};

const interpolate = (value, vars = {}) => String(value).replace(/\{([\w.-]+)\}/g, (_, key) => Object.hasOwn(vars, key) ? String(vars[key]) : `{${key}}`);

export async function initI18n() {
    const requested = normalizeLocale(localStorage.getItem('language') || document.documentElement.lang || navigator.language || navigator.userLanguage || 'en');
    locale = requested;
    messages = await loadLocale(requested);
    return locale;
}

export function getLocale() {
    return locale;
}

export function t(source, vars = {}) {
    return interpolate(messages[source] ?? source, vars);
}

function dynamicTranslation(value) {
    const rules = [
        [/^(\d+) messages?$/, match => t('{count} messages', { count: match[1] })],
        [/^(\d+) active entries$/, match => t('{count} active entries', { count: match[1] })],
        [/^(\d+) lorebooks?$/, match => t('{count} lorebooks', { count: match[1] })],
        [/^Message (\d+)$/, match => t('Message {count}', { count: match[1] })],
        [/^Swipe (\d+)$/, match => t('Swipe {count}', { count: match[1] })],
        [/^Shared by (\d+) chats$/, match => t('Shared by {count} chats', { count: match[1] })],
        [/^(\d+) matches?$/, match => t('{count} matches', { count: match[1] })],
        [/^(\d+) branches$/, match => t('{count} branches', { count: match[1] })],
        [/^(\d+) swipes$/, match => t('{count} swipes', { count: match[1] })],
        [/^(\d+) chats$/, match => t('{count} chats', { count: match[1] })],
        [/^(\d+) conversations?$/, match => t('{count} conversations', { count: match[1] })],
        [/^Branch of (.+)$/, match => t('Branch of {name}', { name: match[1] })],
        [/^Connection profile: (.+) · click for next$/, match => t('Connection profile: {name} · click for next', { name: match[1] })],
        [/^Order (.+)$/, match => t('Order {value}', { value: match[1] })],
        [/^Depth (.+)$/, match => t('Depth {value}', { value: match[1] })],
        [/^Sticky (.+)$/, match => t('Sticky {value}', { value: match[1] })],
        [/^Variable “(.+)” already exists in (local|global) scope\.$/, match => t('Variable “{name}” already exists in {scope} scope.', { name: match[1], scope: t(match[2]) })],
        [/^Created (local|global) variable “(.+)”\.$/, match => t('Created {scope} variable “{name}”.', { scope: t(match[1]), name: match[2] })],
        [/^Saved “(.+)”\.$/, match => t('Saved “{name}”.', { name: match[1] })],
        [/^Deleted “(.+)”\.$/, match => t('Deleted “{name}”.', { name: match[1] })],
        [/^Could not open (.+): (.+)\. The native SillyTavern toolbar is still available\.$/, match => t('Could not open {view}: {detail}. The native SillyTavern toolbar is still available.', { view: t(match[1]), detail: t(match[2]) })],
    ];
    for (const [pattern, render] of rules) {
        const match = value.match(pattern);
        if (match) return render(match);
    }
    return t(value);
}

export function translateText(value) {
    const source = String(value ?? '');
    const match = source.match(/^(\s*)(.*?)(\s*)$/s);
    if (!match) return source;
    const body = match[2];
    if (!body) return source;
    const translated = dynamicTranslation(body);
    return translated === body ? source : `${match[1]}${translated}${match[3]}`;
}

function shouldSkip(node) {
    const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    return !!element?.closest?.(skip);
}

export function localizeElement(root) {
    if (!root || shouldSkip(root)) return;
    if (root.nodeType === Node.ELEMENT_NODE) {
        for (const attr of ['title', 'aria-label', 'placeholder']) {
            if (!root.hasAttribute?.(attr)) continue;
            const current = root.getAttribute(attr);
            const translated = translateText(current);
            if (translated !== current) root.setAttribute(attr, translated);
        }
        root.querySelectorAll?.('[title],[aria-label],[placeholder]').forEach(element => {
            if (shouldSkip(element)) return;
            for (const attr of ['title', 'aria-label', 'placeholder']) {
                if (!element.hasAttribute(attr)) continue;
                const current = element.getAttribute(attr);
                const translated = translateText(current);
                if (translated !== current) element.setAttribute(attr, translated);
            }
        });
    }
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
        if (shouldSkip(node)) continue;
        const current = node.nodeValue;
        const translated = translateText(current);
        if (translated !== current) node.nodeValue = translated;
    }
}

export function localizeOwnedUI() {
    document.querySelectorAll(roots).forEach(localizeElement);
}

export function startI18nObserver() {
    stopI18nObserver();
    observer = new MutationObserver(mutations => {
        const targets = new Set();
        for (const mutation of mutations) {
            const element = mutation.target.nodeType === Node.ELEMENT_NODE ? mutation.target : mutation.target.parentElement;
            const owner = element?.closest?.(roots);
            if (owner) targets.add(owner);
            for (const node of mutation.addedNodes || []) {
                const added = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
                const addedOwner = added?.matches?.(roots) ? added : added?.closest?.(roots);
                if (addedOwner) targets.add(addedOwner);
            }
        }
        targets.forEach(localizeElement);
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['title', 'aria-label', 'placeholder'] });
}

export function stopI18nObserver() {
    observer?.disconnect();
    observer = null;
}
