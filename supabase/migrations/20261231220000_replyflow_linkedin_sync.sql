-- A daily LinkedIn check: ad spend per day (for the cash-flow forecast and the weekly summary), and a
-- record of the alerts already sent today so each is sent once.

create table public.linkedin_ad_spend (
    organisation_id bigint not null references public.organisations (id),
    account_id text not null,
    day date not null,
    spend numeric(14, 2) not null default 0,
    currency text not null default '',
    impressions bigint not null default 0,
    clicks bigint not null default 0,
    primary key (organisation_id, account_id, day)
);

alter table public.linkedin_ad_spend enable row level security;
-- Money, so administrators only.
create policy "administrators read linkedin ad spend" on public.linkedin_ad_spend
    for select to authenticated
    using (organisation_id = (select private.current_organisation()) and (select private.is_admin()));
revoke all on public.linkedin_ad_spend from public, anon, authenticated;
grant select on public.linkedin_ad_spend to authenticated;
grant all on public.linkedin_ad_spend to service_role;

create table public.linkedin_alerts_sent (
    organisation_id bigint not null references public.organisations (id),
    alert_key text not null,
    sent_on date not null default current_date,
    primary key (organisation_id, alert_key, sent_on)
);
alter table public.linkedin_alerts_sent enable row level security;
revoke all on public.linkedin_alerts_sent from public, anon, authenticated;
grant all on public.linkedin_alerts_sent to service_role;

-- Every day at 05:15 UTC, ask the linkedin_sync function to check. It uses the same Vault key as the
-- autopilot and the weekly summary.
select cron.unschedule(jobid) from cron.job where jobname = 'linkedin-sync';
select cron.schedule(
  'linkedin-sync',
  '15 5 * * *',
  $job$
  select net.http_post(
    url := 'https://mdhmuyhtimjkysvsardi.supabase.co/functions/v1/linkedin_sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-autopilot-key', (select decrypted_secret from vault.decrypted_secrets where name = 'autopilot_key')
    ),
    body := '{}'::jsonb
  );
  $job$
);
