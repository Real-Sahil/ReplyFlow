-- A sheet of claims can hold up to 100 rows, so the daily limit is 100 (it was 20).

create or replace function private.expense_claims_before_write() returns trigger
  language plpgsql security definer
  set search_path = ''
  as $$
declare
  v_staff bigint;
begin
  if tg_op = 'INSERT' then
    v_staff := private.staff_id();
    if v_staff is null or not private.is_claimant() then
      raise exception 'Only an expenses sign-in can submit a claim.' using errcode = '42501';
    end if;
    new.organisation_id := private.current_organisation();
    new.claimant_id := v_staff;
    new.status := 'pending';
    new.decided_by := null;
    new.decided_at := null;
    new.decision_note := null;
    new.paid_at := null;
    new.paid_entry_id := null;
    if new.claim_date > current_date + 1 or new.claim_date < current_date - 366 then
      raise exception 'The date of the spend must be within the last year and not in the future.';
    end if;
    if not exists (
      select 1 from public.money_categories c
      where c.code = new.category and c.direction = 'out' and not c.admin_only
        and c.code in ('stock', 'travel_out', 'office_out', 'equipment_out', 'software_out',
                       'advertising_out', 'delivery_out', 'packaging_out', 'production',
                       'professional_out', 'other_out')
    ) then
      raise exception 'That category cannot be claimed.';
    end if;
    -- A receipt photo must be in this person's own folder.
    if new.receipt_path is not null and new.receipt_path not like
       new.organisation_id::text || '/claims/' || v_staff::text || '/%' then
      raise exception 'The receipt must be one you uploaded.' using errcode = '42501';
    end if;
    -- A limit that stops a slip or a runaway script (a sheet may hold up to 100 claims), not a control on honest use.
    if (select count(*) from public.expense_claims e
        where e.claimant_id = v_staff and e.created_at > now() - interval '24 hours') >= 100 then
      raise exception 'That is a lot of claims for one day. Please try again tomorrow.';
    end if;
  else
    new.organisation_id := old.organisation_id;
    new.claimant_id := old.claimant_id;
    new.updated_at := now();
  end if;
  return new;
end;
$$;
