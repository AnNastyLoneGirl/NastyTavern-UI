import { icons } from './icons.js';
import { t } from './i18n.js';
import { createModalShell, showModalShell, hideModalShell } from './modal-shell.js';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function makePlaceholder(label) {
    const node = document.createComment(`NastyTavern ${label}`);
    return node;
}

export class ExtensionsModal {
    constructor(toast = () => {}) {
        this.toast = toast;
        this.root = null;
        this.opening = false;
        this.settingsState = null;
        this.managerPopup = null;
        this.managerInfo = null;
        this.managerObserver = null;
        this.managerRecaptureTimer = null;
        this.managerWatchTimer = null;
        this.PopupClass = null;
        this.managerCaptureBusy = false;
        this.managerUiState = null;
        this.settingsPopup = null;
        this.settingsPopupDrawer = null;
        this.settingsPopupMountRoot = null;
        this.settingsPopupPlaceholder = null;
        this.settingsPopupOpener = null;
        this.opener = null;
        this.boundManagerCaptureClick = event => this.onManagerCaptureClick(event);
        this.boundSettingsLauncherClick = event => this.onSettingsLauncherClick(event);
    }

    ensureRoot() {
        let root = this.root;
        if (!root?.isConnected) root = document.querySelector('#nt-extensions-modal');
        if (!root) {
            ({ root } = createModalShell({
                id: 'nt-extensions-modal',
                title: t('Extensions'),
                icon: icons.extensions,
                size: 'large',
                modalClass: 'nt-extensions-modal',
                headerClass: 'nt-extensions-modal-header',
                bodyClass: 'nt-extensions-modal-body',
                headerActionsHtml: `<button type="button" class="nt-panel-toggle nt-extensions-manager-toggle" data-nt-extensions-manager-toggle aria-expanded="true" title="${t('Hide Manage extensions')}" aria-label="${t('Hide Manage extensions')}">${icons.panel}</button>`,
                closeAttrs: { 'data-nt-extensions-close': '' },
                bodyHtml: `
                    <div class="nt-extensions-topbar">
                        <label class="nt-extensions-notify" for="nt-extensions-notify-input">
                            <input id="nt-extensions-notify-input" type="checkbox" data-nt-extensions-notify>
                            <span>${t('Notify on extension updates')}</span>
                        </label>
                        <button type="button" class="nt-extensions-top-action" data-nt-extensions-copy-report title="${t('Copy third-party extension report')}" aria-label="${t('Copy third-party extension report')}">${icons.copy}<span>${t('Copy report')}</span></button>
                        <button type="button" class="nt-extensions-top-action" data-nt-extensions-update-all disabled>${icons.download}<span>${t('Update all')}</span></button>
                        <button type="button" class="nt-extensions-top-action" data-nt-extensions-update-enabled disabled>${icons.refresh}<span>${t('Update enabled')}</span></button>
                        <button type="button" class="nt-extensions-top-action is-primary" data-nt-extensions-install>${icons.plus}<span>${t('Install extension')}</span></button>
                    </div>
                    <div class="nt-extensions-workspace">
                        <aside class="nt-extensions-manager-panel">
                            <div class="nt-extensions-pane-heading">
                                <div><b>${t('Manage extensions')}</b><small>${t('Enable, disable, update, sort, move or remove installed extensions.')}</small></div>
                            </div>
                            <div class="nt-extensions-manager-tools" data-nt-extensions-manager-tools hidden>
                                <b data-nt-extensions-builtins-label></b>
                                <div class="nt-extensions-sort-host" data-nt-extensions-sort-host></div>
                            </div>
                            <div class="nt-extensions-manager-scroll" data-nt-extensions-manager-host>
                                <div class="nt-extensions-loading"><i class="fa-solid fa-spinner fa-spin"></i><span>${t('Loading extensions...')}</span></div>
                            </div>
                        </aside>
                        <button type="button" class="nt-extensions-manager-scrim" data-nt-extensions-manager-dismiss aria-label="${t('Hide Manage extensions')}"></button>
                        <main class="nt-extensions-settings-panel">
                            <div class="nt-extensions-pane-heading">
                                <div><b>${t('Extension settings')}</b><small>${t('Settings provided by your installed extensions.')}</small></div>
                            </div>
                            <div class="nt-extensions-settings-scroll" data-nt-extensions-settings-host></div>
                        </main>
                    </div>`,
            }));

            root.addEventListener('click', event => {
                const target = event.target instanceof Element ? event.target : null;
                if (!target) return;
                if (target.closest('[data-nt-extensions-manager-toggle]')) {
                    event.preventDefault();
                    this.toggleManagerPanel();
                    return;
                }
                if (target.closest('[data-nt-extensions-manager-dismiss]')) {
                    event.preventDefault();
                    this.setManagerPanelHidden(true);
                    return;
                }
                if (target.closest('[data-nt-extensions-close]')) void this.close();
                if (target.closest('[data-nt-extensions-copy-report]')) void this.copyExtensionReport(target.closest('[data-nt-extensions-copy-report]'));
                if (target.closest('[data-nt-extensions-install]')) this.installExtension();
                if (target.closest('[data-nt-extensions-update-all]')) this.runManagerUpdate('all');
                if (target.closest('[data-nt-extensions-update-enabled]')) this.runManagerUpdate('enabled');
                if (target.closest('.nt-manager-sort-button')) this.scheduleManagerRecapture();
            });
            root.addEventListener('nt:modal-escape-request', event => {
                const openPopup = Array.from(document.querySelectorAll('dialog.popup[open]:not([closing])')).pop();
                if (openPopup) event.preventDefault();
            });
            root.querySelector('[data-nt-extensions-notify]')?.addEventListener('change', event => {
                const native = document.querySelector('#extensions_notify_updates');
                if (!(native instanceof HTMLInputElement) || !(event.currentTarget instanceof HTMLInputElement)) return;
                native.checked = event.currentTarget.checked;
                native.dispatchEvent(new Event('input', { bubbles: true }));
                native.dispatchEvent(new Event('change', { bubbles: true }));
            });
            // Capture clicks before the native inline-drawer handler. In NastyTavern
            // extension settings are launch buttons, not accordions.
            root.addEventListener('click', this.boundSettingsLauncherClick, true);
            document.body.append(root);
            this.ensureSettingsPopup();
        }
        this.root = root;
        this.ensureSettingsPopup();
        return root;
    }

