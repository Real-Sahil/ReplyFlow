-- Several Facebook Pages. Each Page's token is kept here, server-side only: staff see the
-- Page's name and which one is the default through a view, never the token. Posts can be
-- sent to a chosen Page; a post with no Page uses the default, as before.
create table public.meta_pages (
    page_id text primary key,
    name text not null default '',
    access_token text not null,
    is_default boolean not null default false,
    added_at timestamptz not null default now()
);
create unique index meta_pages_one_default on public.meta_pages (is_default) where is_default;

alter table public.meta_pages enable row level security;
grant all on public.meta_pages to service_role;

create view public.meta_pages_list
    as select page_id, name, is_default, added_at from public.meta_pages;
grant select on public.meta_pages_list to authenticated;

alter table public.page_posts add column page_id text;

-- The Page already connected becomes the first one in the list, and the default.
insert into public.meta_pages (page_id, name, access_token, is_default)
select page_id, coalesce(page_name, ''), page_access_token, true
from public.meta_connection
where id = 1 and page_id is not null and page_access_token is not null
on conflict (page_id) do nothing;
