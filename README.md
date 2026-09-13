# NastyTavern UI

A modern, non-destructive UI/UX overhaul for **SillyTavern 1.18+**.

NastyTavern keeps SillyTavern as the source of truth. It does not replace its chat, character, persona, Lorebook, API, prompt, model, or extension logic; it reorganizes the native interface and adds integrated workflow tools on top of it.

> **Current version:** `0.1.2`  
> **Minimum SillyTavern version:** `1.18.0`

## ✨ Highlights

- **Modern application shell** — permanent navigation for Chat, Characters, Personas, Lorebooks, Formatting, Prompts, Models, Extensions, and Settings, with a cleaner top bar and docked native workspaces.
- **Nasty Chat Bar** — chat history and switching, in-chat search, message count, chat actions, connection-profile switching, and quick access to NastyTavern tools.
- **Integrated workflow tools** — Story Timeline, Context / Token Inspector, Variable Manager, World Info Inspector, per-chat Bookmarks & private Notes, and Calendar & Schedule.
- **Home Dashboard** — a dedicated no-chat landing page with recent characters, favorites, quick actions, temporary chat access, and character importing.
- **Community Chat** — optional Supabase-powered real-time SillyTavern community spaces with presence, safe Markdown, replies, reactions, search, session-aware unread counts, persistent mentions, profiles, moderation, typing indicators, and native Character Card / Lorebook sharing.
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

## 💬 Community Chat (Supabase)

Community Chat connects directly to the **official NastyTavern Community backend**. End users do not need to configure a Supabase URL, publishable key, database, or Storage project in NastyTavern Settings. The official public/publishable client configuration is bundled with the extension; server-side secrets are never included.

Community authentication supports **email/password and Google OAuth**. Google sign-in requires enabling the Google provider in Supabase Auth and applying the separate OAuth username-onboarding migration. First-time Google users choose a unique permanent Community username after OAuth; their Google display name is never adopted automatically. Email confirmations and Google OAuth dynamically return to the SillyTavern URL currently open in the user's browser (including its active port and base path), as long as that URL matches the Supabase Auth Redirect URLs allow-list.

Shared Character Cards and Lorebooks use a private Supabase Storage bucket with a **5.5 MiB per-file limit**. Community keeps the **100 most recent messages per room**; attachment files linked to pruned/deleted messages are queued for server-side Storage cleanup.

The Community migration also creates the private Storage bucket used for Character Cards / Lorebooks, the public avatar bucket, persistent mentions, reports and moderation rules. If no Community admin exists yet, the oldest registered Community account is promoted to admin when the social-features migration is applied.

Only Supabase public/publishable client credentials are bundled with NastyTavern. Supabase `service_role` and other server-side secrets must never be included in the extension.

## 🧩 Design principles

1. **Restructure without forking SillyTavern.** Native controls remain the source of truth.
2. **Progressive complexity.** Common actions stay obvious while advanced controls remain available.
3. **One design system.** Native and NastyTavern interfaces follow a consistent visual language.
4. **Fail open.** If a selector or integration breaks after a SillyTavern update, the native UI should remain reachable.
5. **No hidden feature removal.** NastyTavern changes presentation and workflow, not SillyTavern's underlying capabilities.

## 🛠 Current status

**v0.1.2** is still under active testing. Most of the core interface and integrated tools are in place, but some compatibility and responsive edge cases may still need adjustments depending on the SillyTavern version, browser, screen size, or third-party extensions in use.

Bug reports and feedback are welcome through the GitHub repository.

## ☕ Support the project

If you enjoy **NastyTavern UI** and want to support its development, you can buy me a coffee on Ko-fi. Every contribution helps with testing, compatibility fixes, and future features. 🤍

👉 **[Buy me a coffee on Ko-fi](https://ko-fi.com/annastylonegirl)**

## 📚 Reference

The project takes layout inspiration from IceFog72's *SillyTavern-Not-A-Discord-Theme*, but uses a different architecture built around a runtime DOM adapter, application shell, command palette, integrated tools, and narrowly scoped module selectors rather than a monolithic CSS-only layout.

---

## 📝 Patch Notes

### v0.1.2

Major update focused on the Home Dashboard and the new NastyTavern Community experience.

- 🏠 **New Home Dashboard** with recent characters, favorites, quick actions, temporary chat access, and dedicated Community panels.
- 🌐 **NastyTavern Community Chat** with official General, NastyTavern, Character Cards, Lorebooks, and Extensions channels.
- 🔐 **Community authentication** with email/password and Google OAuth.
- 🔴 **Persistent mentions and session-aware unread indicators** with simple red-dot badges.
- 🔎 **Live typing indicators, safe Markdown, and simple Community profiles** with avatar, short bio, role, and immutable username.
- 📦 **Native Character Card & Lorebook sharing** previews, direct download, and **Import into SillyTavern**.
- ↗️ **Share to Community actions** directly inside the SillyTavern Character Card and Lorebook editors.
- 🧾 **Resource detail sheets** available from Community and the Home Dashboard, showing the actual metadata and content available in shared Character Cards and Lorebooks.
- 🏠 **Home Community panels** with a vertical message feed plus the 5 latest shared Character Cards and 5 latest Lorebooks.
- 📱 **Community and Home responsive refinements** with cleaner resource cards, improved mobile layouts, stable Home scrolling.

> v0.1.2 is still being tested and may receive additional fixes before being considered fully stable.

### v0.1.1

Major update focused on integrated tools, mobile support, and usability.

- 📱 **Full phone responsiveness added** for portrait and landscape, with touch-friendly menus, panels, modals, controls, and overflow fixes.
- 💬 **New Nasty Chat Bar** with chat history, in-chat search, chat actions, quick tools, and a unified minimize/restore control.
- 🧰 **Integrated workflow tools** including Story Timeline, Context / Token Inspector, Variable Manager, World Info Inspector, Bookmarks & Notes, and Calendar & Schedule.
- ⚙️ **Expanded Settings** with keyboard shortcut management, conflict detection, and configuration import/export.
- ❤️ **Added Health & Performance diagnostics** with a copyable diagnostic report.
- 🔎 **General UI improvements** including Focus Mode, cleaner navigation, a simplified header, and mobile-specific search placement.