    ensureSettingsPopup() {
        let dialog = this.settingsPopup;
        if (!(dialog instanceof HTMLDialogElement) || !dialog.isConnected) {
            dialog = document.querySelector('#nt-extension-settings-popup');
        }
        if (!(dialog instanceof HTMLDialogElement)) {
            dialog = document.createElement('dialog');
            dialog.id = 'nt-extension-settings-popup';
            dialog.className = 'nt-extension-settings-popup-dialog';
            dialog.setAttribute('aria-labelledby', 'nt-extension-settings-popup-title');
            dialog.innerHTML = `
                <div class="nt-extension-settings-popup-shell">
                    <header class="nt-extension-settings-popup-header">
                        <div class="nt-extension-settings-popup-heading">
                            <span class="nt-modal-heading-icon" aria-hidden="true">${icons.extensions}</span>
                            <b id="nt-extension-settings-popup-title" data-nt-extension-settings-popup-title>${t('Extension settings')}</b>
                        </div>
                        <button type="button" class="nt-modal-close nt-extension-settings-popup-close" data-nt-extension-settings-popup-close title="${t('Close')}" aria-label="${t('Close')}">${icons.close}</button>
                    </header>
                    <div class="nt-extension-settings-popup-body" data-nt-extension-settings-popup-host></div>
                </div>`;
            dialog.addEventListener('click', event => {
                const target = event.target instanceof Element ? event.target : null;
                if (target?.closest('[data-nt-extension-settings-popup-close]')) {
                    event.preventDefault();
                    this.closeSettingsPopup();
                    return;
                }
                if (event.target === dialog) {
                    const rect = dialog.getBoundingClientRect();
                    const outside = event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
                    if (outside) this.closeSettingsPopup();
                }
            });
            dialog.addEventListener('cancel', event => {
                event.preventDefault();
                this.closeSettingsPopup();
            });
            document.body.append(dialog);
        }

        // This is a native <dialog>, not a SillyTavern .popup surface. Keeping
        // the generic .popup class makes some ST/theme rules render a closed
        // dialog in normal document flow, which is the stray window that used
        // to appear below the Extensions modal.
        dialog.classList.remove('popup');
        if (!dialog.open) dialog.hidden = true;
        this.settingsPopup = dialog;
        return dialog;
    }

