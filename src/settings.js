export const MODULE = 'modern_tavern_ui';

export const defaults = Object.freeze({
    enabled: true,
    accent: '#7c6cff',
    density: 'comfortable',
    radius: 14,
    blur: 14,
    navWidth: 222,
    compactNav: false,
    navHidden: false,
    appbarMinimized: false,
    chatBarMinimized: false,
    extensionsBarMinimized: false,
    focusMode: false,
    contextRail: false,
    hideNativeTopbar: true,
    dockNativePanels: true,
    motion: true,
    chatWidth: 940,
    messageWidth: 860,
    historyLimit: 50,
    shortcutDefaultsVersion: 2,
    shortcuts: {
        commandPalette: 'Ctrl+Alt+K',
        timeline: 'Ctrl+Alt+T',
        contextInspector: 'Ctrl+Alt+P',
        worldInfoInspector: 'Ctrl+Alt+W',
        variables: 'Ctrl+Alt+V',
        chatTools: 'Ctrl+Alt+N',
        calendar: 'Ctrl+Alt+C',
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

export function getContextSafe() {
    try { return window.SillyTavern?.getContext?.() || null; } catch (_) { return null; }
}

export function getSettings() {
    const context = getContextSafe();
    if (!context?.extensionSettings) {
        const local = JSON.parse(localStorage.getItem('modern_tavern_ui_fallback') || '{}');
        return Object.assign({}, defaults, local);
    }
    if (!context.extensionSettings[MODULE]) context.extensionSettings[MODULE] = structuredClone(defaults);
    const settings = context.extensionSettings[MODULE];
    for (const [key, value] of Object.entries(defaults)) {
        if (!Object.hasOwn(settings, key)) settings[key] = structuredClone(value);
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
    delete settings.workspacePresets;
    delete settings.activeWorkspacePreset;
    return settings;
}

export function saveSettings() {
    const context = getContextSafe();
    if (context?.saveSettingsDebounced) context.saveSettingsDebounced();
    else localStorage.setItem('modern_tavern_ui_fallback', JSON.stringify(getSettings()));
}

export function applySettings(settings) {
    const root = document.documentElement;
    const unifiedChatMinimized = !!settings.chatBarMinimized || !!settings.extensionsBarMinimized;
    settings.chatBarMinimized = unifiedChatMinimized;
    settings.extensionsBarMinimized = unifiedChatMinimized;
    root.style.setProperty('--mt-accent', settings.accent);
    root.style.setProperty('--mt-radius', `${settings.radius}px`);
    root.style.setProperty('--mt-blur', `${settings.blur}px`);
    root.style.setProperty('--mt-nav-width', `${settings.compactNav ? 76 : settings.navWidth}px`);
    root.style.setProperty('--mt-chat-width', `${settings.chatWidth}px`);
    root.style.setProperty('--mt-message-width', `${settings.messageWidth}px`);
    root.style.setProperty('--mt-context-width', '0px');
    document.body?.classList.toggle('mt-enabled', !!settings.enabled);
    document.body?.classList.toggle('mt-density-compact', settings.density === 'compact');
    document.body?.classList.toggle('mt-density-comfortable', settings.density !== 'compact');
    document.body?.classList.toggle('mt-nav-compact', !!settings.compactNav);
    document.body?.classList.toggle('mt-nav-hidden', !!settings.navHidden);
    document.body?.classList.toggle('mt-appbar-minimized', !!settings.appbarMinimized);
    document.body?.classList.toggle('nt-chat-main-minimized', !!settings.chatBarMinimized);
    document.body?.classList.toggle('nt-chat-extensions-minimized', !!settings.extensionsBarMinimized);
    document.body?.classList.toggle('mt-focus-mode', !!settings.focusMode);
    settings.contextRail = false;
    document.body?.classList.add('mt-context-hidden');
    document.body?.classList.toggle('mt-hide-native-topbar', !!settings.hideNativeTopbar);
    document.body?.classList.toggle('mt-dock-panels', !!settings.dockNativePanels);
    document.body?.classList.toggle('mt-motion', !!settings.motion);
}

export function buildSettingsPanel(settings, onChange, onOpenHub) {
    const wrap = document.createElement('div');
    wrap.id = 'mt-settings-panel';
    wrap.className = 'inline-drawer mt-settings-native';
    wrap.innerHTML = `
      <div class="inline-drawer-toggle inline-drawer-header">
        <b>NastyTavern UI</b>
        <div class="fa-solid fa-circle-chevron-down inline-drawer-icon down"></div>
      </div>
      <div class="inline-drawer-content">
        <div class="mt-settings-grid">
          <label class="checkbox_label"><input data-mt-setting="enabled" type="checkbox"> Enable NastyTavern UI</label>
          <label class="checkbox_label"><input data-mt-setting="hideNativeTopbar" type="checkbox"> Replace native top toolbar</label>
          <label class="checkbox_label"><input data-mt-setting="dockNativePanels" type="checkbox"> Dock native panels</label>
          <label class="checkbox_label"><input data-mt-setting="motion" type="checkbox"> Interface animations</label>
          <label>Accent <input data-mt-setting="accent" type="color"></label>
          <label>Density <select data-mt-setting="density"><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select></label>
          <label>Corner radius <input data-mt-setting="radius" type="range" min="4" max="24" step="1"><span data-mt-value="radius"></span></label>
          <label>Navigation width <input data-mt-setting="navWidth" type="range" min="180" max="300" step="2"><span data-mt-value="navWidth"></span></label>
          <label>Chat max width <input data-mt-setting="chatWidth" type="range" min="700" max="1400" step="20"><span data-mt-value="chatWidth"></span></label>
          <label>Message max width <input data-mt-setting="messageWidth" type="range" min="560" max="1200" step="20"><span data-mt-value="messageWidth"></span></label>
        </div>
        <div class="mt-settings-actions">
          <button class="menu_button" data-mt-action="open-hub">Open NastyTavern Settings</button>
          <button class="menu_button" data-mt-action="toggle-nav">Toggle compact navigation</button>
          <button class="menu_button" data-mt-action="reset">Reset NastyTavern UI</button>
        </div>
      </div>`;

    const sync = () => {
        wrap.querySelectorAll('[data-mt-setting]').forEach(input => {
            const key = input.dataset.mtSetting;
            if (input.type === 'checkbox') input.checked = !!settings[key];
            else input.value = settings[key];
        });
        wrap.querySelectorAll('[data-mt-value]').forEach(span => {
            const key = span.dataset.mtValue;
            span.textContent = key.includes('Width') ? `${settings[key]} px` : `${settings[key]} px`;
        });
    };

    wrap.addEventListener('input', event => {
        const input = event.target.closest('[data-mt-setting]');
        if (!input) return;
        const key = input.dataset.mtSetting;
        let value = input.type === 'checkbox' ? input.checked : input.value;
        if (input.type === 'range') value = Number(value);
        settings[key] = value;
        sync();
        onChange();
    });
    wrap.addEventListener('click', event => {
        const action = event.target.closest('[data-mt-action]')?.dataset.mtAction;
        if (action === 'open-hub') {
            onOpenHub?.();
        }
        if (action === 'toggle-nav') {
            settings.compactNav = !settings.compactNav;
            onChange(); sync();
        }
        if (action === 'reset') {
            Object.assign(settings, structuredClone(defaults));
            onChange(); sync();
        }
    });
    sync();
    return wrap;
}
