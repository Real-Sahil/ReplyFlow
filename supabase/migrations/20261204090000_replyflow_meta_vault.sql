-- Page access tokens move into Supabase Vault, which encrypts them at rest. meta_pages keeps
-- only a pointer to the secret. The token is read by server-only functions, never by the browser.
-- access_token is left in place (DROP hangs on this project) but is cleared once a Page is moved.

alter table public.meta_pages add column if not exists vault_secret_id uuid;
-- Pages stored in Vault no longer need the plain-text token, so the column may be empty.
alter table public.meta_pages alter column access_token drop not null;

-- Saves or replaces one Page's token. The first Page added becomes the default.
create or replace function public.meta_page_store(
  p_page_id text,
  p_name text,
  p_token text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret uuid;
  v_existing uuid;
begin
  select vault_secret_id into v_existing
    from public.meta_pages where page_id = p_page_id;
  if v_existing is null then
    v_secret := vault.create_secret(
      p_token, 'meta_page_' || p_page_id, 'Facebook Page access token');
  else
    perform vault.update_secret(
      v_existing, p_token, 'meta_page_' || p_page_id, 'Facebook Page access token');
    v_secret := v_existing;
  end if;

  insert into public.meta_pages (page_id, name, vault_secret_id, is_default)
  values (
    p_page_id,
    p_name,
    v_secret,
    not exists (select 1 from public.meta_pages where is_default)
  )
  on conflict (page_id) do update
    set name = excluded.name,
        vault_secret_id = excluded.vault_secret_id,
        access_token = null;
end;
$$;

-- The decrypted token for one Page, or null when the Page is not on the list.
create or replace function public.meta_page_token(p_page_id text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select s.decrypted_secret
    from public.meta_pages p
    join vault.decrypted_secrets s on s.id = p.vault_secret_id
   where p.page_id = p_page_id;
$$;

-- Removes a Page from the list. Returns false when the Page was not on the list.
-- The Vault secret is left in place; it is harmless and is removed by a later cleanup.
create or replace function public.meta_page_forget(p_page_id text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.meta_pages where page_id = p_page_id;
  return found;
end;
$$;

-- Only the service role (the Edge Functions) may read or change tokens.
revoke all on function public.meta_page_store(text, text, text) from public, anon, authenticated;
revoke all on function public.meta_page_token(text) from public, anon, authenticated;
revoke all on function public.meta_page_forget(text) from public, anon, authenticated;
grant execute on function public.meta_page_store(text, text, text) to service_role;
grant execute on function public.meta_page_token(text) to service_role;
grant execute on function public.meta_page_forget(text) to service_role;

-- Move any tokens already stored in plain text into Vault.
do $$
declare
  r record;
begin
  for r in
    select page_id, name, access_token
      from public.meta_pages
     where access_token is not null and vault_secret_id is null
  loop
    perform public.meta_page_store(r.page_id, r.name, r.access_token);
  end loop;
end;
$$;
