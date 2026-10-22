-- Website enquiries: a public form on the Mere & Row site creates the contact and
-- an opportunity in one step. A repeat enquiry from the same email within a day adds
-- a note to the open deal instead of opening a second one.

create or replace function public.record_web_enquiry(
    p_name text,
    p_email text,
    p_phone text,
    p_message text,
    p_product text,
    p_source_url text
) returns bigint
    language plpgsql security definer
    set search_path = ''
    as $$
declare
    v_email text := lower(trim(coalesce(p_email, '')));
    v_phone text := nullif(trim(coalesce(p_phone, '')), '');
    v_name text := trim(coalesce(p_name, ''));
    v_first text;
    v_last text;
    v_contact_id bigint;
    v_deal_id bigint;
    v_note text;
begin
    v_first := split_part(v_name, ' ', 1);
    v_last := nullif(trim(substr(v_name, length(v_first) + 1)), '');

    if v_email <> '' then
        select c.id into v_contact_id
        from public.contacts c
        where exists (
            select 1 from jsonb_array_elements(coalesce(c.email_jsonb, '[]'::jsonb)) e
            where lower(e->>'email') = v_email
        )
        limit 1;
    end if;

    if v_contact_id is null then
        insert into public.contacts (first_name, last_name, email_jsonb, phone_jsonb, first_seen, last_seen)
        values (
            v_first,
            v_last,
            case when v_email <> '' then jsonb_build_array(jsonb_build_object('email', v_email, 'type', 'Work')) else '[]'::jsonb end,
            case when v_phone is not null then jsonb_build_array(jsonb_build_object('number', v_phone, 'type', 'Mobile')) else '[]'::jsonb end,
            now(),
            now()
        )
        returning id into v_contact_id;
    end if;

    v_note := left(
        'Website enquiry' ||
        coalesce(' about ' || nullif(trim(p_product), ''), '') ||
        coalesce(' from ' || nullif(trim(p_source_url), ''), '') ||
        E'\n' || coalesce(p_message, ''),
        4000
    );

    -- A repeat enquiry from the same person within a day joins the open deal.
    select d.id into v_deal_id
    from public.deals d
    where d.contact_ids @> array[v_contact_id]
      and d.archived_at is null
      and d.created_at > now() - interval '1 day'
    order by d.created_at desc
    limit 1;

    if v_deal_id is null then
        insert into public.deals (name, contact_ids, stage, description)
        values (
            'Website enquiry: ' || coalesce(nullif(trim(p_product), ''), 'general'),
            array[v_contact_id],
            'opportunity',
            left(coalesce(p_message, ''), 2000)
        )
        returning id into v_deal_id;
    end if;

    insert into public.deal_notes (deal_id, text)
    values (v_deal_id, v_note);

    return v_deal_id;
end;
$$;

revoke execute on function public.record_web_enquiry(text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.record_web_enquiry(text, text, text, text, text, text) to service_role;
