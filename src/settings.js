import { getContextSafe } from './utils.js';
const MODULE = 'modern_tavern_ui';

export const defaults = Object.freeze({
    enabled: true,
    accent: '#7c6cff',
    density: 'comfortable',
    radius: 10,
    blur: 8,
    navWidth: 222,
    compactNav: false,
    navHidden: false,
    focusMode: false,
    hideNativeTopbar: true,
    dockNativePanels: true,
    motion: true,
    chatWidth: 940,
    messageWidth: 860,
    historyLimit: 50,
    // Privacy-first: Community performs no external network activity until explicitly enabled.
    communityNetworkEnabled: false,
    // Presence is independent from Community access and remains opt-in.
    communityPresenceEnabled: false,
    modules: {
        timeline: true,
        contextInspector: true,
        worldInfoInspector: true,
        variables: true,
        chatTools: true,
        calendar: true,
        community: true,
    },
    shortcutDefaultsVersion: 3,
    shortcuts: {
        commandPalette: 'Ctrl+Alt+K',
        timeline: 'Ctrl+Alt+T',
        contextInspector: 'Ctrl+Alt+P',
        worldInfoInspector: 'Ctrl+Alt+W',
        variables: 'Ctrl+Alt+V',
        chatTools: 'Ctrl+Alt+N',
        calendar: 'Ctrl+Alt+C',
        community: 'Ctrl+Alt+G',
        communityPresence: 'Ctrl+Alt+O',
        health: 'Ctrl+Alt+H',
        focusMode: 'Ctrl+Alt+F',
        nativeChat: '',
        nativeCharacters: '',
        nativePersonas: '',
        nativeLorebooks: '',
        nativeBackgrounds: '',
        nativeFormatting: '',
        nativePrompts: '',
        nativeModels: '',
        nativeExtensions: '',
        nativeSettings: '',
        nativeDataBank: '',
    },
});


export function getSettings() {
    const context = getContextSafe();
    if (!context?.extensionSettings) {
        const local = JSON.parse(localStorage.getItem('modern_tavern_ui_fallback') || '{}');
        const settings = Object.assign({}, defaults, local);
        delete settings.community;
        if (settings.navHidden) {
            settings.navHidden = false;
            settings.compactNav = true;
        }
        delete settings.chatBarMinimized;
        delete settings.extensionsBarMinimized;
        return settings;
    }
    if (!context.extensionSettings[MODULE]) context.extensionSettings[MODULE] = structuredClone(defaults);
    const settings = context.extensionSettings[MODULE];
    for (const [key, value] of Object.entries(defaults)) {
        if (!Object.hasOwn(settings, key)) settings[key] = structuredClone(value);
    }
    if (!settings.modules || typeof settings.modules !== 'object') settings.modules = structuredClone(defaults.modules);
    for (const [key, value] of Object.entries(defaults.modules)) {
        if (!Object.hasOwn(settings.modules, key)) settings.modules[key] = value;
    }
    if (!settings.shortcuts || typeof settings.shortcuts !== 'object') settings.shortcuts = structuredClone(defaults.shortcuts);
    for (const [key, value] of Object.entries(defaults.shortcuts)) {
        if (!Object.hasOwn(settings.shortcuts, key)) settings.shortcuts[key] = value;
    }
    if ((settings.shortcutDefaultsVersion || 0) < 2) {
        const oldDefaults = { commandPalette:'Ctrl+K', timeline:'Ctrl+Shift+T', contextInspector:'Ctrl+Shift+P', worldInfoInspector:'Ctrl+Shift+W', variables:'Ctrl+Shift+V', chatTools:'Ctrl+Shift+N', calendar:'', health:'Ctrl+Shift+H' };
        for (const [key, oldValue] of Object.entries(oldDefaults)) {
            if (settings.shortcuts[key] === oldValue) settings.shortcuts[key] = defaults.shortcuts[key];
        }
        settings.shortcutDefaultsVersion = 2;
        context.saveSettingsDebounced?.();
    }
    if ((settings.shortcutDefaultsVersion || 0) < 3) {
        if (!Object.hasOwn(settings.shortcuts, 'communityPresence')) settings.shortcuts.communityPresence = defaults.shortcuts.communityPresence;
        settings.shortcutDefaultsVersion = 3;
        context.saveSettingsDebounced?.();
    }
    if (Object.hasOwn(settings, 'chatBarMinimized') || Object.hasOwn(settings, 'extensionsBarMinimized')) {
        delete settings.chatBarMinimized;
        delete settings.extensionsBarMinimized;
        context.saveSettingsDebounced?.();
    }
    delete settings.workspacePresets;
    delete settings.community;
    delete settings.activeWorkspacePreset;
    if (Object.hasOwn(settings, 'appbarMinimized')) {
        delete settings.appbarMinimized;
        context.saveSettingsDebounced?.();
    }
    // The sidebar collapse control now toggles expanded/compact only.
    // Migrate any legacy fully-hidden state to compact navigation so the menu stays reachable.
    if (settings.navHidden) {
        settings.navHidden = false;
        settings.compactNav = true;
        context.saveSettingsDebounced?.();
    }
    return settings;
}

