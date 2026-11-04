-- The money book: every movement of money into or out of a business that is not an invoice or a
-- supplier bill, entered whenever it happens. Wages and pay, tax and other regulated payments,
-- owner drawings, loans, sales taken outside invoices (e-commerce, Facebook, email, phone),
-- refunds and any cost. No schedule, no frequency.
--
-- Rules that make it usable as a record:
--   * Every entry needs a note (at least 3 characters), so it explains itself in a report.
--   * An entry can be planned (expected, not yet happened) and later marked done.
--   * Entries are never deleted: a wrong one is voided with a reason, and every change is audited.
--   * The organisation and the author are set by the database, never taken from the browser.
--   * Wages and other private categories can be read and written by administrators only.
--   * Regulated payments (VAT, PAYE and National Insurance, pensions, licences) are recorded only.
--     Nothing here calculates or files them.

create table public.money_categories (
  code text primary key,
  label text not null,
  direction text not null check (direction in ('in', 'out')),
  grp text not null,
  regulated boolean not null default false,
  admin_only boolean not null default false,
  sort smallint not null
);

insert into public.money_categories (code, label, direction, grp, regulated, admin_only, sort) values
  ('sales_other',      'Sales taken outside invoices',          'in',  'Money in',          false, false, 1),
  ('refund_received',  'Refund received from a supplier',       'in',  'Money in',          false, false, 2),
  ('other_income',     'Other income',                          'in',  'Money in',          false, false, 3),
  ('loan_received',    'Loan received',                         'in',  'Owner and finance', false, false, 4),
  ('owner_invested',   'Money put in by the owner',             'in',  'Owner and finance', false, false, 5),
  ('transfer_in',      'Transfer in',                           'in',  'Owner and finance', false, false, 6),
  ('stock',            'Stock and materials bought',            'out', 'Stock and production', false, false, 10),
  ('production',       'Production costs',                      'out', 'Stock and production', false, false, 11),
  ('packaging_out',    'Packaging',                             'out', 'Stock and production', false, false, 12),
  ('delivery_out',     'Delivery and courier',                  'out', 'Stock and production', false, false, 13),
  ('wages',            'Wages and salaries',                    'out', 'People',            true,  true,  20),
  ('contractors',      'Contractors and freelancers',           'out', 'People',            false, false, 21),
  ('staff_costs',      'Other staff costs',                     'out', 'People',            false, true,  22),
  ('tax_vat',          'VAT paid to HMRC',                      'out', 'Tax and regulated', true,  false, 30),
  ('tax_paye_ni',      'PAYE and National Insurance paid',      'out', 'Tax and regulated', true,  false, 31),
  ('tax_corporation',  'Corporation tax paid',                  'out', 'Tax and regulated', true,  false, 32),
  ('tax_income',       'Income tax (self assessment) paid',     'out', 'Tax and regulated', true,  false, 33),
  ('pension',          'Pension contributions',                 'out', 'Tax and regulated', true,  true,  34),
  ('licences',         'Licences, fees and rates',              'out', 'Tax and regulated', true,  false, 35),
  ('insurance_out',    'Insurance',                             'out', 'Running costs',     false, false, 40),
  ('rent',             'Rent and utilities',                    'out', 'Running costs',     false, false, 41),
  ('software_out',     'Software and subscriptions',            'out', 'Running costs',     false, false, 42),
  ('advertising_out',  'Advertising and marketing',             'out', 'Running costs',     false, false, 43),
  ('travel_out',       'Travel and vehicle',                    'out', 'Running costs',     false, false, 44),
  ('office_out',       'Office costs',                          'out', 'Running costs',     false, false, 45),
  ('professional_out', 'Professional fees',                     'out', 'Running costs',     false, false, 46),
  ('bank_out',         'Bank and card charges',                 'out', 'Running costs',     false, false, 47),
  ('equipment_out',    'Equipment and repairs',                 'out', 'Running costs',     false, false, 48),
  ('refund_paid',      'Refund paid to a customer',             'out', 'Money out',         false, false, 50),
  ('other_out',        'Other cost',                            'out', 'Money out',         false, false, 51),
  ('drawings',         'Owner drawings',                        'out', 'Owner and finance', false, false, 60),
  ('loan_repaid',      'Loan repayment',                        'out', 'Owner and finance', false, false, 61),
  ('transfer_out',     'Transfer out',                          'out', 'Owner and finance', false, false, 62);

alter table public.money_categories enable row level security;
create policy "staff read money categories" on public.money_categories
  for select to authenticated using ((select public.staff_role()) is not null);
grant select on public.money_categories to authenticated;
grant all on public.money_categories to service_role;

