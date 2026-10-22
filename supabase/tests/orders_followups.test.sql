-- Orders and follow-up engine tests. Plain SQL, rolled back at the end.
--
-- Run against an EMPTY development database that has the Atomic CRM baseline,
-- migration 20261022130000 (security) and 20261023090000 (orders and follow-ups):
--
--     psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/orders_followups.test.sql

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

-- Staff: an admin, an agent and a viewer --------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
    ('00000000-0000-0000-0000-0000000000a1', 'admin@example.test', '{"first_name":"Ada","last_name":"Admin"}');
insert into auth.users (id, email, raw_app_meta_data) values
    ('00000000-0000-0000-0000-0000000000a2', 'agent@example.test', '{"replyflow_invited":"true"}'),
    ('00000000-0000-0000-0000-0000000000a3', 'viewer@example.test', '{"replyflow_invited":"true"}');
update public.sales set role = 'viewer' where email = 'viewer@example.test';

insert into public.contacts (id, first_name, last_name) values (7001, 'Casey', 'Customer'), (7002, 'Dana', 'Buyer');

-- Orders ----------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
insert into public.orders (id, contact_id, product_summary, configuration, quoted_price_pence, agreed_price_pence,
                           deposit_required_pence, paid_pence, delivery_window_start, delivery_window_end)
values (8001, 7001, '3 seater, grey boucle', '{"model":"Mere","fabric":"boucle","colour":"grey","legs":"oak"}',
        189900, 179900, 50000, 50000, '2026-12-01', '2026-12-05');
reset role;

select pg_temp.ok((select reference from public.orders where id = 8001) = 'ORD-08001', 'order gets a readable reference');
select pg_temp.ok((select balance_pence from public.orders where id = 8001) = 129900, 'balance = agreed price minus paid');
select pg_temp.ok((select count(*) from public.order_status_history where order_id = 8001 and from_status is null and to_status = 'quoted') = 1,
    'creating an order records its first status');
select pg_temp.ok((select changed_by from public.order_status_history where order_id = 8001) = (select id from public.sales where email = 'agent@example.test'),
    'status history records who made the change');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
update public.orders set status = 'deposit_paid' where id = 8001;
reset role;
select pg_temp.ok((select count(*) from public.order_status_history where order_id = 8001) = 2, 'a status change is logged');
select pg_temp.ok((select from_status from public.order_status_history where order_id = 8001 order by id desc limit 1) = 'quoted', 'history keeps the previous status');
select pg_temp.ok((select updated_at > created_at - interval '1 second' from public.orders where id = 8001), 'updated_at is maintained');

select pg_temp.fails($$insert into public.orders (contact_id, status) values (7001, 'shipped')$$, 'unknown status rejected');
select pg_temp.fails($$insert into public.orders (contact_id, paid_pence) values (7001, -1)$$, 'negative money rejected');
select pg_temp.fails($$insert into public.orders (contact_id, delivery_window_start, delivery_window_end) values (7001, '2026-12-05', '2026-12-01')$$, 'delivery window must run forwards');
select pg_temp.fails($$insert into public.orders (contact_id, configuration) values (7001, '[1,2]')$$, 'configuration must be an object');
select pg_temp.fails($$delete from public.contacts where id = 7001$$, 'a customer with orders cannot be removed by accident');

-- Permissions -----------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a3');
select pg_temp.ok((select count(*) from public.orders) = 1, 'viewer can read orders');
select pg_temp.fails($$insert into public.orders (contact_id) values (7001)$$, 'viewer cannot create orders');
select pg_temp.ok(pg_temp.rows_affected($$update public.orders set notes = 'x'$$) = 0, 'viewer cannot update orders');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
select pg_temp.ok(pg_temp.rows_affected($$delete from public.orders where id = 8001$$) = 0, 'agent cannot delete orders');
insert into public.after_sales_issues (order_id, summary) values (8001, 'Scuff on left arm');
select pg_temp.ok((select count(*) from public.after_sales_issues) = 1, 'agent can log an after-sales issue');
select pg_temp.ok(pg_temp.rows_affected($$update public.followup_settings set quote_chase_days = 1$$) = 0, 'agent cannot change engine settings');
select pg_temp.fails($$select public.generate_followup_tasks()$$, 'signed-in staff cannot run the engine directly');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select pg_temp.ok(pg_temp.rows_affected($$update public.followup_settings set enquiry_unanswered_hours = 24$$) = 1, 'admin can change engine settings');
reset role;
set local role anon;
select pg_temp.fails($$select public.generate_followup_tasks()$$, 'anon cannot run the engine');
reset role;

