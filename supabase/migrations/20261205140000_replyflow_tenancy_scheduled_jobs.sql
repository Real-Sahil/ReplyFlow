-- Scheduled jobs work per organisation. Each organisation's own follow-up settings apply to its
-- own deals and orders, and every task or post a job creates belongs to the same organisation as
-- the row it came from.

create or replace function public.generate_followup_tasks()
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
    s public.followup_settings;
    total integer := 0;
    n integer;
begin
    for s in select * from public.followup_settings where enabled loop
        insert into public.tasks (contact_id, deal_id, type, text, due_date, sales_id, source, dedupe_key, organisation_id)
        select c.contact_id, d.id, 'follow-up', 'Reply to new enquiry: ' || d.name, now(), d.sales_id, 'auto',
               'enquiry:' || d.id, d.organisation_id
        from public.deals d
        cross join lateral (
            select co.id as contact_id from public.contacts co
            where co.id = any (d.contact_ids) order by co.id limit 1
        ) c
        where d.organisation_id = s.organisation_id
          and d.stage = s.enquiry_stage
          and d.archived_at is null
          and d.created_at < now() - make_interval(hours => s.enquiry_unanswered_hours)
          and not exists (select 1 from public.deal_notes n where n.deal_id = d.id)
          and not exists (select 1 from public.tasks t where t.deal_id = d.id and t.done_date is null)
        on conflict (dedupe_key) do nothing;
        get diagnostics n = row_count;
        total := total + n;

        insert into public.tasks (contact_id, deal_id, type, text, due_date, sales_id, source, dedupe_key, organisation_id)
        select c.contact_id, d.id, 'follow-up', 'Chase quote: ' || d.name, now(), d.sales_id, 'auto',
               'quote:' || d.id || ':' || a.last_activity::date, d.organisation_id
        from public.deals d
        cross join lateral (
            select co.id as contact_id from public.contacts co
            where co.id = any (d.contact_ids) order by co.id limit 1
        ) c
        cross join lateral (
            select greatest(d.updated_at, coalesce(
                (select max(n.date) from public.deal_notes n where n.deal_id = d.id), d.updated_at)
            ) as last_activity
        ) a
        where d.organisation_id = s.organisation_id
          and d.stage = s.quote_stage
          and d.archived_at is null
          and a.last_activity < now() - make_interval(days => s.quote_chase_days)
          and not exists (select 1 from public.tasks t where t.deal_id = d.id and t.done_date is null)
        on conflict (dedupe_key) do nothing;
        get diagnostics n = row_count;
        total := total + n;

        insert into public.tasks (contact_id, order_id, type, text, due_date, sales_id, source, dedupe_key, organisation_id)
        select o.contact_id, o.id, 'follow-up', 'Update customer on order ' || o.reference, now(), o.sales_id, 'auto',
               'order:' || o.id || ':' || due.d, o.organisation_id
        from public.orders o
        cross join lateral (
            select coalesce(
                o.next_update_due,
                (coalesce(o.last_customer_update_at, o.created_at) + make_interval(days => s.order_update_days))::date
            ) as d
        ) due
        where o.organisation_id = s.organisation_id
          and o.status not in ('completed', 'cancelled')
          and due.d <= current_date
          and not exists (select 1 from public.tasks t where t.order_id = o.id and t.done_date is null)
        on conflict (dedupe_key) do nothing;
        get diagnostics n = row_count;
        total := total + n;
    end loop;

    return total;
end;
$function$;

create or replace function public.generate_quiet_deal_tasks()
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
    s public.followup_settings;
    total integer := 0;
    n integer;
begin
    for s in select * from public.followup_settings where enabled loop
        insert into public.tasks (contact_id, deal_id, type, text, due_date, sales_id, source, dedupe_key, organisation_id)
        select c.contact_id, d.id, 'follow-up',
               'Quiet deal, no activity for ' || s.quiet_deal_days || ' days: ' || d.name,
               now(), d.sales_id, 'auto',
               'quiet:' || d.id || ':' || a.last_activity::date, d.organisation_id
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
        where d.organisation_id = s.organisation_id
          and d.archived_at is null
          and d.stage not in ('won', 'lost', s.enquiry_stage, s.quote_stage)
          and a.last_activity < now() - make_interval(days => s.quiet_deal_days)
          and not exists (select 1 from public.tasks t where t.deal_id = d.id and t.done_date is null)
        on conflict (dedupe_key) do nothing;
        get diagnostics n = row_count;
        total := total + n;
    end loop;

    return total;
end;
$function$;

create or replace function public.recycle_evergreen_posts()
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
    total integer;
begin
    insert into public.page_posts (
        message, product_id, image_url, link_url, status, source, ai_model,
        media_path, media_name, media_type, recycled_from, created_by, organisation_id
    )
    select p.message, p.product_id, p.image_url, p.link_url, 'draft', p.source, p.ai_model,
           p.media_path, p.media_name, p.media_type, p.id, p.created_by, p.organisation_id
    from public.page_posts p
    where p.evergreen
      and p.status = 'published'
      and p.published_at < now() - interval '60 days'
      and not exists (
          select 1 from public.page_posts r
          where r.recycled_from = p.id and r.created_at > now() - interval '60 days'
      );
    get diagnostics total = row_count;
    return total;
end;
$function$;

-- Only a staff member of the post's organisation can change it.
create or replace function public.set_post_evergreen(p_id bigint, p_value boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
    if (select public.staff_role()) is null then
        raise exception 'Only staff can change this.' using errcode = 'insufficient_privilege';
    end if;
    update public.page_posts
    set evergreen = p_value
    where id = p_id and status = 'published'
      and organisation_id = (select private.current_organisation());
    if not found then
        raise exception 'Only a published post can be evergreen.' using errcode = 'check_violation';
    end if;
end;
$function$;
