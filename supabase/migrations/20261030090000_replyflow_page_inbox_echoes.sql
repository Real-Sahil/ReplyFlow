-- Replies typed in the Facebook Page inbox come back as "echo" events. Recording
-- them keeps the conversation complete and tells the auto-replies to stand down.

alter table public.messenger_messages
    add column source text check (source in ('page_inbox'));

create or replace function public.record_messenger_echo(
    p_page_id text,
    p_psid text,
    p_mid text,
    p_body text,
    p_sent_at timestamptz
) returns bigint
    language plpgsql security definer
    set search_path = ''
    as $$
declare
    v_contact_id bigint;
    v_deal_id bigint;
    v_id bigint;
begin
    -- Only conversations that started with a customer message are tracked.
    select id into v_contact_id from public.contacts where messenger_psid = p_psid;
    if v_contact_id is null then
        return null;
    end if;

    select m.deal_id into v_deal_id
    from public.messenger_messages m
    where m.contact_id = v_contact_id and m.deal_id is not null
    order by m.sent_at desc
    limit 1;

    insert into public.messenger_messages
        (mid, page_id, psid, contact_id, deal_id, body, direction, source, sent_at)
    values
        (p_mid, p_page_id, p_psid, v_contact_id, v_deal_id, p_body, 'outbound', 'page_inbox',
         coalesce(p_sent_at, now()))
    on conflict (mid) do nothing
    returning id into v_id;

    -- A reply from the Page inbox counts as activity on the enquiry.
    if v_id is not null and v_deal_id is not null then
        insert into public.deal_notes (deal_id, text)
        values (v_deal_id, 'Replied on Facebook: ' || left(p_body, 900));
    end if;
    return v_id;
end;
$$;

revoke execute on function public.record_messenger_echo(text, text, text, text, timestamptz)
    from public, anon, authenticated;
grant execute on function public.record_messenger_echo(text, text, text, text, timestamptz)
    to service_role;
