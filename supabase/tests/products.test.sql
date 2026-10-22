-- Product catalogue tests. Plain SQL, rolled back at the end.
--
-- Run against an EMPTY development database with the baseline and migrations
-- 20261022130000, 20261023090000 and 20261024090000 applied:
--
--     psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/products.test.sql

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

create function pg_temp.fails(sql text, m text) returns void language plpgsql as $$
begin
    begin execute sql; exception when others then return; end;
    raise exception 'FAIL (expected an error): %', m;
end $$;

create function pg_temp.rows_affected(sql text) returns bigint language plpgsql as $$
declare n bigint;
begin execute sql; get diagnostics n = row_count; return n; end $$;

select pg_temp.ok((select count(*) from public.sales) = 0, 'run this on an empty database');

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a1', 'admin@example.test');
insert into auth.users (id, email, raw_app_meta_data) values
    ('00000000-0000-0000-0000-0000000000a2', 'agent@example.test', '{"replyflow_invited":"true"}'),
    ('00000000-0000-0000-0000-0000000000a3', 'viewer@example.test', '{"replyflow_invited":"true"}');
update public.sales set role = 'viewer' where email = 'viewer@example.test';

insert into public.products (id, reference, title, price_pence, original_price_pence)
values (5001, 'TST-001', 'Test sofa', 49900, 62500);

select pg_temp.fails($$insert into public.products (reference, title) values ('tst-001', 'Duplicate by case')$$, 'references are unique regardless of case');
select pg_temp.fails($$insert into public.products (reference, title, price_pence) values ('TST-002', 'Negative', -1)$$, 'negative prices rejected');
select pg_temp.fails($$insert into public.products (reference, title, images) values ('TST-003', 'Bad images', '{"a":1}')$$, 'images must be an array');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000a3');
select pg_temp.ok((select count(*) from public.products) = 1, 'viewer can read products');
select pg_temp.fails($$insert into public.products (reference, title) values ('TST-009', 'x')$$, 'viewer cannot add products');
select pg_temp.ok(pg_temp.rows_affected($$update public.products set title = 'x'$$) = 0, 'viewer cannot edit products');
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
select pg_temp.ok(pg_temp.rows_affected($$update public.products set active = false where id = 5001$$) = 1, 'agent can edit products');
select pg_temp.ok(pg_temp.rows_affected($$delete from public.products where id = 5001$$) = 0, 'agent cannot delete products');
reset role;

set local role anon;
select pg_temp.fails($$select * from public.products$$, 'anon cannot read products');
reset role;

-- Deleting a product keeps the order that referenced it.
insert into public.contacts (id, first_name) values (7001, 'Casey');
insert into public.orders (id, contact_id, product_id) values (8001, 7001, 5001);
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select pg_temp.ok(pg_temp.rows_affected($$delete from public.products where id = 5001$$) = 1, 'admin can delete products');
reset role;
select pg_temp.ok((select product_id is null from public.orders where id = 8001), 'order survives product deletion');

select 'ALL PRODUCT CHECKS PASSED' as result;
rollback;
