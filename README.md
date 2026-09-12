# NastyTavern UI

A non-destructive UI/UX overhaul for **SillyTavern 1.18+**.

NastyTavern does not replace SillyTavern's model, chat, lorebook, persona, character, API, prompt, or extension logic. It adds an application shell and a design-system layer around the native interface so existing event handlers and extension integrations keep working.

## What the first release changes

- Permanent application navigation for Chat, Characters, Personas, Lorebooks, Formatting, Prompts, Models, Extensions, and Settings.
- Modern top application bar with connection status.
- Context rail with current character/persona shortcuts.
- `Ctrl + K` command palette for common SillyTavern actions.
- Native SillyTavern drawers become large docked workspaces instead of small floating control panels.
- Chat spacing, message actions, avatars, message surfaces, composer, controls, scrollbars, tooltips/popups, Select2 menus, World Info entries, character cards, forms, sliders, checkboxes, extension settings and toasts get a shared visual language.
- MutationObserver-based discovery automatically tags dynamically created drawers, inline drawers, popups and chat messages.
- Responsive desktop/tablet/mobile fallback.
- Settings panel under SillyTavern Extensions, including accent, density, widths, animation, docking and native topbar replacement.
- Safe fallback: if NastyTavern cannot find a specialized module, it opens the closest native SillyTavern panel rather than cloning or replacing the feature.

## Install

### SillyTavern extension installer

Use **Extensions → Install extension** and provide the repository URL after you publish this folder to GitHub.

### Manual

Copy the entire `NastyTavern-UI` folder into the current user's SillyTavern extensions directory. Depending on your SillyTavern install/version this is typically under the user data extensions folder. Reload SillyTavern and enable **NastyTavern UI**.

The manifest requires SillyTavern **1.18.0 or newer** because it uses extension lifecycle hooks.

## Design principles

1. **Restructure without forking SillyTavern.** Native controls remain the source of truth.
2. **Progressive complexity.** Common actions are obvious; advanced settings stay available.
3. **One design system.** New/third-party controls inherit sane defaults where possible.
4. **Fail open.** If a selector changes after an ST update, the underlying native UI remains available.
5. **No hidden feature removal.** The project changes placement and hierarchy, not capabilities.

## Reference

The project takes layout inspiration from IceFog72's *SillyTavern-Not-A-Discord-Theme* but uses a different architecture: a runtime DOM adapter, application shell, command palette and narrowly scoped module selectors instead of relying on a monolithic CSS-only layout.