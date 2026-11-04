-- Business details and VAT, per business. VAT is optional: a business that is not VAT
-- registered (Mere & Row today) leaves it off and sees no VAT anywhere. UK rules only.
--
-- vat_rates: the UK rates, shared by every business. Read only for everyone; a rate change
-- is a migration.
-- business_settings: one row per organisation. Members read it, administrators change it.
-- next_invoice_number is never written by the browser: invoices take it through the database
-- so the numbers stay in sequence with no gaps.

create table public.vat_rates (
  code text primary key,
  label text not null,
  rate_percent numeric(5, 2) not null check (rate_percent >= 0),
  sort smallint not null
);

insert into public.vat_rates (code, label, rate_percent, sort) values
  ('S', 'Standard rate', 20, 1),
  ('R', 'Reduced rate', 5, 2),
  ('Z', 'Zero rated', 0, 3),
  ('E', 'Exempt', 0, 4),
  ('O', 'Outside the scope of VAT', 0, 5);

alter table public.vat_rates enable row level security;
create policy "staff read vat rates" on public.vat_rates
  for select to authenticated using ((select public.staff_role()) is not null);
grant select on public.vat_rates to authenticated;
grant all on public.vat_rates to service_role;

create table public.business_settings (
  organisation_id bigint primary key references public.organisations (id) on delete cascade,
  legal_name text,
  trading_name text,
  address text,
  company_number text,
  vat_registered boolean not null default false,
  vat_number text,
  vat_scheme text not null default 'standard'
    check (vat_scheme in ('standard', 'flat_rate', 'cash')),
  flat_rate_percent numeric(5, 2) check (flat_rate_percent is null or flat_rate_percent between 0 and 30),
  prices_include_vat boolean not null default true,
  invoice_prefix text not null default 'INV-' check (char_length(invoice_prefix) <= 10),
  next_invoice_number integer not null default 1 check (next_invoice_number >= 1),
  updated_at timestamptz not null default now(),
  constraint business_vat_number_format check (
    vat_number is null or vat_number ~ '^GB([0-9]{9}|[0-9]{12}|GD[0-9]{3}|HA[0-9]{3})$'
  ),
  constraint business_vat_needs_number check (not vat_registered or vat_number is not null),
  constraint business_flat_rate_needs_percent check (
    vat_scheme <> 'flat_rate' or flat_rate_percent is not null
  )
);

-- Every existing business starts with VAT off.
insert into public.business_settings (organisation_id)
select id from public.organisations
on conflict do nothing;

alter table public.business_settings enable row level security;

create policy "members read their business settings" on public.business_settings
  for select to authenticated
  using (organisation_id = (select private.current_organisation()));

create policy "administrators add their business settings" on public.business_settings
  for insert to authenticated
  with check (
    organisation_id = (select private.current_organisation())
    and (select private.is_admin())
  );

create policy "administrators change their business settings" on public.business_settings
  for update to authenticated
  using (
    organisation_id = (select private.current_organisation())
    and (select private.is_admin())
  )
  with check (
    organisation_id = (select private.current_organisation())
    and (select private.is_admin())
  );

revoke all on public.business_settings from anon, authenticated;
grant select on public.business_settings to authenticated;
grant insert (
  organisation_id, legal_name, trading_name, address, company_number, vat_registered,
  vat_number, vat_scheme, flat_rate_percent, prices_include_vat, invoice_prefix
) on public.business_settings to authenticated;
grant update (
  legal_name, trading_name, address, company_number, vat_registered, vat_number, vat_scheme,
  flat_rate_percent, prices_include_vat, invoice_prefix, updated_at
) on public.business_settings to authenticated;
grant all on public.business_settings to service_role;
