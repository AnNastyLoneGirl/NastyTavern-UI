# NastyTavern UI — Changelog

All notable changes to NastyTavern UI are documented here.

---

## v0.1.6

Update focused on responsive chat scaling, native utility panels, NastyTavern Settings cleanup, Character Library integration, and large-library performance.

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
