-- Website enquiries and comment leads are recorded for an organisation.
-- Each organisation can publish its own enquiry key; the form sends it with each enquiry.
-- Requests without a key keep going to Mere & Row, as before.
alter table public.organisations add column if not exists enquiry_key text unique;

create or replace function public.record_organisation_enquiry(
  p_organisation_id bigint,
  p_name text,
  p_email text,
  p_phone text,
  p_message text,
  p_product text,
  p_source_url text
) returns bigint
language plpgsql
security definer
set search_path = ''
as $function$
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
        where c.organisation_id = p_organisation_id
          and exists (
            select 1 from jsonb_array_elements(coalesce(c.email_jsonb, '[]'::jsonb)) e
            where lower(e->>'email') = v_email
        )
        limit 1;
    end if;

    if v_contact_id is null then
        insert into public.contacts (first_name, last_name, email_jsonb, phone_jsonb, first_seen, last_seen, organisation_id)
        values (
            v_first,
            v_last,
            case when v_email <> '' then jsonb_build_array(jsonb_build_object('email', v_email, 'type', 'Work')) else '[]'::jsonb end,
            case when v_phone is not null then jsonb_build_array(jsonb_build_object('number', v_phone, 'type', 'Mobile')) else '[]'::jsonb end,
            now(),
            now(),
            p_organisation_id
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

    select d.id into v_deal_id
    from public.deals d
    where d.contact_ids @> array[v_contact_id]
      and d.organisation_id = p_organisation_id
      and d.archived_at is null
      and d.created_at > now() - interval '1 day'
    order by d.created_at desc
    limit 1;

    if v_deal_id is null then
        insert into public.deals (name, contact_ids, stage, description, organisation_id)
        values (
            'Website enquiry: ' || coalesce(nullif(trim(p_product), ''), 'general'),
            array[v_contact_id],
            'opportunity',
            left(coalesce(p_message, ''), 2000),
            p_organisation_id
        )
        returning id into v_deal_id;
    end if;

    update public.deals
    set campaign = nullif(substring(coalesce(p_source_url, '') from 'utm_campaign=([A-Za-z0-9_-]+)'), '')
    where id = v_deal_id and campaign is null;

    insert into public.deal_notes (deal_id, text, organisation_id)
    values (v_deal_id, v_note, p_organisation_id);

    return v_deal_id;
end;
$function$;

revoke all on function public.record_organisation_enquiry(bigint, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.record_organisation_enquiry(bigint, text, text, text, text, text, text) to service_role;

-- The original entry point stays for existing callers. It records to Mere & Row.
create or replace function public.record_web_enquiry(p_name text, p_email text, p_phone text, p_message text, p_product text, p_source_url text)
returns bigint
language sql
security definer
set search_path = ''
as $function$
  select public.record_organisation_enquiry(1, p_name, p_email, p_phone, p_message, p_product, p_source_url);
$function$;

-- A lead from a comment belongs to the organisation of the comment.
create or replace function public.record_comment_lead(p_comment_row_id bigint, p_psid text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $function$
declare
    v_comment public.page_comments;
    v_contact_id bigint;
    v_deal_id bigint;
    v_name text;
begin
    select * into v_comment from public.page_comments where id = p_comment_row_id;
    if not found then
        raise exception 'comment not found';
    end if;

    v_contact_id := v_comment.contact_id;
    if v_contact_id is null and p_psid is not null then
        select id into v_contact_id from public.contacts
         where messenger_psid = p_psid and organisation_id = v_comment.organisation_id;
    end if;

    if v_contact_id is null then
        v_name := coalesce(nullif(trim(v_comment.author_name), ''), 'Facebook commenter');
        insert into public.contacts (first_name, last_name, messenger_psid, first_seen, last_seen, organisation_id)
        values (
            split_part(v_name, ' ', 1),
            nullif(trim(substr(v_name, length(split_part(v_name, ' ', 1)) + 1)), ''),
            p_psid, now(), now(), v_comment.organisation_id)
        returning id into v_contact_id;
    elsif p_psid is not null then
        update public.contacts set messenger_psid = p_psid
        where id = v_contact_id and messenger_psid is null;
    end if;

    select d.id into v_deal_id
    from public.deals d
    where d.contact_ids @> array[v_contact_id]
      and d.organisation_id = v_comment.organisation_id
      and d.archived_at is null and d.stage not in ('won', 'lost')
    order by d.created_at desc limit 1;

    if v_deal_id is null then
        insert into public.deals (name, stage, contact_ids, description, created_at, updated_at, organisation_id)
        values ('Facebook comment: ' || coalesce(nullif(trim(v_comment.author_name), ''), 'enquiry'),
                'opportunity', array[v_contact_id],
                'Comment on a Page post: ' || left(coalesce(v_comment.body, ''), 500), now(), now(),
                v_comment.organisation_id)
        returning id into v_deal_id;
    end if;

    update public.page_comments set contact_id = v_contact_id where id = p_comment_row_id;
    return v_contact_id;
end;
$function$;
