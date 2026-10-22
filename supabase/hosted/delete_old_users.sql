-- Run in the Supabase SQL editor (confirm the destructive-statement prompt).
--
-- Deleting the two old GardenOS auth users fails because four tables in the
-- preserved legacy_device_app schema reference them without ON DELETE CASCADE.
-- This switches those four references to cascade, then removes the two users.
-- It deletes those users' rows in the legacy schema as well (that is the point).
-- Nothing in the CRM (public schema) is touched.

begin;

alter table legacy_device_app.cases     drop constraint cases_assigned_to_fkey;
alter table legacy_device_app.commands  drop constraint commands_issued_by_fkey;
alter table legacy_device_app.documents drop constraint documents_user_id_fkey;
alter table legacy_device_app.messages  drop constraint messages_sender_id_fkey;

alter table legacy_device_app.cases     add constraint cases_assigned_to_fkey
    foreign key (assigned_to) references legacy_device_app.users(id) on delete cascade;
alter table legacy_device_app.commands  add constraint commands_issued_by_fkey
    foreign key (issued_by) references legacy_device_app.profiles(id) on delete cascade;
alter table legacy_device_app.documents add constraint documents_user_id_fkey
    foreign key (user_id) references legacy_device_app.users(id) on delete cascade;
alter table legacy_device_app.messages  add constraint messages_sender_id_fkey
    foreign key (sender_id) references legacy_device_app.users(id) on delete cascade;

delete from auth.users
where email in ('test@gardenos.local', 'demo@gardenos.app');

commit;

-- Expect 1 row (your own account):
select id, email from auth.users;
