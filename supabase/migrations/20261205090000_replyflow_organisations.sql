-- Organisations: one per business using ReplyFlow. Mere & Row is organisation 1, and every
-- existing row belongs to it. The default of 1 is temporary, so the app keeps working while
-- the functions are changed to set organisation_id themselves; it is removed in a later step.

create table public.organisations (
  id bigint primary key,
  name text not null,
  created_at timestamptz not null default now()
);
insert into public.organisations (id, name) values (1, 'Mere & Row')
  on conflict (id) do nothing;
alter table public.organisations enable row level security;
grant select on public.organisations to authenticated;
grant all on public.organisations to service_role;

alter table public.sales
  add column organisation_id bigint not null default 1 references public.organisations (id);
alter table public.meta_pages
  add column organisation_id bigint not null default 1 references public.organisations (id);
create index meta_pages_organisation_idx on public.meta_pages (organisation_id);

-- The organisation of the signed-in person, through their sales row. Null when they are not staff.
create or replace function private.current_organisation() returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select s.organisation_id
    from public.sales s
   where s.user_id = (select auth.uid()) and not s.disabled
   limit 1;
$$;
revoke all on function private.current_organisation() from public, anon;
grant execute on function private.current_organisation() to authenticated, service_role;

create policy "members read their organisation" on public.organisations
  for select to authenticated
  using (id = (select private.current_organisation()));

create policy "members read their organisation pages" on public.meta_pages
  for select to authenticated
  using (organisation_id = (select private.current_organisation()));

-- The default Page is chosen per organisation, not once for everyone.
drop index public.meta_pages_one_default;
create unique index meta_pages_one_default_per_org
  on public.meta_pages (organisation_id) where is_default;

create or replace view public.meta_pages_list with (security_invoker = true) as
  select page_id, name, is_default, added_at, organisation_id from public.meta_pages;

-- Saves or replaces one Page's token for an organisation. A Page can belong to only one
-- organisation; connecting it elsewhere is refused.
drop function public.meta_page_store(text, text, text);

create or replace function public.meta_page_store(
  p_page_id text,
  p_name text,
  p_token text,
  p_organisation_id bigint
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret uuid;
  v_existing uuid;
  v_owner bigint;
begin
  select vault_secret_id, organisation_id into v_existing, v_owner
    from public.meta_pages where page_id = p_page_id;
  if found and v_owner <> p_organisation_id then
    raise exception 'That Page is already connected to another organisation'
      using errcode = '42501';
  end if;
  if v_existing is null then
    v_secret := vault.create_secret(
      p_token, 'meta_page_' || p_page_id, 'Facebook Page access token');
  else
    perform vault.update_secret(
      v_existing, p_token, 'meta_page_' || p_page_id, 'Facebook Page access token');
    v_secret := v_existing;
  end if;

  insert into public.meta_pages (page_id, name, vault_secret_id, organisation_id, is_default)
  values (
    p_page_id,
    p_name,
    v_secret,
    p_organisation_id,
    not exists (
      select 1 from public.meta_pages
       where is_default and organisation_id = p_organisation_id)
  )
  on conflict (page_id) do update
    set name = excluded.name,
        vault_secret_id = excluded.vault_secret_id,
        access_token = null;
end;
$$;

revoke all on function public.meta_page_store(text, text, text, bigint) from public, anon, authenticated;
grant execute on function public.meta_page_store(text, text, text, bigint) to service_role;
