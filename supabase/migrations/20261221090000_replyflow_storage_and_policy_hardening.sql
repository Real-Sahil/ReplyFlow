-- Hardening from the audit (S-08, S-10). Nothing here changes what staff can do today.
--
-- 1. Upload limits on the two buckets that had none. attachments holds notes, receipts and
--    documents of many kinds, so only a size limit is set. post-media only ever holds pictures
--    and short videos for Facebook posts, so it also gets a type list.
update storage.buckets set file_size_limit = 26214400 where id = 'attachments';
update storage.buckets
   set file_size_limit = 104857600,
       allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/quicktime']
 where id = 'post-media';

-- 2. The insert policies on bills, stock items and stock movements checked the role but not the
--    organisation, and relied on a trigger to stamp it. They now check it as well, so a changed
--    trigger could not open them. The trigger still sets the organisation first, so inserts that
--    do not send one keep working.
drop policy if exists "staff add bills" on public.bills;
create policy "staff add bills" on public.bills
  for insert to authenticated
  with check (
    (select public.staff_role()) is not null
    and organisation_id = (select private.current_organisation())
  );

drop policy if exists "staff add stock items" on public.stock_items;
create policy "staff add stock items" on public.stock_items
  for insert to authenticated
  with check (
    (select public.staff_role()) in ('admin', 'agent')
    and organisation_id = (select private.current_organisation())
  );

drop policy if exists "staff add stock movements" on public.stock_movements;
create policy "staff add stock movements" on public.stock_movements
  for insert to authenticated
  with check (
    (select public.staff_role()) in ('admin', 'agent')
    and organisation_id = (select private.current_organisation())
  );
