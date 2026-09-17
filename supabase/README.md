# NastyTavern Community Backend — v0.1.5 audit source

This directory is the auditable server-side companion for the NastyTavern UI v0.1.5 hardening work.

It intentionally contains no production secrets. Supabase service-role keys, OAuth secrets and Cloudflare R2 credentials are deployment environment variables and must never be committed.

## Included

- `supabase/migrations/20260917_v0_1_4_privacy_security_hardening.sql` — production migration applied for v0.1.4.
- `supabase/migrations/20260917_v0_1_5_supply_chain_maintenance_hardening.sql` — schedules server-side Storage cleanup and protects its invocation with a private maintenance credential.
- `supabase/policies/current-rls-storage-policies.sql` — current NastyTavern RLS/Storage policy snapshot.
- `supabase/functions/` — source of the Community/Nasty Catalogue Edge Functions. Three catalogue functions are client-facing; `community-storage-cleanup` is server-maintenance-only.

All four published Edge Functions require gateway authentication (`verify_jwt = true`). `community-storage-cleanup` additionally requires a private server-side maintenance credential and is invoked by Supabase Cron rather than the browser.

## v0.1.4 security boundary

The browser extension contains only the Supabase publishable key. Privileged service-role access exists only inside Edge Functions. Database access from the browser remains protected by PostgreSQL grants, RLS policies and role-checked RPCs.

The authenticated RPC surface is explicitly granted. Internal trigger/helper `nt_*` functions and service-only catalogue helpers are not directly executable by `anon` or normal authenticated users.

Supabase's security advisor still reports intentionally exposed `SECURITY DEFINER` authenticated RPCs because those functions form part of the application's authenticated Data API. Their bodies must continue to enforce ownership/moderator/administrator checks where applicable.

## Providers

Community data/auth/realtime/storage: Supabase.
Nasty Catalogue binary objects: Cloudflare R2.
