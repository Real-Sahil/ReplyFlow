-- Covering indexes for foreign keys flagged by the Supabase performance advisor.
-- Non-destructive: indexes only.
create index if not exists bills_category_idx on public.bills (category);
create index if not exists bills_created_by_idx on public.bills (created_by);
create index if not exists bills_vat_code_idx on public.bills (vat_code);
create index if not exists invoice_lines_vat_code_idx on public.invoice_lines (vat_code);
create index if not exists invoices_contact_id_idx on public.invoices (contact_id);
create index if not exists invoices_created_by_idx on public.invoices (created_by);
create index if not exists meta_circuit_cleared_by_idx on public.meta_circuit (cleared_by);
create index if not exists meta_connection_saved_by_idx on public.meta_connection (saved_by);
create index if not exists money_entries_category_idx on public.money_entries (category);
create index if not exists money_entries_created_by_idx on public.money_entries (created_by);
create index if not exists money_entries_vat_code_idx on public.money_entries (vat_code);
create index if not exists stock_items_created_by_idx on public.stock_items (created_by);
create index if not exists stock_movements_bill_id_idx on public.stock_movements (bill_id);
create index if not exists stock_movements_created_by_idx on public.stock_movements (created_by);
