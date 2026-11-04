# Security audit — ReplyFlow

Audit date: 2026-11-04. Mode: read-only. No schema, code or configuration was changed to produce this report.
Project: Supabase `mdhmuyhtimjkysvsardi`, repo `Real-Sahil/ReplyFlow` at `main`.

## How to read this report

Every finding carries one of three labels.

- **Confirmed**: reproduced against the live database, or proven by reading the exact code and schema that executes.
- **Suspected**: the code points to a risk, but I did not prove it end to end.
- **Not tested**: stated so you do not assume it is safe.

## Method and tooling (what actually ran)

| Tool / check | Ran? | Result |
| --- | --- | --- |
| `npm audit --omit=dev` | Yes | 15 advisories (see S-05) |
| Supabase security + performance advisors | Yes | Fixed/explained earlier this session |
| Live RLS probe as an Organisation 6 admin (rolled back, no data kept) | Yes | No cross-tenant reads or writes (see "Tenant isolation") |
| Catalogue of RLS, policies, grants, SECURITY DEFINER functions, storage buckets | Yes | Findings below |
| Manual review of all 22 Edge Functions' auth model, webhook signature, token handling | Yes | Findings below |
| Regex secret scan of `HEAD` | Yes | Only Supabase's published local-demo keys |
| `/security-review` skill | Attempted | Failed: it diffs against `origin/HEAD`, which this checkout lacks. I did the equivalent review by hand |
| Semgrep, OSV Scanner, Gitleaks, Trivy, TruffleHog | **No** | Not installed. Semgrep can be pip-installed here, but its rule packs need network access I did not verify. Run these in CI (see TECHNICAL_ROADMAP) |
| Live HTTP header check of the Vercel site | **No** | The sandbox proxy returned 403 for the site, so response headers are unmeasured |
| Git history secret scan (1,942 commits) | **No** | Needs Gitleaks/TruffleHog |
| ASVS control-by-control walkthrough | **Partial** | Areas V1, V2, V4, V8, V13 covered informally; not a full ASVS pass |

## Executive summary

The database layer is in good shape. Row-level security is on for all 50 public tables (106 policies), every business table carries an `organisation_id`, and a live probe as a second-tenant admin found no cross-tenant reads, updates, deletes or forged inserts. Page access tokens are in Supabase Vault, not in plain columns.

The real isolation problems are in the **Edge Functions**, which use the service role and therefore bypass RLS. Two shared "singleton" rows make Messenger behaviour and the Meta safety breaker global rather than per business (S-01, S-02). The dependency tree has a critical advisory in the HTML sanitiser (S-05). Nothing enforces isolation in CI (S-09).

| ID | Severity | Status | Title |
| --- | --- | --- | --- |
| S-01 | High | Confirmed | Messenger auto-reply and send-hours settings are one shared row (org 1) used for every business |
| S-02 | High | Confirmed | Meta action-block circuit breaker is global; one business can halt Meta for all |
| S-03 | Medium | Suspected | Webhook accepts any Page when no Pages are configured |
| S-04 | Medium | Confirmed | Organisation 1 is hard-coded in several functions |
| S-05 | High | Confirmed (npm audit) | 15 dependency advisories including a critical in `dompurify` |
| S-06 | Medium | Confirmed (absence) | No security headers or CSP defined in the repo |
| S-07 | Low | Confirmed (corrected) | Signed-in functions are rate limited per user; limiter fails open; public `go` was unlimited (now limited) |
| S-08 | Low | Confirmed | Storage buckets have no size or type limits; one is public |
| S-09 | Medium | Confirmed | Isolation SQL tests and browser tests do not run in CI |
| S-10 | Low | Confirmed | Insert policies on three tables rely on a trigger for tenant scoping |
| S-11 | Low | Confirmed | Leaked-password protection is off |
| S-12 | Info | Confirmed | `.env.e2e` committed with Supabase demo keys (not production) |

## Findings

### S-01 — Messenger settings are global (High, Confirmed)

**Evidence.** `messenger_settings` has `CHECK (id = 1)` and `PRIMARY KEY (id)`, so only one row can exist. `supabase/functions/messenger_webhook/index.ts:108` and `supabase/functions/messenger_send/index.ts:148` read it with the service role: `.from("messenger_settings").select("*").eq("id", 1)`. The UI links every business to `/messenger_settings/1`.

