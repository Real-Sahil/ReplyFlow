-- The Facebook page access token can be pasted in the app by an administrator
-- instead of being re-set as a Supabase secret each time. Only the service role
-- (edge functions) can read it: no API role has any access to this table.

create table public.meta_connection (
    id integer primary key default 1,
    page_access_token text,
    page_id text,
    page_name text,
    saved_by bigint references public.sales (id) on delete set null,
    saved_at timestamptz,
    constraint meta_connection_singleton check (id = 1)
);
insert into public.meta_connection (id) values (1);

alter table public.meta_connection enable row level security;
revoke all on public.meta_connection from anon, authenticated;
grant all on public.meta_connection to service_role;
