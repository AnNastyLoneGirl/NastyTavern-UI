# Third-party top-bar compatibility (v0.1.13+)

NastyTavern hides SillyTavern's **visual** native top bar. The Top Bar Bridge mirrors third-party extension launch buttons into NastyTavern's header without moving the original controls or duplicating their event handlers. When NastyTavern is disabled, the original SillyTavern extension UI remains in place.

## No changes needed: existing SillyTavern top-bar launchers

NastyTavern discovers conventional extension-owned drawer buttons in `#top-settings-holder` and `#top-bar`. For instance, [ST-StatTab](https://github.com/interlamer/ST-StatTab) creates `#stat_tab_topbar` and uses its own capture-phase click handler. The bridge shows its existing chart icon and sends user clicks to that original element. If ST-StatTab's **Show a button in the top bar** option is turned off, the source is removed and NastyTavern hides its mirror too.

Legacy auto-detection is intentionally conservative to avoid duplicating built-in SillyTavern settings. For reliable compatibility on *any* extension, use one of the explicit opt-in methods below. No NastyTavern-specific package dependency is needed.

## Option 1: one-line DOM opt-in (recommended for existing buttons)

```js
const button = document.createElement('button');
button.id = 'my_extension_open';
button.title = 'Open My Extension';
button.innerHTML = '<i class="fa-solid fa-star"></i>';
button.addEventListener('click', openMyExtension);

// Add this attribute to your own button, wherever it lives in the DOM.
button.dataset.ntTopbarAction = 'my-extension:open';
// Optional: button.dataset.ntTopbarLabel = 'My Extension';
// Optional: button.dataset.ntTopbarIcon = 'fa-solid fa-star';
container.append(button);
```

When NastyTavern is running, a matching icon is automatically added to its header. When NastyTavern is absent, the marker does nothing and your normal button still works. No startup-order dependency, import or extra code is required. NastyTavern never executes code stored in the marker; it calls `button.click()` on the original source when the user clicks the mirror.

**Lifecycle:** removing the source element (or setting its `hidden` attribute) removes the NastyTavern shortcut. You may also set `data-nt-topbar-disabled="true"`. This works with dynamically-created buttons.

## Option 2: JavaScript API (when you have no native button)

```js
function registerTopbar(api) {
    return api.register({
        id: 'my-extension:open', // unique across extensions
        label: 'Open My Extension',
        icon: 'fa-solid fa-star', // optional Font Awesome classes
        onClick: () => openMyExtension(),
    });
}

if (window.NastyTavernTopbar) {
    registerTopbar(window.NastyTavernTopbar);
} else {
    window.addEventListener('nastytavern:topbar-ready', event => {
        registerTopbar(event.detail);
    }, { once: true });
}
```

`register()` returns an `unregister()` function. Call it when your extension is disabled or cleaned up. You can also call `window.NastyTavernTopbar.unregister('my-extension:open')` or re-register the same ID to update its label or icon.

If you already render a native control, you can delegate clicks using a selector instead of `onClick`:

```js
window.NastyTavernTopbar?.register({
    id: 'my-extension:open',
    label: 'Open My Extension',
    icon: 'fa-solid fa-star',
    sourceSelector: '#my_extension_open',
});
```

The API only becomes available once NastyTavern activates; use the ready event above if your extension loads first. `sourceSelector` entries appear only when their source exists and is not hidden. To reflect a later source state change immediately, call `window.NastyTavernTopbar?.refresh()` or update the source DOM and let the observer detect it.

## Design and compatibility rules

- NastyTavern is optional. Do **not** require it or remove your original UI just because the bridge is present.
- Keep all state and activation logic in your own extension. The bridge never imports your scripts or runs a command string.
- Prefer unique IDs, accessible labels, and Font Awesome `fa-solid`/`fa-regular`/`fa-brands` glyphs. Other icons get NastyTavern's extension fallback icon.
- Up to three buttons appear directly in the desktop app bar (one on narrower screens), with remaining actions in the overflow menu.
- Native SillyTavern controls and DataCat's integrated character-library entry are excluded from this generic bridge, to prevent duplicates.