**Impact.** A second business cannot save its own auto-reply or opening-hours settings (the primary key and check constraint block a second row). Worse, the webhook decides auto-replies for every Page using organisation 1's row, so a customer of business B can receive business A's configured greeting, away message and questions. That is a cross-tenant disclosure of configuration text, and wrong behaviour for B's customers. Follow-up sending ("automated" sends) also gates on organisation 1's opening hours.

**Exploitability.** No attacker needed: it happens in normal use as soon as a second business connects a Page and enables auto-replies.

**Remediation.** Make `messenger_settings` one row per organisation (key on `organisation_id`, drop `CHECK (id = 1)`), and have the webhook and sender read `.eq("organisation_id", row.organisation_id)`. Point the UI at the caller's own row.

**Regression test.** Two organisations with different greetings; deliver a webhook message to each Page; assert each customer gets only their own business's text, and that org B can save settings.

### S-02 — Meta circuit breaker is global (High, Confirmed)

**Evidence.** `supabase/functions/_shared/metaCircuit.ts:18` and `:47` read and write `meta_circuit` with `.eq("id", 1)`. Every Graph call runs `assertMetaOpen()` first.

**Impact.** If Meta returns an action block for one business's Page, the breaker trips for everyone, and all businesses lose inbox sending, publishing and comment replies until someone clears it. This is an availability and fairness failure between tenants, and one tenant's error text is stored in a row all tenants' functions read.

**Remediation.** Key the breaker by `organisation_id` (or Page id); pass it to `assertMetaOpen(orgId)` and `recordIfActionBlock(orgId, body)`.

**Regression test.** Trip the breaker for org A; assert org B still sends and publishes.

### S-03 — Webhook fails open on Page allowlist (Medium, Suspected)

**Evidence.** `messenger_webhook/index.ts` `allowedPages()` returns `null` when no Pages are configured, and the comment says "every Page is accepted". The HMAC signature is still verified with constant-time comparison (`webhook.ts:32-46`), which limits this to payloads genuinely signed by your Meta app.

**Impact.** Low while the app has one secret and Pages are configured. I did not verify that the `record_*` database functions reject an unknown Page rather than guessing an organisation.

**Remediation.** Fail closed: accept a Page only if it exists in `meta_pages`. Add a test that an unknown Page id is dropped.

### S-04 — Organisation 1 is hard-coded (Medium, Confirmed)

**Evidence.**
- `_shared/metaToken.ts` lets only organisation 1 fall back to a shared `META_PAGE_ACCESS_TOKEN` secret and the legacy `meta_connection` row.
- `pipeline_export/index.ts` sets `EXPORT_ORGANISATION = 1` with a single export key.
- `web_enquiry` has `LEGACY_UNKEYED_FORM_ORGANISATION = 1`.
- `meta_connect`, `meta_connection` and `_shared/webPush.ts` use singleton `id = 1` rows.

**Impact.** Not a leak today (each guard is deliberate and safe), but these are the places where a future organisation silently gets nothing or gets organisation 1's behaviour. They are the same pattern as S-01.

**Remediation.** Retire the legacy token path once the Page is in `meta_pages`; make export keys per organisation; document `push_config` as intentionally global (VAPID keys).

### S-05 — Dependency advisories (High, Confirmed by npm audit)

`npm audit --omit=dev` reports 15 advisories: 1 critical, 12 high, 1 moderate, 1 low.

| Package | Severity | Note |
| --- | --- | --- |
| `dompurify` (<=3.4.16) | **Critical** | Used in `misc/Markdown.tsx:38` to sanitise HTML before `dangerouslySetInnerHTML` (line 84). `package.json` allows `^3.4.16`; fix available |
| `zod` (<4.6.6) | High | Fix available |
| `vite` (8.3.0–8.3.2) | High | Installed version is 8.3.2, inside the range. Dev-server issue; fix available |
| `qs` (2.2.5–6.16.0) | Moderate | Fix available |
| `source-map-js`, `esbuild` | High / Low | Fix available |
| `query-string`, `decode-uri-component` | High | Pulled in by `ra-*` / `@raphiniert/ra-data-postgrest`; no clean fix available |
| `ra-core`, `ra-i18n-polyglot`, `ra-supabase-core`, `ra-language-*`, `ra-data-fakerest` | High | Transitive through the `query-string` chain |

