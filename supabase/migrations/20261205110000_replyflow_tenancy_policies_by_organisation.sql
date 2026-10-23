-- Every staff policy also requires the row to belong to the signed-in person's organisation.
-- The two tables already done (organisations, meta_pages) keep their own policies.
do $$
declare
  v_p record;
begin
  for v_p in
    select tablename, policyname, qual, with_check from pg_policies
     where schemaname = 'public' and tablename not in ('organisations', 'meta_pages')
  loop
    if v_p.qual is not null and v_p.qual not like '%current_organisation%' then
      execute format('alter policy %I on public.%I using (%s)', v_p.policyname, v_p.tablename,
        format('(%s) and (organisation_id = (select private.current_organisation()))', v_p.qual));
    end if;
    if v_p.with_check is not null and v_p.with_check not like '%current_organisation%' then
      execute format('alter policy %I on public.%I with check (%s)', v_p.policyname, v_p.tablename,
        format('(%s) and (organisation_id = (select private.current_organisation()))', v_p.with_check));
    end if;
  end loop;
end $$;
