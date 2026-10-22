-- Autopilot can approve and schedule its own posts when an administrator switches
-- auto-approval on. Only AI posts are ever scheduled this way.

alter table public.post_autopilot_settings
    add column auto_approve boolean not null default false;

-- Every 10 minutes, schedule approved AI posts that are due within the next 29 days.
-- post_publish checks the Vault key and accepts only approved posts for this path.
select cron.unschedule(jobid) from cron.job where jobname = 'post-autopilot-publish';

select cron.schedule(
    'post-autopilot-publish',
    '*/10 * * * *',
    $job$
    select net.http_post(
        url := 'https://mdhmuyhtimjkysvsardi.supabase.co/functions/v1/post_publish',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-autopilot-key', (select decrypted_secret from vault.decrypted_secrets where name = 'autopilot_key')
        ),
        body := jsonb_build_object('id', p.id, 'action', 'schedule', 'scheduled_for', p.scheduled_for)
    )
    from public.page_posts p
    where p.source = 'ai'
      and p.status = 'approved'
      and p.scheduled_for between now() + interval '15 minutes' and now() + interval '29 days';
    $job$
);
