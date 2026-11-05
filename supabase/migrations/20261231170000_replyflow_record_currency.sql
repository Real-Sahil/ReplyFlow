-- A money record keeps the currency it was made in, and a business cannot change currency once it has records.
--
-- Until now a business's currency was only a setting the screens read, so changing it would have redrawn old
-- invoices, bills and the money book in the new currency with the same numbers. Invoices are evidence for the
-- accountant, so each record now carries its own currency, set by the database when it is created (never by the
-- sender). Existing rows are pounds, which is what every business used until now.
--
-- And because adding up records in two currencies needs exchange rates, a business that already has records
-- cannot change its currency at all. It is chosen before the first record.

do $$
declare
  t text;
begin
  foreach t in array array['invoices', 'money_entries', 'bills', 'expense_claims', 'orders', 'order_payments'] loop
    execute format(
      'alter table public.%I add column currency text not null default ''GBP'' check (currency ~ ''^[A-Z]{3}$'')', t);
  end loop;
end $$;

-- The business's own currency, from its configuration. Pounds when it has not chosen.
create or replace function private.organisation_currency(p_org bigint) returns text
  language sql stable security definer
  set search_path = ''
  as $$
  select coalesce(
    (select c.config ->> 'currency' from public.configuration c where c.organisation_id = p_org),
    'GBP')
$$;
revoke execute on function private.organisation_currency(bigint) from public, anon, authenticated;

create or replace function private.stamp_currency() returns trigger
  language plpgsql security definer
  set search_path = ''
  as $$
begin
  new.currency := private.organisation_currency(new.organisation_id);
  return new;
end;
$$;
revoke execute on function private.stamp_currency() from public, anon, authenticated;

do $$
declare
  t text;
begin
  foreach t in array array['invoices', 'money_entries', 'bills', 'expense_claims', 'orders', 'order_payments'] loop
    execute format(
      'create trigger "15_%s_currency" before insert on public.%I for each row execute function private.stamp_currency()', t, t);
  end loop;
end $$;

-- Whether the business already has records, so its currency can no longer change.
create or replace function private.has_money_records(p_org bigint) returns boolean
  language sql stable security definer
  set search_path = ''
  as $$
  select exists (select 1 from public.invoices where organisation_id = p_org)
      or exists (select 1 from public.money_entries where organisation_id = p_org)
      or exists (select 1 from public.bills where organisation_id = p_org)
      or exists (select 1 from public.expense_claims where organisation_id = p_org)
      or exists (select 1 from public.orders where organisation_id = p_org)
      or exists (select 1 from public.order_payments where organisation_id = p_org)
$$;
revoke execute on function private.has_money_records(bigint) from public, anon, authenticated;

create or replace function public.business_currency_locked() returns boolean
  language sql stable security definer
  set search_path = ''
  as $$
  select private.has_money_records(private.current_organisation())
$$;
revoke execute on function public.business_currency_locked() from public, anon;
grant execute on function public.business_currency_locked() to authenticated;

-- Refuse a currency change once there are records (the check from the markets migration, extended).
create or replace function private.configuration_market_check() returns trigger
  language plpgsql security definer
  set search_path = ''
  as $$
declare
  v_currency text := new.config ->> 'currency';
  v_market text := new.config ->> 'market';
begin
  if v_currency is not null and v_currency not in (
    'GBP','EUR','USD','CAD','AUD','NZD','CHF','SEK','NOK','DKK','PLN','CZK','ZAR','INR','AED','SGD','HKD','MXN'
  ) then
    raise exception 'That currency is not supported. Amounts need a currency with two decimal places.';
  end if;
  if v_market is not null and v_market not in (
    'GB','IE','US','CA','AU','NZ','DE','FR','NL','ES','IT','AE','ZA','IN','SG'
  ) then
    raise exception 'That market is not supported.';
  end if;
  if tg_op = 'UPDATE'
     and coalesce(v_currency, 'GBP') is distinct from coalesce(old.config ->> 'currency', 'GBP')
     and private.has_money_records(new.organisation_id) then
    raise exception 'This business already has records in %. Its currency cannot change, because that would relabel them. Ask us to move you to a new business in the other currency.',
      coalesce(old.config ->> 'currency', 'GBP');
  end if;
  return new;
end;
$$;

-- The views a screen reads carry the currency too.
create or replace view public.invoice_ledger
  with (security_invoker = on)
  as
select
  l.id as line_id,
  i.id as invoice_id,
  i.number,
  i.kind,
  i.issue_date,
  i.tax_point,
  i.due_date,
  i.order_id,
  i.order_reference,
  i.order_summary,
  i.order_note,
  i.note as document_note,
  i.customer_name,
  cf.number as credit_for_number,
  i.supplier_vat_number,
  i.vat_registered,
  l.position,
  l.description,
  l.quantity,
  l.vat_code,
  l.vat_percent,
  case when i.kind = 'credit_note' then -l.net_pence else l.net_pence end as net_pence,
  case when i.kind = 'credit_note' then -l.vat_pence else l.vat_pence end as vat_pence,
  case when i.kind = 'credit_note' then -l.gross_pence else l.gross_pence end as gross_pence,
  i.currency
from public.invoice_lines l
join public.invoices i on i.id = l.invoice_id
left join public.invoices cf on cf.id = i.credit_for_id;
