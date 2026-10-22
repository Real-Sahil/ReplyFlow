-- Circuit breaker for Meta action blocks (error 368). Once Meta blocks the Page,
-- every feature stops calling Meta until an administrator clears it.

create table public.meta_circuit (
    id integer primary key default 1,
    blocked boolean not null default false,
    reason text,
    blocked_at timestamptz,
    cleared_by bigint references public.sales (id) on delete set null,
    cleared_at timestamptz,
    constraint meta_circuit_singleton check (id = 1)
);
insert into public.meta_circuit (id) values (1);

alter table public.meta_circuit enable row level security;
create policy "staff read" on public.meta_circuit
    for select to authenticated using ((select public.staff_role()) is not null);
grant select on public.meta_circuit to authenticated;
grant all on public.meta_circuit to service_role;
