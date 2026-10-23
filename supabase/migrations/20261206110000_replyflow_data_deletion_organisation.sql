-- A deletion request belongs to the organisation that holds the person's messages. The
-- request is matched to a contact by its Messenger id; with no match the organisation stays
-- empty, so no business is assigned by default.
alter table public.data_deletion_requests alter column organisation_id drop default;
alter table public.data_deletion_requests alter column organisation_id drop not null;
