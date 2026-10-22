-- Security baseline tests. Plain SQL, no extensions needed.
--
-- Run against an EMPTY development database that has the Atomic CRM schema and
-- migration 20261022130000_replyflow_security_baseline.sql applied:
--
--     psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/security_baseline.test.sql
--
-- Everything runs inside one transaction that is rolled back, so it leaves no
-- data behind. Any failed check raises an exception and the run stops.

begin;

create function pg_temp.ok(c boolean, m text) returns void language plpgsql as $$
begin
    if not coalesce(c, false) then raise exception 'FAIL: %', m; end if;
end $$;

create function pg_temp.as_user(u uuid) returns void language plpgsql as $$
begin
    perform set_config('request.jwt.claim.sub', u::text, true);
    execute 'set local role authenticated';
end $$;

create function pg_temp.as_anon() returns void language plpgsql as $$
begin
    perform set_config('request.jwt.claim.sub', '', true);
    execute 'set local role anon';
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

-- Precondition ---------------------------------------------------------------
select pg_temp.ok((select count(*) from public.sales) = 0,
    'run this test on an empty database (no staff rows yet)');

-- Bootstrap and invitation gate ---------------------------------------------
insert into auth.users (id, email, raw_user_meta_data)
values ('00000000-0000-0000-0000-0000000000a1', 'admin@example.test', '{"first_name":"Ada","last_name":"Admin"}');
select pg_temp.ok((select administrator and role = 'admin' from public.sales where email = 'admin@example.test'),
    'first user becomes administrator');

select pg_temp.fails($$insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000b9', 'stranger@example.test')$$,
    'a self-service signup must be rejected once an administrator exists');
select pg_temp.ok((select count(*) from public.sales) = 1, 'rejected signup leaves no staff row');

insert into auth.users (id, email, raw_app_meta_data) values
    ('00000000-0000-0000-0000-0000000000a2', 'agent@example.test', '{"replyflow_invited":"true"}'),
    ('00000000-0000-0000-0000-0000000000a3', 'viewer@example.test', '{"replyflow_invited":"true"}'),
    ('00000000-0000-0000-0000-0000000000a4', 'agent2@example.test', '{"replyflow_invited":"true"}'),
    ('00000000-0000-0000-0000-0000000000a5', 'gone@example.test', '{"replyflow_invited":"true"}');
select pg_temp.ok((select not administrator and role = 'agent' from public.sales where email = 'agent@example.test'),
    'invited user is an agent, not an administrator');
update public.sales set role = 'viewer' where email = 'viewer@example.test';
update public.sales set disabled = true where email = 'gone@example.test';
select pg_temp.ok((select role from public.sales where email = 'viewer@example.test') = 'viewer', 'viewer role can be set');
update public.sales set role = 'admin' where email = 'agent2@example.test';
select pg_temp.ok((select role from public.sales where email = 'agent2@example.test') = 'agent',
    'role admin without the administrator flag is downgraded to agent');

-- Seed data (as the owner role) ---------------------------------------------
insert into public.configuration (id, config) values (1, '{}') on conflict (id) do nothing;
insert into public.contacts (id, first_name, last_name) values (9001, 'Casey', 'Customer');
insert into public.contact_notes (id, contact_id, text, sales_id)
select 9001, 9001, 'note by agent', id from public.sales where email = 'agent@example.test';
insert into public.tasks (id, contact_id, text, sales_id, due_date)
select 9001, 9001, 'follow up', id, now() from public.sales where email = 'agent@example.test';

-- Anonymous access -----------------------------------------------------------
select pg_temp.as_anon();
select pg_temp.fails('select * from public.contacts', 'anon must not read contacts');
select pg_temp.fails('select * from public.sales', 'anon must not read staff');
select pg_temp.fails($$select public.get_user_id_by_email('admin@example.test')$$, 'anon must not look up users by email');
select pg_temp.fails($$select public.merge_contacts(1, 2)$$, 'anon must not merge contacts');
select pg_temp.ok((select count(*) from public.init_state) = 1, 'anon can still check whether the CRM is initialised');
reset role;

