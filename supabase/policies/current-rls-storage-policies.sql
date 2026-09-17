-- NastyTavern Community / Nasty Catalogue
-- Current RLS + Storage policy snapshot for v0.1.4.
-- Generated from the production project for audit/review.

create policy nt_catalog_acquisitions_read_own on public.nt_catalog_acquisitions as permissive for select to authenticated
using ((user_id = (select auth.uid())));

create policy nt_catalog_audit_read_mod on public.nt_catalog_audit_log as permissive for select to authenticated
using (nt_is_moderator());

create policy nt_catalog_collection_items_delete on public.nt_catalog_collection_items as permissive for delete to authenticated
using ((exists (select 1 from nt_catalog_collections c where c.id = nt_catalog_collection_items.collection_id and c.owner_id = auth.uid())));

create policy nt_catalog_collection_items_insert on public.nt_catalog_collection_items as permissive for insert to authenticated
with check ((exists (select 1 from nt_catalog_collections c where c.id = nt_catalog_collection_items.collection_id and c.owner_id = auth.uid())));

create policy nt_catalog_collection_items_select on public.nt_catalog_collection_items as permissive for select to authenticated
using ((exists (select 1 from nt_catalog_collections c where c.id = nt_catalog_collection_items.collection_id and (c.owner_id = auth.uid() or c.is_public = true))));

create policy nt_catalog_collections_delete on public.nt_catalog_collections as permissive for delete to authenticated
using ((owner_id = auth.uid()));

create policy nt_catalog_collections_insert on public.nt_catalog_collections as permissive for insert to authenticated
with check ((owner_id = auth.uid()));

create policy nt_catalog_collections_select on public.nt_catalog_collections as permissive for select to authenticated
using (((owner_id = auth.uid()) or (is_public = true)));

create policy nt_catalog_collections_update on public.nt_catalog_collections as permissive for update to authenticated
using ((owner_id = auth.uid()))
with check ((owner_id = auth.uid()));

create policy nt_catalog_items_read_authenticated on public.nt_catalog_items as permissive for select to authenticated
using (((moderation_status = 'approved'::text) or (owner_id = (select auth.uid())) or nt_is_moderator()));

create policy nt_catalog_ratings_read_own on public.nt_catalog_ratings as permissive for select to authenticated
using ((user_id = (select auth.uid())));

create policy nt_catalog_rejections_read_own on public.nt_catalog_rejections as permissive for select to authenticated
using ((owner_id = auth.uid()));

create policy nt_catalog_reports_read_mod on public.nt_catalog_reports as permissive for select to authenticated
using (nt_is_moderator());

create policy nt_members_delete on public.nt_channel_members as permissive for delete to authenticated
using (((user_id = auth.uid()) or nt_is_channel_admin(channel_id, auth.uid())));

create policy nt_members_insert on public.nt_channel_members as permissive for insert to authenticated
with check ((((user_id = auth.uid()) and exists (select 1 from nt_channels c where c.id = nt_channel_members.channel_id and c.type = 'public'::text)) or nt_is_channel_admin(channel_id, auth.uid())));

create policy nt_members_select on public.nt_channel_members as permissive for select to authenticated
using (nt_can_access_channel(channel_id, auth.uid()));

create policy nt_channels_select on public.nt_channels as permissive for select to authenticated
using (nt_can_access_channel(id, auth.uid()));

create policy nt_mentions_read_own on public.nt_mentions as permissive for select to authenticated
using ((mentioned_user_id = auth.uid()));

create policy nt_mentions_update_own on public.nt_mentions as permissive for update to authenticated
using ((mentioned_user_id = auth.uid()))
with check ((mentioned_user_id = auth.uid()));

create policy nt_reactions_delete on public.nt_message_reactions as permissive for delete to authenticated
using ((user_id = auth.uid()));

create policy nt_reactions_insert on public.nt_message_reactions as permissive for insert to authenticated
with check (((user_id = auth.uid()) and exists (select 1 from nt_messages m where m.id = nt_message_reactions.message_id and nt_can_access_channel(m.channel_id, auth.uid()))));

create policy nt_reactions_select on public.nt_message_reactions as permissive for select to authenticated
using ((exists (select 1 from nt_messages m where m.id = nt_message_reactions.message_id and nt_can_access_channel(m.channel_id, auth.uid()))));

