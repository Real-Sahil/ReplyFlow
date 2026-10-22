-- Replace the placeholder name of a Messenger contact as soon as the Page can
-- look up the real one (the token may be added after the first enquiry).
-- Names that staff have edited are never overwritten.

create or replace function public.record_messenger_message(
    p_page_id text,
    p_psid text,
    p_mid text,
    p_body text,
    p_sent_at timestamptz,
    p_first_name text,
    p_last_name text,
    p_referral jsonb
) returns bigint
    language plpgsql security definer
    set search_path = ''
    as $$
declare
    v_message_id bigint;
    v_contact_id bigint;
    v_deal_id bigint;
    v_first text;
    v_last text;
    v_real_first text := nullif(trim(p_first_name), '');
    v_real_last text := nullif(trim(p_last_name), '');
begin
    insert into public.messenger_messages (mid, page_id, psid, body, referral, sent_at)
    values (p_mid, p_page_id, p_psid, p_body, p_referral, coalesce(p_sent_at, now()))
    on conflict (mid) do nothing
    returning id into v_message_id;

    if v_message_id is null then
        return null;
    end if;

    select id into v_contact_id from public.contacts where messenger_psid = p_psid;

    if v_contact_id is null then
        v_first := coalesce(v_real_first, 'Messenger');
        v_last := coalesce(v_real_last, 'enquiry ' || right(p_psid, 4));
        insert into public.contacts (first_name, last_name, messenger_psid, first_seen, last_seen)
        values (v_first, v_last, p_psid, now(), now())
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
          and name like 'Messenger enquiry: Messenger enquiry %';
    end if;

    update public.contacts set last_seen = now() where id = v_contact_id;

    select d.id into v_deal_id
    from public.deals d
    where d.contact_ids @> array[v_contact_id]
      and d.archived_at is null
      and d.stage not in ('won', 'lost')
    order by d.created_at desc
    limit 1;

    if v_deal_id is null then
        select 'Messenger enquiry: ' || c.first_name || ' ' || coalesce(c.last_name, '')
        into v_first from public.contacts c where c.id = v_contact_id;
        insert into public.deals (name, stage, contact_ids, description, created_at, updated_at)
        values (trim(v_first), 'opportunity', array[v_contact_id],
                'Started from a Messenger message to the Page.', now(), now())
        returning id into v_deal_id;
    end if;

    update public.messenger_messages
    set contact_id = v_contact_id, deal_id = v_deal_id
    where id = v_message_id;

    return v_message_id;
end;
$$;
