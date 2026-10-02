# Data-flow summary — v0.1.11

## Before consent

Opening SillyTavern/NastyTavern does not load the Supabase JavaScript client and does not contact the NastyTavern Supabase project. Community and Catalogue network entry points are gated by `communityNetworkEnabled === true`.

## After Community consent

- Browser → local NastyTavern extension asset: load the vendored `@supabase/supabase-js` browser bundle; no third-party CDN is contacted for the client SDK.
- Browser → Supabase Auth/Data API/targeted Realtime/Storage/Functions: account, profile, Community chat, resource metadata and client-authorized RPCs.
- Browser → Google: only when Google OAuth is explicitly chosen.
- Supabase Edge Functions → Cloudflare R2: Nasty Catalogue authorization, upload and deletion workflows.
- Browser → Cloudflare R2: authorized Nasty Catalogue binary imports/downloads use short-lived signed URLs so multi-megabyte files do not transit through Supabase egress.
- Edge runtime dependency resolution may use JSR / esm.sh as declared by function source.

## Community image egress

Community shared resource binaries remain in Supabase Storage. New Character Card shares create a small resized PNG preview client-side and store its `preview_path` beside the message metadata. Home and Community card thumbnails request only this preview. The original PNG is fetched only after an explicit details/import/download action. Older shares without `preview_path` keep a lightweight fallback for viewers who cannot persist a repair. When the signed-in user owns the legacy share, the client performs a one-time background migration: it downloads the original PNG once, generates/uploads the compact preview, and writes `preview_path` back to that message so future renders stay on the lightweight path.

Profile avatars are resized/compressed to WebP client-side when the browser supports it (animated GIFs remain unchanged), with long cache-control metadata to reduce repeat transfers.

## Realtime

Presence is a second opt-in. When disabled, the client does not join Presence streams and does not broadcast typing state. When enabled, typing uses state transitions rather than broadcasting on every keystroke.

The active Community room subscribes only while the Community panel is open. Message and reaction events update local state incrementally instead of re-fetching the entire room. Home data uses a short coalesced TTL rather than a permanent global message/statistics subscription.

## Explicit user content transfer

SillyTavern chats/prompts are not passively uploaded. Character Cards and Lorebooks are transferred only through explicit share/catalogue actions.

## Acquisition records

Community resource and Catalogue download/import actions are associated with the authenticated Supabase user. These are not anonymous aggregate-only metrics.

## Server-side maintenance

Community Storage cleanup is scheduled hourly by Supabase Cron. The database supplies a private maintenance credential to `community-storage-cleanup`; browser clients do not invoke this function. The function only drains the explicit cleanup queue and exits immediately when there is no work.
