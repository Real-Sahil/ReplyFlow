-- Sign-up grants. The onboard function records the email it is about to create, and the
-- sign-up trigger lets through only an email that has a grant. Only the service role can
-- write here: anonymous and signed-in users have no access.
create table if not exists public.signup_grants (
  email text primary key,
  organisation_id bigint not null references public.organisations(id),
  created_at timestamptz not null default now()
);

alter table public.signup_grants enable row level security;
revoke all on public.signup_grants from anon, authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  staff_count int;
  invited boolean;
begin
  select count(id) into staff_count from public.sales;
  invited := coalesce(new.raw_app_meta_data ->> 'replyflow_invited', '') = 'true'
    or exists (
      select 1 from public.signup_grants g where g.email = lower(new.email)
    );

  if staff_count > 0 and not invited then
    raise exception 'Sign-up is closed. Ask an administrator for an invitation.'
      using errcode = '42501';
  end if;

  insert into public.sales (first_name, last_name, email, user_id, administrator)
  values (
    coalesce(new.raw_user_meta_data ->> 'first_name', new.raw_user_meta_data -> 'custom_claims' ->> 'first_name', 'Pending'),
    coalesce(new.raw_user_meta_data ->> 'last_name', new.raw_user_meta_data -> 'custom_claims' ->> 'last_name', 'Pending'),
    new.email,
    new.id,
    staff_count = 0
  );
  return new;
end;
$$;
