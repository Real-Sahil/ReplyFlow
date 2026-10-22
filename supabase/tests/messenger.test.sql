-- Messenger intake tests. Plain SQL, rolled back at the end.
-- Run on an EMPTY development database with all ReplyFlow migrations applied.

begin;

create function pg_temp.ok(c boolean, m text) returns void language plpgsql as $$
begin
    if not coalesce(c, false) then raise exception 'FAIL: %', m; end if;
end $$;

create function pg_temp.rows_affected(sql text) returns bigint language plpgsql as $$
declare n bigint;
begin execute sql; get diagnostics n = row_count; return n; end $$;

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

-- A placeholder name is replaced once the real name is known, and edits are kept.
select public.record_messenger_message('PAGE1', 'PSID-2002', 'm_5', 'Hello again', now(), 'Dana', 'Buyer', null);
select pg_temp.ok((select first_name = 'Dana' and last_name = 'Buyer' from public.contacts where messenger_psid = 'PSID-2002'), 'placeholder name replaced by the real name');
update public.contacts set first_name = 'Danielle' where messenger_psid = 'PSID-2002';
select public.record_messenger_message('PAGE1', 'PSID-2002', 'm_6', 'Third', now(), 'Dana', 'Buyer', null);
select pg_temp.ok((select first_name = 'Danielle' from public.contacts where messenger_psid = 'PSID-2002'), 'a name edited by staff is not overwritten');

-- Inbox view: one row per conversation, unread until the contact is marked read.
select pg_temp.ok((select count(*) from public.messenger_inbox) = 2, 'inbox has one row per conversation');
select pg_temp.ok((select unread and window_open from public.messenger_inbox where contact_id = (select id from public.contacts where messenger_psid = 'PSID-1001')), 'a fresh inbound message is unread with the window open');
update public.contacts set messenger_read_at = now() + interval '1 minute' where messenger_psid = 'PSID-1001';
select pg_temp.ok((select not unread from public.messenger_inbox where contact_id = (select id from public.contacts where messenger_psid = 'PSID-1001')), 'marking read clears unread');
update public.messenger_messages set sent_at = now() - interval '30 hours' where psid = 'PSID-1001';
select pg_temp.ok((select not window_open from public.messenger_inbox where contact_id = (select id from public.contacts where messenger_psid = 'PSID-1001')), 'window closes after 24 hours');

-- Access control.
set local role anon;
select pg_temp.fails($$select * from public.messenger_messages$$, 'anon cannot read messages');
select pg_temp.fails($$select * from public.messenger_inbox$$, 'anon cannot read the inbox');
select pg_temp.fails($$select * from public.page_comments$$, 'anon cannot read comments');
select pg_temp.fails($$select * from public.saved_replies$$, 'anon cannot read saved replies');
select pg_temp.fails($$select public.record_messenger_message('P','x','m_9','t',now(),null,null,null)$$, 'anon cannot record messages');
reset role;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a1', 'admin@example.test');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
set local role authenticated;
select pg_temp.ok((select count(*) from public.messenger_messages) = 6, 'staff can read messages');
select pg_temp.fails($$select public.record_messenger_message('P','x','m_9','t',now(),null,null,null)$$, 'staff cannot call the intake function');
reset role;
-- Auto-reply settings: off by default, admin-only edits, state is service-only.
select pg_temp.ok((select not auto_replies_enabled and not qualify_enabled and not away_enabled from public.messenger_settings), 'auto replies are off by default');
select pg_temp.fails($$update public.messenger_settings set open_days = '{0}'$$, 'weekday numbers must be 1 to 7');
insert into auth.users (id, email, raw_app_meta_data) values ('00000000-0000-0000-0000-0000000000a2', 'agent@example.test', '{"replyflow_invited":"true"}');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a2', true);
set local role authenticated;
select pg_temp.ok((select count(*) from public.messenger_settings) = 1, 'staff can read the settings');
select pg_temp.ok(pg_temp.rows_affected($$update public.messenger_settings set auto_replies_enabled = true$$) = 0, 'agents cannot change the settings');
select pg_temp.fails($$insert into public.messenger_conversation_state (contact_id) values (1)$$, 'staff cannot write conversation state');
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
set local role authenticated;
select pg_temp.ok(pg_temp.rows_affected($$update public.messenger_settings set auto_replies_enabled = true$$) = 1, 'admins can change the settings');
reset role;