    settingsPopupIsOpen() {
        return Boolean(this.settingsPopup instanceof HTMLDialogElement && this.settingsPopup.open);
    }

    getSettingsDrawerTitle(drawer) {
        const header = drawer?.querySelector?.(':scope > .inline-drawer-toggle.inline-drawer-header');
        if (!header) return t('Extension settings');
        const clone = header.cloneNode(true);
        clone.querySelectorAll('.inline-drawer-icon,button,input,select').forEach(node => node.remove());
        return (clone.textContent || '').replace(/\s+/g, ' ').trim() || t('Extension settings');
    }

    onSettingsLauncherClick(event) {
        if (!this.isOpen() || this.settingsPopupIsOpen()) return;
        const target = event.target instanceof Element ? event.target : null;
        const header = target?.closest?.('.nt-extensions-settings-scroll .inline-drawer > .inline-drawer-toggle.inline-drawer-header');
        if (!header || !this.root?.contains(header)) return;
        const drawer = header.closest('.inline-drawer');
        if (!(drawer instanceof HTMLElement)) return;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        this.openSettingsPopup(drawer, header);
    }

    openSettingsPopup(drawer, opener = null) {
        if (!(drawer instanceof HTMLElement)) return false;
        if (this.settingsPopupIsOpen()) this.closeSettingsPopup({ restoreFocus: false });
        const dialog = this.ensureSettingsPopup();
        const host = dialog.querySelector('[data-nt-extension-settings-popup-host]');
        const title = dialog.querySelector('[data-nt-extension-settings-popup-title]');
        if (!(host instanceof HTMLElement)) return false;

        // Preserve extension-specific scope wrappers when their CSS depends on
        // them. Quick Reply styles its rows/actions below #qr--settings; moving
        // only the drawer out of that wrapper breaks the horizontal layout.
        const scopedRoot = drawer.closest('#qr--settings');
        const mountRoot = scopedRoot instanceof HTMLElement ? scopedRoot : drawer;
        const placeholder = makePlaceholder('extension settings popup');
        mountRoot.parentNode?.insertBefore(placeholder, mountRoot);
        this.settingsPopupDrawer = drawer;
        this.settingsPopupMountRoot = mountRoot;
        this.settingsPopupPlaceholder = placeholder;
        this.settingsPopupOpener = opener instanceof HTMLElement ? opener : null;
        if (title) title.textContent = this.getSettingsDrawerTitle(drawer);
        drawer.classList.add('nt-extension-settings-popup-active');
        mountRoot.classList.add('nt-extension-settings-popup-scope-root');
        host.replaceChildren(mountRoot);

        dialog.hidden = false;
        try {
            dialog.showModal();
        } catch (_) {
            dialog.setAttribute('open', '');
        }
        requestAnimationFrame(() => dialog.querySelector('[data-nt-extension-settings-popup-close]')?.focus?.({ preventScroll: true }));
        return true;
    }

    closeSettingsPopup({ restoreFocus = true } = {}) {
        const dialog = this.settingsPopup;
        const drawer = this.settingsPopupDrawer;
        const mountRoot = this.settingsPopupMountRoot;
        const placeholder = this.settingsPopupPlaceholder;
        const opener = this.settingsPopupOpener;

        if (drawer instanceof HTMLElement) drawer.classList.remove('nt-extension-settings-popup-active');
        if (mountRoot instanceof HTMLElement) {
            mountRoot.classList.remove('nt-extension-settings-popup-scope-root');
            if (placeholder?.parentNode) placeholder.parentNode.insertBefore(mountRoot, placeholder);
        }
        placeholder?.remove?.();
        this.settingsPopupDrawer = null;
        this.settingsPopupMountRoot = null;
        this.settingsPopupPlaceholder = null;
        this.settingsPopupOpener = null;

        if (dialog instanceof HTMLDialogElement && dialog.open) {
            try { dialog.close(); } catch (_) { dialog.removeAttribute('open'); }
        }
        if (dialog instanceof HTMLDialogElement) dialog.hidden = true;
        const host = dialog?.querySelector?.('[data-nt-extension-settings-popup-host]');
        host?.replaceChildren?.();
        const title = dialog?.querySelector?.('[data-nt-extension-settings-popup-title]');
        if (title) title.textContent = t('Extension settings');
        if (restoreFocus && opener?.isConnected) requestAnimationFrame(() => opener.focus?.({ preventScroll: true }));
        return true;
    }

