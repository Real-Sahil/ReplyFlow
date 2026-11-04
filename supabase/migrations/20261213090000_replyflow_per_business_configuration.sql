-- Company settings (name, currency, pipeline stages, logo) per business.
--
-- The configuration table was a single row (id = 1, enforced), so only Mere & Row could ever
-- have settings: an administrator of any other business could not save them. Now there is one
-- row per organisation, with id equal to the organisation id, and each administrator reads and
-- writes only their own business's row (the row-level policies already require that).
-- Administrators can also rename their own business.

alter table public.configuration drop constraint if exists configuration_singleton;
alter table public.configuration alter column id drop default;
update public.configuration set id = organisation_id where id <> organisation_id;
alter table public.configuration
  add constraint configuration_one_per_organisation unique (organisation_id),
  add constraint configuration_id_is_organisation check (id = organisation_id);

grant select, insert, update on public.configuration to authenticated;

create policy "admins rename their organisation" on public.organisations
  for update to authenticated
  using (id = (select private.current_organisation()) and (select private.is_admin()))
  with check (id = (select private.current_organisation()) and (select private.is_admin()));
grant update (name) on public.organisations to authenticated;
