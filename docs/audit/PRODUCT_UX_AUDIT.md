# Product and UX audit — ReplyFlow

Audit date: 2026-11-04. Mode: read-only.

## What this report is, and is not

This is a review of the design system, the code of each screen, the routes, and the product's own history, plus measured bundle sizes.

It is **not** a real-browser audit. The sandbox cannot reach the live site (the proxy returned 403), the app needs a signed-in session, and no Playwright, axe-core, Lighthouse or Storybook run was done. Anything below about how a screen looks or feels in a browser is therefore a judgement from code, not an observation. Section "Verification still owed" lists exactly what to run.

## Executive summary

The interface already follows an Apple-informed direction: large collapsing titles on mobile, a floating bottom pill, grouped-list sheets, spring easing, swipe rows, segmented controls and pressed states. That work should be kept, not replaced.

The bigger product risks are structural, not visual:

1. A second business cannot configure Messenger auto-replies (the settings screen edits a single shared row). See SECURITY_AUDIT S-01.
2. The brief asks for light and dark modes. The product is deliberately light-only (an earlier decision). That is a conflict to resolve, not a defect to fix quietly.
3. The first screen ships a 2.25 MB script (633 KB gzipped), which hurts first load on phones.
4. Quality is not guarded by browser tests in CI.
5. The module count has grown quickly (finance, stock, money book, reports, invoices). Navigation needs a pass so the daily inbox/orders/posts work does not get buried.

## Apple Liquid Glass assessment

**Authority.** Apple's Human Interface Guidelines and the Liquid Glass overview are the reference. I did not fetch them in this pass, so the points below come from established HIG principles (clarity, deference, depth; glass for the navigation layer, content on stable surfaces), not from re-reading the current pages.

| Area | Current state (from code) | Verdict |
| --- | --- | --- |
| Tokens | oklch tokens in `src/index.css`: coral tint, crimson destructive, warm neutrals, `--spring` easing | Keep. Good base |
| Navigation | Floating pill bar and grouped "More" sheet on mobile; toolbar and tab marker on desktop | Right place for glass. Keep content surfaces opaque |
| Motion | `linear()` spring curve, `.press` state, drag-to-dismiss sheets | Good. Confirm `prefers-reduced-motion` is honoured everywhere (not verified) |
| Typography | Inter variable; large collapsing titles | Acceptable. SF Pro is not licensable for web, so Inter is the right call |
| Colour modes | Light only, by decision | **Decision needed** (see below) |
| Data surfaces | Tables, forms, invoices and money screens use plain surfaces | Correct. Do not add blur here |

**Recommendation.** Apply real glass (translucent material with a subtle edge highlight) only to: the mobile tab pill, desktop toolbar, the command/search palette, popovers and menus, and sheet grabbers. Keep every table, form, order, invoice and money screen on solid surfaces. Implement it as a small CSS token set (`--glass-bg`, `--glass-border`, backdrop blur 16–24px) with a solid fallback when `backdrop-filter` is unsupported or reduced-transparency is requested. Test on a mid-range Android phone, because blur is the main performance cost.

**Light and dark.** Dark mode is a real project (every token pair, every chart, the PDF-adjacent screens, contrast checks). Your earlier instruction was "light-only", and the brief now says light and dark. Treat dark mode as an explicit decision: either keep light-only and update the brief, or schedule dark as a later phase after the glass tokens exist. I have not changed anything.

## Libraries and skills — adoption decisions

I could not verify the listed repositories: the session's GitHub access is scoped to this repository, and the sandbox proxy blocks most other hosts. So **maintenance, licence and compatibility are unverified for every external repository below**. Decisions here are based on fit with the existing stack only. Verify each before adopting.

| Item | Decision | Reason |
| --- | --- | --- |
| shadcn/ui | Already in use | Keep |
| TanStack Query | Already in use (`^5.101`, with persist) | Keep |
| `@hello-pangea/dnd` | Keep; do not swap for dnd-kit | Working drag-and-drop on the deals board; replacement has no demonstrated benefit |
| Playwright | Already present (`@playwright/test`) | Use it in CI (currently only `e2e/` specs exist, not run in CI) |
| Storybook | Already present (v10) | Use for glass components and states |
| axe-core / axe-playwright | Adopt for tests | Small dev dependency; automates WCAG checks |
| Lighthouse | Run as a tool (CI or manual), not a dependency | |
| Motion | Not now | Current CSS spring is enough; avoid ~30–50 KB for little gain |
| simple-liquid-glass, liquid-glass-react | **Reject for now** | A CSS token set is smaller, faster and avoids a dependency. Revisit only if you want physically accurate refraction, which costs performance |
| TanStack Table | Optional | Only if lists need column-level features the current react-admin lists lack |
| FullCalendar | Defer | A custom `PostCalendar.tsx` exists. Adopt only if day/week/drag-reschedule is confirmed missing |
| Tiptap | Defer | Adopt only if the post composer needs rich text; Meta posts are plain text plus media |
| Apple-design skills (four repos) | Do not install the collections | Use as reading material; overlapping guidance |
| UX/UI audit skills | Defer | Run the checklist manually first |

## Navigation and information architecture

Evidence from `Header.tsx` and `MobileNavigation.tsx`: the "More" menu now holds Reports, Stock, Money book, Bills, Accountant's pack, Invoices and Business and VAT, alongside CRM and settings.