    isOpen() {
        const root = this.root || document.querySelector('#nt-extensions-modal');
        return Boolean(root && !root.hidden && root.classList.contains('is-open'));
    }

    setManagerPanelHidden(hidden) {
        const root = this.root || document.querySelector('#nt-extensions-modal');
        const modal = root?.querySelector('.nt-extensions-modal');
        const toggle = root?.querySelector('[data-nt-extensions-manager-toggle]');
        if (!modal || !toggle) return;
        const isHidden = Boolean(hidden);
        modal.classList.toggle('is-manager-hidden', isHidden);
        toggle.setAttribute('aria-expanded', String(!isHidden));
        toggle.title = t(isHidden ? 'Show Manage extensions' : 'Hide Manage extensions');
        toggle.setAttribute('aria-label', toggle.title);
    }

    toggleManagerPanel() {
        const root = this.root || document.querySelector('#nt-extensions-modal');
        const modal = root?.querySelector('.nt-extensions-modal');
        if (!modal) return;
        this.setManagerPanelHidden(!modal.classList.contains('is-manager-hidden'));
    }

    syncNotifyControl() {
        const proxy = this.root?.querySelector('[data-nt-extensions-notify]');
        const native = document.querySelector('#extensions_notify_updates');
        if (proxy instanceof HTMLInputElement && native instanceof HTMLInputElement) proxy.checked = native.checked;
    }

    mountSettings() {
        const host = this.root?.querySelector('[data-nt-extensions-settings-host]');
        const first = document.querySelector('#extensions_settings');
        const second = document.querySelector('#extensions_settings2');
        if (!host || !first || !second || !first.parentNode || !second.parentNode) return false;
        if (this.settingsState) this.restoreSettings();

        const firstPlaceholder = makePlaceholder('extensions settings 1');
        const secondPlaceholder = makePlaceholder('extensions settings 2');
        first.parentNode.insertBefore(firstPlaceholder, first);
        second.parentNode.insertBefore(secondPlaceholder, second);

        this.settingsState = {
            first,
            second,
            firstPlaceholder,
            secondPlaceholder,
            firstClass: first.getAttribute('class'),
            secondClass: second.getAttribute('class'),
            firstStyle: first.getAttribute('style'),
            secondStyle: second.getAttribute('style'),
        };

        first.classList.add('nt-extension-settings-column');
        second.classList.add('nt-extension-settings-column');
        host.append(first, second);
        return true;
    }

    restoreSettings() {
        const state = this.settingsState;
        if (!state) return;
        const { first, second, firstPlaceholder, secondPlaceholder } = state;
        if (firstPlaceholder?.parentNode) {
            firstPlaceholder.parentNode.insertBefore(first, firstPlaceholder);
            firstPlaceholder.remove();
        }
        if (secondPlaceholder?.parentNode) {
            secondPlaceholder.parentNode.insertBefore(second, secondPlaceholder);
            secondPlaceholder.remove();
        }
        if (state.firstClass == null) first.removeAttribute('class'); else first.setAttribute('class', state.firstClass);
        if (state.secondClass == null) second.removeAttribute('class'); else second.setAttribute('class', state.secondClass);
        if (state.firstStyle == null) first.removeAttribute('style'); else first.setAttribute('style', state.firstStyle);
        if (state.secondStyle == null) second.removeAttribute('style'); else second.setAttribute('style', state.secondStyle);
        this.settingsState = null;
    }

