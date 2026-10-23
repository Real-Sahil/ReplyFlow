-- Files in the attachments, post-media and product-images buckets live under a folder
-- named after their organisation: <organisation_id>/<file>. Staff can only read, upload,
-- replace or delete files in their own organisation's folder.

create or replace function public.my_organisation_id()
returns bigint
language sql
stable
set search_path = ''
as $$
  select private.current_organisation();
$$;

revoke all on function public.my_organisation_id() from public;
grant execute on function public.my_organisation_id() to authenticated;

alter policy "attachments agents upload" on storage.objects
  with check (
    bucket_id = 'attachments'
    and (select staff_role()) = any (array['admin'::text, 'agent'::text])
    and (storage.foldername(name))[1] = (select private.current_organisation())::text
  );

alter policy "attachments staff read" on storage.objects
  using (
    bucket_id = 'attachments'
    and (select staff_role()) is not null
    and (storage.foldername(name))[1] = (select private.current_organisation())::text
  );

alter policy "attachments uploader or admin delete" on storage.objects
  using (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = (select private.current_organisation())::text
    and (
      (select is_admin())
      or ((select staff_role()) = 'agent'::text and owner = (select auth.uid()))
    )
  );

alter policy "post media staff read" on storage.objects
  using (
    bucket_id = 'post-media'
    and (select staff_role()) is not null
    and (storage.foldername(name))[1] = (select private.current_organisation())::text
  );

alter policy "post media staff upload" on storage.objects
  with check (
    bucket_id = 'post-media'
    and (select staff_role()) = any (array['admin'::text, 'agent'::text])
    and (storage.foldername(name))[1] = (select private.current_organisation())::text
  );

alter policy "post media admin delete" on storage.objects
  using (
    bucket_id = 'post-media'
    and (select is_admin())
    and (storage.foldername(name))[1] = (select private.current_organisation())::text
  );

alter policy "product images staff upload" on storage.objects
  with check (
    bucket_id = 'product-images'
    and (select staff_role()) = any (array['admin'::text, 'agent'::text])
    and (storage.foldername(name))[1] = (select private.current_organisation())::text
  );

alter policy "product images staff replace" on storage.objects
  using (
    bucket_id = 'product-images'
    and (select staff_role()) = any (array['admin'::text, 'agent'::text])
    and (storage.foldername(name))[1] = (select private.current_organisation())::text
  )
  with check (
    bucket_id = 'product-images'
    and (select staff_role()) = any (array['admin'::text, 'agent'::text])
    and (storage.foldername(name))[1] = (select private.current_organisation())::text
  );
