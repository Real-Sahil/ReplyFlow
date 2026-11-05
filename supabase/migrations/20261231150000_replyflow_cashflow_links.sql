-- Cash flow: no double counting of a repeating retainer and its invoice, and "leave this out".
--
-- 1. Planned money-book entries made by a repeating item now remember which item made them
--    (money_entries.recurring_item_id). A repeating INVOICE can be linked to the repeating money-in item that
--    stands for the same retainer. When an invoice has been issued from it for a month, the planned entry of
--    that month is left out of the cash-flow forecast, because the invoice (what the customer owes) now
--    stands for that money.
-- 2. An administrator can leave a line out of the forecast (a planned entry, a bill or what one customer
--    owes), and put it back. That is remembered per business, and changes nothing in the books.

alter table public.money_entries
  add column recurring_item_id bigint references public.recurring_items (id) on delete set null;
create index money_entries_recurring_item_idx on public.money_entries (recurring_item_id);

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
  e.vat_code, e.vat_pence, e.recurring_item_id
from public.money_entries e
join public.money_categories c on c.code = e.category
left join public.orders o on o.id = e.order_id;

create or replace function private.generate_recurring(p_org bigint, p_horizon date)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.recurring_items;
  v_user uuid;
  v_next date;
  v_made int := 0;
  v_added int;
  v_label text;
begin
  for r in
    select * from public.recurring_items
     where active and next_date <= p_horizon and (p_org is null or organisation_id = p_org)
     order by organisation_id, id
     for update skip locked
  loop
    -- The person who created it if they can still sign in, otherwise any administrator of the business.
    select s.user_id into v_user from public.sales s
     where s.id = r.created_by and not s.disabled and s.administrator limit 1;
    if v_user is null then
      select s.user_id into v_user from public.sales s
       where s.organisation_id = r.organisation_id and s.administrator and not s.disabled order by s.id limit 1;
    end if;
    if v_user is null then
      update public.recurring_items set last_error = 'No administrator can sign in to add this.' where id = r.id;
      continue;
    end if;
    perform set_config('request.jwt.claim.sub', v_user::text, true);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_user, 'role', 'authenticated')::text, true);

    v_added := 0;
    while r.next_date <= p_horizon and (r.end_date is null or r.next_date <= r.end_date) loop
      begin
        if r.kind = 'bill' then
          insert into public.bills
            (supplier_name, bill_date, due_date, category, description, vat_code, net_pence, vat_pence, vat_reclaimable, note)
          values
            (coalesce(nullif(trim(r.counterparty), ''), r.title), r.next_date, r.next_date + r.due_days, r.category,
             r.title, case when r.vat_pence > 0 then 'S' else 'O' end, r.amount_pence, r.vat_pence, true, r.note);
        else
          v_label := coalesce(nullif(trim(r.note), ''), r.title);
          insert into public.money_entries
            (direction, category, status, entry_date, amount_pence, counterparty, payment_method, note, recurring_item_id)
          values
            (case r.kind when 'money_in' then 'in' else 'out' end, r.category, 'planned', r.next_date, r.amount_pence,
             nullif(trim(r.counterparty), ''), r.payment_method,
             case when char_length(v_label) >= 3 then v_label else r.title end, r.id);
        end if;
        v_added := v_added + 1;
        r.last_generated_on := r.next_date;
        r.next_date := private.next_occurrence(r.next_date, r.frequency, r.anchor_day);
        r.last_error := null;
      exception when others then
        r.last_error := 'Could not add the ' || to_char(r.next_date, 'DD Mon YYYY') || ' entry: ' || sqlerrm;
        exit;
      end;
    end loop;

    update public.recurring_items
       set next_date = r.next_date, last_generated_on = r.last_generated_on, last_error = r.last_error
     where id = r.id;
    v_made := v_made + v_added;
  end loop;
  return v_made;
end;
$$;
revoke execute on function private.generate_recurring(bigint, date) from public, anon, authenticated;
grant execute on function private.generate_recurring(bigint, date) to service_role;

alter table public.recurring_invoices
  add column recurring_item_id bigint references public.recurring_items (id) on delete set null;
create index recurring_invoices_item_idx on public.recurring_invoices (recurring_item_id);
grant insert (recurring_item_id) on public.recurring_invoices to authenticated;

create or replace function private.recurring_invoices_link_check() returns trigger
  language plpgsql security definer
  set search_path = ''
  as $$
begin
  if tg_op = 'UPDATE' then
    new.recurring_item_id := old.recurring_item_id;
  elsif new.recurring_item_id is not null and not exists (
    select 1 from public.recurring_items r
     where r.id = new.recurring_item_id and r.organisation_id = new.organisation_id and r.kind = 'money_in'
  ) then
    raise exception 'That is not a repeating money-in item of your business.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function private.recurring_invoices_link_check() from public, anon, authenticated;
create trigger "20_recurring_invoices_link_check" before insert or update on public.recurring_invoices
  for each row execute function private.recurring_invoices_link_check();

create table public.forecast_exclusions (
  id bigint generated by default as identity primary key,
  organisation_id bigint not null references public.organisations (id),
  source text not null check (source in ('planned', 'bill', 'customer')),
  ref_id bigint not null,
  created_by bigint references public.sales (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint forecast_exclusions_once unique (organisation_id, source, ref_id)
);
create index forecast_exclusions_created_by_idx on public.forecast_exclusions (created_by);

create or replace function private.forecast_exclusions_before_write() returns trigger
  language plpgsql security definer
  set search_path = ''
  as $$
declare
  v_ok boolean;
begin
  new.organisation_id := private.current_organisation();
  new.created_by := private.staff_id();
  if new.organisation_id is null or not private.is_admin() then
    raise exception 'Only an administrator can do this.' using errcode = '42501';
  end if;
  v_ok := case new.source
    when 'planned' then exists (select 1 from public.money_entries e where e.id = new.ref_id and e.organisation_id = new.organisation_id)
    when 'bill' then exists (select 1 from public.bills b where b.id = new.ref_id and b.organisation_id = new.organisation_id)
    else exists (select 1 from public.orders o where o.id = new.ref_id and o.organisation_id = new.organisation_id)
  end;
  if not v_ok then
    raise exception 'That line belongs to another business.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function private.forecast_exclusions_before_write() from public, anon, authenticated;
create trigger "10_forecast_exclusions_before_write" before insert on public.forecast_exclusions
  for each row execute function private.forecast_exclusions_before_write();
create trigger "90_forecast_exclusions_audit" after insert or update or delete on public.forecast_exclusions
  for each row execute function private.audit_row();

alter table public.forecast_exclusions enable row level security;
create policy "administrators read forecast exclusions" on public.forecast_exclusions for select to authenticated
  using (organisation_id = (select private.current_organisation()) and (select private.is_admin()));
create policy "administrators add forecast exclusions" on public.forecast_exclusions for insert to authenticated
  with check (organisation_id = (select private.current_organisation()) and (select private.is_admin()));
create policy "administrators remove forecast exclusions" on public.forecast_exclusions for delete to authenticated
  using (organisation_id = (select private.current_organisation()) and (select private.is_admin()));
grant select, delete on public.forecast_exclusions to authenticated;
grant insert (source, ref_id) on public.forecast_exclusions to authenticated;
grant all on public.forecast_exclusions to service_role;
