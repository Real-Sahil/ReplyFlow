-- VAT on money-book entries, and one combined cash book.
--
-- A VAT-registered business that takes sales outside invoices (Facebook, e-commerce, phone) or
-- pays a cost with VAT through the money book needs that VAT in its return workings. vat_pence is
-- the part of the amount that is VAT, as it appears on the sale or the receipt; vat_code says
-- which rate. Both default to none, so a business without VAT is unaffected.
--
-- cash_book lists everything that moved, or is planned to move, in one place, whatever recorded
-- it: customer payments on orders, supplier bills (paid, or planned until paid) and money-book
-- entries. Each row keeps its note and the order it belongs to. It reads the same tables as
-- before, so it follows the same row-level security, including who can see wages.

alter table public.money_entries
  add column vat_code text not null default 'O' references public.vat_rates (code),
  add column vat_pence bigint not null default 0 check (vat_pence >= 0),
  add constraint money_vat_within_amount check (vat_pence <= amount_pence);

grant insert (vat_code, vat_pence) on public.money_entries to authenticated;
grant update (vat_code, vat_pence) on public.money_entries to authenticated;

create or replace view public.money_ledger
  with (security_invoker = on)
  as
select
  e.id, e.direction, e.category, c.label as category_label, c.grp as category_group,
  e.status, e.entry_date, e.period_from, e.period_to, e.amount_pence, e.counterparty,
  e.payment_method, e.reference, e.channel, e.order_id, o.reference as order_reference,
  o.product_summary as order_summary, o.notes as order_note, e.regulated, e.receipt_path,
  e.note, e.voided_at, e.void_reason,
  case when e.voided_at is not null then 'void' else e.status end as state,
  e.vat_code, e.vat_pence
from public.money_entries e
join public.money_categories c on c.code = e.category
left join public.orders o on o.id = e.order_id;

create view public.cash_book
  with (security_invoker = on)
  as
select
  'order_payment'::text as source,
  p.id as source_id,
  p.received_at::date as entry_date,
  case when p.kind = 'security_refund' then 'out' else 'in' end::text as direction,
  'Customer payments'::text as category_group,
  case p.kind
    when 'deposit' then 'Deposit from a customer'
    when 'balance' then 'Balance from a customer'
    when 'security_deposit' then 'Security deposit held'
    else 'Security deposit returned' end::text as category_label,
  'done'::text as state,
  p.amount_pence,
  nullif(trim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')), '')::text as counterparty,
  p.method::text as payment_method,
  o.reference::text as reference,
  null::text as channel,
  o.id as order_id,
  o.reference::text as order_reference,
  o.product_summary::text as order_summary,
  o.notes::text as order_note,
  false as regulated,
  null::text as receipt_path,
  coalesce(nullif(trim(p.note), ''), 'Payment recorded on ' || o.reference)::text as note,
  null::text as void_reason,
  0::bigint as vat_pence
from public.order_payments p
join public.orders o on o.id = p.order_id
left join public.contacts c on c.id = o.contact_id
union all
select
  'bill', b.id, coalesce(b.paid_date, b.due_date, b.bill_date), 'out', 'Supplier bills and expenses',
  ec.label,
  case when b.voided_at is not null then 'void' when b.paid_date is not null then 'done' else 'planned' end,
  b.gross_pence, b.supplier_name, b.payment_method, b.reference, null, b.order_id, o.reference,
  o.product_summary, o.notes, false, b.receipt_path,
  trim(b.description || coalesce(' - ' || nullif(trim(b.note), ''), '')), b.void_reason,
  case when b.vat_reclaimable then b.vat_pence else 0 end
from public.bills b
join public.expense_categories ec on ec.code = b.category
left join public.orders o on o.id = b.order_id
union all
select
  'entry', e.id, e.entry_date, e.direction, c.grp, c.label,
  case when e.voided_at is not null then 'void' else e.status end,
  e.amount_pence, e.counterparty, e.payment_method, e.reference, e.channel, e.order_id, o.reference,
  o.product_summary, o.notes, e.regulated, e.receipt_path, e.note, e.void_reason, e.vat_pence
from public.money_entries e
join public.money_categories c on c.code = e.category
left join public.orders o on o.id = e.order_id;

grant select on public.cash_book to authenticated;
grant select on public.cash_book to service_role;
