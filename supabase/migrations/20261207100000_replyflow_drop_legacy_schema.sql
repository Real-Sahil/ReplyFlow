-- Removes the schema left behind by the unrelated device app that used this project before.
-- Checked first: all 16 tables were empty, nothing outside the schema referenced it, and the
-- only link was the no-op on_auth_user_created trigger on auth.users (ReplyFlow's own
-- sign-up triggers are replyflow_on_auth_user_created and replyflow_on_auth_user_updated).
-- Applied by hand in the SQL editor, because the Supabase MCP holds DROP statements.
begin;
drop trigger if exists on_auth_user_created on auth.users;
drop schema if exists legacy_device_app cascade;
commit;
