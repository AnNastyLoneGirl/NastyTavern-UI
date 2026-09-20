# NastyTavern UI — Changelog

All notable changes to NastyTavern UI are documented here.

---

## v0.1.9

Update focused on global and per-character Chat Appearance, plus mobile Lorebook compatibility improvements.

### Added

- Added **Global Chat Appearance** in NastyTavern Settings, with complete User and Character customization for Avatar, Name, Message, and Rich Content, including presets, categorized editing, RGBA colors, reset/copy tools, full-screen editing, and responsive controls.
- Added **Individual Chat Appearance** for Character Cards, inheriting the global appearance by default while allowing per-character overrides with **Inherit** and **Same as User** behavior.
- Added a shared **modal opacity** control to NastyTavern modal headers.
- Added README demonstrations for **Global Chat Appearance** and **Individual Chat Appearance** under `docs/screenshots/`.

### Changed

- Chat Appearance now follows native SillyTavern styling whenever no explicit NastyTavern override is set.
- Improved Chat Appearance responsiveness, control performance, and scroll preservation across desktop, tablet, split-screen, and mobile layouts.

### Fixed

- Fixed side-avatar and long-message layout issues that could cause text overlap with Nasty Veil, Nasty Edge, or Nasty Banner presentation modes.
- Fixed **World Info Gallery / Lorebooks** on mobile so the workspace keeps the NastyTavern navigation visible, initializes correctly in portrait, and supports vertical touch scrolling without requiring an orientation change.
- Fixed Example Dialogue handling in Create Character and Edit Character, restoring proper formatting and saving of example dialogues.

---

## v0.1.8

Update focused on integrated library workspaces, Persona Studio, Lorebook management, mobile chat/model workflows, extension diagnostics, updater reliability, and compatibility fixes.

### Added

- Added **Lorebook Library**, an integrated World Info workspace with gallery browsing, search, filters, sorting, pagination, bindings, global activation controls, native entry editing, and optional folders while keeping SillyTavern as the source of truth.
- Added **Persona Studio**, a responsive persona workspace with library browsing, search, filters, sorting, pagination, detail/edit workflows, persona selection, locks/connections, image actions, and backup/restore access.
- Added structured persona sections and contextual **Variants**, including drag-to-reorder prompt order, character/chat/text/RegExp activation, and a preview of the resolved persona content.
- Added a compact **Copy report** action in Extensions that copies installed third-party extension name, version, enabled state, and repository URL for diagnostics or support.
- Added opt-in mobile model metadata in NastyTavern Settings: OpenRouter context (`ctx`), token value (`t/$`) and estimated max prompt cost (`$`), plus NanoGPT context, input/output pricing and subscription status (`sub`, `sub(2x)`, `not sub`) directly in model choices. All indicators are disabled by default.

### Changed

- `Characters`, `Backgrounds`, `Personas`, and `Lorebooks` now integrate into NastyTavern's main workspace/navigation model while preserving SillyTavern's native data and handlers; third-party Persona Library keeps priority when installed.
- The updater now detects maintenance changes from the published manifest/changelog and reloads the page automatically after a successful update.

### Fixed

- Fixed the mobile chat message structure so avatar/name metadata and message content use separate layout regions, preventing text, reasoning, or media from flowing underneath taller avatars while preserving native swipe behavior.
- Fixed embedded Character Lore import/linking when SillyTavern sanitizes filesystem-invalid characters in Lorebook names, so imported Lorebooks remain correctly attached to their Character Card.
- Fixed Lorebook **New**, **Import**, and **Delete** workflows inside the detached NastyTavern World Info workspace: newly created/imported books now appear immediately without reloading, and deleting the currently open Lorebook returns directly to the Lorebooks gallery.
- Fixed Story Timeline navigation so **Go to** and **New Branch** keep the timeline canvas open while SillyTavern changes or branches the active chat.
- Improved the mobile **Settings → Models** Connection Profile layout: the profile selector now uses its own row, with the six profile actions grouped on the row below.
- Fixed the NastyTavern main app bar being hidden whenever SillyTavern Waifu Mode is active; the header now remains available and Waifu Mode content/panels respect its height.
- Fixed **Create Character / Save** with Moonlit Echoes by preserving the native `#form_create` association when NastyTavern temporarily detaches SillyTavern submit controls for compatibility layout handling.
- Fixed the Community Privacy Notice on phones and low-height screens so its content scrolls correctly and **Save & return** remains reachable.

---

## v0.1.7

Release focused on large-library performance, responsive navigation, and compatibility with SillyTavern and third-party extensions.

### Added

- Added first-class **Persona Library** and **World Info Gallery** workspace integration: the `Personas` and `Lorebooks` navigation automatically delegates to the installed extension while keeping NastyTavern's native workflows as fallback.
- Added Moonlit Echoes settings-popout integration to the shared NastyTavern side-panel/modal system.
- Added a **Character Libraries** flyout in the main navigation, grouping Character Library and DataCat without adding separate global launchers.

