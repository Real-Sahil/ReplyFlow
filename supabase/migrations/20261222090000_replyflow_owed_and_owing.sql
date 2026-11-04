-- Money owed to a business by customers, and money it owes to suppliers.
--
-- Customers pay against orders (order_payments keeps orders.paid_pence), so what a customer owes is
-- what has been invoiced for the order, less any credit notes, less what has been paid. Nothing new
-- is stored and no payment is entered twice: both views read what is already recorded. They run
-- with the caller's rights, so each business sees only its own rows.
create view public.owed_by_customers with (security_invoker = on) as
select
  o.id as order_id,
  o.reference as order_reference,
  o.contact_id,
  max(i.customer_name) as customer_name,
  sum(case when i.kind = 'invoice' then i.gross_pence else -i.gross_pence end)::bigint as invoiced_pence,
  o.paid_pence::bigint as paid_pence,
  (sum(case when i.kind = 'invoice' then i.gross_pence else -i.gross_pence end) - o.paid_pence)::bigint as owed_pence,
  min(i.due_date) filter (where i.kind = 'invoice') as due_date,
  max(i.number) filter (where i.kind = 'invoice') as latest_invoice_number
from public.orders o
join public.invoices i on i.order_id = o.id
group by o.id, o.reference, o.contact_id, o.paid_pence
having sum(case when i.kind = 'invoice' then i.gross_pence else -i.gross_pence end) - o.paid_pence > 0;

create view public.owed_to_suppliers with (security_invoker = on) as
select
  b.id,
  b.supplier_name,
  b.reference,
  b.description,
  b.bill_date,
  b.due_date,
  b.gross_pence::bigint as owed_pence,
  b.order_id
from public.bills b
where b.voided_at is null and b.paid_date is null;

grant select on public.owed_by_customers to authenticated;
grant select on public.owed_to_suppliers to authenticated;
