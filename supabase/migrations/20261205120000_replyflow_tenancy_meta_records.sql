-- Messenger and comment records take their organisation from the Facebook Page they arrived on.
-- A Page that is not on the list (an older setup) falls back to organisation 1, as before.
create or replace function private.organisation_for_page(p_page_id text) returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select m.organisation_id from public.meta_pages m where m.page_id = p_page_id),
    1
  );
$$;
revoke all on function private.organisation_for_page(text) from public, anon, authenticated;
grant execute on function private.organisation_for_page(text) to service_role;

create or replace function public.record_messenger_echo(p_page_id text, p_psid text, p_mid text, p_body text, p_sent_at timestamp with time zone)
returns bigint
language plpgsql
security definer
set search_path = ''
as $function$
declare
    v_org bigint := private.organisation_for_page(p_page_id);
    v_contact_id bigint;
    v_deal_id bigint;
    v_id bigint;
begin
    select id into v_contact_id from public.contacts
     where messenger_psid = p_psid and organisation_id = v_org;
    if v_contact_id is null then
        return null;
    end if;

    select m.deal_id into v_deal_id
    from public.messenger_messages m
    where m.contact_id = v_contact_id and m.deal_id is not null and m.organisation_id = v_org
    order by m.sent_at desc
    limit 1;

    insert into public.messenger_messages
        (mid, page_id, psid, contact_id, deal_id, body, direction, source, sent_at, organisation_id)
    values
        (p_mid, p_page_id, p_psid, v_contact_id, v_deal_id, p_body, 'outbound', 'page_inbox',
         coalesce(p_sent_at, now()), v_org)
    on conflict (mid) do nothing
    returning id into v_id;

    if v_id is not null and v_deal_id is not null then
        insert into public.deal_notes (deal_id, text, organisation_id)
        values (v_deal_id, 'Replied on Facebook: ' || left(p_body, 900), v_org);
    end if;
    return v_id;
end;
$function$;

create or replace function public.record_messenger_message(p_page_id text, p_psid text, p_mid text, p_body text, p_sent_at timestamp with time zone, p_first_name text, p_last_name text, p_referral jsonb)
returns bigint
language plpgsql
security definer
set search_path = ''
as $function$
declare
    v_org bigint := private.organisation_for_page(p_page_id);
    v_message_id bigint;
    v_contact_id bigint;
    v_deal_id bigint;
    v_first text;
    v_last text;
    v_real_first text := nullif(trim(p_first_name), '');
    v_real_last text := nullif(trim(p_last_name), '');
begin
    insert into public.messenger_messages (mid, page_id, psid, body, referral, sent_at, organisation_id)
    values (p_mid, p_page_id, p_psid, p_body, p_referral, coalesce(p_sent_at, now()), v_org)
    on conflict (mid) do nothing
    returning id into v_message_id;

    if v_message_id is null then
        return null;
    end if;

    select id into v_contact_id from public.contacts
     where messenger_psid = p_psid and organisation_id = v_org;

    if v_contact_id is null then
        v_first := coalesce(v_real_first, 'Messenger');
        v_last := coalesce(v_real_last, 'enquiry ' || right(p_psid, 4));
        insert into public.contacts (first_name, last_name, messenger_psid, first_seen, last_seen, organisation_id)
        values (v_first, v_last, p_psid, now(), now(), v_org)
        returning id into v_contact_id;
    elsif v_real_first is not null then
        update public.contacts
        set first_name = v_real_first,
            last_name = coalesce(v_real_last, last_name)
        where id = v_contact_id
          and first_name = 'Messenger'
          and last_name like 'enquiry %';
        update public.deals
        set name = 'Messenger enquiry: ' || v_real_first || ' ' || coalesce(v_real_last, '')
        where contact_ids = array[v_contact_id]
          and organisation_id = v_org
          and name like 'Messenger enquiry: Messenger enquiry %';
    end if;

    update public.contacts set last_seen = now() where id = v_contact_id;

    select d.id into v_deal_id
    from public.deals d
    where d.contact_ids @> array[v_contact_id]
      and d.organisation_id = v_org
      and d.archived_at is null
      and d.stage not in ('won', 'lost')
    order by d.created_at desc
    limit 1;

    if v_deal_id is null then
        select 'Messenger enquiry: ' || c.first_name || ' ' || coalesce(c.last_name, '')
        into v_first from public.contacts c where c.id = v_contact_id;
        insert into public.deals (name, stage, contact_ids, description, created_at, updated_at, organisation_id)
        values (trim(v_first), 'opportunity', array[v_contact_id],
                'Started from a Messenger message to the Page.', now(), now(), v_org)
        returning id into v_deal_id;
    end if;

    update public.messenger_messages
    set contact_id = v_contact_id, deal_id = v_deal_id
    where id = v_message_id;

    return v_message_id;
end;
$function$;

create or replace function public.record_page_comment(p_comment_id text, p_post_id text, p_parent_id text, p_page_id text, p_author_id text, p_author_name text, p_body text, p_commented_at timestamp with time zone)
returns bigint
language plpgsql
security definer
set search_path = ''
as $function$
declare
    v_id bigint;
begin
    if p_author_id = p_page_id then
        return null;
    end if;
    insert into public.page_comments
        (comment_id, post_id, parent_id, page_id, author_id, author_name, body, commented_at, organisation_id)
    values
        (p_comment_id, p_post_id, p_parent_id, p_page_id, p_author_id, p_author_name,
         left(p_body, 4000), coalesce(p_commented_at, now()), private.organisation_for_page(p_page_id))
    on conflict (comment_id) do nothing
    returning id into v_id;
    return v_id;
end;
$function$;
