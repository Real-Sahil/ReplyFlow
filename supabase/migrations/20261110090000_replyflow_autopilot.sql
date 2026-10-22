-- Post autopilot: an AI writer (Groq) drafts a caption for new products and queues
-- it for review in the next free slot. Administrators approve; approval schedules.

alter table public.page_posts
    add column source text not null default 'manual' check (source in ('manual', 'ai')),
    add column ai_model text;

create table public.post_autopilot_settings (
    id int primary key default 1 check (id = 1),
    enabled boolean not null default false,
    posts_per_day int not null default 2 check (posts_per_day between 0 and 10),
    slot_times text[] not null default array['12:00', '18:00'],
    timezone text not null default 'Europe/London',
    updated_at timestamptz not null default now(),
    updated_by bigint references public.sales (id) on delete set null
);

insert into public.post_autopilot_settings (id) values (1)
    on conflict (id) do nothing;

create trigger "10_post_autopilot_settings_audit" after update on public.post_autopilot_settings
    for each row execute function private.audit_row();

alter table public.post_autopilot_settings enable row level security;

create policy "staff read autopilot" on public.post_autopilot_settings
    for select to authenticated using ((select public.staff_role()) is not null);
create policy "admins change autopilot" on public.post_autopilot_settings
    for update to authenticated
    using ((select public.is_admin())) with check ((select public.is_admin()));

grant select, update on public.post_autopilot_settings to authenticated;
grant all on public.post_autopilot_settings to service_role;

-- The cron job's key lives in Vault (name: autopilot_key). The edge function asks
-- this check, so the key never has to be copied into function settings.
create or replace function public.post_autopilot_key_ok(candidate text) returns boolean
    language sql stable security definer
    set search_path = ''
    as $$
    select exists (
        select 1 from vault.decrypted_secrets
        where name = 'autopilot_key' and decrypted_secret = candidate
    );
$$;
revoke execute on function public.post_autopilot_key_ok(text) from public, anon, authenticated;
grant execute on function public.post_autopilot_key_ok(text) to service_role;

-- Every 30 minutes, ask the autopilot function to top up the review queue.
select cron.unschedule(jobid) from cron.job where jobname = 'post-autopilot';

select cron.schedule(
    'post-autopilot',
    '*/30 * * * *',
    $job$
    select net.http_post(
        url := 'https://mdhmuyhtimjkysvsardi.supabase.co/functions/v1/post_autopilot',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-autopilot-key', (select decrypted_secret from vault.decrypted_secrets where name = 'autopilot_key')
        ),
        body := '{"action":"run"}'::jsonb
    );
    $job$
);
