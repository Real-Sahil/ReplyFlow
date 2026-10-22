-- ReplyFlow security baseline (in-house, single organisation).
--
-- Fixes found in the Atomic CRM source review:
--   1. Open signup: any new auth user became CRM staff with full access.
--   2. Policies were "authenticated using (true)": no roles, anyone can delete.
--   3. anon held ALL privileges on every table and could execute helper
--      functions through the public API (including get_user_id_by_email).
--   4. Saving a contact or company called Gravatar / favicon.show from inside
--      the database, sending a hash of customer emails to a third party.
--
-- First-administrator bootstrap: the very first auth user becomes the
-- administrator. Create that user yourself immediately after deploying and keep
-- public signup disabled in the Supabase Auth settings.

begin;

-- 1. Staff roles ------------------------------------------------------------

alter table public.sales add column if not exists role text not null default 'agent';
alter table public.sales drop constraint if exists sales_role_check;
alter table public.sales
    add constraint sales_role_check check (role in ('admin', 'agent', 'viewer'));
update public.sales set role = 'admin' where administrator;

-- "administrator" stays the source of truth for admin so the existing UI and
-- edge functions keep working; role carries the non-admin distinction.
create or replace function public.sales_sync_role() returns trigger
    language plpgsql
    set search_path = ''
    as $$
begin
    if new.administrator then
        new.role := 'admin';
    elsif new.role = 'admin' then
        new.role := 'agent';
    end if;
    return new;
end;
$$;

drop trigger if exists "05_sales_sync_role" on public.sales;
create trigger "05_sales_sync_role"
    before insert or update on public.sales
    for each row execute function public.sales_sync_role();

-- 2. Helpers used by policies ---------------------------------------------

create or replace function public.staff_role() returns text
    language sql stable security definer
    set search_path = ''
    as $$
    select s.role from public.sales s
    where s.user_id = (select auth.uid()) and not s.disabled
    limit 1
$$;

create or replace function public.staff_id() returns bigint
    language sql stable security definer
    set search_path = ''
    as $$
    select s.id from public.sales s
    where s.user_id = (select auth.uid()) and not s.disabled
    limit 1
$$;

create or replace function public.is_admin() returns boolean
    language sql stable security definer
    set search_path = ''
    as $$
    select coalesce((select public.staff_role()) = 'admin', false)
$$;

-- 3. Row level security: role based -----------------------------------------

