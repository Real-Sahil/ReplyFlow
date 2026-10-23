-- Public product image links keep working without this policy: a public bucket serves
-- objects by URL. Without it, the bucket's files cannot be listed by anonymous visitors.
drop policy if exists "product images public read" on storage.objects;
