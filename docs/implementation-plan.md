# abcfinance phase 1: implementation plan (rebuild from the handover docs)

## Context

abcfinance runs a white-labelled finance section on partner newspapers' subdomains (e.g. `money.tarunbharat.net`). Institutions publish articles and sponsored calculators there through a multi-step approval workflow, and the newspapers earn from a revenue pool and ad revenue. A reference implementation exists, but we have no access to it, so we are **rebuilding from the handover pack** in `docs/handover/` (01–11), `docs/TESTING.md` and the spec PDF. The pack is the source of truth for behaviour; doc 08 (651 acceptance checks) is the definition of done.

**Decisions made with the user**

| Decision | Choice |
| --- | --- |
| Stack | Next.js + TypeScript, one app hosted as a single unit |
| Team | 2–4 developers, so work streams must run in parallel |
| Target | **Phase gate first**: Tarun Bharat plus one paying sponsor on 2+ papers with leads flowing. Then complete the 3×3 phase-1 scope (finance, widgets, ads). |
| Timeline | No fixed date; plan by milestone |
| Hosting | Our own VPS in India; **nginx is already installed and running on it**; Postgres in Docker on the same VPS |
| Design | Designed in code by the team, with no separate designer |
| Code location | This folder (`/home/atharv/projects/finance-cms`) as a new git repo, with `docs/` kept alongside |
| Done means | Each milestone ports its doc-08 checks into automated tests and passes them |

## Stack

| Layer | Choice | Notes |
| --- | --- | --- |
| Runtime | Node 24 LTS, pnpm | |
| App | Next.js 16 (App Router), TypeScript strict | `output: "standalone"` for Docker |
| DB | PostgreSQL 17, UTF-8 | Same VPS (Docker), nightly offsite dumps |
| ORM / migrations | Drizzle ORM + drizzle-kit (SQL migrations committed) | The partial unique index for "one master per (article, language) where tenant IS NULL" is written explicitly |
| Validation | Zod | One schema each for forms, server actions and endpoints |
| Styling | Tailwind v4 + CSS variables | Each tenant's theme tokens come from its DB row and are injected in the layout |
| Panel UI | shadcn/ui (Radix) | Panels only; the reader site stays light on JavaScript |
| Auth | Own implementation on `node:crypto` | scrypt (N=16384, 16-byte salt, 64-byte key); TOTP per RFC 6238 (SHA-1, 6 digits, 30 s, ±1 step, replay guard); `qrcode` for enrolment |
| Crypto | AES-256-GCM and HMAC-SHA-256, keyed from `APP_SECRET` | Covers leads, 2FA secrets, outbox bodies, visitor and phone hashes |
| Mail | nodemailer via `SMTP_URL`; DB outbox sent by cron | |
| Rate limits | Postgres-backed counters (UNLOGGED table) | Survives restarts; closes gap 06.7 #1 early |
| Caching | Next.js data cache with tags, purged with `revalidateTag` on publish, takedown and edit | Covers the "cache and purge" production gap without a CDN |
| Widget loader | `widgets/loader.ts` built to ES5 with esbuild | Served at `/_w/widgets.js` on newspaper hosts |
| Tests | Vitest for unit, integration (real Postgres) and HTTP e2e; Playwright only for browser/DOM checks | Every test names its doc-08 check ID |
| CI | GitHub Actions | Lint, typecheck, unit, integration (Postgres service), e2e |

## Repository layout

```
finance-cms/
  docs/                         existing handover pack (unchanged)
  src/
    proxy.ts                    host → tenant; language prefix and 308 redirects; rewrites newspaper paths
                                 (/_a/h, /_w/*, sitemap, robots, ads.txt) to internal routes; panels on APP_URL host
    app/
      sites/[host]/[lang]/[[...path]]/   reader site (server-rendered, cached)
      sites/[host]/{sitemap.xml,robots.txt,ads.txt}/
      (auth)/login, login/verify, forgot, reset/[token], invite/[token], account/security
      (panel)/dashboard, articles, publisher, leads, calculators, reports, finance, widgets, ads, users, account/password
      api/track, api/widgets/{match,click}, api/cron/deemed
    domain/                     PURE rules, no DB, unit-tested: workflow, approvals, checks, markup,
                                 seo, leads, consent, calc/*, analytics/bots, time (IST), pool, statement,
                                 widgets/match, ads/policy, password, totp, roles
    server/                     db/schema.ts, db/client.ts, services per feature, auth/session,
                                 crypto/{secret-box,hmac}, mail/outbox, ratelimit, audit, tenant-cache
    components/reader/, components/panel/, components/calculators/
  widgets/loader.ts
  db/migrations/, db/seed/      seed reproduces the TESTING.md demo world
  tests/unit, tests/integration, tests/e2e, tests/acceptance/INDEX.md (doc-08 ID → test, status)
  deploy/Dockerfile, docker-compose.yml, nginx/abcfinance.conf, add-tenant-host.sh, backup/, cron
```