    async getPopupClass() {
        if (this.PopupClass) return this.PopupClass;
        try {
            const module = await import('/scripts/popup.js');
            this.PopupClass = module.Popup;
            return this.PopupClass;
        } catch (error) {
            return null;
        }
    }

    getManagerInfo(popup) {
        // Do not identify the native extension manager by `.extensions_info` alone.
        // Other extension popups use the same generic class (notably Regex's
        // editor help text), which caused the manager watcher to adopt that node
        // and close the Regex popup as if it were a rebuilt Manage extensions
        // dialog. The real manager always owns its `.extensions_toolbar`.
        const candidates = [...(popup?.content?.querySelectorAll?.('.extensions_info') || [])];
        return candidates.find(info => info.querySelector?.('.extensions_toolbar')) || null;
    }

    async findManagerPopup(timeout = 2600, { excludeCurrent = false } = {}) {
        const Popup = await this.getPopupClass();
        if (!Popup) return null;

        const find = () => {
            const matches = Popup.util.popups.filter(item => this.getManagerInfo(item));
            if (excludeCurrent) return [...matches].reverse().find(item => item !== this.managerPopup) || null;
            return matches.at(-1) || null;
        };

        const immediate = find();
        if (immediate || timeout <= 0) return immediate;
        const started = Date.now();
        while (Date.now() - started < timeout) {
            await wait(40);
            const popup = find();
            if (popup) return popup;
        }
        return null;
    }

    identifyManagerButtons(info) {
        const buttons = [...(info?.querySelectorAll?.('.extensions_toolbar button') || [])];
        const normalized = value => String(value || '').trim().toLowerCase();
        const all = buttons.find(button => normalized(button.textContent).includes('update all')) || buttons[0] || null;
        const enabled = buttons.find(button => normalized(button.textContent).includes('update enabled')) || buttons[1] || null;
        if (all) all.classList.add('nt-manager-native-update', 'nt-manager-native-update-all');
        if (enabled) enabled.classList.add('nt-manager-native-update', 'nt-manager-native-update-enabled');
        return { all, enabled };
    }

    restoreManagerPresentation() {
        const state = this.managerUiState;
        if (!state) return;
        const { sortButton, sortPlaceholder, builtInHeading, toolbar } = state;
        if (sortButton) sortButton.classList.remove('nt-manager-sort-button');
        if (sortButton && sortPlaceholder?.parentNode) {
            sortPlaceholder.parentNode.insertBefore(sortButton, sortPlaceholder);
            sortPlaceholder.remove();
        }
        builtInHeading?.classList.remove('nt-manager-native-builtins-heading');
        toolbar?.classList.remove('nt-manager-native-toolbar');
        this.managerUiState = null;

        const tools = this.root?.querySelector('[data-nt-extensions-manager-tools]');
        const label = this.root?.querySelector('[data-nt-extensions-builtins-label]');
        const sortHost = this.root?.querySelector('[data-nt-extensions-sort-host]');
        if (tools) tools.hidden = true;
        if (label) label.textContent = '';
        if (sortHost) sortHost.replaceChildren();
    }

    prepareManagerPresentation(info) {
        this.restoreManagerPresentation();
        if (!(info instanceof HTMLElement)) return;

        const toolbar = info.querySelector('.extensions_toolbar');
        const sortButton = [...(toolbar?.querySelectorAll?.('button') || [])]
            .find(button => !button.classList.contains('nt-manager-native-update')) || null;
        const builtInHeading = [...info.querySelectorAll('h3')].find(node => /built[ -]?in/i.test(node.textContent || ''))
            || info.querySelector('h3');
        const tools = this.root?.querySelector('[data-nt-extensions-manager-tools]');
        const label = this.root?.querySelector('[data-nt-extensions-builtins-label]');
        const sortHost = this.root?.querySelector('[data-nt-extensions-sort-host]');
        if (!tools || !label || !sortHost || !sortButton) return;

        const sortPlaceholder = makePlaceholder('extensions sort button');
        sortButton.parentNode?.insertBefore(sortPlaceholder, sortButton);
        sortButton.classList.add('nt-manager-sort-button');
        sortHost.append(sortButton);
        toolbar?.classList.add('nt-manager-native-toolbar');
        builtInHeading?.classList.add('nt-manager-native-builtins-heading');
        label.textContent = (builtInHeading?.textContent || t('Built-in Extensions')).trim();
        tools.hidden = false;

        this.managerUiState = { sortButton, sortPlaceholder, builtInHeading, toolbar };
    }

