-- Remember which LinkedIn permissions each person's token carries, so the ads report can tell when an
-- administrator still has to connect again with the ads permission.

alter table public.linkedin_members
    add column if not exists scopes text not null default 'openid profile w_member_social';

grant select (scopes) on public.linkedin_members to authenticated;

drop function if exists public.linkedin_member_store(bigint, bigint, text, text, text, timestamptz);

create or replace function public.linkedin_member_store(
    p_sale_id bigint,
    p_organisation_id bigint,
    p_member_id text,
    p_name text,
    p_token text,
    p_expires_at timestamptz,
    p_scopes text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_existing uuid;
    v_secret uuid;
begin
    select vault_secret_id into v_existing
      from public.linkedin_members
     where organisation_id = p_organisation_id and sale_id = p_sale_id;
    if v_existing is null then
        v_secret := vault.create_secret(
            p_token, 'linkedin_' || p_organisation_id || '_' || p_sale_id, 'LinkedIn access token');
    else
        perform vault.update_secret(
            v_existing, p_token, 'linkedin_' || p_organisation_id || '_' || p_sale_id, 'LinkedIn access token');
        v_secret := v_existing;
    end if;

    insert into public.linkedin_members
        (organisation_id, sale_id, member_id, name, vault_secret_id, expires_at, scopes, connected_at)
    values
        (p_organisation_id, p_sale_id, p_member_id, p_name, v_secret, p_expires_at, p_scopes, now())
    on conflict (organisation_id, sale_id) do update
        set member_id = excluded.member_id,
            name = excluded.name,
            vault_secret_id = excluded.vault_secret_id,
            expires_at = excluded.expires_at,
            scopes = excluded.scopes,
            connected_at = now();
end;
$$;

revoke all on function public.linkedin_member_store(bigint, bigint, text, text, text, timestamptz, text) from public, anon, authenticated;
grant execute on function public.linkedin_member_store(bigint, bigint, text, text, text, timestamptz, text) to service_role;
