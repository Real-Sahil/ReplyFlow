-- Staff switch a published post to evergreen (or back). The post update rules only allow
-- edits to drafts, so this is a narrow function that changes just the flag.
create or replace function public.set_post_evergreen(p_id bigint, p_value boolean) returns void
    language plpgsql security definer
    set search_path = ''
    as $$
begin
    if (select public.staff_role()) is null then
        raise exception 'Only staff can change this.' using errcode = 'insufficient_privilege';
    end if;
    update public.page_posts
    set evergreen = p_value
    where id = p_id and status = 'published';
    if not found then
        raise exception 'Only a published post can be evergreen.' using errcode = 'check_violation';
    end if;
end;
$$;

revoke execute on function public.set_post_evergreen(bigint, boolean) from public, anon;
grant execute on function public.set_post_evergreen(bigint, boolean) to authenticated;
