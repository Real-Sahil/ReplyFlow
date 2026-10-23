-- Any signed-in staff member can approve a post, not only administrators. The approver is
-- recorded on the post. Automatic approval by the autopilot stays an administrator setting.
create or replace function public.page_posts_guard_status() returns trigger
    language plpgsql security definer
    set search_path = ''
    as $$
begin
    if new.status = 'approved' and old.status is distinct from 'approved' then
        if private.staff_role() is null then
            raise exception 'Only signed-in staff can approve a post' using errcode = '42501';
        end if;
        new.approved_by := private.staff_id();
        new.approved_at := now();
    end if;
    if new.status = 'pending_review' and old.status is distinct from 'pending_review' then
        new.submitted_at := now();
    end if;
    return new;
end;
$$;
revoke execute on function public.page_posts_guard_status() from public, anon, authenticated;
