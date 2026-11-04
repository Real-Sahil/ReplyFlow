-- Accountant access and a month lock.
--
-- ACCOUNTANT. A sign-in that can read the finance records of one business and nothing else, and
-- change nothing. How it is kept apart: almost every existing rule grants "any signed-in staff", so
-- private.staff_role() now answers NULL for an accountant. Every one of those rules (customers,
-- messages, posts, products, notes, tasks, every write) then refuses them without being touched.
-- Their read access is added back, table by table, in the policies below, for finance only.
-- Wages and other private money categories are visible to them, because an accountant needs them.
--
-- BOOKS LOCK. business_settings.books_locked_until: nothing dated on or before that day can be added
-- to or changed in invoices, supplier bills, the money book or customer payments. Marking an old bill
-- as paid later is still allowed. An administrator moves or clears the date.

alter table public.sales drop constraint if exists sales_role_check;
alter table public.sales
  add constraint sales_role_check check (role in ('admin', 'agent', 'viewer', 'accountant'));

create or replace function private.staff_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case when s.role = 'accountant' then null else s.role end
  from public.sales s
  where s.user_id = (select auth.uid()) and not s.disabled
  limit 1
$$;

create or replace function private.is_accountant()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.sales s
    where s.user_id = (select auth.uid()) and not s.disabled and s.role = 'accountant'
  )
$$;
revoke execute on function private.is_accountant() from public, anon;
grant execute on function private.is_accountant() to authenticated, service_role;

create or replace function private.can_use_money_category(p_category text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select not c.admin_only or (select private.is_admin()) or (select private.is_accountant())
     from public.money_categories c where c.code = p_category),
    false)
$$;

-- What an accountant can read: their own row (so the app knows who they are), their business's
-- settings, and the finance records.
create policy "accountant reads own row" on public.sales
  for select to authenticated
  using (user_id = (select auth.uid()) and (select private.is_accountant()));

create policy "accountant reads configuration" on public.configuration
  for select to authenticated
  using ((select private.is_accountant()) and organisation_id = (select private.current_organisation()));

create policy "accountant reads invoices" on public.invoices
  for select to authenticated
  using ((select private.is_accountant()) and organisation_id = (select private.current_organisation()));

create policy "accountant reads invoice lines" on public.invoice_lines
  for select to authenticated
  using ((select private.is_accountant()) and organisation_id = (select private.current_organisation()));

create policy "accountant reads bills" on public.bills
  for select to authenticated
  using ((select private.is_accountant()) and organisation_id = (select private.current_organisation()));

create policy "accountant reads money entries" on public.money_entries
  for select to authenticated
  using (
    (select private.is_accountant())
    and organisation_id = (select private.current_organisation())
    and (select private.can_use_money_category(category))
  );

create policy "accountant reads customer payments" on public.order_payments
  for select to authenticated
  using ((select private.is_accountant()) and organisation_id = (select private.current_organisation()));

create policy "accountant reads orders" on public.orders
  for select to authenticated
  using ((select private.is_accountant()) and organisation_id = (select private.current_organisation()));

create policy "accountant reads money categories" on public.money_categories
  for select to authenticated using ((select private.is_accountant()));
create policy "accountant reads expense categories" on public.expense_categories
  for select to authenticated using ((select private.is_accountant()));
create policy "accountant reads vat rates" on public.vat_rates
  for select to authenticated using ((select private.is_accountant()));

-- Receipts and attachments in their own business's folder, to open the evidence behind an entry.
create policy "accountant reads attachments" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'attachments'
    and (select private.is_accountant())
    and (storage.foldername(name))[1] = (select private.current_organisation())::text
  );

-- BOOKS LOCK ---------------------------------------------------------------------------------------
alter table public.business_settings add column books_locked_until date;
grant insert (books_locked_until), update (books_locked_until) on public.business_settings to authenticated;

-- TG_ARGV[0]: the dates that decide whether a record is in a locked period (comma separated).
-- TG_ARGV[1] is no longer used: what may still change on a locked record is listed in the function.
create or replace function private.enforce_books_lock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lock date;
  v_org bigint;
  v_dates text[] := string_to_array(tg_argv[0], ',');
  v_protected text[];
  v_row jsonb;
  v_col text;
  v_day date;
  v_i int;
begin
  -- OLD does not exist for an insert and NEW does not for a delete, so each is read only when it does.
  v_org := case when tg_op = 'DELETE' then old.organisation_id else new.organisation_id end;
  select s.books_locked_until into v_lock
  from public.business_settings s where s.organisation_id = v_org;
  if v_lock is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  -- A record already in a locked period may still have its payment details filled in (for example an
  -- October bill marked as paid in November). Changing any of the fields below counts as changing the
  -- period, so is refused. Fields the database keeps up to date itself are not on the list.
  v_protected := case tg_table_name
    when 'bills' then array['bill_date', 'supplier_name', 'supplier_vat_number', 'reference', 'category',
      'description', 'order_id', 'vat_code', 'net_pence', 'vat_pence', 'vat_reclaimable', 'voided_at', 'void_reason']
    when 'money_entries' then array['direction', 'category', 'status', 'entry_date', 'period_from', 'period_to',
      'amount_pence', 'counterparty', 'payment_method', 'reference', 'channel', 'order_id', 'regulated',
      'vat_code', 'vat_pence', 'note', 'voided_at', 'void_reason']
    else null
  end;
  if tg_op = 'UPDATE' and v_protected is not null then
    if not exists (
      select 1 from unnest(v_protected) as k
      where (to_jsonb(new) -> k) is distinct from (to_jsonb(old) -> k)
    ) then
      return new;
    end if;
  end if;

  for v_i in 1..2 loop
    v_row := case v_i
      when 1 then case when tg_op = 'INSERT' then null else to_jsonb(old) end
      else case when tg_op = 'DELETE' then null else to_jsonb(new) end
    end;
    continue when v_row is null;
    foreach v_col in array v_dates loop
      v_day := nullif(left(v_row ->> v_col, 10), '')::date;
      if v_day is not null and v_day <= v_lock then
        raise exception 'These books are locked up to %. Ask an administrator to move the lock date first.',
          to_char(v_lock, 'DD Mon YYYY')
          using errcode = 'check_violation';
      end if;
    end loop;
  end loop;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke execute on function private.enforce_books_lock() from public, anon, authenticated;

create trigger "20_books_lock" before insert or update on public.bills
  for each row execute function private.enforce_books_lock('bill_date', 'paid_date,payment_method,receipt_path,note,updated_at');
create trigger "20_books_lock" before insert or update on public.money_entries
  for each row execute function private.enforce_books_lock('entry_date', 'receipt_path,updated_at');
create trigger "20_books_lock" before insert on public.invoices
  for each row execute function private.enforce_books_lock('issue_date');
create trigger "20_books_lock" before insert on public.order_payments
  for each row execute function private.enforce_books_lock('received_at');