create table public.money_entries (
  id bigint generated by default as identity primary key,
  organisation_id bigint not null references public.organisations (id),
  created_by bigint references public.sales (id) on delete set null,
  direction text not null check (direction in ('in', 'out')),
  category text not null references public.money_categories (code),
  status text not null default 'done' check (status in ('planned', 'done')),
  entry_date date not null,
  period_from date,
  period_to date,
  amount_pence bigint not null check (amount_pence > 0),
  counterparty text,
  payment_method text check (payment_method in ('cash', 'card', 'bank_transfer', 'other')),
  reference text,
  channel text check (channel in ('ecommerce', 'facebook', 'email', 'phone', 'in_person', 'other')),
  order_id bigint references public.orders (id) on delete set null,
  regulated boolean not null default false,
  receipt_path text,
  note text not null check (char_length(trim(note)) >= 3),
  voided_at timestamptz,
  void_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint money_period_order check (period_from is null or period_to is null or period_to >= period_from),
  constraint money_void_has_reason check (voided_at is null or void_reason is not null)
);
create index money_entries_org_date_idx on public.money_entries (organisation_id, entry_date desc);
create index money_entries_order_idx on public.money_entries (order_id);

create or replace function private.money_entries_before_write() returns trigger
  language plpgsql security definer
  set search_path = ''
  as $$
declare
  v_dir text;
begin
  if tg_op = 'INSERT' then
    new.organisation_id := private.current_organisation();
    new.created_by := private.staff_id();
    if new.organisation_id is null then
      raise exception 'Only staff can add entries.' using errcode = '42501';
    end if;
  else
    new.organisation_id := old.organisation_id;
    new.created_by := old.created_by;
    new.updated_at := now();
  end if;
  select direction into v_dir from public.money_categories where code = new.category;
  if v_dir is distinct from new.direction then
    raise exception 'That category is for money going %, not %.', v_dir, new.direction;
  end if;
  if new.order_id is not null and not exists (
    select 1 from public.orders o where o.id = new.order_id and o.organisation_id = new.organisation_id
  ) then
    raise exception 'That order belongs to another business.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function private.money_entries_before_write() from public, anon, authenticated;

create trigger "10_money_entries_before_write"
  before insert or update on public.money_entries
  for each row execute function private.money_entries_before_write();
create trigger "90_money_entries_audit"
  after insert or update or delete on public.money_entries
  for each row execute function private.audit_row();

alter table public.money_entries enable row level security;

-- Private categories (wages, pension, other staff costs) are for administrators only.
create or replace function private.can_use_money_category(p_category text) returns boolean
  language sql stable security definer
  set search_path = ''
  as $$
  select coalesce(
    (select not c.admin_only or (select private.is_admin())
     from public.money_categories c where c.code = p_category),
    false)
$$;
revoke execute on function private.can_use_money_category(text) from public, anon;
grant execute on function private.can_use_money_category(text) to authenticated, service_role;

create policy "staff read their money entries" on public.money_entries
  for select to authenticated
  using (
    organisation_id = (select private.current_organisation())
    and (select public.staff_role()) is not null
    and (select private.can_use_money_category(category))
  );
create policy "staff add money entries" on public.money_entries
  for insert to authenticated
  with check (
    (select public.staff_role()) in ('admin', 'agent')
    and (select private.can_use_money_category(category))
  );
create policy "staff change their money entries" on public.money_entries
  for update to authenticated
  using (
    organisation_id = (select private.current_organisation())
    and (select public.staff_role()) in ('admin', 'agent')
    and (select private.can_use_money_category(category))
  )
  with check (
    organisation_id = (select private.current_organisation())
    and (select private.can_use_money_category(category))
  );

revoke all on public.money_entries from anon, authenticated;
grant select on public.money_entries to authenticated;
grant insert (
  direction, category, status, entry_date, period_from, period_to, amount_pence, counterparty,
  payment_method, reference, channel, order_id, regulated, receipt_path, note
) on public.money_entries to authenticated;
grant update (
  direction, category, status, entry_date, period_from, period_to, amount_pence, counterparty,
  payment_method, reference, channel, order_id, regulated, receipt_path, note, voided_at, void_reason
) on public.money_entries to authenticated;
grant all on public.money_entries to service_role;

create view public.money_ledger
  with (security_invoker = on)
  as
select
  e.id, e.direction, e.category, c.label as category_label, c.grp as category_group,
  e.status, e.entry_date, e.period_from, e.period_to, e.amount_pence, e.counterparty,
  e.payment_method, e.reference, e.channel, e.order_id, o.reference as order_reference,
  o.product_summary as order_summary, o.notes as order_note, e.regulated, e.receipt_path,
  e.note, e.voided_at, e.void_reason,
  case when e.voided_at is not null then 'void' else e.status end as state
from public.money_entries e
join public.money_categories c on c.code = e.category
left join public.orders o on o.id = e.order_id;

grant select on public.money_ledger to authenticated;
grant select on public.money_ledger to service_role;

-- The audit log is readable by all staff of a business, and an entry's history carries its amount
-- and note. Wages must not leak that way, so the history of money entries is for administrators.
alter policy "staff read" on public.audit_log
  using (
    (select public.staff_role()) is not null
    and organisation_id = (select private.current_organisation())
    and (table_name <> 'money_entries' or (select private.is_admin()))
  );
