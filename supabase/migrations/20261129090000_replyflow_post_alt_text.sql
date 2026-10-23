-- Alt text for an image on a post (read aloud by screen readers; up to 200 characters).
alter table public.page_posts add column alt_text text check (char_length(alt_text) <= 200);