do $$
declare p record;
begin
    for p in select schemaname, tablename, policyname from pg_policies where schemaname = 'public' loop
        execute format('drop policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
    end loop;
end;
$$;

-- Shared records: everyone on staff reads, admins and agents write, only admins delete.
do $$
declare t text;
begin
    foreach t in array array['companies', 'contacts', 'deals', 'tags'] loop
        execute format('create policy "staff read" on public.%I for select to authenticated using ((select public.staff_role()) is not null)', t);
        execute format('create policy "agents insert" on public.%I for insert to authenticated with check ((select public.staff_role()) in (''admin'', ''agent''))', t);
        execute format('create policy "agents update" on public.%I for update to authenticated using ((select public.staff_role()) in (''admin'', ''agent'')) with check ((select public.staff_role()) in (''admin'', ''agent''))', t);
        execute format('create policy "admins delete" on public.%I for delete to authenticated using ((select public.is_admin()))', t);
    end loop;
end;
$$;

-- Notes keep an audit trail: authors only create as themselves, and only the
-- author or an admin can change or remove them.
do $$
declare t text;
begin
    foreach t in array array['contact_notes', 'deal_notes'] loop
        execute format('create policy "staff read" on public.%I for select to authenticated using ((select public.staff_role()) is not null)', t);
        execute format('create policy "agents insert own" on public.%I for insert to authenticated with check ((select public.staff_role()) in (''admin'', ''agent'') and sales_id = (select public.staff_id()))', t);
        execute format('create policy "author or admin update" on public.%I for update to authenticated using ((select public.is_admin()) or ((select public.staff_role()) = ''agent'' and sales_id = (select public.staff_id()))) with check ((select public.is_admin()) or ((select public.staff_role()) = ''agent'' and sales_id = (select public.staff_id())))', t);
        execute format('create policy "author or admin delete" on public.%I for delete to authenticated using ((select public.is_admin()) or ((select public.staff_role()) = ''agent'' and sales_id = (select public.staff_id())))', t);
    end loop;
end;
$$;

-- Tasks: any agent can complete or reassign a colleague's follow-up, but only
-- the owner or an admin can delete it.
create policy "staff read" on public.tasks
    for select to authenticated using ((select public.staff_role()) is not null);
create policy "agents insert" on public.tasks
    for insert to authenticated with check ((select public.staff_role()) in ('admin', 'agent'));
create policy "agents update" on public.tasks
    for update to authenticated
    using ((select public.staff_role()) in ('admin', 'agent'))
    with check ((select public.staff_role()) in ('admin', 'agent'));
create policy "owner or admin delete" on public.tasks
    for delete to authenticated
    using ((select public.is_admin()) or ((select public.staff_role()) = 'agent' and sales_id = (select public.staff_id())));

-- Staff directory: read only. Changes go through the users edge function.
create policy "staff read" on public.sales
    for select to authenticated using ((select public.staff_role()) is not null);

-- Configuration: everyone on staff reads, only admins change it.
create policy "staff read" on public.configuration
    for select to authenticated using ((select public.staff_role()) is not null);
create policy "admins insert" on public.configuration
    for insert to authenticated with check ((select public.is_admin()));
create policy "admins update" on public.configuration
    for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

-- 4. Close signup at the database as well as in Auth settings -------------

create or replace function public.handle_new_user() returns trigger
    language plpgsql security definer
    set search_path = ''
    as $$
declare
    staff_count int;
    invited boolean;
begin
    select count(id) into staff_count from public.sales;
    -- Only the users edge function sets this flag, and it does so with the
    -- service role. A self-service signup cannot set app_metadata.
    invited := coalesce(new.raw_app_meta_data ->> 'replyflow_invited', '') = 'true';

    if staff_count > 0 and not invited then
        raise exception 'Sign-up is closed. Ask an administrator for an invitation.'
            using errcode = '42501';
    end if;

    insert into public.sales (first_name, last_name, email, user_id, administrator)
    values (
        coalesce(new.raw_user_meta_data ->> 'first_name', new.raw_user_meta_data -> 'custom_claims' ->> 'first_name', 'Pending'),
        coalesce(new.raw_user_meta_data ->> 'last_name', new.raw_user_meta_data -> 'custom_claims' ->> 'last_name', 'Pending'),
        new.email,
        new.id,
        staff_count = 0
    );
    return new;
end;
$$;

-- 5. Remove third-party calls made from the database -------------------------

drop trigger if exists company_saved on public.companies;
drop trigger if exists "20_contact_saved" on public.contacts;
drop function if exists public.handle_company_saved();
drop function if exists public.handle_contact_saved();
drop function if exists public.get_avatar_for_email(text);
drop function if exists public.get_domain_favicon(text);
drop table if exists public.favicons_excluded_domains;
drop extension if exists http;

-- 6. Least privilege for API roles ------------------------------------------

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke truncate, references, trigger on all tables in schema public from authenticated;

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
    public.staff_role(),
    public.staff_id(),
    public.is_admin(),
    public.merge_contacts(bigint, bigint),
    public.global_search(text, text[], integer),
    public.search_attachment_titles(jsonb[]),
    public.search_document(variadic text[]),
    public.search_query(text),
    public.search_unaccent(text)
    to authenticated;

-- The login screen asks whether the CRM has been initialised.
grant select on public.init_state to anon;

alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from public, anon;

-- 7. Attachments: staff only -------------------------------------------------

-- Upstream created this bucket public, which serves files to anyone with the
-- link and bypasses the policies below. The app now opens files through
-- short-lived signed links (see NoteAttachments).
update storage.buckets set public = false where id = 'attachments';

drop policy if exists "Attachments 1mt4rzk_0" on storage.objects;
drop policy if exists "Attachments 1mt4rzk_1" on storage.objects;
drop policy if exists "Attachments 1mt4rzk_3" on storage.objects;

create policy "attachments staff read" on storage.objects
    for select to authenticated
    using (bucket_id = 'attachments' and (select public.staff_role()) is not null);
create policy "attachments agents upload" on storage.objects
    for insert to authenticated
    with check (bucket_id = 'attachments' and (select public.staff_role()) in ('admin', 'agent'));
create policy "attachments uploader or admin delete" on storage.objects
    for delete to authenticated
    using (bucket_id = 'attachments' and ((select public.is_admin()) or ((select public.staff_role()) = 'agent' and owner = (select auth.uid()))));

commit;