    prepareManagerPopupForCompletion() {
        const dlg = this.managerPopup?.dlg;
        if (!(dlg instanceof HTMLDialogElement) || dlg.open) return;
        try {
            dlg.style.display = 'none';
            dlg.show();
        } catch (_) {}
    }

    async finalizeManagerPopup(popup, info = null) {
        if (!popup) return;
        try {
            if (info && popup.content?.isConnected && !popup.content.contains(info)) popup.content.append(info);
            const dlg = popup.dlg;
            if (dlg instanceof HTMLDialogElement && !dlg.open) {
                dlg.style.display = 'none';
                try { dlg.show(); } catch (_) {}
            }
            await popup.completeCancelled();
        } catch (_) {
            try { popup.dlg?.remove?.(); } catch (_) {}
        }
    }

    startManagerWatcher() {
        clearInterval(this.managerWatchTimer);
        this.managerWatchTimer = setInterval(async () => {
            if (!this.isOpen() || this.managerCaptureBusy) return;
            const next = await this.findManagerPopup(0, { excludeCurrent: true });
            if (!next) return;
            await this.captureManager({ trigger: false, popup: next });
        }, 240);
    }

    async captureManager({ trigger = true, popup: suppliedPopup = null } = {}) {
        if (this.managerCaptureBusy) return false;
        this.managerCaptureBusy = true;
        try {
        const host = this.root?.querySelector('[data-nt-extensions-manager-host]');
        if (!host) return false;

        if (trigger) {
            const button = document.querySelector('#extensions_details');
            if (!(button instanceof HTMLElement)) return false;
            button.click();
        }

        const popup = suppliedPopup || await this.findManagerPopup();
        const info = this.getManagerInfo(popup);
        if (!popup || !info) return false;

        const previousPopup = this.managerPopup;
        const previousInfo = this.managerInfo;
        if (previousPopup && previousPopup !== popup) {
            previousInfo?.removeEventListener('click', this.boundManagerCaptureClick, true);
            this.restoreManagerPresentation();
            await this.finalizeManagerPopup(previousPopup, previousInfo);
        }

        this.managerPopup = popup;
        this.managerInfo = info;
        this.identifyManagerButtons(info);

        host.replaceChildren(info);
        this.prepareManagerPresentation(info);
        info.addEventListener('click', this.boundManagerCaptureClick, true);

        // The native manager is implemented as a modal <dialog>. Once its live
        // content has been adopted by NastyTavern, close only the browser dialog
        // layer so the rest of the app is not made inert. We keep the Popup
        // instance alive because its onClosing callback commits bulk toggles.
        try {
            if (popup.dlg?.open) popup.dlg.close();
            popup.dlg.style.display = 'none';
        } catch (_) {}

        this.root?.querySelector('[data-nt-extensions-update-all]')?.removeAttribute('disabled');
        this.root?.querySelector('[data-nt-extensions-update-enabled]')?.removeAttribute('disabled');
        this.startManagerWatcher();
        return true;
        } finally {
            this.managerCaptureBusy = false;
        }
    }

    restoreManagerInfoToPopup() {
        this.restoreManagerPresentation();
        const popup = this.managerPopup;
        const info = this.managerInfo;
        if (!popup || !info) return;
        info.removeEventListener('click', this.boundManagerCaptureClick, true);
        if (popup.content?.isConnected) popup.content.append(info);
    }

    scheduleManagerRecapture() {
        clearTimeout(this.managerRecaptureTimer);
        this.managerRecaptureTimer = setTimeout(async () => {
            if (!this.isOpen()) return;
            const next = await this.findManagerPopup(3200, { excludeCurrent: true });
            if (!next) return;
            await this.captureManager({ trigger: false, popup: next });
        }, 80);
    }

