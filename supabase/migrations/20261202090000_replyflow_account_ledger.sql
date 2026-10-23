-- The account: one line per order that has been delivered and paid in full. The entry time
-- is the later of the delivery and the final payment. Price and paid amounts come from the
-- order itself. There is no VAT. Built as a view, so it always matches the orders and their
-- payments, and it respects the same row-level security as the orders.
create view public.account_ledger
    with (security_invoker = on)
    as
select
    o.id as order_id,
    o.reference,
    o.product_summary as product,
    trim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')) as customer,
    o.agreed_price_pence as price_pence,
    o.paid_pence,
    greatest(d.delivered_at, p.paid_at) as entry_at,
    d.delivered_at,
    p.paid_at
from public.orders o
join lateral (
    select max(h.changed_at) as delivered_at
    from public.order_status_history h
    where h.order_id = o.id and h.to_status in ('delivered', 'completed')
) d on d.delivered_at is not null
join lateral (
    select max(pay.received_at) as paid_at
    from public.order_payments pay
    where pay.order_id = o.id and pay.kind in ('deposit', 'balance')
) p on p.paid_at is not null
left join public.contacts c on c.id = o.contact_id
where o.agreed_price_pence > 0
  and o.balance_pence <= 0;

grant select on public.account_ledger to authenticated;
grant select on public.account_ledger to service_role;