create policy nt_messages_delete on public.nt_messages as permissive for delete to authenticated
using ((user_id = auth.uid()));

create policy nt_messages_insert on public.nt_messages as permissive for insert to authenticated
with check (((user_id = auth.uid()) and nt_can_access_channel(channel_id, auth.uid())));

create policy nt_messages_select on public.nt_messages as permissive for select to authenticated
using (nt_can_access_channel(channel_id, auth.uid()));

create policy nt_messages_update on public.nt_messages as permissive for update to authenticated
using ((user_id = auth.uid()))
with check ((user_id = auth.uid()));

create policy nt_profiles_read_authenticated on public.nt_profiles as permissive for select to authenticated
using (true);

create policy nt_profiles_select on public.nt_profiles as permissive for select to authenticated
using (true);

create policy nt_profiles_update on public.nt_profiles as permissive for update to authenticated
using ((id = auth.uid()))
with check ((id = auth.uid()));

create policy nt_profiles_update_self_guard on public.nt_profiles as restrictive for update to authenticated
using ((id = auth.uid()))
with check ((id = auth.uid()));

create policy nt_profiles_update_self_public on public.nt_profiles as permissive for update to authenticated
using ((id = auth.uid()))
with check ((id = auth.uid()));

create policy nt_reports_insert_own on public.nt_reports as permissive for insert to authenticated
with check ((reporter_id = auth.uid()));

create policy nt_reports_select_mod on public.nt_reports as permissive for select to authenticated
using (nt_is_moderator());

create policy nt_resource_stats_live_select_authenticated on public.nt_resource_stats_live as permissive for select to authenticated
using (true);

-- Supabase Storage policies
create policy nt_community_avatars_delete on storage.objects as permissive for delete to authenticated
using (((bucket_id = 'community-avatars'::text) and ((storage.foldername(name))[1] = (auth.uid())::text) and exists (select 1 from nt_profiles p where p.id = auth.uid() and p.banned_at is null)));

create policy nt_community_avatars_insert on storage.objects as permissive for insert to authenticated
with check (((bucket_id = 'community-avatars'::text) and ((storage.foldername(name))[1] = (auth.uid())::text) and exists (select 1 from nt_profiles p where p.id = auth.uid() and p.banned_at is null)));

create policy nt_community_avatars_read on storage.objects as permissive for select to authenticated
using ((bucket_id = 'community-avatars'::text));

create policy nt_community_avatars_update on storage.objects as permissive for update to authenticated
using (((bucket_id = 'community-avatars'::text) and ((storage.foldername(name))[1] = (auth.uid())::text) and exists (select 1 from nt_profiles p where p.id = auth.uid() and p.banned_at is null)))
with check (((bucket_id = 'community-avatars'::text) and ((storage.foldername(name))[1] = (auth.uid())::text) and exists (select 1 from nt_profiles p where p.id = auth.uid() and p.banned_at is null)));

create policy nt_community_files_delete on storage.objects as permissive for delete to authenticated
using (((bucket_id = 'community-files'::text) and ((storage.foldername(name))[1] = (auth.uid())::text) and exists (select 1 from nt_profiles p where p.id = auth.uid() and p.banned_at is null)));

create policy nt_community_files_insert on storage.objects as permissive for insert to authenticated
with check (((bucket_id = 'community-files'::text) and ((storage.foldername(name))[1] = (auth.uid())::text) and exists (select 1 from nt_profiles p where p.id = auth.uid() and p.banned_at is null)));

create policy nt_community_files_read on storage.objects as permissive for select to authenticated
using ((bucket_id = 'community-files'::text));

create policy nt_community_files_update on storage.objects as permissive for update to authenticated
using (((bucket_id = 'community-files'::text) and ((storage.foldername(name))[1] = (auth.uid())::text) and exists (select 1 from nt_profiles p where p.id = auth.uid() and p.banned_at is null)))
with check (((bucket_id = 'community-files'::text) and ((storage.foldername(name))[1] = (auth.uid())::text) and exists (select 1 from nt_profiles p where p.id = auth.uid() and p.banned_at is null)));
