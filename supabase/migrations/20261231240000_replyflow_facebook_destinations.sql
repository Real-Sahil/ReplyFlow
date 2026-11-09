-- Stage two of docs/SOCIAL_WORKFLOW.md: Facebook Pages become ordinary destinations, so one post can go to several
-- Facebook Pages, or to LinkedIn only, and the post's own status follows its destinations.

-- 1. A destination may now be a Facebook Page of the business.
create or replace function private.post_destinations_before_write() returns trigger
    language plpgsql security definer
    set search_path = ''
    as $$
declare
    v_org bigint;
    v_status text;
    v_parts text[];
begin
    select organisation_id, status into v_org, v_status from public.page_posts where id = new.post_id;
    if v_org is null then
        raise exception 'That post was not found' using errcode = '42501';
    end if;
    new.organisation_id := v_org;

    if private.staff_id() is not null then
        if v_org <> private.current_organisation() then
            raise exception 'That post belongs to another business' using errcode = '42501';
        end if;
        if tg_op = 'UPDATE' and new.channel_key is distinct from old.channel_key then
            raise exception 'A destination cannot change channel' using errcode = '42501';
        end if;
        v_parts := string_to_array(new.channel_key, ':');
        if v_parts[1] = 'linkedin' and v_parts[2] = 'page' then
            if not exists (
                select 1 from public.linkedin_pages
                 where organisation_id = v_org and org_id = v_parts[3]
            ) then
                raise exception 'That LinkedIn Page is not connected' using errcode = '42501';
            end if;
            new.owner_sale_id := null;
        elsif v_parts[1] = 'linkedin' and v_parts[2] = 'profile' then
            if v_parts[3] is distinct from private.staff_id()::text then
                raise exception 'You can post only to your own LinkedIn profile' using errcode = '42501';
            end if;
            new.owner_sale_id := private.staff_id();
        elsif v_parts[1] = 'facebook' and v_parts[2] = 'page' then
            if not exists (
                select 1 from public.meta_pages
                 where organisation_id = v_org and page_id = v_parts[3]
            ) then
                raise exception 'That Facebook Page is not connected' using errcode = '42501';
            end if;
            new.owner_sale_id := null;
            -- Facebook holds its own schedule: the server marks a Facebook destination scheduled once
            -- Facebook has accepted it, never the browser.
            if new.state = 'scheduled' then
                new.state := 'planned';
                new.scheduled_for := null;
            end if;
        else
            raise exception 'That channel is not available' using errcode = '22023';
        end if;
        if new.text_override is not null
           and (tg_op = 'INSERT' or new.text_override is distinct from old.text_override)
           and v_status in ('approved', 'scheduled', 'published')
           and not private.is_admin() then
            raise exception 'Only an administrator can change the words of an approved post' using errcode = '42501';
        end if;
        if tg_op = 'INSERT' then
            new.created_by := private.staff_id();
        end if;
        if tg_op = 'UPDATE' and old.state = 'failed' and new.state in ('planned', 'scheduled') then
            new.error := null;
        end if;
        if new.state = 'planned' then
            new.scheduled_for := null;
        end if;
    end if;
    return new;
end;
$$;
revoke execute on function private.post_destinations_before_write() from public, anon, authenticated;

-- 2. The post's status follows its destinations once it has been approved, and only forwards: a post that is
-- approved (or failed) becomes scheduled when something waits for its time, and published when something is out
-- and nothing chosen is left unsent; a scheduled post becomes published when what was waiting has gone out. A
-- published post stays published, and the human steps (draft, in review, approved) are never touched. If every
-- destination is taken down, a scheduled or published post goes back to a draft, as taking a post off Facebook
-- always did.
create or replace function private.refresh_post_status(p_post bigint) returns void
    language plpgsql security definer
    set search_path = ''
    as $$
declare
    v_status text;
    v_planned int;
    v_published int;
    v_scheduled int;
    v_failed int;
    v_removed int;
    v_next timestamptz;
    v_error text;
