# Server-side maintenance — v0.1.5

`community-storage-cleanup` is no longer invoked by NastyTavern browser clients.

Supabase Cron runs `nastytavern-community-storage-cleanup` every 15 minutes through `pg_net`. The request includes a random maintenance credential stored in `nt_maintenance_secrets`. That table has RLS enabled, grants no access to `anon` or `authenticated`, and only grants direct read access to `service_role`.

The Edge Function compares the supplied credential against the private server-side value before using service-role privileges. A normal authenticated Community session is therefore insufficient to trigger global cleanup.

The job processes the internal cleanup queue and removes unreferenced `community-files` objects older than one hour.
