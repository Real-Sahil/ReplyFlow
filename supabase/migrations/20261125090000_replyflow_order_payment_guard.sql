-- The database enforces the payment rules too, not only the order screen: a payment for
-- the goods cannot exceed the balance due, and a refund cannot exceed the security deposit held.
create or replace function public.check_order_payment() returns trigger
    language plpgsql security definer
    set search_path = ''
    as $$
declare
    agreed bigint;
    paid bigint;
    held bigint;
begin
    select coalesce(o.agreed_price_pence, 0) into agreed from public.orders o where o.id = new.order_id;
    select coalesce(sum(p.amount_pence), 0) into paid
    from public.order_payments p where p.order_id = new.order_id and p.kind in ('deposit', 'balance');
    select coalesce(sum(case when p.kind = 'security_deposit' then p.amount_pence else -p.amount_pence end), 0)
    into held
    from public.order_payments p where p.order_id = new.order_id and p.kind in ('security_deposit', 'security_refund');

    if new.kind in ('deposit', 'balance') and paid + new.amount_pence > agreed then
        raise exception 'This payment is more than the balance still due.' using errcode = 'check_violation';
    end if;
    if new.kind = 'security_refund' and new.amount_pence > held then
        raise exception 'The refund is more than the security deposit held.' using errcode = 'check_violation';
    end if;
    return new;
end;
$$;

revoke execute on function public.check_order_payment() from public, anon, authenticated;

create trigger "30_order_payments_check"
    before insert on public.order_payments
    for each row execute function public.check_order_payment();
