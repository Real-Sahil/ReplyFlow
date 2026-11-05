-- Customer statements: every invoice, credit note and payment for a customer in one list. It reads what is
-- already recorded (invoices, credit notes and the payments on orders), so nothing is entered twice, and it
-- is visible only to people who can already see those records (security_invoker). Security deposits and
-- their refunds are left out: they are held for the customer, not part of what they owe.

create or replace view public.customer_statement_lines
with (security_invoker = on)
as
select
  i.organisation_id,
  coalesce(i.contact_id, o.contact_id) as contact_id,
  i.issue_date as line_date,
  i.kind as kind,
  i.number as reference,
  o.reference as order_reference,
  i.order_id,
  i.due_date,
  case when i.kind = 'invoice' then i.gross_pence else 0::bigint end as debit_pence,
  case when i.kind = 'credit_note' then i.gross_pence else 0::bigint end as credit_pence,
  case when i.kind = 'invoice' then 1 else 2 end as sort_order,
  i.id as source_id
from public.invoices i
join public.orders o on o.id = i.order_id
union all
select
  p.organisation_id,
  o.contact_id,
  p.received_at::date as line_date,
  'payment' as kind,
  null::text as reference,
  o.reference as order_reference,
  p.order_id,
  null::date as due_date,
  0::bigint as debit_pence,
  p.amount_pence as credit_pence,
  3 as sort_order,
  p.id as source_id
from public.order_payments p
join public.orders o on o.id = p.order_id
where p.kind in ('deposit', 'balance');

grant select on public.customer_statement_lines to authenticated;
