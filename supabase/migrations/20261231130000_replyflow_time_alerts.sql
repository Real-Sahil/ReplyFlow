-- Tell the administrators when staff record hours or ask for holiday.
--
-- Same method as expense claims: one alert per statement (a batch of hours is one alert), sent after the
-- records are saved, to the administrators only, using the same Vault key. An alert that cannot be sent
-- never stops a save.

create or replace function private.time_entries_announce() returns trigger
  language plpgsql security definer
  set search_path = ''
  as $$
declare
  r record;
begin
  for r in
    select organisation_id, staff_id, count(*) as n, sum(hours) as total
      from inserted group by organisation_id, staff_id
  loop
    begin
      perform net.http_post(
        url := 'https://mdhmuyhtimjkysvsardi.supabase.co/functions/v1/claims_notify',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-autopilot-key', (select decrypted_secret from vault.decrypted_secrets where name = 'autopilot_key')
        ),
        body := jsonb_build_object('kind', 'hours', 'organisation_id', r.organisation_id,
          'staff_id', r.staff_id, 'count', r.n, 'hours', r.total)
      );
    exception when others then
      null;
    end;
  end loop;
  return null;
end;
$$;

create or replace function private.holiday_requests_announce() returns trigger
  language plpgsql security definer
  set search_path = ''
  as $$
declare
  r record;
begin
  for r in
    select organisation_id, staff_id, count(*) as n, sum(days) as total
      from inserted group by organisation_id, staff_id
  loop
    begin
      perform net.http_post(
        url := 'https://mdhmuyhtimjkysvsardi.supabase.co/functions/v1/claims_notify',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-autopilot-key', (select decrypted_secret from vault.decrypted_secrets where name = 'autopilot_key')
        ),
        body := jsonb_build_object('kind', 'holiday', 'organisation_id', r.organisation_id,
          'staff_id', r.staff_id, 'count', r.n, 'days', r.total)
      );
    exception when others then
      null;
    end;
  end loop;
  return null;
end;
$$;
revoke execute on function private.time_entries_announce() from public, anon, authenticated;
revoke execute on function private.holiday_requests_announce() from public, anon, authenticated;

create trigger "80_time_entries_announce" after insert on public.time_entries
  referencing new table as inserted
  for each statement execute function private.time_entries_announce();
create trigger "80_holiday_requests_announce" after insert on public.holiday_requests
  referencing new table as inserted
  for each statement execute function private.holiday_requests_announce();
