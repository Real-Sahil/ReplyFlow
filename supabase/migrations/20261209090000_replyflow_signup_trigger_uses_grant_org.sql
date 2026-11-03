-- A new account lands in the business its sign-up grant names.
--
-- Before: the trigger created the staff row without an organisation, so the column default
-- (Mere & Row) applied, and the onboard and invite functions moved the person afterwards. An
-- account created any other way (the dashboard, or a failed second step) stayed in Mere & Row.
-- Now the trigger reads the organisation from the grant, so the first insert is already right.
-- Everything else about the trigger is unchanged.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  staff_count int;
  invited boolean;
  granted_org bigint;
begin
  select count(id) into staff_count from public.sales;

  select g.organisation_id into granted_org
  from public.signup_grants g
  where g.email = lower(new.email);

  invited := coalesce(new.raw_app_meta_data ->> 'replyflow_invited', '') = 'true'
    or granted_org is not null;

  if staff_count > 0 and not invited then
    raise exception 'Sign-up is closed. Ask an administrator for an invitation.'
      using errcode = '42501';
  end if;

  insert into public.sales (first_name, last_name, email, user_id, administrator, organisation_id)
  values (
    coalesce(new.raw_user_meta_data ->> 'first_name', new.raw_user_meta_data -> 'custom_claims' ->> 'first_name', 'Pending'),
    coalesce(new.raw_user_meta_data ->> 'last_name', new.raw_user_meta_data -> 'custom_claims' ->> 'last_name', 'Pending'),
    new.email,
    new.id,
    staff_count = 0,
    coalesce(granted_org, 1)
  );
  return new;
end;
$$;
