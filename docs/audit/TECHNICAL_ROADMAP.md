# Technical roadmap — ReplyFlow

Audit date: 2026-11-04. Mode: read-only. Nothing in this roadmap has been started. It waits for your approval.

Companion documents: `SECURITY_AUDIT.md` (findings S-01 to S-12) and `PRODUCT_UX_AUDIT.md`.

## Executive summary

The platform is a coherent multi-tenant system on a sound base: React 19 with react-admin and shadcn/ui on the front, Supabase (Postgres with RLS, Edge Functions, Storage, Vault) behind it, deployed on Vercel. 50 public tables all have RLS (106 policies), and a live probe found no cross-tenant access through the database API.

Three things stand between it and "genuinely isolated, enterprise-grade":

1. **Function-layer isolation.** Edge Functions use the service role, so they bypass RLS. Two singleton rows (Messenger settings, Meta breaker) are shared by every business. These are the most important fixes.
2. **No automated guard.** The SQL isolation tests and browser tests exist but CI does not run them.
3. **Dependency and delivery hygiene.** One critical and twelve high npm advisories, no security headers in the repo, and a 2.25 MB main script.

## Architecture map (verified from the repo and the live project)

| Layer | What it is | Notes |
| --- | --- | --- |
| Front end | React 19, Vite 8.3.2, react-admin (`ra-core` 5.14), shadcn/ui on Radix, Tailwind v4, TanStack Query 5 with persistence, HashRouter | PWA via vite-plugin-pwa; jsPDF lazy-loaded; ~534 files under `src/`, 43 test files |
| Data | Supabase Postgres, project `mdhmuyhtimjkysvsardi`; 95 migration files in `supabase/migrations/` | Tenant key `organisation_id` on business tables; before-write triggers set it from the session |
| Auth | Supabase Auth; `sales` rows link users to an organisation and role (`admin`, `agent`, `viewer`) | Helpers: `private.current_organisation()`, `public.staff_role()`, `private.is_admin()` |
| API | PostgREST with RLS; 22 Edge Functions (Deno) for anything needing secrets or the service role | 20 set `verify_jwt = false` and authenticate in-function or by signature/key (see below) |
| Meta | Messenger webhook (HMAC verified), send API, comments, publishing, lead ads, Page connection; tokens in Vault | Graph API pinned to `v21.0`; singleton settings and breaker (S-01, S-02) |
| Storage | Buckets `attachments`, `post-media` (private), `product-images` (public), `documents` (private) | Folder-per-organisation policies |
| Background | Scheduled work through functions (`post_autopilot`, follow-ups, publishing) | Scheduler mechanism not re-audited here |
| Push | Web Push with server-generated VAPID keys (`push_config`) | Global by design |
| Deploy | Vercel for the app; GitHub Actions deploys functions on push; migrations applied through Supabase MCP or SQL editor | Migrations are not applied by CI |
| Tests | Vitest (functions project and browser project), Playwright specs in `e2e/`, SQL tests in `supabase/tests/`, Storybook | CI runs typecheck, lint, function tests, build, browser unit tests only |

### Edge Function authentication model

| Group | Functions | Control |
| --- | --- | --- |
| Signed-in staff | `messenger_send`, `comments_action`, `post_publish`, `post_autopilot`, `meta_connect`, `meta_connection`, `meta_pages`, `merge_contacts`, `delete_note_attachments`, `users`, `update_password`, `push_subscribe`, `log_client_error` | Auth middleware and role check |
| Signed webhooks | `messenger_webhook`, `meta_leadgen`, `data_deletion` | Meta HMAC / signed request |
| Shared secret or allowlist | `postmark` (basic auth + IP allowlist), `pipeline_export` (export key) | Secret / IP |
| Public by design | `go` (tracked link redirect, target only from DB), `order_tracking` (random UUID token), `web_enquiry` and `onboard` (rate limited, key/gate) | Unguessable token, rate limit, `SIGNUP_OPEN` |

