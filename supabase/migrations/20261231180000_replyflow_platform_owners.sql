-- Who may set up a new business on ReplyFlow.
--
-- Public sign-up is closed, so a customer's business is created for them by a platform owner using the
-- create_business function. A platform owner is a signed-in person listed here. The list is kept by hand (a row
-- is added in the SQL editor); nobody can read or change it from the app, and the function checks it with the
-- service key. The one thing the app can ask is "am I one?", so it knows whether to show the Businesses screen.

create table public.platform_owners (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.platform_owners enable row level security;
revoke all on public.platform_owners from anon, authenticated;
grant all on public.platform_owners to service_role;

create or replace function public.is_platform_owner() returns boolean
  language sql stable security definer
  set search_path = ''
  as $$
  select exists (select 1 from public.platform_owners where user_id = (select auth.uid()))
$$;
revoke execute on function public.is_platform_owner() from public, anon;
grant execute on function public.is_platform_owner() to authenticated;