Layering rule: `app/` calls `server/` services, and services use `domain/` rules. Only `server/` touches the database. This keeps the business rules (doc 04) in one place, as doc 02 §2.1 #5 requires.

## Infrastructure (own VPS in India, existing nginx)

- **Docker Compose** with two containers: `app` (Next standalone, bound to `127.0.0.1:3000`) and `postgres` (not exposed publicly). The existing **host nginx** is the reverse proxy.
- **nginx config** (`deploy/nginx/abcfinance.conf`):
  - one server block for the panel host;
  - one catch-all `443` server block for newspaper hosts, using variable certificate paths (`ssl_certificate /etc/letsencrypt/live/$ssl_server_name/fullchain.pem`, needs nginx ≥ 1.15.9);
  - passes through `Host`, sets `X-Forwarded-For` and `X-Forwarded-Proto`. The app trusts the forwarded IP only from 127.0.0.1, because rate limits and visitor hashes depend on it;
  - gzip/brotli; long caching for `/_next/static`;
  - no nginx page cache. Page caching and purge live in Next.js (tag revalidation).
- **TLS for newspaper subdomains:** the newspaper adds a CNAME to `edge.<our domain>`, then we run `deploy/add-tenant-host.sh money.paper.com`. It runs `certbot certonly --webroot` and reloads nginx, and certbot's timer handles renewals. No code change and no redeploy. This is a small deviation from "TLS automatic" (07.3) and will be recorded in `docs/decisions.md`.
- **Scheduled job:** a cron entry (or supercronic container) calls `POST /api/cron/deemed` (the path in doc 05) with the bearer `CRON_SECRET` every 5 minutes. A dead-man's-switch alert fires on a missed run.
- **Backups:** nightly `pg_dump`, encrypted, pushed offsite (object storage in India), with a restore drill before launch. `APP_SECRET` is backed up separately from the database.
- **Monitoring:** uptime check per host (99.5% target), error tracking, outbox-queue depth, and cron heartbeat.

## Milestones

Each milestone ends when its doc-08 checks are automated and green in CI, and the TESTING.md walk-through for that area passes by hand.

### Part A: to the phase gate

**M0. Foundations** (whole team, short)
- Repo, pnpm, ESLint, Prettier, TS strict, CI, Docker Compose dev (Postgres), and env validation with Zod (doc 07.1 variables).
- **Full Drizzle schema for every entity in doc 03**, built once up front so the parallel streams don't collide. Includes migrations, the partial unique index, and the invariants in 03.7.
- `secret-box`, `hmac`, IST date utilities, audit writer, Postgres rate limiter, mail outbox table, cron endpoint skeleton.
- A seed framework and the base demo world: 3 tenants (Tarun Bharat live/red/mr+en; Paper B staging/blue/en+mr; Paper C staging/green/mr), 8 sections, 5 disclaimer templates, glossary, authors, 3 institutions, abcfinance org and 3 publisher orgs, and the 15 demo users with password `Demo-Pass-2026`.
- `tests/acceptance/INDEX.md` generated from doc 08, listing every check with an ID, milestone, test file and status; `docs/decisions.md` started.
- The cookie-keeping HTTP test client and the harness that starts the app on the e2e port.

