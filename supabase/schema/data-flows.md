# Data-flow summary — v0.1.4

## Before consent

Opening SillyTavern/NastyTavern does not load the Supabase JavaScript client and does not contact the NastyTavern Supabase project. Community and Catalogue network entry points are gated by `communityNetworkEnabled === true`.

## After Community consent

- Browser → jsDelivr: load pinned `@supabase/supabase-js@2.116.0`.
- Browser → Supabase Auth/Data API/Realtime/Storage/Functions: account, profile, Community chat, resource metadata and client-authorized RPCs.
- Browser → Google: only when Google OAuth is explicitly chosen.
- Supabase Edge Functions → Cloudflare R2: Nasty Catalogue binary object storage/access/deletion.
- Edge runtime dependency resolution may use JSR / esm.sh as declared by function source.

## Presence

Presence is a second opt-in. When disabled, the v0.1.4 client does not join the global/channel Presence streams and does not broadcast typing state. When enabled, Realtime Presence contains the Community user id, username and `online_at`; no session correlation token is sent or persisted by v0.1.4.

## Explicit user content transfer

SillyTavern chats/prompts are not passively uploaded. Character Cards and Lorebooks are transferred only through explicit share/catalogue actions.

## Acquisition records

Community resource and Catalogue download/import actions are associated with the authenticated Supabase user. These are not anonymous aggregate-only metrics.
