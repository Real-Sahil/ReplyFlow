-- Lead score for open deals, with a band that does not flicker at the boundaries.
-- Score: 0 to 100 from the enquiry origin, the stage, recent inbound messages and recency.
-- Band: Cold, Warm or Hot. To move up, the score must clear the threshold by a margin of 5;
-- to move down, it must fall below the threshold by the same margin. In between, the band stays.

alter table public.deals
    add column lead_score integer not null default 0 check (lead_score between 0 and 100),
    add column lead_band text not null default 'frio' check (lead_band in ('frio', 'morno', 'quente')),
    add column lead_score_at timestamptz;

create or replace function public.next_lead_band(prev text, score integer)
returns text
    language sql immutable
    set search_path = ''
    as $$
    select case
        when score >= 75 then 'quente'
        when prev = 'quente' and score >= 65 then 'quente'
        when score >= 45 then 'morno'
        when prev in ('morno', 'quente') and score >= 35 then 'morno'
        else 'frio'
    end;
$$;

create or replace function public.refresh_lead_scores()
returns integer
    language plpgsql security definer
    set search_path = ''
    as $$
declare
    updated integer;
begin
    with scored as (
        select
            d.id,
            d.lead_band,
            least(100,
                case when d.name like 'Website enquiry:%' then 30 else 0 end
                + case d.stage
                    when 'opportunity' then 10
                    when 'proposal-sent' then 30
                    when 'in-negociation' then 45
                    when 'delayed' then 10
                    else 0
                  end
                + case when m.inbound_week >= 1 then 10 else 0 end
                + case when m.inbound_week >= 3 then 10 else 0 end
                + case when m.last_inbound > now() - interval '48 hours' then 10 else 0 end
            ) as score
        from public.deals d
        left join lateral (
            select
                count(*) as inbound_week,
                max(mm.sent_at) as last_inbound
            from public.messenger_messages mm
            where mm.direction = 'inbound'
              and mm.contact_id = any(d.contact_ids)
              and mm.sent_at > now() - interval '7 days'
        ) m on true
        where d.archived_at is null
          and d.stage not in ('won', 'lost')
    )
    update public.deals d
    set lead_score = s.score,
        lead_band = public.next_lead_band(s.lead_band, s.score),
        lead_score_at = now()
    from scored s
    where d.id = s.id;

    get diagnostics updated = row_count;
    return updated;
end;
$$;

revoke execute on function public.refresh_lead_scores() from public, anon, authenticated;
grant execute on function public.refresh_lead_scores() to service_role;

-- Free, in-database schedule: refresh the open deals every 15 minutes.
select cron.unschedule(jobid) from cron.job where jobname = 'lead-scores';
select cron.schedule('lead-scores', '*/15 * * * *', $job$ select public.refresh_lead_scores(); $job$);