### Changed

- Community shared Character Cards now use `nt_description` as their primary short description, with the legacy `description` field kept as a compatibility fallback.
- Character Libraries now behaves like a normal primary navigation destination and opens its available library sources in a compact flyout to the right of the sidebar.
- Phone and narrow layouts now always use the compact main navigation while preserving the user's desktop expanded/compact preference when returning to desktop.
- MovingUI keeps ownership of its saved movable geometry when enabled instead of being overridden by NastyTavern layout rules.

### Performance

- Reworked Character Library for very large collections with off-screen rendering containment, progressive avatar work, lightweight tag indexing, and targeted DOM updates instead of broad per-card mutation tracking.
- Reduced repeated full-library work by preferring SillyTavern's existing tag index when available and avoiding expensive attribute-driven rescans across large character collections.

### Fixed

- Fixed the remaining artificial right-side reservation so a 100% chat width can use the full available workspace.
- Fixed the disconnected model status so clicking `No connection…` opens NastyTavern Settings directly on the Model section instead of exposing the native Models & API workspace.
- Fixed Character Management card geometry and label alignment across the default UI and Moonlit Echoes, including the Create/Edit Character layout, action bar, spacing, and scrolling behavior.
- Fixed compact navigation alignment for the Character Libraries launcher.
- Fixed third-party controls injected into SillyTavern's top bar being visible but unclickable by removing the full-width NastyTavern click shield while keeping NastyTavern's own controls interactive. This also restores DataCat's native top launcher without a DataCat-specific click workaround.

### Compatibility

- Persona Library and World Info Gallery keep ownership of their own DOM, click handlers, detail/editor windows, and overlays inside the NastyTavern workspace; redundant native World Info heading, drawer toggle, and editor pin/lock chrome is hidden while World Info Gallery is active.
- Audited NastyTavern overlay, pointer-event, z-index, and movable-panel behavior to reduce interference with third-party extension interfaces and preserve native extension click handlers where possible.

---

## v0.1.6

Update focused on responsive chat scaling, native utility panels, NastyTavern Settings cleanup, Character Library integration, and first-pass large-library performance improvements.

### Added

- Integrated Character Library into NastyTavern so it fits the main application workspace and navigation instead of behaving like a separate overlay.

### Changed

- Character Library now avoids repeated full-library scans during routine UI mutations; tag usage counts are cached for the active library session and invalidated when the library is reopened.
- Character Library observers now batch updates and ignore cosmetic mutation churn instead of rebuilding work on every class/style change.
- Chat scaling now follows a percentage-based width model instead of a fixed pixel width, allowing the conversation to adapt more naturally across desktop sizes and split-screen layouts.
- Author's Note now uses the NastyTavern native modal-panel styling and participates correctly in the responsive chat workspace.
- CFG Scale now uses the same NastyTavern modal-panel treatment, with corrected header structure, sizing, and chat layout adaptation.
- Token Probabilities now uses the same shared NastyTavern modal-panel treatment for a consistent native-tools experience.
- Removed the obsolete chat/Layout parameters from NT Settings.

### Performance

- Optimized Character Library for very large collections (including libraries with thousands of characters) by caching tag usage counts, batching mutation-driven updates, and avoiding repeated full-library DOM/style scans.
- Reduced unnecessary Character Library observer work so cosmetic class/style churn no longer triggers expensive rebuild paths.

### Fixed

- Removed per-card `getComputedStyle()` scans from Character Library empty-state detection, avoiding forced style/layout work across very large libraries.
- Fixed repeated observer teardown/recreation for Character Library pagination and redundant tag sorting when the library DOM has not changed.
- Fixed chat width restoration when native side panels are closed.
- Fixed CFG Scale opening with broken or persisted narrow geometry.
- Fixed panel headers and window controls so they no longer overlap collapsible section controls.

---

## v0.1.5

Update focused on supply-chain hardening and tightening the Community maintenance trust boundary.

### Added

- Added a permanent Home release changelog that shows the latest build published on GitHub and exposes an explicit `Update now` action when a newer version or maintenance revision is available.
- Vendored the exact `@supabase/supabase-js@2.116.0` browser bundle and its license inside the extension source.
- Added a server-scheduled Community Storage cleanup job backed by a private maintenance credential.

### Changed

- Community now loads the Supabase JavaScript client from the installed NastyTavern extension instead of jsDelivr.
- Community clients no longer invoke the global `community-storage-cleanup` maintenance function.
- Storage cleanup is now invoked by a Supabase Cron job instead of ordinary authenticated browsers.

### Security

- Removed the runtime CDN trust boundary for the Supabase browser client; the exact executed bundle is now part of the auditable release.
- `community-storage-cleanup` now uses a private server-only maintenance credential instead of user-session authorization.
- The maintenance credential is not exposed to `anon` or `authenticated` database roles.
- Disabled the legacy `smart-task` cleanup deployment with an inert HTTP 410 tombstone so it can no longer perform privileged maintenance.

### Fixed