export function saveSettings() {
    const context = getContextSafe();
    if (context?.saveSettingsDebounced) context.saveSettingsDebounced();
    else localStorage.setItem('modern_tavern_ui_fallback', JSON.stringify(getSettings()));
}

function getAccentContrast(hex) {
    const value = String(hex || '').trim().replace(/^#/, '');
    if (!/^[0-9a-f]{6}$/i.test(value)) return '#fff';
    const rgb = [0, 2, 4].map(i => parseInt(value.slice(i, i + 2), 16) / 255);
    const linear = rgb.map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
    const luminance = 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
    return luminance > 0.43 ? '#111318' : '#ffffff';
}

export function applySettings(settings) {
    const root = document.documentElement;
    root.style.setProperty('--mt-accent', settings.accent);
    root.style.setProperty('--mt-accent-contrast', getAccentContrast(settings.accent));
    root.style.setProperty('--mt-radius', `${settings.radius}px`);
    root.style.setProperty('--mt-blur', `${settings.blur}px`);
    // Keep the user preference separate from the effective responsive width.
    // An inline --mt-nav-width would override CSS media queries after a viewport/orientation change.
    root.style.removeProperty('--mt-nav-width');
    root.style.setProperty('--mt-nav-width-user', `${settings.navWidth}px`);
    root.style.setProperty('--mt-chat-width', `${settings.chatWidth}px`);
    root.style.setProperty('--mt-message-width', `${settings.messageWidth}px`);
    document.body?.classList.toggle('mt-enabled', !!settings.enabled);
    document.body?.classList.toggle('mt-density-compact', settings.density === 'compact');
    document.body?.classList.toggle('mt-density-comfortable', settings.density !== 'compact');
    document.body?.classList.toggle('mt-nav-compact', !!settings.compactNav);
    document.body?.classList.toggle('mt-nav-hidden', !!settings.navHidden);
    // Header visibility is controlled exclusively by Focus Mode.
    document.body?.classList.remove('mt-appbar-minimized');
    document.body?.classList.remove('nt-chat-main-minimized', 'nt-chat-extensions-minimized');
    document.body?.classList.toggle('mt-focus-mode', !!settings.focusMode);
    document.body?.classList.toggle('mt-hide-native-topbar', !!settings.hideNativeTopbar);
    document.body?.classList.toggle('mt-dock-panels', !!settings.dockNativePanels);
    const modules = settings.modules || defaults.modules;
    document.body?.classList.toggle('nt-hide-module-timeline', modules.timeline === false);
    document.body?.classList.toggle('nt-hide-module-context', modules.contextInspector === false);
    document.body?.classList.toggle('nt-hide-module-worldinfo', modules.worldInfoInspector === false);
    document.body?.classList.toggle('nt-hide-module-variables', modules.variables === false);
    document.body?.classList.toggle('nt-hide-module-chattools', modules.chatTools === false);
    document.body?.classList.toggle('nt-hide-module-calendar', modules.calendar === false);
    document.body?.classList.toggle('nt-hide-module-community', modules.community === false);
    document.body?.classList.toggle('mt-motion', !!settings.motion);
}