begin
    select status into v_status from public.page_posts where id = p_post;
    if v_status is null or v_status not in ('approved', 'failed', 'scheduled', 'published') then
        return;
    end if;
    select count(*) filter (where state = 'planned'),
           count(*) filter (where state = 'published'),
           count(*) filter (where state = 'scheduled'),
           count(*) filter (where state = 'failed'),
           count(*) filter (where state = 'removed'),
           min(scheduled_for) filter (where state = 'scheduled'),
           max(error) filter (where state = 'failed')
      into v_planned, v_published, v_scheduled, v_failed, v_removed, v_next, v_error
      from public.post_destinations where post_id = p_post;

    if v_planned + v_published + v_scheduled + v_failed = 0 then
        if v_removed > 0 and v_status in ('scheduled', 'published') then
            update public.page_posts set status = 'draft', published_at = null where id = p_post;
        end if;
        return;
    end if;

    if v_status in ('approved', 'failed') then
        if v_scheduled > 0 then
            update public.page_posts
               set status = 'scheduled', scheduled_for = v_next, error = null
             where id = p_post;
        elsif v_published > 0 and v_planned = 0 then
            update public.page_posts
               set status = 'published', published_at = coalesce(published_at, now()), error = null
             where id = p_post;
        elsif v_failed > 0 and v_published = 0 and v_planned = 0 then
            update public.page_posts
               set status = 'failed', error = left(v_error, 500)
             where id = p_post and status <> 'failed';
        end if;
    elsif v_status = 'scheduled' then
        if v_scheduled > 0 then
            update public.page_posts
               set scheduled_for = v_next
             where id = p_post and scheduled_for is distinct from v_next;
        elsif v_published > 0 and v_planned = 0 then
            update public.page_posts
               set status = 'published', published_at = coalesce(published_at, now())
             where id = p_post;
        end if;
    end if;
end;
$$;
revoke execute on function private.refresh_post_status(bigint) from public, anon, authenticated;

create or replace function private.post_destinations_after_change() returns trigger
    language plpgsql security definer
    set search_path = ''
    as $$
begin
    perform private.refresh_post_status(coalesce(new.post_id, old.post_id));
    return null;
end;
$$;
revoke execute on function private.post_destinations_after_change() from public, anon, authenticated;
create trigger "30_post_destinations_refresh_status"
    after insert or update or delete on public.post_destinations
    for each row execute function private.post_destinations_after_change();

-- A post that is approved after its destinations were already set to wait for their time becomes scheduled.
create or replace function private.page_posts_after_approval() returns trigger
    language plpgsql security definer
    set search_path = ''
    as $$
begin
    if new.status = 'approved' and old.status is distinct from 'approved' then
        perform private.refresh_post_status(new.id);
    end if;
    return null;
end;
$$;
revoke execute on function private.page_posts_after_approval() from public, anon, authenticated;
create trigger "40_page_posts_refresh_after_approval"
    after update of status on public.page_posts
    for each row execute function private.page_posts_after_approval();

-- 3. Every post that is already on Facebook (or waiting there) gets its Facebook destination, so the lists and
-- the new editor show it. The Page is the one the post named, or the business's default Page.
insert into public.post_destinations
    (organisation_id, post_id, channel_key, state, external_id, scheduled_for, posted_at)
select p.organisation_id,
       p.id,
       'facebook:page:' || coalesce(
           p.page_id,
           (select m.page_id from public.meta_pages m
             where m.organisation_id = p.organisation_id and m.is_default
             limit 1)),
       case when p.status = 'scheduled' then 'scheduled' else 'published' end,
       p.fb_post_id,
       case when p.status = 'scheduled' then p.scheduled_for end,
       case when p.status = 'published' then p.published_at end
  from public.page_posts p
 where p.fb_post_id is not null
   and p.status in ('scheduled', 'published')
   and coalesce(
           p.page_id,
           (select m.page_id from public.meta_pages m
             where m.organisation_id = p.organisation_id and m.is_default
             limit 1)) is not null
on conflict (post_id, channel_key) do nothing;
