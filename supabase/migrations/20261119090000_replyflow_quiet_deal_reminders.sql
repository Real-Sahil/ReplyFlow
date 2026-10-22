-- Reminders for open deals that have gone quiet. The follow-up engine already covers
-- unanswered enquiries, quotes awaiting a reply and overdue order updates; this covers
-- every other open stage. "Activity" is the latest of the deal's own change, its notes
-- and Messenger messages from its contacts. Reminders are tasks for the owner, not
-- messages to customers, so they need no send window.

alter table public.followup_settings
    add column quiet_deal_days integer not null default 14 check (quiet_deal_days > 0);

create or replace function public.generate_quiet_deal_tasks() returns integer
    language plpgsql security definer
    set search_path = ''
    as $$
declare
    s public.followup_settings;
    total integer;
begin
    select * into s from public.followup_settings where id = 1;
    if not found or not s.enabled then
        return 0;
    end if;

    -- The key carries the last activity date, so a new reminder only appears after
    -- the deal has been quiet again. A reminder that is still open blocks another one.
    insert into public.tasks (contact_id, deal_id, type, text, due_date, sales_id, source, dedupe_key)
    select c.contact_id, d.id, 'follow-up',
           'Quiet deal, no activity for ' || s.quiet_deal_days || ' days: ' || d.name,
           now(), d.sales_id, 'auto',
           'quiet:' || d.id || ':' || a.last_activity::date
    from public.deals d
    cross join lateral (
        select co.id as contact_id from public.contacts co
        where co.id = any (d.contact_ids) order by co.id limit 1
    ) c
    cross join lateral (
        select greatest(
            d.updated_at,
            coalesce((select max(n.date) from public.deal_notes n where n.deal_id = d.id), d.updated_at),
            coalesce((select max(m.sent_at) from public.messenger_messages m
                      where m.contact_id = any (d.contact_ids)), d.updated_at)
        ) as last_activity
    ) a
    where d.archived_at is null
      and d.stage not in ('won', 'lost', s.enquiry_stage, s.quote_stage)
      and a.last_activity < now() - make_interval(days => s.quiet_deal_days)
      and not exists (select 1 from public.tasks t where t.deal_id = d.id and t.done_date is null)
    on conflict (dedupe_key) do nothing;
    get diagnostics total = row_count;

    return total;
end;
$$;

revoke execute on function public.generate_quiet_deal_tasks() from public, anon, authenticated;
grant execute on function public.generate_quiet_deal_tasks() to service_role;

select cron.schedule('replyflow-quiet-deals', '7,22,37,52 * * * *', $job$ select public.generate_quiet_deal_tasks(); $job$);