## Technical debt

| Item | Evidence | Impact |
| --- | --- | --- |
| Singleton `id = 1` rows in functions | `metaCircuit.ts`, `messenger_webhook`, `messenger_send`, `meta_connect`, `meta_connection`, `webPush.ts` | Blocks true multi-tenancy |
| Organisation 1 special cases | `metaToken.ts`, `pipeline_export`, `web_enquiry` | Silent behaviour differences for new businesses |
| Mixed admin checks | Some policies use `private.is_admin()`, others join `sales.administrator = true` (`custom_field_definitions`, `stage_task_rules`) | Two sources of truth for "admin" |
| Upstream template residue | Atomic CRM changelog, French language packs, fakerest demo data, `documents` bucket `postgres` policy | Bundle size and confusion |
| Policies that rely on triggers | `bills`, `stock_items`, `stock_movements` inserts (S-10) | Fragile if a trigger changes |
| Large entry script | 2.25 MB | See Performance |
| Migrations are manual | Applied via MCP/SQL editor, not CI | No automatic drift detection |
| Rate limiter fails open | `_shared/rateLimit.ts` | Intentional, but unmonitored |

## Performance findings

Measured: main script 2.25 MB raw, 633 KB gzip; `jspdf` 435 KB and `html2canvas` 214 KB are already lazy; largest route chunk 150 KB. Database: no unindexed foreign keys after this session's index migration; the advisor lists 80 unused indexes, which is normal for a young, low-traffic project.

Not measured: LCP, TBT, INP, render counts, query timings (`pg_stat_statements`), edge function latencies, memory. These need a signed-in browser run and the production database's statistics. Do not prioritise micro-optimisations before that baseline exists.

Likely first wins, in order: route-level splitting of the admin shell; removing unused locales and fakerest from the production bundle; checking that list screens page results rather than loading everything (the money, stock and report screens load a full period).

## Recommended tooling

| Need | Choice | Why |
| --- | --- | --- |
| Dependency scan | `npm audit` plus OSV Scanner in CI | Free, no secrets |
| Secret scan | Gitleaks in CI, and once over full history | History (1,942 commits) is unscanned |
| Static analysis | Semgrep with the community TypeScript and Deno rules | Catches missing organisation filters if a custom rule is added |
| Container/IaC | Trivy | Only if you add Docker or IaC; not needed today |
| Browser tests | Playwright (already installed) + `axe-playwright` | Real journeys and accessibility |
| Component states | Storybook (already installed) | Glass components and every state |
| Performance | Lighthouse CI | Baseline and regression budget |
| Glass | CSS token set, no library | See PRODUCT_UX_AUDIT |

Rejected for now: liquid-glass npm packages (extra weight, performance cost), Motion, FullCalendar, Tiptap, dnd-kit replacement, TanStack Table. Reasons are in PRODUCT_UX_AUDIT. I could not verify the external repositories you listed (access to this session is scoped to this repo), so verify maintenance, licence and compatibility before adopting any.

## Implementation plan

Order matters: fix isolation first, then guard it, then improve the experience on top of a trustworthy base.

### Phase 0 — Isolation and safety (P0)

| # | Work | Files | Complexity | Depends on | Acceptance |
| --- | --- | --- | --- | --- | --- |
| 0.1 | Bump `dompurify`, `zod`, `vite`, `qs`, `esbuild` | `package.json`, lockfile | S | none | `npm audit --omit=dev` shows no critical; build, lint and tests pass |
| 0.2 | Per-organisation `messenger_settings` | new migration; `messenger_webhook/index.ts:108`; `messenger_send/index.ts:148`; settings UI and 4 link sites | M | none | Org B saves its own settings; org B customer never receives org A text (two-org test) |
| 0.3 | Per-organisation Meta breaker | new migration; `_shared/metaCircuit.ts`; all callers | M | none | Tripping org A leaves org B sending |
| 0.4 | Fail-closed Page allowlist | `messenger_webhook/index.ts` | S | none | Unknown Page id is dropped and logged |

