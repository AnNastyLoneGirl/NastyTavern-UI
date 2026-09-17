-- NastyTavern UI v0.1.4 — Community privacy & privilege hardening
-- Production migration for project NastyTavern Community.

-- 1) Stop persisting Community session correlation tokens.
update public.nt_channel_members
set session_token = null
where session_token is not null;

comment on column public.nt_channel_members.session_token is
'Deprecated compatibility column. NastyTavern v0.1.4+ does not persist Community presence/session tokens here.';

-- Keep the v0.1.3 signature temporarily compatible, but ignore the token.
create or replace function public.nt_join_channel(p_channel uuid, p_session_token text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    channel_slug text;
begin
    if auth.uid() is null then raise exception 'Not authenticated'; end if;
    if exists(select 1 from public.nt_profiles where id=auth.uid() and banned_at is not null) then
        raise exception 'This Community account is banned';
    end if;
    select slug into channel_slug from public.nt_channels where id=p_channel and type='public';
    if channel_slug is null or channel_slug not in ('general','nastytavern','character-cards','lorebooks','extensions') then
        raise exception 'Only official Community channels can be joined';
    end if;
    insert into public.nt_channel_members(channel_id,user_id,role,joined_at,session_token)
    values(p_channel,auth.uid(),'member',now(),null)
    on conflict(channel_id,user_id) do update
    set joined_at=excluded.joined_at, session_token=null;
    return p_channel;
end;
$$;

-- v0.1.4 signature: no session token accepted at all.
create or replace function public.nt_join_channel(p_channel uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
begin
    return public.nt_join_channel(p_channel, null);
end;
$$;

-- 2) Fix mutable search_path lint on the pure role-rank helper.
alter function public.nt_role_rank(text) set search_path = pg_catalog;

-- 3) Least-privilege function ACLs.
-- Remove implicit/public execution from all NastyTavern functions, then explicitly
-- expose only the client RPC and RLS helper surface required by the extension.
do $$
declare
    r record;
begin
    for r in
        select p.oid::regprocedure as fn
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and left(p.proname, 3) = 'nt_'
    loop
        execute format('revoke execute on function %s from public, anon, authenticated', r.fn);
        execute format('grant execute on function %s to service_role', r.fn);
    end loop;
end;
$$;

-- Explicit authenticated API surface. Every matching overload is granted;
-- all other nt_* helpers remain unavailable as direct client RPC endpoints.
do $$
declare
    r record;
    allowed text[] := array[
            'nt_can_access_channel',
            'nt_is_channel_admin',
            'nt_is_moderator',
            'nt_claim_username',
            'nt_join_channel',
            'nt_leave_all_channels',
            'nt_moderate_delete_message',
            'nt_mute_user',
            'nt_ban_user',
            'nt_unban_user',
            'nt_set_role',
            'nt_rate_resource',
            'nt_record_resource_acquisition',
            'nt_report_message',
            'nt_resolve_report',
            'nt_resource_stats',
            'nt_catalog_acknowledge_rejection',
            'nt_catalog_audit_queue',
            'nt_catalog_collection_items_view',
            'nt_catalog_creator_items',
            'nt_catalog_creator_summary',
            'nt_catalog_detect_copy',
            'nt_catalog_item_payload',
            'nt_catalog_log_moderation_action',
            'nt_catalog_make_canonical',
            'nt_catalog_moderate_item',
            'nt_catalog_moderation_count',
            'nt_catalog_moderation_queue',
            'nt_catalog_moderator_items',
            'nt_catalog_my_upload_policy',
            'nt_catalog_public_collections',
            'nt_catalog_rate_item',
            'nt_catalog_record_my_acquisition',
            'nt_catalog_report_count',
            'nt_catalog_report_item',
            'nt_catalog_report_queue',
            'nt_catalog_resolve_report',
            'nt_catalog_search',
            'nt_catalog_set_content_rating',
            'nt_catalog_sha_exists'
    ];
begin
    for r in
        select p.oid::regprocedure as fn
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = any(allowed)
    loop
        execute format('grant execute on function %s to authenticated', r.fn);
    end loop;
end;
$$;

-- Prevent new public NastyTavern helper functions from becoming executable by
-- anonymous/authenticated clients through PostgreSQL's default PUBLIC grant.
alter default privileges for role postgres in schema public
    revoke execute on functions from public, anon, authenticated;
