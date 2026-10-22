-- Messenger intake tests. Plain SQL, rolled back at the end.
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

select pg_temp.ok((select count(*) from public.contacts) = 0, 'run this on an empty database');

-- First message creates a contact and an open enquiry.
select pg_temp.ok(public.record_messenger_message('PAGE1', 'PSID-1001', 'm_1', 'Do you deliver to Reading?', now(), 'Casey', 'Customer', null) is not null, 'first message stored');
select pg_temp.ok((select count(*) from public.contacts where messenger_psid = 'PSID-1001' and first_name = 'Casey') = 1, 'contact created from profile name');
select pg_temp.ok((select count(*) from public.deals where stage = 'opportunity') = 1, 'one open enquiry created');
select pg_temp.ok((select deal_id is not null and contact_id is not null from public.messenger_messages where mid = 'm_1'), 'message linked to contact and deal');

-- Redelivery is ignored.
select pg_temp.ok(public.record_messenger_message('PAGE1', 'PSID-1001', 'm_1', 'Do you deliver to Reading?', now(), 'Casey', 'Customer', null) is null, 'a redelivered message returns null');
select pg_temp.ok((select count(*) from public.messenger_messages) = 1, 'no duplicate row');

-- A second message from the same person reuses the contact and the open enquiry.
select public.record_messenger_message('PAGE1', 'PSID-1001', 'm_2', 'Also, how long for a corner sofa?', now(), null, null, null);
select pg_temp.ok((select count(*) from public.contacts) = 1, 'same person, same contact');
select pg_temp.ok((select count(*) from public.deals) = 1, 'same open enquiry reused');

-- Once the enquiry is won, a new message opens a new one.
update public.deals set stage = 'won';
select public.record_messenger_message('PAGE1', 'PSID-1001', 'm_3', 'Hi again', now(), null, null, '{"ref":"ad123"}');
select pg_temp.ok((select count(*) from public.deals) = 2, 'new enquiry after the previous one closed');

-- Unknown profile name still produces a usable contact.
select public.record_messenger_message('PAGE1', 'PSID-2002', 'm_4', 'Hello', now(), null, null, null);
select pg_temp.ok((select first_name = 'Messenger' and last_name = 'enquiry 2002' from public.contacts where messenger_psid = 'PSID-2002'), 'fallback name');

-- The follow-up engine sees the unanswered enquiry.
update public.deals set created_at = now() - interval '48 hours' where contact_ids = (select array[id] from public.contacts where messenger_psid = 'PSID-2002');
select pg_temp.ok(public.generate_followup_tasks() >= 1, 'unanswered Messenger enquiry gets a follow-up task');

-- Access control.
set local role anon;
select pg_temp.fails($$select * from public.messenger_messages$$, 'anon cannot read messages');
select pg_temp.fails($$select public.record_messenger_message('P','x','m_9','t',now(),null,null,null)$$, 'anon cannot record messages');
reset role;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a1', 'admin@example.test');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
set local role authenticated;
select pg_temp.ok((select count(*) from public.messenger_messages) = 4, 'staff can read messages');
select pg_temp.fails($$select public.record_messenger_message('P','x','m_9','t',now(),null,null,null)$$, 'staff cannot call the intake function');
reset role;
select 'ALL MESSENGER CHECKS PASSED' as result;
rollback;
