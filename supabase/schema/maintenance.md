# Server-side maintenance — v0.1.11

`community-storage-cleanup` is not invoked by NastyTavern browser clients.

Supabase Cron runs `nastytavern-community-storage-cleanup` once per hour through `pg_net`. The request includes a random maintenance credential stored in `nt_maintenance_secrets`. That table has RLS enabled, grants no access to `anon` or `authenticated`, and only grants direct read access to `service_role`.

The cleanup Edge Function is not user-facing and is deployed with gateway JWT verification disabled. Instead, it requires the private `x-nt-maintenance-key` value and compares it against the server-side credential before using service-role privileges. A normal authenticated Community session therefore cannot trigger global cleanup.

The function reads only `nt_storage_cleanup_queue`. When the queue is empty it returns immediately, avoiding periodic Storage object enumeration and unnecessary network traffic. Deleted Community attachment objects are queued by the database trigger and then removed in batches.
