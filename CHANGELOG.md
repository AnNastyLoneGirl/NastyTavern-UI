# NastyTavern UI — Changelog

## v0.1.4 — 2026-09-17

### Added

- Explicit Community network consent before loading the Supabase client or contacting the Community backend.
- Independent opt-in for Community online presence and typing broadcasts.
- Quick Community presence switch in the account menu, synchronized with Settings → Modules, plus a configurable `Ctrl+Alt+O` shortcut.
- Community privacy/data-flow documentation covering Supabase, Google OAuth, jsDelivr and Cloudflare R2.
- Public backend source bundle for the Community/Nasty Catalogue security-relevant server components.

### Changed

- Existing v0.1.3 sessions no longer cause an automatic Community connection after upgrading; the user must explicitly enable Community network access once.
- Nasty Catalogue uses the same Community network consent gate and cannot initialize Supabase independently.
- Community membership no longer relies on a persisted session correlation token.
- Supabase function privileges now use an explicit allowlist for authenticated client RPCs; internal trigger/helper functions are no longer directly executable by `anon` or ordinary authenticated clients.
- All NastyTavern `nt_*` functions are no longer executable by the anonymous role.
- `nt_role_rank` now uses an explicit immutable search path.

### Fixed

- Community module visibility no longer acts as a misleading substitute for network/privacy consent.
- Disabling Community now closes active Community Realtime subscriptions and stops the extension's Supabase auth refresh loop.
- NastyTavern Settings actions (`Reset`, `Export`, `Import`) and shortcut recorder buttons now keep the NastyTavern control skin instead of inheriting native browser/SillyTavern button styling.
- Community sign-in/sign-up fields and actions now use the same NastyTavern form/button language across email, password, username, Google OAuth and account-mode switching.
- Removed a duplicated settings row label that could produce malformed Interface settings markup.

### Compatibility

- The legacy two-argument `nt_join_channel(uuid, text)` server RPC remains temporarily available for v0.1.3 clients, but discards the supplied session token and stores `NULL`.

---

## v0.1.3

Major update focused on **Nasty Catalogue** and improving the main SillyTavern interfaces.

### 📚 Nasty Catalogue

- Added the new **Nasty Catalogue** for Character Cards and Lorebooks.
- Added Discover, Popular, Newest and Top Rated sections.
- Added Character Card and Lorebook search.
- Added SFW / NSFW filtering.
- Added resource ratings.
- Added creator pages.
- Added direct download and **Import into SillyTavern**.
- Added resource collections.
- Added public and private collections.
- Added Character Card versions and modifications.
- Added automatic protection against duplicate uploads.
- Added resource reporting.

### 🧑‍🎨 Characters

- Redesigned Character Management.
- Improved character creation and editing.
- Improved tags and filtering.
- Improved dialogue example editing.
- Improved Groups integration.
- Added Character Card details.
- Added direct Nasty Catalogue access.
- Added easier Character Card publishing and sharing.

### 📖 Lorebooks

- Redesigned the Lorebook interface.
- Improved entry navigation.
- Improved the editing workspace.
- Improved portrait mobile support.
- Improved landscape mobile support.
- Added better Community and Catalogue integration.

### 🧩 Extensions

- Redesigned the Extensions interface.
- Improved access to installed extensions.
- Improved access to extension settings.

### 🏠 Home & Community

- Added Nasty Catalogue access from Home.
- Improved Community resource integration.
- Improved user profiles.
- Improved resource statistics.
- Improved mobile layouts.
- Various Community and interface fixes.

### 📱 General improvements

- Improved responsive behavior.
- Improved several mobile interfaces.
- Improved navigation between NastyTavern sections.
- Improved consistency between the different interfaces.
- Various UI, compatibility, and usability fixes.

> v0.1.3 is still being tested and may receive additional fixes.

---

## v0.1.2

Major update focused on the **Home Dashboard** and the new **NastyTavern Community** experience.

- 🏠 Added the **Home Dashboard** with recent characters, favorites, quick actions, and Community panels.
- 🌐 Added **NastyTavern Community Chat**.
- 🔐 Added email/password and Google authentication.
- 🔴 Added mentions and unread indicators.
- 🔎 Added typing indicators and message search.
- 👤 Added Community profiles.
- 📦 Added Character Card and Lorebook sharing.
- 📥 Added direct download and **Import into SillyTavern**.
- ↗️ Added Community sharing actions inside SillyTavern.
- 🧾 Added Character Card and Lorebook detail views.
- 📱 Improved Home and Community mobile layouts.

---

## v0.1.1

Major update focused on integrated tools, mobile support, and usability.

- 📱 Added full phone responsiveness for portrait and landscape.
- 💬 Added the **Nasty Chat Bar**.
- 🧰 Added Story Timeline, Context / Token Inspector, Variable Manager, World Info Inspector, Bookmarks, Notes, and Calendar & Schedule.
- ⚙️ Expanded NastyTavern Settings and keyboard shortcut management.
- ❤️ Added Health & Performance diagnostics.
- 🔎 Added Focus Mode and general navigation improvements.