I read the severity and ranges from `npm audit`; I did not read each advisory's text, so the exact exploit conditions are not confirmed. The `dompurify` one matters most because user-supplied text (notes, customer replies) can reach that sanitiser.

**Remediation.** Bump `dompurify`, `zod`, `vite`, `qs` and `esbuild` now (non-breaking). Track the `ra-*` chain separately: either pin `query-string` via `overrides` after testing, or accept and document until upstream updates.

**Acceptance.** `npm audit --omit=dev` reports no critical and no high advisories that are reachable in production code, and CI fails on new criticals.

### S-06 — No security headers or CSP in the repo (Medium, Confirmed absence)

**Evidence.** No `vercel.json`, no `public/_headers`, no CSP `<meta>` in `index.html`. The live response headers could not be measured from this environment.

**Impact.** Without a CSP, any XSS (see S-05) has full script freedom. Missing `X-Frame-Options`/`frame-ancestors` allows clickjacking of a signed-in console. Vercel's dashboard may set some headers; that is unverified.

**Remediation.** Add `vercel.json` headers: CSP (self + Supabase + required fonts), `frame-ancestors 'none'`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, HSTS. Ship the CSP in report-only mode first.

**Acceptance.** `curl -I` shows the headers; the app works with the CSP enforced; Lighthouse "Best practices" passes the CSP audit.

### S-07 — Rate limiting: mostly present; two gaps (Low, Confirmed) — CORRECTED

**Correction.** The first version of this finding said only `onboard` and `web_enquiry` were rate limited. That was wrong. `_shared/authentication.ts` (`UserMiddleware`, line 91) applies a per-user, per-function limit to every signed-in function, using the table in `_shared/rateLimitRules.ts` (for example `messenger_send` 60/minute, `post_publish` 20/minute, `update_password` 5/minute). I had only searched the function entry files, not the shared middleware.

**What remains.**
- The limiter fails open if the counter cannot be reached (a deliberate availability choice, but unmonitored).
- Limits are per user, not per organisation, so several users in one business can together exceed what one person could.
- The public `go` (tracked links) function wrote a click row per request with no limit. **Fixed in Phase 1**: 120 requests per minute per address.
- `order_tracking` is public but guarded by a random UUID token, so enumeration is not realistic.

**Remediation still open.** Alert when the limiter errors; consider an organisation-level cap on sends.

### S-08 — Storage bucket hardening (Low, Confirmed)

`attachments` and `post-media` have no `file_size_limit` or `allowed_mime_types`. `product-images` is public (probably needed for Meta to fetch images; confirm that is intended). Upload policies correctly pin the first path folder to the caller's organisation, and a probe as org 6 saw zero objects outside folder `6`. The `documents` bucket has a stray upload policy bound to role `postgres`, which is upstream template residue and harmless but confusing.

**Remediation.** Set size and MIME limits; confirm `product-images` should stay public; remove the `postgres`-role policy.

### S-09 — Isolation is not enforced by CI (Medium, Confirmed)

**Evidence.** `supabase/tests/` holds `cross_tenant.sql`, `security_baseline.test.sql` and others, but `.github/workflows/ci.yml` runs only typecheck, lint, function unit tests, build and browser unit tests. Playwright specs in `e2e/` are not run in CI either.

**Impact.** A migration that weakens a policy would pass CI.

**Remediation.** Add a CI job that starts the Supabase local stack, applies migrations, and runs the SQL tests; add the two-organisation test described in "Tenant isolation".

### S-10 — Insert policies rely on triggers (Low, Confirmed)

`bills` ("staff add bills"), `stock_items` and `stock_movements` have `WITH CHECK` clauses that test role but not `organisation_id`. The `10_*_before_write` triggers overwrite `organisation_id` from the session, so this is safe today. A future change to a trigger would silently open it. Add the organisation check to the policy as a second layer.

### S-11 — Leaked-password protection off (Low, Confirmed)

Supabase advisor warning. Dashboard setting: Authentication → Sign In / Providers → Email.

### S-12 — Demo keys in `.env.e2e` (Info, Confirmed)