- **Finding (P2).** Eight finance-flavoured entries sit in one flat list. A new user sees an accountancy suite before they see the inbox. Group them under one "Money" section, hide the whole group behind a setting for businesses that have not turned on invoicing or VAT, and keep Inbox, Orders, Posts, Deals as the primary tabs.
- **Finding (P2).** The Messenger auto-reply settings link goes to `/messenger_settings/1`, a fixed id. It only works for the first business (SECURITY_AUDIT S-01).
- **Resolved earlier.** Mobile "Not Found" on Deals, Team, Companies, Profile and Import (routes were desktop-only). The mobile route set in `root/CRM.tsx` now registers them. Re-verify in a browser.

## Workflow audit by module

| Module | What exists | Gaps seen in code and history |
| --- | --- | --- |
| CRM | Contacts, companies, deals, tasks, notes, tags, merge, import | Duplicate detection beyond manual merge; bulk operations beyond tags not checked |
| Commerce | Products, orders, payments, quotes, invoices, credit notes, stock, bills | Purchase orders and goods-received matching are not built; bill-to-stock link now avoids double counting on order margin |
| Inbox | Messenger inbox, saved replies, internal notes, auto-replies, push notifications | Per-business auto-reply settings (S-01); assignment/resolved states "where supported" not verified |
| Marketing | Post composer, calendar, autopilot, tracked links, comment replies | Post performance reporting depth not verified; calendar views (day/week/month) not verified |
| Finance | Money book, VAT, accountant's pack, P&L, channel and cash-forecast reports | Xero/QuickBooks/Sage import layouts unverified against the real software; cash-accounting VAT uses invoice dates |
| Admin | Business and VAT settings, roles, sign-up gating, demo business | Org switcher: a user belongs to one organisation, so there is no switcher to test. If agencies need several businesses per user, that is a new feature, not a bug |

**Decorative or unverified controls.** I did not click through screens, so I cannot list controls that do nothing. Run the Playwright smoke test below to find them.

## Accessibility

Not measured. Known positives from code: shadcn/Radix primitives provide focus management and ARIA for dialogs, menus, tabs and tooltips. Risks to check: contrast of coral on tinted backgrounds, touch targets under 44 px in dense lists, the swipe rows (needs a non-gesture alternative), focus return after sheet dismissal, and reduced-motion handling for the spring animations and glass.

## Performance (measured)

From the production build in `dist/`:

| Asset | Raw | Gzip |
| --- | --- | --- |
| Main app script `index-*.js` | 2.25 MB | 633 KB |
| `jspdf` (lazy) | 435 KB | not measured |
| `html2canvas` (lazy) | 214 KB | not measured |
| Largest route chunk (`DealList`) | 150 KB | not measured |

The PDF libraries are already lazy-loaded, which is correct. The main script is the problem: everything in the admin shell ships up front. **Recommended:** split by route (finance, stock, posts, reports), and analyse with the existing `rollup-plugin-visualizer`. Target: main script under 300 KB gzipped; measure LCP and TBT with Lighthouse before and after on a throttled mobile profile. These targets are my proposal, not a measured baseline.

Database: the performance advisor now reports no unindexed foreign keys. 80 "unused index" notices are expected on a low-traffic project; do not drop them.

## Product opportunities

| Tier | Opportunity | Why |
| --- | --- | --- |
| Essential | Per-business Messenger settings and breaker | Required for more than one business |
| Essential | Browser tests for the five core journeys in CI | Nothing guards regressions today |
| High value | Group finance navigation; progressive disclosure | Daily work is inbox, orders, posts |
| High value | Route-level code splitting | Largest measured user-facing cost |
| High value | Purchase orders and goods received matched to bills | Closes the buy-stock → produce → sell loop |
| High value | Assignment and "resolved" state in the inbox, with unread counts per person | Team handling of Messenger |
| Optional | Dark mode on the glass token set | Pending your decision |
| Optional | Automation rules (for example, tag and task on keywords) | Only after the inbox basics |
| Future | Staff and contractor records, timesheets, pay-summary export | Previously discussed; not started |
| Future | Reporting exports for more accounting products | After the existing layouts are verified |

Avoid adding more finance features until the existing ones are verified by an accountant's import test.

## Verification still owed (real browser, needs a test login)

1. Playwright smoke test of: sign in, inbox open/reply, create order, create post and schedule, open each "More" item, at 390 px and 1280 px wide.
2. `axe-playwright` on each of those screens; fix serious and critical violations.
3. Lighthouse mobile run on the sign-in page and the dashboard, recorded as the baseline.
4. Storybook stories for the glass toolbar, tab pill, sheet and popover in all states (hover, focus, pressed, disabled, loading, empty, error).
5. A reduced-motion and reduced-transparency pass.

## Backlog

| Priority | Item | Evidence | Acceptance |
| --- | --- | --- | --- |
| P1 | Per-business Messenger settings screen | `/messenger_settings/1` hard-coded in four files | Second business saves and sees only its own settings |
| P1 | Playwright core-journey suite in CI | `ci.yml` has no browser step; `e2e/` has 4 specs | Suite runs on every push; fails the build on regressions |
| P2 | Route-level code splitting | 2.25 MB main script | Main script ≤ 300 KB gzip; Lighthouse mobile performance ≥ 80 (proposed) |
| P2 | Regroup finance navigation | 8 flat "More" entries | Finance hidden until enabled; inbox/orders/posts/deals primary |
| P2 | Glass token set for nav layer | Existing tokens, no glass layer | Glass only on nav/popovers; solid fallback; no layout shift |
| P2 | Accessibility pass | Not measured | Zero serious/critical axe violations on core screens |
| P3 | Dark mode | Light-only decision | Decision recorded; if yes, all tokens paired and contrast checked |
| P3 | Purchase orders and goods received | Not built | Bill matches PO and receipt |
