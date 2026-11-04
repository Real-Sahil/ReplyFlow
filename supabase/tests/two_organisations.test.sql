-- Two-organisation isolation test, run in CI against a fresh local Supabase database.
--
--     psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/two_organisations.test.sql
--
-- Needs an EMPTY database with every migration applied. Everything runs in one transaction that
-- is rolled back, so nothing is kept. Any failed check raises an exception, so the exit code
-- is non-zero. It proves Organisation A cannot read, change, delete or forge Organisation B's
-- rows, and that the per-organisation Messenger settings and Meta breaker stay separate.

begin;

create function pg_temp.ok(c boolean, m text) returns void language plpgsql as $$
begin
  if not coalesce(c, false) then raise exception 'FAIL: %', m; end if;
end $$;

create function pg_temp.as_user(u uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', u::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

create function pg_temp.back() returns void language plpgsql as $$
begin
  execute 'reset role';
end $$;

create function pg_temp.fails(sql text, m text) returns void language plpgsql as $$
begin
  begin
    execute sql;
  exception when others then
    return;
  end;
  raise exception 'FAIL (expected an error): %', m;
end $$;

create function pg_temp.rows_affected(sql text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute sql;
  get diagnostics n = row_count;
  return n;
end $$;

-- Tables and views that carry an organisation_id and that the signed-in role can read, listing
-- any that show a row from an organisation other than the given one.
create function pg_temp.leaks(org bigint) returns text language plpgsql as $$
declare r record; n bigint; found text := '';
begin
  for r in
    select c.relname
      from pg_class c
      join pg_namespace ns on ns.oid = c.relnamespace
      join pg_attribute a on a.attrelid = c.oid and a.attname = 'organisation_id' and not a.attisdropped
     where ns.nspname = 'public' and c.relkind in ('r', 'p', 'v')
  loop
    if has_table_privilege('authenticated', format('public.%I', r.relname), 'select') then
      execute format('select count(*) from public.%I where organisation_id is distinct from %s', r.relname, org) into n;
      if n > 0 then found := found || r.relname || '(' || n || ') '; end if;
    end if;
  end loop;
  return found;
end $$;

select pg_temp.ok((select count(*) from public.sales) = 0, 'run this on an empty database');

-- Set up: the first account (administrator of organisation 1), two more organisations, and one
-- administrator in each, created the way real sign-ups are (through a sign-up grant).
insert into auth.users (id, email, raw_user_meta_data)
values ('00000000-0000-0000-0000-0000000000f1', 'root@example.test', '{"first_name":"Root","last_name":"Admin"}');
insert into public.organisations (id, name) values (101, 'Organisation A'), (102, 'Organisation B');
insert into public.signup_grants (email, organisation_id)
values ('a@example.test', 101), ('b@example.test', 102);
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1', 'a@example.test', '{"first_name":"Ann","last_name":"A"}'),
  ('00000000-0000-0000-0000-0000000000b1', 'b@example.test', '{"first_name":"Bob","last_name":"B"}');
update public.sales set administrator = true, role = 'admin' where email in ('a@example.test', 'b@example.test');

select pg_temp.ok((select organisation_id from public.sales where email = 'a@example.test') = 101, 'A belongs to organisation 101');
select pg_temp.ok((select organisation_id from public.sales where email = 'b@example.test') = 102, 'B belongs to organisation 102');

-- Messenger settings and the Meta breaker: one row per organisation, created with it.
select pg_temp.ok((select count(*) from public.messenger_settings where id = organisation_id and organisation_id in (101, 102)) = 2,
  'each organisation has its own Messenger settings row');
select pg_temp.ok((select count(*) from public.meta_circuit where id = organisation_id and organisation_id in (101, 102)) = 2,
  'each organisation has its own Meta breaker row');
select pg_temp.fails($$insert into public.messenger_settings (id, organisation_id) values (999, 101)$$,
  'a settings row whose id is not its organisation id is rejected');

-- A creates data in its own organisation.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
insert into public.tags (name, color, organisation_id) values ('A-ONLY-TAG', '#000000', 101);
insert into public.companies (name, organisation_id) values ('A-ONLY-COMPANY', 101);
insert into public.contacts (first_name, last_name, organisation_id) values ('A', 'ONLY', 101);
select pg_temp.fails($$insert into public.tags (name, color, organisation_id) values ('FORGED', '#000000', 102)$$,
  'A cannot create a tag inside organisation 102');
select pg_temp.fails($$insert into public.contacts (first_name, last_name, organisation_id) values ('F', 'ORGED', 102)$$,
  'A cannot create a contact inside organisation 102');
select pg_temp.ok((select count(*) from public.tags where name = 'A-ONLY-TAG') = 1, 'A sees its own tag');
select pg_temp.ok(pg_temp.leaks(101) = '', 'A sees nothing outside organisation 101: ' || pg_temp.leaks(101));
select pg_temp.ok((select count(*) from public.messenger_settings) = 1 and (select id from public.messenger_settings) = 101,
  'A sees only its own Messenger settings');
select pg_temp.ok((select count(*) from public.meta_circuit) = 1 and (select id from public.meta_circuit) = 101,
  'A sees only its own Meta breaker');
select pg_temp.ok(pg_temp.rows_affected($$update public.messenger_settings set greeting_text = 'A greeting' where id = 101$$) = 1,
  'A can change its own Messenger settings');
select pg_temp.ok(pg_temp.rows_affected($$update public.messenger_settings set greeting_text = 'HACK' where id = 102$$) = 0,
  'A cannot change organisation 102 Messenger settings');
select pg_temp.back();

-- B tries to reach A's data.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
select pg_temp.ok(pg_temp.leaks(102) = '', 'B sees nothing outside organisation 102: ' || pg_temp.leaks(102));
select pg_temp.ok((select count(*) from public.tags where name = 'A-ONLY-TAG') = 0, 'B cannot read A''s tag');
select pg_temp.ok((select count(*) from public.companies where name = 'A-ONLY-COMPANY') = 0, 'B cannot read A''s company');
select pg_temp.ok((select count(*) from public.contacts where last_name = 'ONLY') = 0, 'B cannot read A''s contact');
select pg_temp.ok(pg_temp.rows_affected($$update public.contacts set first_name = 'HACK' where last_name = 'ONLY'$$) = 0,
  'B cannot change A''s contact');
select pg_temp.ok(pg_temp.rows_affected($$delete from public.companies where name = 'A-ONLY-COMPANY'$$) = 0,
  'B cannot delete A''s company');
select pg_temp.ok(pg_temp.rows_affected($$delete from public.tags where name = 'A-ONLY-TAG'$$) = 0,
  'B cannot delete A''s tag');
select pg_temp.ok((select count(*) from public.messenger_settings) = 1 and (select id from public.messenger_settings) = 102,
  'B sees only its own Messenger settings');
select pg_temp.ok((select greeting_text from public.messenger_settings where id = 102) <> 'A greeting',
  'A''s greeting did not reach B');
select pg_temp.ok(pg_temp.rows_affected($$update public.meta_circuit set blocked = true where id = 101$$) = 0,
  'B cannot touch A''s Meta breaker');
select pg_temp.back();

-- Nothing of A's was changed or removed by B, checked without row-level security.
select pg_temp.ok((select count(*) from public.contacts where first_name = 'A' and last_name = 'ONLY') = 1, 'A''s contact is intact');
select pg_temp.ok((select count(*) from public.companies where name = 'A-ONLY-COMPANY') = 1, 'A''s company is intact');
select pg_temp.ok((select greeting_text from public.messenger_settings where id = 101) = 'A greeting', 'A''s settings are intact');

select 'two-organisation isolation: all checks passed' as result;
rollback;
