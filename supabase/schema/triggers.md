# Trigger inventory — production snapshot 2026-09-17

## Community

- `nt_channels_touch_updated_at` — BEFORE UPDATE → `nt_touch_updated_at()`
- `nt_messages_guard_write` — BEFORE INSERT/UPDATE → `nt_guard_message_write()`
- `nt_messages_mentions` — AFTER INSERT/UPDATE → `nt_sync_message_mentions()`
- `nt_messages_queue_deleted_attachment` — AFTER DELETE → `nt_queue_deleted_attachment()`
- `nt_messages_trim_channel` — AFTER INSERT → `nt_trim_channel_messages()`
- `nt_profiles_protect_fields` — BEFORE UPDATE → `nt_protect_profile_fields()`
- `nt_profiles_touch_updated_at` — BEFORE UPDATE → `nt_touch_updated_at()`
- `nt_profiles_username_immutable` — BEFORE UPDATE → `nt_prevent_username_change()`
- `nt_resource_acquisitions_refresh_live_stats` — AFTER INSERT/UPDATE/DELETE → `nt_resource_stats_live_from_acquisition()`
- `nt_resource_ratings_refresh_live_stats` — AFTER INSERT/UPDATE/DELETE → `nt_resource_stats_live_from_rating()`

## Nasty Catalogue

- `nt_catalog_collection_item_guard_trg` — BEFORE INSERT/UPDATE → `nt_catalog_collection_item_guard()`
- `nt_catalog_collection_items_touch_parent` — AFTER INSERT/DELETE → `nt_catalog_touch_collection()`
- `nt_catalog_touch_collection_trg` — AFTER INSERT/DELETE → `nt_catalog_touch_collection()`
- `nt_catalog_canonical_copy_guard_trg` — BEFORE INSERT/UPDATE → `nt_catalog_prepare_canonical_copy_guard()`
- `nt_catalog_enforce_upload_policy_trigger` — BEFORE INSERT/UPDATE → `nt_catalog_enforce_upload_policy()`
- `nt_catalog_items_search_vector` — BEFORE INSERT/UPDATE → `nt_catalog_set_search_vector()`
- `nt_catalog_items_touch_updated_at` — BEFORE UPDATE → `nt_catalog_touch_updated_at()`
- `nt_catalog_lock_identity_and_png_asset_trg` — BEFORE UPDATE → `nt_catalog_lock_identity_and_png_asset()`
- `nt_catalog_mark_pending_trg` — BEFORE INSERT/UPDATE → `nt_catalog_mark_pending()`
- `nt_catalog_reject_duplicate_sha_trigger` — BEFORE INSERT/UPDATE → `nt_catalog_reject_duplicate_sha()`
- `nt_catalog_ratings_touch_updated_at` — BEFORE UPDATE → `nt_catalog_touch_updated_at()`

This inventory is descriptive. The database migration and current policy snapshots are the files intended for security review; trigger helpers themselves are not directly executable by browser roles in v0.1.4.