- The Home updater now supports a manifest maintenance revision, so fixes published on the same semantic version are detected without relying on Git checkout state.

### Compatibility

- Community behavior and user-facing account flows are unchanged; the hardening only changes dependency delivery and backend maintenance execution.

---

## v0.1.4

Update focused on Community privacy controls, backend transparency, security hardening, and interface consistency.

### Added

- Explicit Community network consent before loading the Supabase client or contacting the Community backend.
- Independent opt-in for Community online presence and typing broadcasts.
- Quick Community presence switch in the account menu, synchronized with Settings → Modules.
- Configurable `Ctrl+Alt+O` shortcut for toggling Community presence.
- Community privacy and data-flow documentation covering Supabase, Google OAuth, jsDelivr, and Cloudflare R2.
- Public backend source for the Community and Nasty Catalogue security-relevant server components.

### Changed

- Existing v0.1.3 sessions no longer cause an automatic Community connection after upgrading; Community network access must be explicitly enabled once.
- Nasty Catalogue now uses the same Community network consent gate and cannot initialize Supabase independently.
- Community membership no longer relies on a persisted session correlation token.
- NastyTavern Settings actions and shortcut recorder controls now use the same NastyTavern control styling as the rest of the interface.
- Community sign-in and sign-up fields and actions now share the same NastyTavern form and button styling.

### Fixed
- Community module visibility no longer acts as a substitute for network and privacy consent.
- Disabling Community now closes active Community Realtime subscriptions and stops the extension's Supabase auth refresh loop.
- Fixed unstyled `Reset`, `Export`, and `Import` actions in NastyTavern Settings.
- Fixed unstyled keyboard shortcut recorder buttons.
- Fixed inconsistent styling across Community email, password, username, Google OAuth, and account-mode controls.
- Removed a duplicated settings row label that could produce malformed Interface settings markup.

### Security

- Supabase function privileges now use an explicit allowlist for authenticated client RPCs.
- Internal trigger and helper functions are no longer directly executable by `anon` or ordinary authenticated clients.
- All NastyTavern `nt_*` functions are no longer executable by the anonymous role.
- `nt_role_rank` now uses an explicit immutable search path.
- Persisted Community session correlation tokens are no longer used by the v0.1.4 client.

### Compatibility

- The legacy two-argument `nt_join_channel(uuid, text)` server RPC remains temporarily available for v0.1.3 clients, but discards the supplied session token and stores `NULL`.

---

## v0.1.3

Update focused on Nasty Catalogue and improvements to the main SillyTavern management interfaces.

### Added

- Added **Nasty Catalogue** for Character Cards and Lorebooks.
- Added Discover, Popular, Newest, and Top Rated catalogue sections.
- Added Character Card and Lorebook search.
- Added SFW and NSFW filtering.
- Added resource ratings and creator pages.
- Added direct download and **Import into SillyTavern**.
- Added resource collections with public and private visibility.
- Added Character Card versions and modifications.
- Added automatic protection against duplicate uploads.
- Added resource reporting.
- Added Character Card details.
- Added direct Nasty Catalogue access from Character Management and Home.
- Added easier Character Card publishing and sharing.

### Changed

- Redesigned Character Management.
- Improved character creation and editing.
- Improved tags and filtering.
- Improved dialogue example editing.
- Improved Groups integration.
- Redesigned the Lorebook interface.
- Improved Lorebook entry navigation and editing workspace.
- Improved portrait and landscape mobile support for Lorebooks.
- Improved Community and Catalogue integration.
- Redesigned the Extensions interface.
- Improved access to installed extensions and extension settings.
- Improved Community resource integration, user profiles, and resource statistics.
- Improved responsive behavior and several mobile interfaces.
- Improved navigation and visual consistency between NastyTavern sections.

### Fixed

- Various Community, UI, compatibility, and usability issues.

---

## v0.1.2

Update focused on the Home Dashboard and the first NastyTavern Community experience.

### Added

- Added the **Home Dashboard** with recent characters, favorites, quick actions, and Community panels.
- Added **NastyTavern Community Chat**.
- Added email/password and Google authentication.
- Added mentions and unread indicators.
- Added typing indicators and message search.
- Added Community profiles.
- Added Character Card and Lorebook sharing.
- Added direct download and **Import into SillyTavern**.
- Added Community sharing actions inside SillyTavern.
- Added Character Card and Lorebook detail views.

### Changed

- Improved Home and Community mobile layouts.

---

## v0.1.1

Update focused on integrated tools, mobile support, and everyday usability.

### Added

- Added full phone responsiveness for portrait and landscape.
- Added the **Nasty Chat Bar**.
- Added Story Timeline.
- Added Context / Token Inspector.
- Added Variable Manager.
- Added World Info Inspector.
- Added Bookmarks and Notes.
- Added Calendar & Schedule.
- Added Health & Performance diagnostics.
- Added Focus Mode.

### Changed

- Expanded NastyTavern Settings and keyboard shortcut management.
- Improved general navigation.