### Phase 1 — Guardrails (P1)

| # | Work | Complexity | Depends on | Acceptance |
| --- | --- | --- | --- | --- |
| 1.1 | CI job: local Supabase, apply migrations, run `supabase/tests/*.sql` | M | none | Weakening a policy fails CI |
| 1.2 | Two-organisation isolation test (reads, writes, deletes, storage, each RPC, webhook routing) | M | 1.1 | Org A cannot read, change, delete or send using org B's data or Page |
| 1.3 | Security headers and CSP (`vercel.json`), report-only first | S–M | none | `curl -I` shows headers; no CSP violations on core screens before enforcing |
| 1.4 | Rate limits on send, publish, comment and Page-connect paths | M | 0.3 | Excess calls return 429; limiter errors are logged and alerted |
| 1.5 | Gitleaks over full history; Semgrep and OSV in CI | S | none | CI fails on new findings; any historical secret rotated |
| 1.6 | Playwright core-journey suite plus axe in CI | M | a test login | Five journeys at 390 px and 1280 px; zero serious/critical axe violations |

### Phase 2 — Experience and performance (P2)

| # | Work | Complexity | Depends on | Acceptance |
| --- | --- | --- | --- | --- |
| 2.1 | Lighthouse baseline, then route-level code splitting | M | 1.6 | Main script ≤ 300 KB gzip (proposed); no feature regression |
| 2.2 | Regroup finance navigation; progressive disclosure | S–M | none | Inbox, orders, posts, deals stay primary; finance appears when enabled |
| 2.3 | Glass token set on the navigation layer only | M | 2.1, 1.6 | Solid fallback; honours reduced transparency and motion; no regression in Lighthouse or axe |
| 2.4 | Retire organisation 1 special cases (S-04); unify admin checks | M | 0.2, 0.3 | No function reads `id = 1` or `organisation_id = 1` literals |
| 2.5 | Bucket limits; policy `WITH CHECK` organisation tests (S-08, S-10) | S | none | Limits set; policies self-sufficient without triggers |

### Phase 3 — Refinements (P3)

Dark mode (needs your decision); inbox assignment and resolved states; purchase orders and goods received; automation rules; staff records and timesheets; accountant-verified import layouts for Xero, QuickBooks and Sage.

## Prioritised backlog

| Priority | Items |
| --- | --- |
| P0 | 0.1 dependency fixes · 0.2 per-organisation Messenger settings · 0.3 per-organisation Meta breaker |
| P1 | 0.4 fail-closed webhook · 1.1–1.2 CI isolation tests · 1.3 security headers · 1.4 rate limits · 1.5 secret and static scans · 1.6 browser and accessibility suite |
| P2 | 2.1 code splitting · 2.2 navigation grouping · 2.3 glass navigation layer · 2.4 remove org-1 special cases · 2.5 storage and policy hardening |
| P3 | Dark mode · assignment/resolved · purchase orders · automation · staff records · import verification |

## Decisions I need from you

1. **Approve Phase 0 and Phase 1** (or tell me which to skip). Phase 0 includes two schema migrations; I will paste any SQL you must run.
2. **Dark mode:** keep the light-only decision, or add dark after the glass tokens exist?
3. **`product-images` bucket:** is public access intended?
4. **Test login:** a second-business test account and a normal staff account would let me run the browser, accessibility and isolation suites against real sessions. Create them in the Supabase dashboard; do not send me passwords in chat.

## Limits of this audit

No run of Semgrep, OSV, Gitleaks, Trivy, TruffleHog, Playwright, axe, Lighthouse or Storybook. The live site's headers and performance were unmeasured. History was not scanned for secrets. Every service-role query in the Edge Functions was not reviewed line by line. The findings above are real, but "not found" in an unexamined area is not "safe".