The committed JWTs decode with `iss: supabase-demo`, the published local-development keys. They grant nothing on the hosted project. No other secret patterns were found in `HEAD`. History was not scanned.

### S-13 — Migrations did not reproduce production (Low, Confirmed in CI)

Found when the new two-organisation test first ran against a fresh database built only from `supabase/migrations/`: no staff row was created for a new account. A migration dropped the template's sign-up trigger, and ReplyFlow's replacement triggers (`replyflow_on_auth_user_created` and `_updated` on `auth.users`) existed only on the hosted project, created by hand. A rebuild from migrations would have no sign-up trigger. Production is unaffected. Fixed by `20261207100100_replyflow_signup_triggers.sql`, which creates them only if missing. The same CI job also needed `pg_cron`/`pg_net` and a working seed, which were hosted-only as well. Keeping this job green is what prevents the repository and production drifting apart again.


## Tenant isolation assessment

**Live probe (read-only, rolled back).** Signed in as the Organisation 6 admin, with all work inside a transaction that was aborted:

- Read check across every table that has an `organisation_id` column: **zero rows from other organisations** on all readable tables. Six tables returned "permission denied" to the signed-in role (`data_deletion_requests`, `meta_connection`, `meta_leadgen_leads`, `meta_pages`, `push_subscriptions`, `signup_grants`), which is intended: they are service-only.
- `UPDATE` of organisation 1 contacts: 0 rows. `DELETE` of organisation 1 deals: 0 rows.
- `INSERT` into `contacts` forging `organisation_id = 1`: blocked by RLS.
- `set_post_evergreen` on an organisation 1 post: refused. Its definition scopes by `private.current_organisation()`.
- Storage objects outside folder `6` in `attachments` and `post-media`: 0 visible.
- `issue_invoice` against an organisation 1 order: **not run** (no organisation 1 order existed to target). The function body references `private.current_organisation()`; confirm with a test order.

**What this does not cover.** The probe exercises RLS. The Edge Functions use the service role and bypass RLS, so their isolation depends on each query adding an organisation filter. I checked `messenger_send` (filters by `sale.organisation_id` on messages and products) and found S-01/S-02 in the others. A full line-by-line pass over every service-role query is still owed.

**Tenant model verdict.** Strong at the database layer; incomplete in the function layer. Fix S-01, S-02, S-04 and add S-09 before onboarding more businesses.

## Meta integration security

| Area | Finding |
| --- | --- |
| Webhook signature | HMAC-SHA256, constant-time compare, rejects missing/malformed header. Good |
| Page tokens | In Supabase Vault (`meta_pages.vault_secret_id`); 0 plaintext tokens in `meta_pages` or `meta_connection`. Good |
| Token routing | Replies use the token of the Page the customer messaged, not another Page's. Good |
| Circuit breaker | Global (S-02) |
| Page allowlist | Fails open when empty (S-03) |
| Settings | Global (S-01) |
| Send limits | 24-hour window enforced; no rate limit (S-07) |
| API version | Calls pin `v21.0`. Check Meta's current deprecation schedule and plan an upgrade |
| Token refresh/expiry | Not examined |
| Deduplication/retries | Not examined beyond reading that inserts use a `mid` |

## Items not examined

CSRF (the app uses bearer tokens, so classic cookie CSRF does not apply, but I did not test it), SSRF (a grep found no server-side `fetch` of user-supplied URLs other than Meta's Graph API), password-recovery flow, session lifetime, file-upload content sniffing, race conditions in invoice numbering, and sensitive-data logging in function logs.

## Prioritised remediation

| Priority | Item | Complexity | Depends on |
| --- | --- | --- | --- |
| P0 | S-05 bump `dompurify`, `zod`, `vite`, `qs`, `esbuild` | S | none |
| P0 | S-01 per-organisation Messenger settings | M | migration + function + UI change |
| P0 | S-02 per-organisation Meta breaker | S–M | migration + `_shared` change |
| P1 | S-06 security headers / CSP | S–M | none |
| P1 | S-09 CI job for SQL isolation tests | M | Supabase local stack in CI |
| P1 | S-03 fail-closed Page allowlist | S | none |
| P1 | S-07 limiter alerting and organisation cap | S | none |
| P2 | S-04 retire org-1 special cases | M | S-01, S-02 |
| P2 | S-08, S-10, S-11 hardening | S | none |