-- Replies typed in the Page inbox are recorded once and count as activity.
select pg_temp.ok(public.record_messenger_echo('PAGE1', 'PSID-2002', 'e_1', 'Hi Dana, yes we do deliver', now()) is not null, 'a Page inbox reply is recorded');
select pg_temp.ok(public.record_messenger_echo('PAGE1', 'PSID-2002', 'e_1', 'Hi Dana, yes we do deliver', now()) is null, 'a redelivered echo is ignored');
select pg_temp.ok((select source = 'page_inbox' and direction = 'outbound' and sent_by is null from public.messenger_messages where mid = 'e_1'), 'echo stored as an outbound Page inbox message');
select pg_temp.ok(public.record_messenger_echo('PAGE1', 'PSID-UNKNOWN', 'e_2', 'x', now()) is null, 'echoes for unknown people are ignored');
select pg_temp.ok((select count(*) from public.deal_notes where text like 'Replied on Facebook:%') = 1, 'the reply is logged on the enquiry');
select pg_temp.ok(not has_function_privilege('authenticated', 'public.record_messenger_echo(text,text,text,text,timestamptz)', 'execute') and not has_function_privilege('anon', 'public.record_messenger_echo(text,text,text,text,timestamptz)', 'execute'), 'only the service role can record echoes');

-- Page comments.
select pg_temp.ok(public.record_page_comment('c_1', 'POST1', null, 'PAGE1', 'U9', 'Priya Shah', 'Is the corner sofa in stock?', now()) is not null, 'a comment is stored');
select pg_temp.ok(public.record_page_comment('c_1', 'POST1', null, 'PAGE1', 'U9', 'Priya Shah', 'Is the corner sofa in stock?', now()) is null, 'a redelivered comment is ignored');
select pg_temp.ok(public.record_page_comment('c_2', 'POST1', 'c_1', 'PAGE1', 'PAGE1', 'Mere & Row', 'Yes, in stock', now()) is null, 'the Page''s own comments are ignored');
select pg_temp.ok((select status = 'new' from public.page_comments where comment_id = 'c_1'), 'new comments start as new');
select pg_temp.ok(public.record_comment_lead((select id from public.page_comments where comment_id = 'c_1'), null) is not null, 'a comment becomes a contact');
select pg_temp.ok((select first_name = 'Priya' and last_name = 'Shah' from public.contacts c join public.page_comments p on p.contact_id = c.id where p.comment_id = 'c_1'), 'the commenter name is split into first and last name');
select pg_temp.ok((select count(*) from public.deals where name = 'Facebook comment: Priya Shah') = 1, 'and an open enquiry is created');
select public.record_comment_lead((select id from public.page_comments where comment_id = 'c_1'), 'PSID-PRIYA');
select pg_temp.ok((select messenger_psid = 'PSID-PRIYA' from public.contacts c join public.page_comments p on p.contact_id = c.id where p.comment_id = 'c_1'), 'a private reply links the Messenger conversation to the same contact');
select pg_temp.ok((select count(*) from public.deals where name = 'Facebook comment: Priya Shah') = 1, 'no second enquiry is created');

-- The stored Facebook token is invisible to every API role.
select pg_temp.ok(not has_table_privilege('authenticated', 'public.meta_connection', 'select') and not has_table_privilege('anon', 'public.meta_connection', 'select'), 'no API role can read the stored token');
select pg_temp.ok(has_table_privilege('service_role', 'public.meta_connection', 'select, update'), 'the service role can read and update it');

select 'ALL MESSENGER CHECKS PASSED' as result;
rollback;
