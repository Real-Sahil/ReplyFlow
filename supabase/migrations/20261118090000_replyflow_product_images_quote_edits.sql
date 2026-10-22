-- Product photos uploaded from a device, and quotes without VAT that keep their own
-- last-updated time.

insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

-- Public read: listing photos are shown on the website and used in Facebook posts.
create policy "product images public read" on storage.objects
    for select to anon, authenticated
    using (bucket_id = 'product-images');
create policy "product images staff upload" on storage.objects
    for insert to authenticated
    with check (bucket_id = 'product-images' and (select public.staff_role()) in ('admin', 'agent'));
create policy "product images staff replace" on storage.objects
    for update to authenticated
    using (bucket_id = 'product-images' and (select public.staff_role()) in ('admin', 'agent'))
    with check (bucket_id = 'product-images' and (select public.staff_role()) in ('admin', 'agent'));

-- VAT is no longer charged on quotes. The column stays for now, unused, with a default of 0;
-- drop it in a later migration once nothing needs the old values.
alter table public.quotes alter column vat_percent set default 0;

create trigger "10_quotes_set_updated_at"
    before update on public.quotes
    for each row execute function public.set_updated_at();
