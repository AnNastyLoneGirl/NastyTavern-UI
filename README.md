# NastyTavern UI

A modern, non-destructive UI/UX overhaul for **SillyTavern 1.18+**.

NastyTavern keeps SillyTavern as the source of truth. It does not replace its chat, character, persona, Lorebook, API, prompt, model, or extension logic; it reorganizes the native interface and adds integrated workflow tools on top of it.

> **Current version:** `0.1.1`  
> **Minimum SillyTavern version:** `1.18.0`

## ✨ Highlights

- **Modern application shell** — permanent navigation for Chat, Characters, Personas, Lorebooks, Formatting, Prompts, Models, Extensions, and Settings, with a cleaner top bar and docked native workspaces.
- **Nasty Chat Bar** — chat history and switching, in-chat search, message count, chat actions, connection-profile switching, and quick access to NastyTavern tools.
- **Integrated workflow tools** — Story Timeline, Context / Token Inspector, Variable Manager, World Info Inspector, per-chat Bookmarks & private Notes, and Calendar & Schedule.
- **Mobile-first responsive support** — dedicated phone layouts for portrait and landscape, touch-friendly controls, responsive panels/modals, and overflow fixes across the interface.
- **NastyTavern Settings** — configurable keyboard shortcuts, conflict detection, UI preferences, and configuration import/export.
- **Health & Performance** — built-in diagnostics with selector checks and a copyable diagnostic report.
- **Internationalization** — English fallback and `fr-fr`, with the structure ready for additional locale files.
- **Compatibility-focused design** — when a specialized NastyTavern module is unavailable, the closest native SillyTavern interface remains accessible.

## 📦 Install

### SillyTavern extension installer

Open **Extensions → Install extension** and use:

```text
https://github.com/AnNastyLoneGirl/NastyTavern-UI
```

Reload SillyTavern and enable **NastyTavern UI** if needed.

### Manual installation

Copy the entire `NastyTavern-UI` folder into your SillyTavern user extensions directory, then reload SillyTavern.

NastyTavern UI requires **SillyTavern 1.18.0 or newer** because it uses extension lifecycle hooks.

## 🧩 Design principles

1. **Restructure without forking SillyTavern.** Native controls remain the source of truth.
2. **Progressive complexity.** Common actions stay obvious while advanced controls remain available.
3. **One design system.** Native and NastyTavern interfaces follow a consistent visual language.
4. **Fail open.** If a selector or integration breaks after a SillyTavern update, the native UI should remain reachable.
5. **No hidden feature removal.** NastyTavern changes presentation and workflow, not SillyTavern's underlying capabilities.

## 🛠 Current status

**v0.1.1** is still under active testing. Most of the core interface and integrated tools are in place, but some compatibility and responsive edge cases may still need adjustments depending on the SillyTavern version, browser, screen size, or third-party extensions in use.

Bug reports and feedback are welcome through the GitHub repository.

## ☕ Support the project

If you enjoy **NastyTavern UI** and want to support its development, you can buy me a coffee on Ko-fi. Every contribution helps with testing, compatibility fixes, and future features. 🤍

👉 **[Buy me a coffee on Ko-fi](https://ko-fi.com/annastylonegirl)**

## 📚 Reference

The project takes layout inspiration from IceFog72's *SillyTavern-Not-A-Discord-Theme*, but uses a different architecture built around a runtime DOM adapter, application shell, command palette, integrated tools, and narrowly scoped module selectors rather than a monolithic CSS-only layout.

---

## 📝 Patch Notes

### v0.1.1

Major update focused on integrated tools, mobile support, and usability.

- 📱 **Full phone responsiveness added** for portrait and landscape, with touch-friendly menus, panels, modals, controls, and overflow fixes.
- 💬 **New Nasty Chat Bar** with chat history, in-chat search, chat actions, quick tools, and a unified minimize/restore control.
- 🧰 **Integrated workflow tools** including Story Timeline, Context / Token Inspector, Variable Manager, World Info Inspector, Bookmarks & Notes, and Calendar & Schedule.
- ⚙️ **Expanded Settings** with keyboard shortcut management, conflict detection, and configuration import/export.
- ❤️ **Added Health & Performance diagnostics** with a copyable diagnostic report.
- 🔎 **General UI improvements** including Focus Mode, cleaner navigation, a simplified header, and mobile-specific search placement.
- 🛠 **Responsive fixes** across Lorebooks, Calendar, Bookmarks, Notes, and other phone layouts.

> v0.1.1 is still being tested and may receive additional fixes before being considered fully stable.
