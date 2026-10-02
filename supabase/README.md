# NastyTavern Community Backend — v0.1.11 audit source

This directory is the auditable server-side companion for NastyTavern UI v0.1.11.

It intentionally contains no production secrets. Supabase service-role keys, OAuth secrets and Cloudflare R2 credentials are deployment environment variables and must never be committed.

## Included

One-shot SQL migrations are intentionally excluded from the extension package; this directory contains only persistent audit/source material needed to review the deployed integration.

- `supabase/policies/current-rls-storage-policies.sql` — current NastyTavern RLS/Storage policy snapshot.
- `supabase/functions/` — source of the Community/Nasty Catalogue Edge Functions. Three catalogue functions are client-facing; `community-storage-cleanup` is server-maintenance-only.
- `supabase/functions/smart-task/` — tombstone for the legacy cleanup deployment name; it always returns HTTP 410 and performs no privileged work.

The three client-facing catalogue Edge Functions keep gateway JWT verification enabled. `community-storage-cleanup` is deployed with gateway JWT verification disabled because it is not a user-facing endpoint; it performs its own server-only authentication with a random maintenance credential stored outside client-accessible roles. Supabase Cron supplies that credential, and ordinary browser sessions cannot invoke the cleanup successfully.

## v0.1.11 security boundary

The browser extension contains only the Supabase publishable key. Privileged service-role access exists only inside Edge Functions. Database access from the browser remains protected by PostgreSQL grants, RLS policies and role-checked RPCs.

The authenticated RPC surface is explicitly granted. Internal trigger/helper `nt_*` functions and service-only catalogue helpers are not directly executable by `anon` or normal authenticated users.

Supabase's security advisor still reports intentionally exposed `SECURITY DEFINER` authenticated RPCs because those functions form part of the application's authenticated Data API. Their bodies must continue to enforce ownership/moderator/administrator checks where applicable.


## v0.1.11 egress hardening

- Community Character Card thumbnails use generated lightweight previews instead of the original multi-megabyte shared resource; owner-owned legacy shares self-migrate once to the compact preview format.
- Community Realtime subscriptions are scoped to active UI work and Home snapshots are coalesced/cached.
- Nasty Catalogue authorizes access through Supabase but returns short-lived Cloudflare R2 URLs for large binary transfers; Character Card tracking metadata is reconstructed in the browser.
- Server-side Community Storage cleanup is queue-driven and scheduled hourly instead of scanning Storage frequently.

## Providers

Community data/auth/realtime/storage: Supabase.
Nasty Catalogue binary objects: Cloudflare R2.
