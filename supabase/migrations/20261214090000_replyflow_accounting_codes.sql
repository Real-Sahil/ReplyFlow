-- The account codes an accountant gives a business, so exports can be imported without
-- mapping each line by hand. Shape: { "sales": "200", "bills": { "materials": "310", ... } }.
-- Empty by default: nothing is assumed, because every accountant's chart is different.
alter table public.business_settings
  add column accounting_codes jsonb not null default '{}'::jsonb
    check (jsonb_typeof(accounting_codes) = 'object');

grant insert (accounting_codes) on public.business_settings to authenticated;
grant update (accounting_codes) on public.business_settings to authenticated;