-- Follow-up engine: unanswered enquiries ----------------------------------------
insert into public.deals (id, name, stage, contact_ids, created_at, sales_id)
select 6001, 'Corner sofa enquiry', 'opportunity', array[7001::bigint], now() - interval '48 hours', id
from public.sales where email = 'agent@example.test';
insert into public.deals (id, name, stage, contact_ids, created_at) values (6002, 'Fresh enquiry', 'opportunity', array[7002::bigint], now() - interval '2 hours');

select pg_temp.ok(public.generate_followup_tasks() = 1, 'engine creates one task for the old unanswered enquiry only');
select pg_temp.ok((select count(*) from public.tasks where deal_id = 6001 and source = 'auto') = 1, 'the task is linked to the deal');
select pg_temp.ok((select sales_id from public.tasks where deal_id = 6001) = (select id from public.sales where email = 'agent@example.test'), 'the task goes to the deal owner');
select pg_temp.ok(public.generate_followup_tasks() = 0, 'running the engine again creates no duplicates');
select pg_temp.ok((select count(*) from public.tasks where deal_id = 6001) = 1, 'still exactly one task');

-- A reply closes the reminder ------------------------------------------------------
insert into public.deal_notes (deal_id, text, sales_id)
select 6001, 'Replied by phone', id from public.sales where email = 'agent@example.test';
select pg_temp.ok((select done_date is not null and closed_reason = 'activity recorded' from public.tasks where deal_id = 6001), 'a note closes the automatic reminder');
select pg_temp.ok(public.generate_followup_tasks() = 0, 'the engine does not recreate a reminder for an answered enquiry');

-- Quotes awaiting a reply --------------------------------------------------------------
insert into public.deals (id, name, stage, contact_ids, created_at, updated_at)
values (6003, 'Quoted armchair', 'proposal-sent', array[7002::bigint], now() - interval '10 days', now() - interval '5 days');
select pg_temp.ok(public.generate_followup_tasks() = 1, 'engine chases a quote that has gone quiet');
select pg_temp.ok((select text from public.tasks where deal_id = 6003) like 'Chase quote:%', 'the chase task names the quote');
select pg_temp.ok(public.generate_followup_tasks() = 0, 'no duplicate chase');
-- Marking it done without any new activity must not bring it straight back.
update public.tasks set done_date = now() where deal_id = 6003;
select pg_temp.ok(public.generate_followup_tasks() = 0, 'a completed chase is not recreated without new activity');
-- The customer accepts: the deal moves on and its open reminders cancel.
insert into public.deals (id, name, stage, contact_ids, created_at, updated_at)
values (6004, 'Another quote', 'proposal-sent', array[7001::bigint], now() - interval '9 days', now() - interval '6 days');
select pg_temp.ok(public.generate_followup_tasks() = 1, 'second quote chased');
update public.deals set stage = 'won' where id = 6004;
select pg_temp.ok((select done_date is not null and closed_reason like 'deal moved to%' from public.tasks where deal_id = 6004), 'moving the deal cancels its reminder');

-- Orders missing an update --------------------------------------------------------------
update public.orders set next_update_due = current_date - 1 where id = 8001;
select pg_temp.ok(public.generate_followup_tasks() = 1, 'engine asks for a customer update on an overdue order');
select pg_temp.ok((select text from public.tasks where order_id = 8001) = 'Update customer on order ORD-08001', 'order task names the order');
select pg_temp.ok(public.generate_followup_tasks() = 0, 'no duplicate order task');
update public.orders set next_update_due = current_date + 7, last_customer_update_at = now() where id = 8001;
select pg_temp.ok((select done_date is not null and closed_reason = 'order updated' from public.tasks where order_id = 8001), 'updating the order cancels its reminder');
select pg_temp.ok(public.generate_followup_tasks() = 0, 'a rescheduled order is not chased early');
update public.orders set status = 'cancelled', next_update_due = current_date - 3 where id = 8001;
select pg_temp.ok(public.generate_followup_tasks() = 0, 'cancelled orders are never chased');

-- The engine can be switched off ----------------------------------------------------------
update public.followup_settings set enabled = false;
insert into public.deals (id, name, stage, contact_ids, created_at) values (6005, 'Old enquiry', 'opportunity', array[7002::bigint], now() - interval '5 days');
select pg_temp.ok(public.generate_followup_tasks() = 0, 'a disabled engine creates nothing');

select 'ALL ORDER AND FOLLOW-UP CHECKS PASSED' as result;
rollback;
