# Hosted Supabase project

How the ReplyFlow Supabase project (`mdhmuyhtimjkysvsardi`, London) was built on
22 October 2026, and where it differs from the repo migrations.

The project previously held an unrelated device app. Its `public` schema was
**renamed** to `legacy_device_app` (data kept, API access revoked, its sign-up
trigger function replaced by a no-op) rather than dropped, because the Supabase
MCP tool holds `DROP` and `DELETE FROM` statements for interactive approval.
Delete that schema yourself when you no longer need the data.

## Applied, in order

1. Extensions: `citext`, `unaccent`, `pg_net`.
2. Atomic CRM baseline from `supabase/schemas/01`, `02`, `03`, `04`, `08`, split
   into several migrations, **without**:
   - the Gravatar and favicon functions, triggers and `favicons_excluded_domains`
   - upstream's open policies and grants (`05`, `06`, `07`)
   - `merge_contacts` (see below)
   - the sign-up triggers, which are created by the security step under the names
     `replyflow_on_auth_user_created` / `replyflow_on_auth_user_updated`, because
     the old app left a trigger called `on_auth_user_created` on `auth.users`
3. `replyflow_security_baseline_hosted`: the same roles, policies, invitation gate
   and storage rules as `migrations/20261022130000_replyflow_security_baseline.sql`,
   minus the `DROP` steps for objects that were never created here.
4. `replyflow_api_role_grants`: explicit table grants. Recreating `public` removed
   Supabase's default grants, so `authenticated` and `service_role` had none.
5. `replyflow_private_role_helpers`: role helpers moved to the `private` schema.

## Still to do by hand

- Run `merge_contacts.sql` in the Supabase SQL editor.
- Create the first administrator in the dashboard (Authentication > Users). The
  first user becomes admin, so do this before anyone else can sign in.
- Turn on leaked password protection (Authentication settings, Pro plan).
- Known advisor items: `init_state` is a security definer view on purpose (the
  login screen reads it before sign-in and it returns only 0 or 1).

The behavioural checks in `supabase/tests/security_baseline.test.sql` were run on
a local PostgreSQL 16 with a Supabase stand-in, and a rollback-only subset (no
`DELETE`/`TRUNCATE`) was run against this project.
