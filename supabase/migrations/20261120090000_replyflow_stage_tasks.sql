-- A task for the deal owner when a deal enters a stage. Rules are set per stage by an
-- administrator. Stage tasks are automatic, so the existing progress trigger clears them
-- when the deal moves on or a note is recorded.

create table public.stage_task_rules (
    stage text primary key,
    task_text text not null,
    due_days integer not null default 2 check (due_days >= 0),
    enabled boolean not null default true,
    updated_at timestamptz not null default now()
);

create trigger "10_stage_task_rules_set_updated_at"
    before update on public.stage_task_rules
    for each row execute function public.set_updated_at();

alter table public.stage_task_rules enable row level security;
create policy "staff read" on public.stage_task_rules
    for select to authenticated using ((select public.staff_role()) is not null);
create policy "administrators write" on public.stage_task_rules
    for all to authenticated
    using (exists (select 1 from public.sales s where s.user_id = auth.uid() and s.administrator = true))
    with check (exists (select 1 from public.sales s where s.user_id = auth.uid() and s.administrator = true));
grant select on public.stage_task_rules to authenticated;
grant all on public.stage_task_rules to service_role;

-- Starting rules. Placeholders: change the wording and days in the table.
insert into public.stage_task_rules (stage, task_text, due_days) values
    ('in-negociation', 'Agree the deposit and the delivery date', 2),
    ('delayed', 'Call the customer to agree a new date', 7);

create or replace function public.on_deal_stage_task() returns trigger
    language plpgsql security definer
    set search_path = ''
    as $$
begin
    if new.archived_at is not null then
        return new;
    end if;
    if tg_op = 'UPDATE' and new.stage is not distinct from old.stage then
        return new;
    end if;

    insert into public.tasks (contact_id, deal_id, type, text, due_date, sales_id, source, dedupe_key)
    select c.contact_id, new.id, 'follow-up', r.task_text || ': ' || new.name,
           now() + make_interval(days => r.due_days), new.sales_id, 'auto',
           'stage:' || new.id || ':' || gen_random_uuid()::text
    from public.stage_task_rules r
    left join lateral (
        select co.id as contact_id from public.contacts co
        where co.id = any (new.contact_ids) order by co.id limit 1
    ) c on true
    where r.stage = new.stage and r.enabled;

    return new;
end;
$$;

revoke execute on function public.on_deal_stage_task() from public, anon, authenticated;

-- Runs after 40_deals_close_auto_tasks, so the previous stage's tasks are closed first.
create trigger "45_deals_stage_tasks"
    after insert or update of stage on public.deals
    for each row execute function public.on_deal_stage_task();
