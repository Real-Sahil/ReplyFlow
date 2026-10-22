-- Facebook lead ads: one row per lead received, so a redelivered lead is not
-- recorded twice. Written and read only by the meta_leadgen function.
create table public.meta_leadgen_leads (
    leadgen_id text primary key,
    page_id text not null,
    form_id text,
    deal_id bigint references public.deals (id) on delete set null,
    received_at timestamptz not null default now()
);

alter table public.meta_leadgen_leads enable row level security;
grant all on public.meta_leadgen_leads to service_role;
