import { saveSettings } from './settings.js';

const nameOf = name => String(name ?? '').trim();

/**
 * A non-destructive, per-book master enable switch.
 *
 * SillyTavern has native ON/OFF controls for entries and a selection for global
 * books, but no single native "disabled book" flag that also covers character,
 * persona and chat bindings. Filter World Info's four source arrays at its
 * WORLDINFO_ENTRIES_LOADED event, before the prompt merges them. No lorebook
 * file, entry, global selection or character/persona/chat binding is altered.
 *
 * Settings persist across refreshes; the listener is live even when the
 * Lorebook gallery is closed, and is removed if NastyTavern is disabled.
 */
export class LorebookActivation {
    constructor(settings) {
        this.settings = settings;
        this.listener = null;
        this.onEntriesLoaded = this.onEntriesLoaded.bind(this);
    }

    disabledBooks() {
        const names = this.settings?.lorebookStudio?.disabledBooks;
        return Array.isArray(names) ? names : [];
    }

    isEnabled(name) {
        const key = nameOf(name);
        return !key || !this.disabledBooks().includes(key);
    }

    setEnabled(name, enabled) {
        const key = nameOf(name);
        if (!key || typeof enabled !== 'boolean') return false;
        const current = this.disabledBooks();
        const next = current.filter(item => item !== key);
        if (!enabled) next.push(key);
        if (current.length === next.length && current.every((item, index) => item === next[index])) return true;
        this.settings.lorebookStudio ||= {};
        this.settings.lorebookStudio.disabledBooks = next;
        saveSettings();
        return true;
    }

    rename(oldName, newName) {
        const before = nameOf(oldName);
        const after = nameOf(newName);
        if (!before || !after || before === after || this.isEnabled(before)) return;
        const next = this.disabledBooks().filter(name => name !== before && name !== after);
        next.push(after);
        this.settings.lorebookStudio.disabledBooks = next;
        saveSettings();
    }

    forget(name) {
        const key = nameOf(name);
        if (key && !this.isEnabled(key)) this.setEnabled(key, true);
    }

    onEntriesLoaded(lores) {
        const disabled = new Set(this.disabledBooks());
        if (!disabled.size || !lores) return;
        for (const key of ['globalLore', 'characterLore', 'chatLore', 'personaLore']) {
            const entries = lores[key];
            if (!Array.isArray(entries)) continue;
            // Preserve the existing array identity: SillyTavern's getSortedEntries
            // has already captured these arrays before emitting this event.
            for (let i = entries.length - 1; i >= 0; i--) {
                if (disabled.has(nameOf(entries[i]?.world))) entries.splice(i, 1);
            }
        }
    }

    mount() {
        if (this.listener) return;
        let context;
        try { context = window.SillyTavern?.getContext?.(); } catch (_) { return; }
        const source = context?.eventSource;
        const type = (context?.eventTypes || context?.event_types)?.WORLDINFO_ENTRIES_LOADED;
        if (!source?.on || !type) return;
        source.on(type, this.onEntriesLoaded);
        this.listener = { source, type };
    }

    unmount() {
        if (!this.listener) return;
        const { source, type } = this.listener;
        if (typeof source.off === 'function') source.off(type, this.onEntriesLoaded);
        else source.removeListener?.(type, this.onEntriesLoaded);
        this.listener = null;
    }
}
