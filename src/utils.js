/** Shared, dependency-free helpers used across NastyTavern modules. */
export function getContextSafe() {
    try {
        return window.SillyTavern?.getContext?.() || null;
    } catch (_) {
        return null;
    }
}

export function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

export function formatBytes(value) {
    const bytes = Number(value || 0);
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
    const amount = bytes / (1024 ** index);
    return `${amount >= 10 || index === 0 ? amount.toFixed(0) : amount.toFixed(1)} ${units[index]}`;
}

export function debounce(fn, ms = 280) {
    let timer = null;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), ms);
    };
}

export async function withViewOpeningState(element, task) {
    if (typeof task !== 'function') return undefined;
    const target = element && element.nodeType === 1 ? element : null;
    if (!target) return task();
    if (target.classList.contains('is-view-opening')) return undefined;

    const previousBusy = target.getAttribute('aria-busy');
    target.classList.add('is-view-opening');
    target.setAttribute('aria-busy', 'true');
    try {
        return await task();
    } finally {
        target.classList.remove('is-view-opening');
        if (previousBusy == null) target.removeAttribute('aria-busy');
        else target.setAttribute('aria-busy', previousBusy);
    }
}
