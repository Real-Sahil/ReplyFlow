-- Everything the audit log recorded about one contact: the contact row, its deals
-- and its orders, newest first. Security invoker, so row-level security decides
-- what each staff member can see.

create or replace function public.contact_activity(p_contact_id bigint)
returns setof public.audit_log
language sql
stable
security invoker
set search_path = public
as $$
    select a.*
    from public.audit_log a
    where (a.table_name = 'contacts' and a.record_id = p_contact_id)
       or (a.table_name = 'deals' and a.record_id in (
            select d.id from public.deals d where p_contact_id = any (d.contact_ids)
       ))
       or (a.table_name = 'orders' and a.record_id in (
            select o.id from public.orders o where o.contact_id = p_contact_id
       ))
    order by a.changed_at desc
    limit 200;
$$;

revoke execute on function public.contact_activity(bigint) from public, anon;
grant execute on function public.contact_activity(bigint) to authenticated, service_role;