-- A signed-in account with no active staff row sees nothing -------------------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a5');
select pg_temp.ok((select count(*) from public.contacts) = 0, 'disabled staff read nothing');
select pg_temp.fails($$insert into public.contacts (first_name) values ('x')$$, 'disabled staff cannot create contacts');
reset role;

-- Viewer: read only ----------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a3');
select pg_temp.ok((select count(*) from public.contacts) = 1, 'viewer can read');
select pg_temp.fails($$insert into public.contacts (first_name) values ('x')$$, 'viewer cannot create');
select pg_temp.ok(pg_temp.rows_affected($$update public.contacts set last_name = 'Changed'$$) = 0, 'viewer cannot update');
select pg_temp.ok(pg_temp.rows_affected($$delete from public.contacts$$) = 0, 'viewer cannot delete');
reset role;

-- Agent: create and edit, not delete shared records ------------------------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
select pg_temp.ok((select count(*) from public.contacts) = 1, 'agent can read');
insert into public.contacts (id, first_name) values (9002, 'New');
select pg_temp.ok(pg_temp.rows_affected($$update public.contacts set last_name = 'Edited' where id = 9001$$) = 1, 'agent can update');
select pg_temp.ok(pg_temp.rows_affected($$delete from public.contacts where id = 9002$$) = 0, 'agent cannot delete shared records');
select pg_temp.ok(pg_temp.rows_affected($$update public.configuration set config = '{"x":1}'$$) = 0, 'agent cannot change configuration');
select pg_temp.fails($$insert into public.contact_notes (contact_id, text, sales_id) values (9001, 'forged', (select id from public.sales where email = 'admin@example.test'))$$,
    'agent cannot write a note in someone else''s name');
insert into public.contact_notes (contact_id, text) values (9001, 'my note');
select pg_temp.ok(pg_temp.rows_affected($$delete from public.tasks where id = 9001$$) = 1, 'agent can delete their own task');
reset role;

-- Second agent: cannot touch the first agent's notes -------------------------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a4');
select pg_temp.ok(pg_temp.rows_affected($$update public.contact_notes set text = 'hijack' where id = 9001$$) = 0, 'agent cannot edit another agent''s note');
select pg_temp.ok(pg_temp.rows_affected($$delete from public.contact_notes where id = 9001$$) = 0, 'agent cannot delete another agent''s note');
reset role;

-- Signed-in users cannot reach admin-only plumbing --------------------------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
select pg_temp.fails($$select public.get_user_id_by_email('admin@example.test')$$, 'staff must not look up users by email');
select pg_temp.fails($$truncate public.contacts$$, 'staff cannot truncate');
select pg_temp.fails($$insert into public.sales (first_name, last_name, email, administrator, user_id) values ('a','b','c@d.test', true, gen_random_uuid())$$,
    'staff cannot add themselves or others directly to the staff table');
select pg_temp.ok(pg_temp.rows_affected($$update public.sales set administrator = true where email = 'agent@example.test'$$) = 0,
    'staff cannot promote themselves');
reset role;

-- Admin: full control --------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select pg_temp.ok(pg_temp.rows_affected($$update public.configuration set config = '{"x":1}'$$) = 1, 'admin can change configuration');
select pg_temp.ok(pg_temp.rows_affected($$delete from public.contacts where id = 9002$$) = 1, 'admin can delete');
reset role;

-- Third-party calls are gone ---------------------------------------------------
select pg_temp.ok(not exists (select 1 from pg_trigger where tgname in ('company_saved', '20_contact_saved')), 'avatar and favicon triggers removed');
select pg_temp.ok(not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('get_avatar_for_email', 'get_domain_favicon')), 'avatar and favicon functions removed');
select pg_temp.ok(not exists (select 1 from pg_extension where extname = 'http'), 'http extension removed');

-- No function in the public schema is executable by anon ----------------------
select pg_temp.ok(not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace
    and has_function_privilege('anon', p.oid, 'execute')), 'anon cannot execute any public function');
select pg_temp.ok(not exists (select 1 from information_schema.role_table_grants
    where grantee = 'anon' and table_schema = 'public' and table_name <> 'init_state'), 'anon holds no table privileges except init_state');

select 'ALL SECURITY BASELINE CHECKS PASSED' as result;
rollback;
