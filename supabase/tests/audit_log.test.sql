-- Audit log tests. Plain SQL, rolled back at the end.
-- Run on an EMPTY development database with all ReplyFlow migrations applied.

begin;

create function pg_temp.ok(c boolean, m text) returns void language plpgsql as $$
begin
    if not coalesce(c, false) then raise exception 'FAIL: %', m; end if;
end $$;
create function pg_temp.fails(sql text, m text) returns void language plpgsql as $$
begin
    begin execute sql; exception when others then return; end;
    raise exception 'FAIL (expected an error): %', m;
end $$;
create function pg_temp.rows_affected(sql text) returns bigint language plpgsql as $$
declare n bigint;
begin execute sql; get diagnostics n = row_count; return n; end $$;
create function pg_temp.as_user(u uuid) returns void language plpgsql as $$
begin
    perform set_config('request.jwt.claim.sub', u::text, true);
    execute 'set local role authenticated';
end $$;

select pg_temp.ok((select count(*) from public.sales) = 0, 'run this on an empty database');
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a1', 'admin@example.test');
insert into auth.users (id, email, raw_app_meta_data) values ('00000000-0000-0000-0000-0000000000a2', 'agent@example.test', '{"replyflow_invited":"true"}');
insert into public.contacts (id, first_name) values (7001, 'Casey');

-- An agent creates and edits an order; each change is recorded against them.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
insert into public.orders (id, contact_id, product_summary) values (8001, 7001, 'Corner sofa');
update public.orders set status = 'confirmed', paid_pence = 50000 where id = 8001;
reset role;

select pg_temp.ok((select count(*) from public.audit_log where table_name = 'orders' and record_id = 8001) >= 2, 'order insert and updates are logged');
select pg_temp.ok((select actor_id = (select id from public.sales where email = 'agent@example.test') from public.audit_log where table_name = 'orders' and action = 'update' and changes ? 'status'), 'the actor is the staff member who made the change');
select pg_temp.ok((select changes -> 'status' = '{"old": "quoted", "new": "confirmed"}'::jsonb from public.audit_log where table_name = 'orders' and action = 'update' and changes ? 'status'), 'an update records old and new values');
select pg_temp.ok((select not (changes ? 'updated_at') from public.audit_log where table_name = 'orders' and action = 'update' and changes ? 'status'), 'noise columns are left out');

-- Changes that only touch noise columns write nothing.
select count(*) as before_count from public.audit_log \gset
update public.contacts set last_seen = now(), messenger_read_at = now() where id = 7001;
select pg_temp.ok((select count(*) = :before_count from public.audit_log), 'noise-only updates are not logged');

-- Deletes keep the row for the record.
delete from public.orders where id = 8001;
select pg_temp.ok((select changes ->> 'product_summary' = 'Corner sofa' from public.audit_log where table_name = 'orders' and action = 'delete'), 'a delete keeps the row contents');

-- Nobody can edit or remove history.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select pg_temp.ok((select count(*) from public.audit_log) > 0, 'staff can read the history');
select pg_temp.fails($$update public.audit_log set action = 'insert'$$, 'history cannot be edited');
select pg_temp.fails($$delete from public.audit_log$$, 'history cannot be deleted');
reset role;
set local role anon;
select pg_temp.fails($$select * from public.audit_log$$, 'anon cannot read the history');
reset role;

select 'ALL AUDIT LOG CHECKS PASSED' as result;
rollback;
