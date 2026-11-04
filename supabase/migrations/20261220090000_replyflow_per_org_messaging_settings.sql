-- Messenger auto-reply settings and the Meta action-block breaker become one row per organisation.
-- Before this, both tables were singletons (CHECK id = 1) that every function read with
-- .eq("id", 1), so one business's settings and one business's Meta block applied to all.
-- The row id now equals the organisation id, which keeps the existing /messenger_settings/<id>
-- route and the primary key, and lets each organisation have exactly one row.

alter table public.messenger_settings drop constraint if exists messenger_settings_singleton;
alter table public.messenger_settings
  add constraint messenger_settings_id_is_organisation check (id = organisation_id);
alter table public.messenger_settings alter column id drop default;
alter table public.messenger_settings alter column organisation_id drop default;

alter table public.meta_circuit drop constraint if exists meta_circuit_singleton;
alter table public.meta_circuit
  add constraint meta_circuit_id_is_organisation check (id = organisation_id);
alter table public.meta_circuit alter column id drop default;
alter table public.meta_circuit alter column organisation_id drop default;

-- New businesses start from neutral wording, not another business's text.
alter table public.messenger_settings
  alter column greeting_text set default 'Hi, thanks for your message. We have it and a member of the team will reply shortly.',
  alter column question_1 drop default,
  alter column question_2 drop default;

-- Every organisation gets its rows when it is created, and today's organisations are backfilled.
create or replace function private.create_organisation_messaging_rows()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.messenger_settings (id, organisation_id) values (new.id, new.id)
    on conflict do nothing;
  insert into public.meta_circuit (id, organisation_id) values (new.id, new.id)
    on conflict do nothing;
  return new;
end;
$$;
revoke execute on function private.create_organisation_messaging_rows() from public, anon, authenticated;

drop trigger if exists organisation_messaging_rows on public.organisations;
create trigger organisation_messaging_rows
  after insert on public.organisations
  for each row execute function private.create_organisation_messaging_rows();

insert into public.messenger_settings (id, organisation_id)
  select id, id from public.organisations on conflict do nothing;
insert into public.meta_circuit (id, organisation_id)
  select id, id from public.organisations on conflict do nothing;
