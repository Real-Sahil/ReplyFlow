-- Run in the Supabase SQL editor (confirm the destructive-statement prompt).
-- Needed for review, approval and photo uploads on posts. Safe to run once.

begin;

-- Posts: review before publishing, media uploads, and approval trail.
-- Agents submit posts for review; only administrators approve them.

alter table public.page_posts drop constraint page_posts_status_check;
alter table public.page_posts add constraint page_posts_status_check
    check (status in ('draft', 'pending_review', 'approved', 'scheduled', 'published', 'failed'));

alter table public.page_posts
    add column submitted_at timestamptz,
    add column approved_by bigint references public.sales (id) on delete set null,
    add column approved_at timestamptz,
    add column media_path text,
    add column media_name text,
    add column media_type text;

-- Only an administrator can mark a post approved. Checked in the database, so
-- the rule holds however the change is made.
create or replace function public.page_posts_guard_status() returns trigger
    language plpgsql security definer
    set search_path = ''
    as $$
begin
    if new.status = 'approved' and old.status is distinct from 'approved' then
        if not private.is_admin() then
            raise exception 'Only an administrator can approve a post' using errcode = '42501';
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

create trigger "15_page_posts_guard_status" before update on public.page_posts
    for each row execute function public.page_posts_guard_status();

drop policy if exists "agents update drafts" on public.page_posts;
create policy "agents update drafts" on public.page_posts
    for update to authenticated
    using ((select public.staff_role()) in ('admin', 'agent')
           and status in ('draft', 'pending_review', 'approved', 'failed'))
    with check ((select public.staff_role()) in ('admin', 'agent')
           and status in ('draft', 'pending_review', 'approved', 'failed'));

-- Media: private bucket, staff only. Facebook receives a short-lived signed link.
insert into storage.buckets (id, name, public)
values ('post-media', 'post-media', false)
on conflict (id) do nothing;

create policy "post media staff read" on storage.objects
    for select to authenticated
    using (bucket_id = 'post-media' and (select public.staff_role()) is not null);
create policy "post media staff upload" on storage.objects
    for insert to authenticated
    with check (bucket_id = 'post-media' and (select public.staff_role()) in ('admin', 'agent'));
create policy "post media admin delete" on storage.objects
    for delete to authenticated
    using (bucket_id = 'post-media' and (select public.is_admin()));

commit;
