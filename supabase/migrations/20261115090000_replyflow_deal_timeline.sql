-- One history per deal: stage changes, notes, Messenger messages and Page comments
-- from the deal's contacts, newest first. Runs as the caller, so row-level security
-- decides what each staff member can see.

create or replace function public.deal_timeline(p_deal_id bigint)
returns table (
    event_id text,
    happened_at timestamptz,
    kind text,
    body text,
    detail jsonb
)
language sql
stable
security invoker
set search_path = public
as $$
    with deal as (
        select d.id, coalesce(d.contact_ids, '{}'::bigint[]) as contact_ids
        from public.deals d
        where d.id = p_deal_id
    )
    select 'deal.' || a.id as event_id, a.changed_at as happened_at, 'created' as kind, null::text as body, null::jsonb as detail
    from public.audit_log a
    where a.table_name = 'deals' and a.record_id = p_deal_id and a.action = 'insert'
    union all
    select 'stage.' || a.id, a.changed_at, 'stage',
        null::text,
        jsonb_build_object(
            'from', a.changes -> 'stage' ->> 'old',
            'to', a.changes -> 'stage' ->> 'new',
            'actor_id', a.actor_id
        )
    from public.audit_log a
    where a.table_name = 'deals' and a.record_id = p_deal_id and a.action = 'update'
      and a.changes ? 'stage'
    union all
    select 'note.' || n.id, n.date, 'note', n.text,
        jsonb_build_object('actor_id', n.sales_id)
    from public.deal_notes n
    where n.deal_id = p_deal_id
    union all
    select 'message.' || m.id, m.sent_at, 'message', m.body,
        jsonb_build_object('direction', m.direction, 'source', m.source, 'actor_id', m.sent_by)
    from public.messenger_messages m
    where m.deal_id = p_deal_id
       or m.contact_id in (select unnest(contact_ids) from deal)
    union all
    select 'comment.' || c.id, c.commented_at, 'comment', c.body,
        jsonb_build_object('status', c.status, 'author', c.author_name, 'reply', c.reply_text)
    from public.page_comments c
    where c.contact_id in (select unnest(contact_ids) from deal)
    order by happened_at desc
    limit 300;
$$;

revoke execute on function public.deal_timeline(bigint) from public, anon;
grant execute on function public.deal_timeline(bigint) to authenticated, service_role;
