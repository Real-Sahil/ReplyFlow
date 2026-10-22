-- Page post tests. Plain SQL, rolled back at the end.
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
insert into auth.users (id, email, raw_app_meta_data) values
    ('00000000-0000-0000-0000-0000000000a2', 'agent@example.test', '{"replyflow_invited":"true"}'),
    ('00000000-0000-0000-0000-0000000000a3', 'viewer@example.test', '{"replyflow_invited":"true"}');
update public.sales set role = 'viewer' where email = 'viewer@example.test';

select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
insert into public.page_posts (id, message) values (9001, 'New Marilyn corner sofa in stock');
select pg_temp.ok((select created_by = (select id from public.sales where email = 'agent@example.test') from public.page_posts where id = 9001), 'the author is recorded');
select pg_temp.ok(pg_temp.rows_affected($$update public.page_posts set message = 'Edited' where id = 9001$$) = 1, 'agents can edit drafts');
select pg_temp.fails($$insert into public.page_posts (message) values ('   ')$$, 'empty posts are rejected');
select pg_temp.fails($$insert into public.page_posts (message, status) values ('x', 'scheduled')$$, 'a scheduled post needs a time');
select pg_temp.fails($$insert into public.page_posts (message, status) values ('x', 'banana')$$, 'unknown status rejected');
reset role;

-- Once published, only the service role changes it.
update public.page_posts set status = 'published', fb_post_id = '123_456', published_at = now() where id = 9001;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
select pg_temp.ok(pg_temp.rows_affected($$update public.page_posts set message = 'Sneaky edit' where id = 9001$$) = 0, 'published posts cannot be edited by staff');
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-0000000000a3');
select pg_temp.ok((select count(*) from public.page_posts) = 1, 'viewers can read posts');
select pg_temp.fails($$insert into public.page_posts (message) values ('viewer post')$$, 'viewers cannot create posts');
reset role;
set local role anon;
select pg_temp.fails($$select * from public.page_posts$$, 'anon cannot read posts');
reset role;

select pg_temp.ok((select count(*) from public.audit_log where table_name = 'page_posts') >= 2, 'post changes are in the history');

-- Review: agents submit, only administrators approve.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
insert into public.page_posts (id, message) values (9002, 'Second post for review');
select pg_temp.ok(pg_temp.rows_affected($$update public.page_posts set status = 'pending_review' where id = 9002$$) = 1, 'agents can submit a post for review');
select pg_temp.fails($$update public.page_posts set status = 'approved' where id = 9002$$, 'agents cannot approve');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select pg_temp.ok(pg_temp.rows_affected($$update public.page_posts set status = 'approved' where id = 9002$$) = 1, 'administrators can approve');
select pg_temp.ok((select approved_by is not null and approved_at is not null from public.page_posts where id = 9002), 'approval records who and when');
reset role;

-- Media bucket is private.
select pg_temp.ok(exists (select 1 from storage.buckets where id = 'post-media' and not public), 'post media bucket is private');

select 'ALL PAGE POST CHECKS PASSED' as result;
rollback;
