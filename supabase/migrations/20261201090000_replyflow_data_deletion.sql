-- Data deletion requests from Facebook users (Meta's data deletion callback). Staff
-- remove the person's messages and contact details, then mark the request completed.
create table public.data_deletion_requests (
    code text primary key,
    meta_user_id text not null,
    requested_at timestamptz not null default now(),
    status text not null default 'received' check (status in ('received', 'completed')),
    completed_at timestamptz
);
alter table public.data_deletion_requests enable row level security;
grant all on public.data_deletion_requests to service_role;