**M1. Tenancy and reader site** (02, 04.4–4.5, 05.1)
- `proxy.ts`: host resolution (30 s cache), unknown host returns 404, default language unprefixed, prefixed default language redirects 308.
- Pages: home, section, article, calculators list (stub), glossary, experts, partners, 404. Only published paper copies are visible.
- Theming from tenant tokens; self-hosted Latin and Devanagari fonts; header, menu and "Powered by abcfinance" footer.
- Reader labels: "Partner content", the explicit vs deemed approval label, and the expert tag with affiliations.
- Article body markup parser (04.2): it builds elements without injecting HTML, sanitises links and applies `rel` rules (04.11), and auto-inserts the disclaimer by section.
- SEO: canonical (pointing to the first paper that published), hreflang, Open Graph, Article JSON-LD, per-host sitemap and robots, and staging set to noindex plus `Disallow: /`.
- Tagged caching, purged on content change.

**M2. Identity and panel shell** (04.1, 04.12 sign-in, 06.1)
- Password policy, scrypt hashing, sign-in with dummy-hash timing parity, lockout after 5 failures for 15 minutes, and a per-address sign-in limit (closes 06.7 #1).
- DB sessions (256-bit token, SHA-256 stored, 12 h, HttpOnly/Lax/Secure, `mfaVerified`); TOTP enrolment and verification; 2FA enforcement for every role except the two writer roles.
- Role-per-organisation permission helper (`domain/roles.ts`); same-origin check on form posts.
- Panel layout with a role-aware menu, dashboard ("waiting for you", recent activity), and audit events.

**M3. Article workflow and publisher approval** (04.2–4.3). Split in two (2026-10-09) because it
is the largest milestone, at about 90 checks.

**M3a. Authoring and institution approvals** (plan: `docs/plans/m3a-authoring-approvals.md`)
- Article editor: markup, live preview, automated checks shown live (English and Marathi
  patterns), history, add a language.
- State machine with per-role transitions, required comments on return, and workflow events.
  Concurrent edits and steps use optimistic concurrency: a version column, and the loser is told
  someone else changed it (D22).
- "Your turn" markers and the dashboard's "Waiting for you".

**M3b. Release, the publisher queue and deemed approval** (plan:
`docs/plans/m3b-release-publishing.md`; decisions D26–D31)
- Release to several papers: language support check, skip papers that already have it, per-copy
  explicit-approval reasons (first 3 articles from an institution, a flagged check, held
  section), and a release-preview screen.
- Publisher queue: approve, hold (reason required, stops the clock), take down (reason required,
  works on live copies). `publisher_admin` can view only.
- Cron step for deemed approval (idempotent; concurrent human decisions win), the "publish
  anything past its window now" button, and review-due flags.
- abcfinance staff see every paper's queue read-only (D28). A taken-down article answers 404
  (D27). Page caching moved to M6 behind a `contentChanged()` hook (D26). The mail outbox sender
  was already wired into cron in M0.

**M4. Calculators and leads** (04.6–4.7, 06.4–6.5; plan: `docs/plans/m4-calculators-leads.md`).
Split in two (2026-10-09): **M4a** calculators, sponsor rates and branding (D32–D34); **M4b**
lead capture and the sponsor inbox (D35–D40).
- The 7 formulas in `domain/calc/` with doc-04 defaults, lakh/crore wording (en/mr), "how this is worked out", "rates as of" date, and React client components embedded with `{{calc:slug}}` plus `/calculators/<slug>` pages.
- Rate precedence (sponsor → abcfinance → built-in), the rates panel with range validation, "as of" date rules, reset, and audit.
- Branding matrix: institution article / sponsored / exclusive category / independent expert.
- Lead form and capture:
  - sponsor resolved on the server only;
  - validation, Indian mobile normalisation, honeypot, and the limits 5/h per address, 3/day per phone, 24 h duplicate window;
  - consent text generated on the server and stored verbatim as `v1`;
  - encryption, retention (`deleteAfter`), and the new-lead email to the sponsor's admins.
- Leads inbox (sponsor's account admins only): statuses and notes, quality report, CSV export with formula neutralisation, erasure (personal data blanked, consent record kept), and a cron retention purge.

**M5. Analytics, reports, user management** (04.8–4.9 reports, 04.12)
- Tracker component and `POST /_a/h`:
  - `text/plain`, always 204, 2 KB cap;
  - same-origin check, bot filter, 120 events/min per visitor (keyed HMAC);
  - de-duplication by `pv`;
  - engaged read = client side 20 s visible and 50% scrolled, server side at least 15 s;
  - calculator-use crediting, atomic `PageStat` upserts, 30-day `PageView` prune.
- Reports: the `inst-*` and `pub-*` report sets (plus `abc-seo` and `abc-articles`), a month picker, and CSV export (BOM, CRLF, formula-safe, audited). The pool and finance reports come in M7.
- User management: invitations (7 days, replace, re-send, withdraw, existing-user path), forgot/reset (rate limits, newest link only, 60 min), change password, role editing with guards, 2FA reset, deactivate/reactivate, link-page headers, and emails built from `APP_URL`.
- **Analytics must be live at launch**: the revenue pool (M7) is computed later from the engaged reads collected from day one.

**M6. Production and phase-gate launch**
- Compose stack on the VPS, nginx site config, certificates for each newspaper host, backups and a restore drill, monitoring and alerts, and SMTP with SPF/DKIM/DMARC.
- Content-Security-Policy and the security headers; `/dev/outbox` excluded from production builds; an internal security review against doc 06.
- Real Tarun Bharat theme from their brand assets; Core Web Vitals checked on a real mid-range Android over 4G.
- Real sponsor calculator rates entered.
- Page caching, if measurements on the VPS call for it: fill in `contentChanged()` (D26), which
  is already called on publish, hold and take-down.
- Tarun Bharat set to `live`, the second paper onboarded (CNAME, tenant row, contract), and the first sponsor's plan and users invited.
- **Gate:** one paying sponsor live on 2+ papers, articles indexed, leads arriving at the sponsor's inbox.

### Part B: completing phase 1 (3×3)

**M7. Revenue sharing and finance** (04.9): pool (30% plus tenure step per paper, annual ÷ 12), statements (AdSense 50%, year-1 guarantee advance and recovery), draft → issued → paid with locking, the `/finance` panel, and the `pub-pool`, `pub-payouts` and `abc-sponsors` reports. The spec's worked example (₹18,000) is a unit test.

**M8. Newspaper widgets** (04.10): ES5 loader (shadow root, idle wait, 3.5 s give-up, no cookies, `textContent` only); `/_w/m` match (scoring, rotation, defaults, no repeated target, CORS allow-list, 120/min); `/_w/c` clicks; `/widgets` panel with preview and reasons; `pub-widgets` reports; `public/demo-newspaper.html`.

**M9. Ads** (04.11): page matrix, slot planner and reserved heights, in-text placement rules, exclusivity, MCM go-live state machine and kill switch, `ads.txt`, deferred non-personalised GPT loader, `/ads` panel with rules tester, and `ADS_PREVIEW`. Real Google account steps are business tasks.

**M10. 3×3 completion**: third paper and remaining institutions onboarded; optional tenant/plan admin screen (the first gap in 09.2); vendor-exit article export; all 651 checks green.

## Parallel work streams (after M0 and the start of M1)

| Stream | Milestones | Depends on |
| --- | --- | --- |
| A. Platform and identity | M1 proxy and tenancy → M2 → M5 user management → M6 infrastructure | M0 schema |
| B. Content | M1 reader pages → M3 workflow and publisher | proxy, M2 permissions helper |
| C. Conversion | M4 calculators (pure formulas can start on day 1) → leads | M1 reader article page |
| D. Data and design | Design tokens and reader UI polish, then M5 analytics and reports, then M7 | M1 |

With 2 developers, merge A+B and C+D.

Shared interfaces (frozen in M0): the DB schema, `domain/roles.ts`, `requireMembership()` and session helpers, `getTenant()`, the audit writer, the outbox writer, and the rate limiter.

## Design approach (designed in code)

- Design tokens (colour, fonts, spacing, radius) with tenant overrides. Reader article and home pages are built first for Tarun Bharat in Marathi and English, checked on a phone, then the other papers' themes are derived from the same tokens (doc 11.5).
- Required blocks on reader pages (11.3): labels, disclaimer, "Powered by", the "Advertisement" label, byline with credentials, and reserved ad space.
- Performance budget for reader pages: server-rendered, with no client JavaScript except the tracker, calculators and lead form; CLS of 0.
- Panels use shadcn/ui; the publisher queue must work on a phone.
- Polish reviews use the project skill `make-interfaces-feel-better` (`.claude/skills/`).

## Testing and verification

Doc 08 has **651 checks without IDs**, in two parts: **475 end-to-end checks** in 9 groups and **176 unit checks** in 9 groups. In M0 we assign IDs (e.g. `E2E-WF-12`, `U-CALC-07`) in `tests/acceptance/INDEX.md`. Each test names its ID in its title, and a script fails CI when a check due in a completed milestone has no passing test.

| Doc-08 group | Count | Milestone |
| --- | --- | --- |
| E2E sign-in, 2FA, lockout, audit | 20 | M2 |
| E2E workflow rules | 40 | M3a (18) and M3b (22) |
| E2E workflow via pages and reader view | 30 | M1 (5), M3a (15), M3b (the rest) |
| E2E leads | 53 | M4 |
| E2E calculators and rates | 33 | M4 |
| E2E analytics and reports, finance | 59 | M5 (finance subset in M7) |
| E2E users | 100 | M5 |
| E2E widgets | 80 | M8 |
| E2E ads (link-`rel` checks in M1) | 60 | M9 |
| Unit: auth / workflow / leads / calc / pool / analytics / widgets / ads / users | 11 / 23 / 12 / 30 / 13 / 12 / 23 / 34 / 18 | Same milestone as the feature |

- **Unit tests** (Vitest) cover the pure `domain/` modules, including the RFC 6238 test vectors and the spec's pool example (₹18,000).
- **Integration tests** (Vitest + real Postgres) cover:
  - concurrency: two simultaneous submits with exactly one winner, and 10 simultaneous first views with no lost updates;
  - sweep idempotency;
  - encryption at rest;
  - retention purge and the 30-day prune;
  - outbox retry;
  - rate limits;
  - cross-sponsor isolation.
- **HTTP end-to-end** covers most of the 475 checks. It uses Vitest and a cookie-keeping fetch client against `next start` with `TENANT_CACHE_SECONDS=0 WIDGET_CACHE_SECONDS=0`, and asserts status codes, headers (CORS, Cache-Control, Referrer-Policy, Set-Cookie), HTML, form posts, and emailed links read from the outbox. Multiple hosts work through `tarunbharat.localhost`, `paperb.localhost`, `paperc.localhost` and the panel host.
- **Browser end-to-end** (Playwright) is only for what needs a real DOM: the widget loader (shadow root, idle wait, placement, timeout), the ad loader injecting Google's script after load, and the main UI flows.
- **Seed**: e2e tests depend on the TESTING.md demo world (15 users, 14 articles in the listed states, deem times of about 20 h and 3 h, the Life Insurer's exclusive life-insurance category, 45 days of traffic). The 5 unnamed articles and the contract figures are invented and documented in `db/seed/README.md`.
- **Manual**: the TESTING.md walk-through per milestone; before launch, a Lighthouse/CWV run on a real mid-range Android over 4G.

## Spec items missing from the handover (not in the phase-gate scope; decide at M10)

These are in the spec PDF but neither built nor listed as gaps in the handover:
- home page "trending" and "rate snapshot";
- author and FAQ structured data;
- EMI amortisation chart;
- a sponsor owning a calculator *group*;
- desk managers scoped to particular desks;
- flagging independent-expert articles that mention the expert's affiliations.

Author `Person` JSON-LD costs almost nothing, so it goes in M1. The rest go to the business for a decision.

## Assumptions (taken from doc 09.3 unless changed)

The 18 decisions in 09.3 apply as written, including: a 24 h veto window, engaged read = 20 s, 50% scroll and server minimum 15 s, 365-day lead retention, and only the sponsor's admins seeing leads. Ambiguities found in the docs (canonical after the first paper takes down; junk % denominator; guarantee recovery after year 1) are resolved as each milestone starts and recorded in `docs/decisions.md`.

## Inputs needed from the business (they block M6, not earlier milestones)

- Tarun Bharat brand assets.
- First sponsor and plan terms; real calculator rates.
- Legal sign-off on consent, disclaimers and labels, in Marathi and English.
- Production domain.
- SMTP provider.
- VPS in India.
