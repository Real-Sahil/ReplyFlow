-- meta_pages_list reads meta_pages as the signed-in person (security_invoker), so that person needs
-- read permission on the columns the view shows. The token columns stay unreadable.
grant select (page_id, name, is_default, added_at, organisation_id) on public.meta_pages to authenticated;