    onManagerCaptureClick(event) {
        const target = event.target instanceof Element ? event.target : null;
        if (!target) return;
        const sort = target.closest('.extensions_toolbar button:not(.nt-manager-native-update)');
        const rebuildingAction = target.closest('.btn_update, .btn_move, .btn_branch');
        if (!sort && !rebuildingAction) return;
        // These actions can rebuild the native manager asynchronously. Keep the
        // live manager visible here and adopt the replacement popup when it appears.
        this.scheduleManagerRecapture();
    }

    runManagerUpdate(kind) {
        const selector = kind === 'all' ? '.nt-manager-native-update-all' : '.nt-manager-native-update-enabled';
        const source = this.managerInfo?.querySelector(selector);
        if (!(source instanceof HTMLElement)) {
            this.toast(t('Extension manager is still loading.'));
            return;
        }
        this.prepareManagerPopupForCompletion();
        source.click();
    }

    getManagerExtensionBlock(internalName) {
        const externalId = String(internalName || '').replace(/^third-party/, '');
        return [...(this.managerInfo?.querySelectorAll?.('.extension_block') || [])]
            .find(block => block instanceof HTMLElement && block.dataset.name === externalId) || null;
    }

    normalizeRepositoryUrl(value) {
        let url = String(value || '').trim();
        if (!url) return '';
        if (/^git@github\.com:/i.test(url)) url = `https://github.com/${url.replace(/^git@github\.com:/i, '')}`;
        if (/^ssh:\/\/git@github\.com\//i.test(url)) url = `https://github.com/${url.replace(/^ssh:\/\/git@github\.com\//i, '')}`;
        if (/^git:\/\/github\.com\//i.test(url)) url = `https://github.com/${url.replace(/^git:\/\/github\.com\//i, '')}`;
        return url.replace(/\.git$/i, '').replace(/\/$/, '');
    }

    async getExtensionRepository(internalName, manifest, extensionsModule) {
        const block = this.getManagerExtensionBlock(internalName);
        const nativeHref = block?.querySelector?.('a[href]')?.getAttribute?.('href');
        if (nativeHref) return this.normalizeRepositoryUrl(nativeHref);

        const externalId = String(internalName || '').replace(/^third-party/, '');
        const context = window.SillyTavern?.getContext?.();
        try {
            const response = await fetch('/api/extensions/version', {
                method: 'POST',
                headers: context?.getRequestHeaders?.() || { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    extensionName: externalId,
                    global: extensionsModule?.extensionTypes?.[internalName] === 'global',
                }),
            });
            if (response.ok) {
                const data = await response.json();
                const remoteUrl = this.normalizeRepositoryUrl(data?.remoteUrl);
                if (remoteUrl) return remoteUrl;
            }
        } catch (_) {}

        return this.normalizeRepositoryUrl(manifest?.homePage);
    }

    async buildExtensionReport() {
        let extensionsModule;
        try {
            extensionsModule = await import('/scripts/extensions.js');
        } catch (_) {
            return null;
        }

        const names = [...(extensionsModule.extensionNames || [])]
            .filter(name => String(name).startsWith('third-party'));

        const items = await Promise.all(names.map(async internalName => {
            const manifest = extensionsModule.getExtensionManifest?.(internalName) || {};
            const block = this.getManagerExtensionBlock(internalName);
            const toggle = block?.querySelector?.('.extension_toggle input');
            const enabled = toggle instanceof HTMLInputElement
                ? toggle.checked
                : !extensionsModule.extension_settings?.disabledExtensions?.includes?.(internalName);
            const repository = await this.getExtensionRepository(internalName, manifest, extensionsModule);
            const folderName = String(internalName).replace(/^third-party\/?/, '');
            return {
                name: String(manifest.display_name || folderName || internalName),
                version: String(manifest.version || t('Unknown')),
                enabled: Boolean(enabled),
                repository: repository || t('Unavailable'),
            };
        }));

        items.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
        const lines = [
            'NastyTavern third-party extensions report',
            `${t('Installed third-party extensions')}: ${items.length}`,
            '',
        ];
        if (!items.length) {
            lines.push(t('No third-party extensions installed.'));
        } else {
            items.forEach((item, index) => {
                lines.push(`${index + 1}. ${item.name}`);
                lines.push(`   ${t('Version')}: ${item.version}`);
                lines.push(`   ${t('Enabled')}: ${item.enabled ? t('Yes') : t('No')}`);
                lines.push(`   ${t('Repository')}: ${item.repository}`);
                if (index < items.length - 1) lines.push('');
            });
        }
        return lines.join('\n');
    }

    async copyExtensionReport(button = null) {
        if (button instanceof HTMLButtonElement) {
            button.disabled = true;
            button.setAttribute('aria-busy', 'true');
        }
        try {
            const text = await this.buildExtensionReport();
            if (!text) throw new Error('Extension report unavailable');
            await navigator.clipboard.writeText(text);
            this.toast?.(t('Extension report copied.'));
        } catch (_) {
            this.toast?.(t('Could not copy extension report.'));
        } finally {
            if (button instanceof HTMLButtonElement) {
                button.disabled = false;
                button.removeAttribute('aria-busy');
            }
        }
    }

    installExtension() {
        const native = document.querySelector('#third_party_extension_button');
        if (native instanceof HTMLElement) native.click();
        else this.toast(t('Could not open extension installer.'));
    }

    async open() {
        if (this.isOpen()) return true;
        if (this.opening) return false;
        this.opening = true;
        try {
            const root = this.ensureRoot();
            const first = document.querySelector('#extensions_settings');
            const second = document.querySelector('#extensions_settings2');
            if (!first || !second) {
                this.toast(t('Could not open Extensions.'));
                return false;
            }

            this.opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
            this.syncNotifyControl();
            if (!this.mountSettings()) {
                this.toast(t('Could not open Extensions.'));
                return false;
            }

            document.body?.classList.add('nt-extensions-modal-open');
            this.setManagerPanelHidden(false);
            showModalShell(root);
            requestAnimationFrame(() => root.querySelector('.nt-modal-close')?.focus?.({ preventScroll: true }));

            const managerLoaded = await this.captureManager({ trigger: true });
            if (!managerLoaded) {
                const host = root.querySelector('[data-nt-extensions-manager-host]');
                if (host) host.innerHTML = `<div class="nt-extensions-empty"><b>${t('Manage extensions')}</b><span>${t('Could not load the native extension manager.')}</span></div>`;
            }
            return true;
        } finally {
            this.opening = false;
        }
    }

    async close({ restoreFocus = true } = {}) {
        const root = this.root || document.querySelector('#nt-extensions-modal');
        this.closeSettingsPopup({ restoreFocus: false });
        hideModalShell(root);
        clearTimeout(this.managerRecaptureTimer);
        this.managerRecaptureTimer = null;
        clearInterval(this.managerWatchTimer);
        this.managerWatchTimer = null;

        if (this.managerInfo && this.managerPopup) this.restoreManagerInfoToPopup();
        else this.restoreManagerPresentation();
        if (this.managerPopup) {
            try {
                this.prepareManagerPopupForCompletion();
                await this.managerPopup.completeAffirmative();
            } catch (_) {
                try { this.managerPopup.dlg?.remove?.(); } catch (_) {}
            }
        }
        this.managerPopup = null;
        this.managerInfo = null;
        this.root?.querySelector('[data-nt-extensions-update-all]')?.setAttribute('disabled', '');
        this.root?.querySelector('[data-nt-extensions-update-enabled]')?.setAttribute('disabled', '');
        const managerHost = this.root?.querySelector('[data-nt-extensions-manager-host]');
        if (managerHost) managerHost.innerHTML = `<div class="nt-extensions-loading"><i class="fa-solid fa-spinner fa-spin"></i><span>${t('Loading extensions...')}</span></div>`;

        this.restoreSettings();
        document.body?.classList.remove('nt-extensions-modal-open');
        const opener = this.opener;
        this.opener = null;
        if (restoreFocus && opener?.isConnected) requestAnimationFrame(() => opener.focus?.({ preventScroll: true }));
        return true;
    }

    async unmount() {
        await this.close({ restoreFocus: false });
        this.root?.removeEventListener('click', this.boundSettingsLauncherClick, true);
        this.root?.remove();
        this.settingsPopup?.remove();
        this.settingsPopup = null;
        this.root = null;
    }
}
