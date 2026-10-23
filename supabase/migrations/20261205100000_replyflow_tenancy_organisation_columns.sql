-- Every business table gets organisation_id. Existing rows belong to Mere & Row (organisation 1).
-- The default of 1 is temporary: the functions set organisation_id themselves before it is removed.
do $$
declare
  t text;
begin
  for t in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r'
       and c.relname not in ('organisations', 'sales', 'meta_pages')
     order by 1
  loop
    if not exists (select 1 from information_schema.columns col
                    where col.table_schema = 'public' and col.table_name = t
                      and col.column_name = 'organisation_id') then
      execute format('alter table public.%I add column organisation_id bigint not null default 1 references public.organisations (id)', t);
      execute format('create index %I on public.%I (organisation_id)', t || '_organisation_idx', t);
    end if;
  end loop;
end $$;
