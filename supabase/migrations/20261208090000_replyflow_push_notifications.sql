-- Push notifications: a phone or computer that has turned them on is listed in
-- push_subscriptions, and the webhook sends one to everyone in the business when a customer
-- messages. push_config holds the signing key pair, created by the server on first use. Both
-- tables are read and written only by the Edge Functions (service role); the browser never
-- sees them.

create table public.push_config (
  id integer primary key check (id = 1),
  public_key text not null,
  private_key text not null,
  created_at timestamptz not null default now()
);

create table public.push_subscriptions (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_id uuid not null references auth.users (id) on delete cascade,
  organisation_id bigint not null references public.organisations (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null
);

create index push_subscriptions_organisation_idx
  on public.push_subscriptions (organisation_id);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_config enable row level security;
alter table public.push_subscriptions enable row level security;

revoke all on public.push_config from anon, authenticated;
revoke all on public.push_subscriptions from anon, authenticated;
grant all on public.push_config to service_role;
grant all on public.push_subscriptions to service_role;
