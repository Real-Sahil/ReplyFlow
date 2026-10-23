-- Cross-tenant check. Run in the SQL editor or with the Supabase MCP; it changes nothing,
-- because it ends by raising an exception that rolls everything back.
-- Creates a second organisation with one tag, then checks that a signed-in staff member of
-- organisation 1 cannot see it, and that they still see every organisation 1 row.
do $$
declare
  v_user uuid;
  v_t record;
  v_seen bigint;
  v_owner bigint;
  v_leaks text := '';
  v_checked int := 0;
  v_tag_seen bigint;
begin
  insert into public.organisations (id, name) values (2, 'Cross-tenant test') on conflict (id) do nothing;
  insert into public.tags (name, color, organisation_id) values ('CROSS_TENANT_TEST_TAG', '#000000', 2);

  select user_id into v_user from public.sales
   where administrator and user_id is not null and not disabled and organisation_id = 1
   order by id limit 1;

  perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_tag_seen from public.tags where name = 'CROSS_TENANT_TEST_TAG';
  execute 'reset role';
  if v_tag_seen <> 0 then
    v_leaks := v_leaks || ' tags(org2 row visible)';
  end if;

  for v_t in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' and c.relname <> 'organisations'
  loop
    if not has_table_privilege('authenticated', format('public.%I', v_t.relname), 'select') then
      continue;
    end if;
    perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    execute format('select count(*) from public.%I', v_t.relname) into v_seen;
    execute 'reset role';
    execute format('select count(*) from public.%I where organisation_id = 1', v_t.relname) into v_owner;
    v_checked := v_checked + 1;
    if v_seen <> v_owner then
      v_leaks := v_leaks || format(' %s(seen=%s,org1=%s)', v_t.relname, v_seen, v_owner);
    end if;
  end loop;

  raise exception 'RESULT tables_checked=% problems=[%]', v_checked, v_leaks;
end $$;
