-- Error tracking and rate limiting, both inside the database so they cost nothing.
--
-- error_log: what went wrong, in the functions or in the browser. Administrators read the
-- errors of their own business in the app. Only the server writes to it.
-- rate_limits: one counter per key and time window. check_rate_limit() is called by the
-- Edge Functions with the service role, never by the browser.
--
-- Housekeeping runs inside check_rate_limit (about 1 call in 100): counters older than a day
-- and errors older than 60 days are removed.

create table public.error_log (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  organisation_id bigint references public.organisations (id) on delete cascade,
  source text not null,
  message text not null,
  detail text,
  context jsonb
);

create index error_log_organisation_created_idx
  on public.error_log (organisation_id, created_at desc);
create index error_log_created_idx on public.error_log (created_at desc);

alter table public.error_log enable row level security;

create policy "administrators read errors" on public.error_log
  for select to authenticated
  using (
    organisation_id = (select private.current_organisation())
    and (select private.is_admin())
  );

revoke all on public.error_log from anon, authenticated;
grant select on public.error_log to authenticated;
grant all on public.error_log to service_role;

create table public.rate_limits (
  key text not null,
  window_start timestamptz not null,
  hits integer not null default 1,
  primary key (key, window_start)
);

alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;
grant all on public.rate_limits to service_role;

-- Counts one hit for the key in the current fixed window. Returns whether it is within the
-- limit and, when it is not, how many seconds until the window resets.
create or replace function public.check_rate_limit(
  p_key text,
  p_limit integer,
  p_window_seconds integer
)
returns table (allowed boolean, retry_after integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_start timestamptz;
  v_hits integer;
begin
  if p_window_seconds < 1 or p_limit < 1 then
    raise exception 'invalid rate limit' using errcode = '22023';
  end if;

  v_start := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  insert into public.rate_limits as r (key, window_start, hits)
  values (p_key, v_start, 1)
  on conflict (key, window_start) do update set hits = r.hits + 1
  returning r.hits into v_hits;

  if random() < 0.01 then
    delete from public.rate_limits where window_start < now() - interval '1 day';
    delete from public.error_log where created_at < now() - interval '60 days';
  end if;

  return query select
    v_hits <= p_limit,
    greatest(1, ceil(extract(epoch from (v_start + make_interval(secs => p_window_seconds) - now())))::integer);
end;
$$;

revoke all on function public.check_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.check_rate_limit(text, integer, integer) to service_role;
