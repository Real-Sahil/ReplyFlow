-- Expense claims: flag likely duplicates, and tell the administrators about every claim.
--
-- DUPLICATES. The database marks a new claim when an earlier one (not rejected) is probably the same
-- spend: the same receipt photo (a hash of the file, from anyone in the business), or the same person
-- claiming the same amount within three days. A flag is only a flag: nothing is blocked, and the
-- administrator decides. Rows sent together in one sheet are checked against each other in the app,
-- because the database cannot see them until the statement ends.
--
-- ALERTS. After every insert (one alert per statement, so a sheet of 40 rows is one alert) the
-- database asks the claims_notify function to push a notification to the business's administrators
-- only. It uses the same Vault key as the weekly summary, runs after the claim is saved, and can never
-- make a claim fail.

alter table public.expense_claims
  add column receipt_hash text check (receipt_hash is null or receipt_hash ~ '^[0-9a-f]{64}$'),
  add column duplicate_of bigint references public.expense_claims (id) on delete set null,
  add column duplicate_reason text check (duplicate_reason is null or duplicate_reason in ('same_receipt', 'same_person_amount'));
create index expense_claims_receipt_hash_idx on public.expense_claims (organisation_id, receipt_hash) where receipt_hash is not null;
create index expense_claims_duplicate_of_idx on public.expense_claims (duplicate_of);

grant insert (receipt_hash) on public.expense_claims to authenticated;

create or replace function private.expense_claims_before_write() returns trigger
  language plpgsql security definer
  set search_path = ''
  as $$
declare
  v_staff bigint;
  v_other bigint;
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
    new.duplicate_of := null;
    new.duplicate_reason := null;
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

    -- Likely duplicates: the same receipt photo, then the same person and amount within three days.
    if new.receipt_hash is not null then
      select e.id into v_other from public.expense_claims e
       where e.organisation_id = new.organisation_id and e.receipt_hash = new.receipt_hash and e.status <> 'rejected'
       order by e.id limit 1;
      if v_other is not null then
        new.duplicate_of := v_other;
        new.duplicate_reason := 'same_receipt';
      end if;
    end if;
    if new.duplicate_of is null then
      select e.id into v_other from public.expense_claims e
       where e.claimant_id = v_staff and e.amount_pence = new.amount_pence
         and abs(e.claim_date - new.claim_date) <= 3 and e.status <> 'rejected'
       order by e.id limit 1;
      if v_other is not null then
        new.duplicate_of := v_other;
        new.duplicate_reason := 'same_person_amount';
      end if;
    end if;
  else
    new.organisation_id := old.organisation_id;
    new.claimant_id := old.claimant_id;
    new.updated_at := now();
    -- The flag and the photo hash are set once, at the start.
    new.receipt_hash := old.receipt_hash;
    new.duplicate_of := old.duplicate_of;
    new.duplicate_reason := old.duplicate_reason;
  end if;
  return new;
end;
$$;

-- One alert per statement. The row details are summed here so the function only has to word them.
create or replace function private.expense_claims_announce() returns trigger
  language plpgsql security definer
  set search_path = ''
  as $$
declare
  r record;
begin
  for r in
    select organisation_id, claimant_id, count(*) as n, sum(amount_pence) as total,
           count(*) filter (where duplicate_of is not null) as flagged
      from inserted
     group by organisation_id, claimant_id
  loop
    begin
      perform net.http_post(
        url := 'https://mdhmuyhtimjkysvsardi.supabase.co/functions/v1/claims_notify',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-autopilot-key', (select decrypted_secret from vault.decrypted_secrets where name = 'autopilot_key')
        ),
        body := jsonb_build_object(
          'organisation_id', r.organisation_id,
          'claimant_id', r.claimant_id,
          'count', r.n,
          'total_pence', r.total,
          'flagged', r.flagged
        )
      );
    exception when others then
      -- An alert that cannot be sent must never stop a claim being saved.
      null;
    end;
  end loop;
  return null;
end;
$$;
revoke execute on function private.expense_claims_announce() from public, anon, authenticated;

create trigger "80_expense_claims_announce" after insert on public.expense_claims
  referencing new table as inserted
  for each statement execute function private.expense_claims_announce();
