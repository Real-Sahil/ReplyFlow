-- ReplyFlow's two sign-up triggers on auth.users were created by hand on the hosted project, and
-- the migration before this one dropped the template's own trigger, so a database built only from
-- migrations had no sign-up trigger at all (no staff row for a new account). This records them.
-- It creates each trigger only if it is missing, so it changes nothing where they already exist
-- (the hosted project) and contains no DROP.
do $$
begin
  if not exists (
    select 1 from pg_trigger
     where tgrelid = 'auth.users'::regclass and tgname = 'replyflow_on_auth_user_created'
  ) then
    create trigger replyflow_on_auth_user_created
      after insert on auth.users
      for each row execute function public.handle_new_user();
  end if;

  if not exists (
    select 1 from pg_trigger
     where tgrelid = 'auth.users'::regclass and tgname = 'replyflow_on_auth_user_updated'
  ) then
    create trigger replyflow_on_auth_user_updated
      after update on auth.users
      for each row execute function public.handle_update_user();
  end if;
end;
$$;
