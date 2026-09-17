# NastyTavern Community — Privacy & Data Flow (v0.1.5)

This document describes the Community and Nasty Catalogue network behavior prepared for NastyTavern UI v0.1.5.

## Network consent

Community network access is disabled by default. NastyTavern does not contact the NastyTavern Supabase project until the user explicitly enables **Community network access**. The pinned Supabase JavaScript client is vendored with the extension and is loaded locally from NastyTavern rather than from a third-party CDN.

Presence is a separate opt-in. Enabling Community does not automatically broadcast online presence or typing activity.

Disabling Community closes active NastyTavern Realtime channels and stops the Supabase auth refresh loop used by the extension. It does not delete the user's account, existing Community posts, catalogue resources, ratings, reports, or acquisition records.

## Services contacted

- **Supabase** — Community authentication, public Community profiles, messages, reactions, mentions, reports, ratings/acquisition records, Realtime, Edge Functions, and Community Storage.
- **Google** — contacted only when the user explicitly chooses Google OAuth.
- **Cloudflare R2** — stores Nasty Catalogue binary objects. Catalogue metadata remains in Supabase.
- **esm.sh / JSR** — runtime dependency delivery used by deployed Supabase Edge Functions.

NastyTavern does not include a custom advertising SDK or behavioral analytics SDK.

## Authentication data

Supabase Auth stores the account data required by the selected sign-in method. Google OAuth may provide email, verification state, account/provider identifiers, name/full name, avatar/picture metadata and issuer metadata to Supabase Auth.

NastyTavern does not copy the account email into its public Community profile tables. The signed-in client can access its own Auth email and may display it in account UI.

Supabase Auth/infrastructure may process normal operational metadata such as session IP address, user-agent, request logs and service metrics according to Supabase's own platform behavior and retention policies.

## Community profile and chat data

`nt_profiles` stores the Supabase user UUID, Community username, optional avatar URL and bio, role, timestamps, and moderation state.

Community messages store the channel, author UUID, message content, reply reference, message type/metadata, and timestamps. The current database trigger retains the newest 100 messages per channel.

Reactions, mentions, reports and ratings are stored when the corresponding feature is used.

## Presence and typing

When the user enables the separate presence option, NastyTavern uses Supabase Realtime Presence. Presence is transient Realtime state rather than a NastyTavern history table.

Global presence broadcasts the user's Community UUID, Community username and an `online_at` timestamp. Channel presence broadcasts the Community UUID, username and `online_at`. Typing broadcasts the UUID, username and whether the user is currently typing.

Since v0.1.4, NastyTavern no longer writes a Community session correlation token to `nt_channel_members`. Existing persisted token values were cleared by the v0.1.4 backend migration. The old column remains temporarily for v0.1.3 server compatibility but is unused by current clients.

`nt_channel_members` still records persistent channel membership metadata (`channel_id`, `user_id`, `role`, `joined_at`). Explicit Community sign-out removes the current user's channel membership rows.

## Files and storage

Community chat attachments use the private Supabase Storage bucket `community-files`. The per-user path begins with the authenticated Supabase UUID. The bucket limit is 5.5 MiB.

Community avatars use the public `community-avatars` bucket. Writes/updates/deletes are restricted to the authenticated user's folder and the bucket limit is 1 MiB.

Deleted Community message attachments are queued for cleanup. A server-side Supabase Cron job invokes the cleanup Edge Function on a schedule; ordinary Community clients cannot trigger this global maintenance operation. The cleanup function also removes unreferenced Community files that have been orphaned for at least one hour.

Nasty Catalogue binary objects are stored in Cloudflare R2. Supabase stores catalogue metadata, ownership, hashes, moderation state, lineage data and the resource payload used by the catalogue backend.

## Character Cards, Lorebooks and SillyTavern content

NastyTavern does not automatically upload SillyTavern chats, prompts, Character Cards or Lorebooks to Community.

A Character Card or Lorebook leaves SillyTavern only after the user performs an explicit Community share or Nasty Catalogue upload action.

## Download/import records

Resource downloads/imports are not anonymous counters.

Community resources use `nt_resource_acquisitions`, which associates the authenticated user UUID with the resource/message and records the first action (`download` or `import`) and timestamp.

Nasty Catalogue uses `nt_catalog_acquisitions`, which associates an authenticated user with a catalogue item and stores first/last action and acquisition timestamps. Aggregate download counts are derived from these records.

## Backend transparency

The v0.1.5 source includes the v0.1.4 privacy/security migration, the v0.1.5 maintenance hardening migration, RLS/Storage policy snapshots, the vendored Supabase browser bundle metadata, and the Edge Function sources used by Community/Nasty Catalogue. Secrets such as service-role keys and Cloudflare R2 credentials are intentionally not included.
