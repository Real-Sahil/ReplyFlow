# Multi-tenant plan: one ReplyFlow, many businesses

Status: proposal. Nothing here is applied yet.

## Where we start

Measured on the live project on 23 October 2026:

- 34 public tables, all with row-level security (RLS) on, 78 policies in total.
- 48 public functions, 7 views, 6 scheduled jobs (pg_cron).
- Data is test-sized: 1 staff row, 1 contact, 1 deal. A migration is cheap now and expensive later.
- Staff access is decided by `private.staff_role()`. There is no notion of which business a row belongs to, so every staff member of the one business sees everything.

## The model

- One database, one deployment, many **organisations**.
- Every business row carries `organisation_id`.
- A signed-in person belongs to one organisation through their `sales` row (`sales.organisation_id`).
- Mere & Row becomes organisation 1. Nothing else changes for them.

## Phases

### 1. Schema

- Create `organisations (id, name, slug, created_at)`. Insert Mere & Row.
- Add `organisation_id bigint not null references organisations(id)` to every business table. Backfill it to 1 first, then set `not null`. Add an index on each.
- Singleton settings tables (`configuration`, `followup_settings`, `messenger_settings`, `post_autopilot_settings`, `meta_connection`, `meta_circuit`) are keyed by `id = 1` today. Each needs one row per organisation, so their key becomes `organisation_id`.
- Tables that already hold a foreign key to a business row (`deal_notes`, `contact_notes`, `order_payments`, `order_status_history`) get the column too. Do not rely on the parent to filter, because the child is queried directly.

### 2. Access rules

- Add `private.current_organisation()` (the caller's organisation from `sales`), and `private.current_organisation_role()`.
- Rewrite every policy to require `organisation_id = private.current_organisation()` in addition to the role check.
- Every `security definer` function and every view gets the same filter. Views stay `security_invoker` so they inherit RLS.

### 3. Functions, jobs and public endpoints

Service-role code bypasses RLS, so the database cannot protect it. Each function must set and filter `organisation_id` itself. Where the caller is not a signed-in person, the organisation comes from something that identifies it:

- **Meta webhooks** (`messenger_webhook`, `meta_leadgen`, `data_deletion`): resolve the organisation from the Page ID through `meta_pages.organisation_id`.
- **Website enquiry** (`web_enquiry`, `record_web_enquiry`): the form posts a per-organisation public key. Without it an anonymous form could write into any business.
- **Tracked links** (`go`) and **order tracking**: the link or token already identifies one order, so the organisation comes from that row.
- **Scheduled jobs** (`recycle_evergreen_posts`, `refresh_lead_scores`, quiet deals, autopilot): loop over organisations, or run per organisation.

### 4. Storage

- Prefix object paths with the organisation id (`post-media/{org}/...`, `product-images/{org}/...`).
- Storage policies check that prefix against the caller's organisation.
- Existing files move into prefix 1.

### 5. Onboarding

- Turn sign-up on only through an onboarding function. It creates the auth user, the organisation and a `sales` row with `administrator = true`, in one transaction.
- Team members join by invitation, scoped to the inviter's organisation (the existing `users` function, changed to take the organisation from the caller).
- Confirm the email address before the first sign-in (Postmark is already set up for outgoing mail).

### 6. Meta connection per organisation

- One Meta app for everyone. Each organisation connects its own Pages through Connect Facebook, and `meta_pages.organisation_id` records the owner.
- Circuit breaker state (`meta_circuit`) becomes per organisation, so one business blocked by Meta does not stop the others.

### 7. Tests

- A cross-tenant suite in rollback SQL: create two organisations, sign in as each, and confirm that every table returns zero rows for the other. This runs against every table, so a new table that forgets the filter fails the suite.
- Vitest for the helpers and the webhook routing.
- Re-run the existing 199 function tests and the app build.

## Risks, in order

1. **Service-role code that forgets the filter.** 18 of the edge functions use the service-role client, so the database cannot filter for them. One missed `organisation_id` leaks data across businesses. The cross-tenant suite is the guard; do not ship without it.
2. **Anonymous entry points** (website enquiry, tracked links). They need the organisation derived from the request, never trusted from the body.
3. **Scheduled jobs** that currently run once for everyone.
4. **Facebook data deletion** must find the right organisation from the Meta user, not assume one.

## Decisions needed from you

1. Is one organisation equal to one business account? (The plan assumes yes.)
2. Should Mere & Row stay the only organisation until the cross-tenant suite passes?
3. Do you want the onboarding page to ask for a Facebook connection straight away, or let the business finish that later?

## Suggested order of work

Phase 1 and the cross-tenant test scaffold first, with Mere & Row as the only organisation. Then phases 2 and 3 together, because the policies and the service-role code change the same tables. Phases 4 to 6 after that. Turn sign-up on last, and only after the suite passes.
