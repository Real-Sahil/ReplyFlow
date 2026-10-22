-- When the customer's order page was last sent to them on Messenger.
alter table public.orders add column customer_page_sent_at timestamptz;
