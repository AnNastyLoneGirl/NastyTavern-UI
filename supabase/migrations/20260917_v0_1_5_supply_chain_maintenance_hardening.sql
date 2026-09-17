-- NastyTavern UI v0.1.5 — supply-chain & maintenance trust-boundary hardening
-- Makes Community Storage cleanup server-scheduled and removes arbitrary authenticated invocation.

create extension if not exists pg_net;
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

create table if not exists public.nt_maintenance_secrets (
    name text primary key,
    secret text not null,
    created_at timestamptz not null default now(),
    rotated_at timestamptz not null default now()
);
alter table public.nt_maintenance_secrets enable row level security;
revoke all on table public.nt_maintenance_secrets from public, anon, authenticated;
grant select on table public.nt_maintenance_secrets to service_role;

insert into public.nt_maintenance_secrets (name, secret)
values ('community_storage_cleanup', encode(extensions.gen_random_bytes(32), 'hex'))
on conflict (name) do nothing;

do $$
begin
    if exists (select 1 from cron.job where jobname = 'nastytavern-community-storage-cleanup') then
        perform cron.unschedule('nastytavern-community-storage-cleanup');
    end if;
end
$$;

select cron.schedule(
    'nastytavern-community-storage-cleanup',
    '*/15 * * * *',
    $cron$
    select net.http_post(
        url := 'https://egyzkywvuvlcaguirzdm.supabase.co/functions/v1/community-storage-cleanup',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-nt-maintenance-key', (select secret from public.nt_maintenance_secrets where name = 'community_storage_cleanup')
        ),
        body := jsonb_build_object('scheduled_at', now()),
        timeout_milliseconds := 10000
    ) as request_id;
    $cron$
);
