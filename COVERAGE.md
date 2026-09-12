# NastyTavern UI coverage map

This checklist is based on the SillyTavern 1.18-era documentation/control-panel structure and current extension conventions.

| Area | V0.1 treatment | Strategy |
|---|---|---|
| Chat / messages | Dedicated | Modern message surfaces, hover actions, max width, scrolling; full workspace width with no duplicate right rail |
| Send form / composer | Dedicated | Centered floating composer with scrollbar clearance; native in-stage composer in Waifu/VN mode |
| Flat / Bubbles / Document chat styles | Generic + inherited | Avoids replacing message DOM; native mode classes remain functional |
| Characters | Dedicated | Native `.drawer-toggle` route to `#right-nav-panel` + character-card design system + non-shrinking action toolbar + dedicated Advanced Definitions modal |
| Groups | Native within Character workflow | Preserved; receives generic controls/cards |
| Personas | Dedicated | Native `.drawer-toggle` route to `#PersonaManagement` + dedicated responsive two-column workspace |
| World Info / Lorebooks | Dedicated | Docked editor, modern World Info entries/forms |
| Character/Chat/Persona lore links | Native | Preserved by not cloning or moving controls |
| Advanced Formatting | Primary dedicated workspace | Sidebar opens native `#AdvancedFormatting` with Context Template, Instruct Template and System Prompt |
| Data Bank | Secondary command | Available from `Ctrl + K`; opens official `#manageAttachments` control and styles the resulting popup |
| Response Configuration | Dedicated | Docked workspace; modern controls |
| Prompt Manager | Within Response Config | Native manager remains functional, receives design system |
| API Connections | Dedicated | Models/API navigation maps to native API panel |
| Connection Profiles | Native within API | Preserved and styled generically |
| User Settings | Dedicated | Docked settings; NastyTavern settings injected here/Extensions host |
| UI themes / appearance | Native | Preserved; NastyTavern variables layer on top |
| Backgrounds | Command palette | Opens native background manager |
| Extensions settings | Dedicated | Native `.drawer-toggle` route to `#rm_extensions_block` + generic inline-drawer styling |
| Quick Replies | Generic | Native buttons/panels inherit modern button/card rules |
| Regex | Generic | Extension settings receive controls/card styling |
| TTS | Generic | Extension settings receive controls/card styling |
| Image Generation | Generic | Extension settings/popups receive modern styling |
| Vector Storage | Generic + Data Bank discovery | Generic extension UI + semantic navigation |
| Reasoning blocks | Generic | Details/inline controls inherit typography and borders |
| Swipe controls / Swipe Picker | Generic | Native message actions remain intact |
| Message edit / delete / regenerate / continue | Native + palette | Preserved; common actions discoverable in command palette |
| Attachments / Gallery | Generic | Inputs, cards and popups styled without DOM relocation |
| Popups / dialogs | Generic | Surface, border, shadow, inputs |
| Select2 / autocomplete | Generic | Modern dropdown surface and highlight state |
| Notifications / toasts | Generic | Modern toast surface |
| Waifu / Visual Novel | Dedicated compatibility | Preserves SillyTavern VN stage geometry; immersive compact shell and native in-stage composer |
| Mobile | Responsive fallback | Compact nav, full-width docked panels; native 40dvh Waifu/VN stage preserved |
| Character Expressions | Dedicated compatibility | Normal-chat sprite defaults to the right side; user drag positions win; Visual Novel layout untouched |
| Third-party extension UI | Generic auto-discovery | Inline drawers/forms/popups/buttons styled automatically |

## Important architectural constraint

NastyTavern deliberately does **not** clone settings forms or detach SillyTavern controls into a second DOM tree. Doing that would duplicate IDs, break delegated event handlers, invalidate extension assumptions, and make every SillyTavern update dangerous. Instead, navigation activates the original UI and CSS docks/reframes it as an application workspace.

## Official Chat Top Bar extension

Dedicated integration for `SillyTavern/Extension-TopInfoBar`:

- `#extensionTopBar` toolbar layout and actions
- current-chat selector
- in-chat search field
- chat manager / new / rename / delete / close actions
- sidebar toggle and connection-profile toggle
- `#extensionConnectionProfiles` profile/status strip
- `#extensionSideBar` chat-history drawer
- chat-history cards, selected state, metadata and close control
- responsive desktop/tablet/mobile behavior
- DOM restoration when NastyTavern is disabled

## 0.1.6 compatibility notes

- **Native panel opening:** NastyTavern pre-docks closed panels and suppresses the native drawer transition during route changes, preventing the old SillyTavern panel geometry from flashing before the modern workspace appears.
- **Persona Management:** only `#PersonaManagement` is a top-level workspace. `#persona-management-block` remains a normal internal layout container.
- **Waifu / Visual Novel:** when `body.waifuMode` is present, NastyTavern deliberately yields `#sheld` sizing/positioning to SillyTavern and does not use the normal fixed composer.

## 0.1.7 Character Advanced Definitions

The native `#character_popup` editor is now a dedicated NastyTavern modal rather than a generic popup. NastyTavern keeps the original SillyTavern controls and handlers, adds internal navigation, constrains the modal to the usable viewport, and applies responsive layouts to Prompt Overrides, creator metadata, Personality/Scenario, Character Note depth/role, Talkativeness and Example Messages.


## 0.1.8 workspace notes

- The duplicate NastyTavern right Context rail is retired; left navigation plus `Ctrl+K` is the single navigation model.
- Advanced Definitions section shortcuts reserve a fixed-height sticky row and cannot flex-shrink.
- Character-card top actions use fixed hit targets and wrap when necessary.
- Character Expressions uses right-side placement only in normal chat; `body.waifuMode` / Visual Novel remains owned by SillyTavern.
