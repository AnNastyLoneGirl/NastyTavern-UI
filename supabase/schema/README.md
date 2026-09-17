# NastyTavern Supabase schema reference — v0.1.4

This directory documents the production schema surface used by NastyTavern Community and Nasty Catalogue as of 2026-09-17.

The authoritative security state is represented by:

- `../migrations/20260917_v0_1_4_privacy_security_hardening.sql`
- `../policies/current-rls-storage-policies.sql`
- `../policies/storage-buckets.sql`
- the Edge Function sources under `../functions/`

The database includes the following application tables:

## Community

- `nt_profiles` — Community public profile, role and moderation state. No application email column.
- `nt_channels` — official/public Community channels.
- `nt_channel_members` — persistent channel membership (`session_token` remains as a deprecated compatibility column and is cleared/not written by v0.1.4).
- `nt_messages` — Community messages/resources; trigger keeps the newest 100 messages per channel.
- `nt_message_reactions` — per-user reactions.
- `nt_mentions` — per-user mention state.
- `nt_reports` — Community message reports/moderation state.
- `nt_resource_acquisitions` — authenticated user ↔ shared resource acquisition record.
- `nt_resource_ratings` — authenticated user ↔ shared resource rating.
- `nt_resource_stats_live` — aggregate resource stats used by the client.
- `nt_storage_cleanup_queue` — internal attachment cleanup queue; RLS enabled with no client policy by design.

## Nasty Catalogue

- `nt_catalog_items` — catalogue metadata, ownership, moderation/provenance fields and resource payload.
- `nt_catalog_acquisitions` — authenticated user ↔ catalogue acquisition history.
- `nt_catalog_ratings` — authenticated user ↔ catalogue rating.
- `nt_catalog_rejections` — rejection receipts for owners.
- `nt_catalog_reports` — catalogue reports.
- `nt_catalog_audit_log` — moderation audit actions.
- `nt_catalog_collections` — user collections.
- `nt_catalog_collection_items` — collection membership.

## Client RPC surface in v0.1.4

`anon` has no EXECUTE privilege on any `public.nt_*` function. The following authenticated RPC/helper names are deliberately exposed because the frontend or RLS policies use them; function bodies enforce ownership/authentication/role rules where privileged behavior is required:

### Community / RLS

- `nt_can_access_channel`
- `nt_is_channel_admin`
- `nt_is_moderator`
- `nt_claim_username`
- `nt_join_channel`
- `nt_leave_all_channels`
- `nt_moderate_delete_message`
- `nt_mute_user`
- `nt_ban_user`
- `nt_unban_user`
- `nt_set_role`
- `nt_rate_resource`
- `nt_record_resource_acquisition`
- `nt_report_message`
- `nt_resolve_report`
- `nt_resource_stats`

### Catalogue

- `nt_catalog_acknowledge_rejection`
- `nt_catalog_audit_queue`
- `nt_catalog_collection_items_view`
- `nt_catalog_creator_items`
- `nt_catalog_creator_summary`
- `nt_catalog_detect_copy`
- `nt_catalog_item_payload`
- `nt_catalog_log_moderation_action`
- `nt_catalog_make_canonical`
- `nt_catalog_moderate_item`
- `nt_catalog_moderation_count`
- `nt_catalog_moderation_queue`
- `nt_catalog_moderator_items`
- `nt_catalog_my_upload_policy`
- `nt_catalog_public_collections`
- `nt_catalog_rate_item`
- `nt_catalog_record_my_acquisition`
- `nt_catalog_report_count`
- `nt_catalog_report_item`
- `nt_catalog_report_queue`
- `nt_catalog_resolve_report`
- `nt_catalog_search`
- `nt_catalog_set_content_rating`
- `nt_catalog_sha_exists`

All other `nt_*` helper/trigger functions have direct EXECUTE revoked from `anon` and `authenticated` and remain usable only through PostgreSQL triggers, policies or `service_role` as appropriate.
