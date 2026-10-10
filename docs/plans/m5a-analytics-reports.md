# M5a: First-party analytics and reports

## Context

M4 and the workflow changes D41–D46 are done (`f59595e`, CI green, 282/282 due checks covered). M5 (analytics, reports, user management) was too large at about 160 checks, so it is split into two:
- **M5a (this plan):** the reader tracker, the `POST /_a/h` beacon, the counters, and the `/reports` panel with a CSV export.
- **M5b:** invitations, forgot and reset password, and the `/users` panel.

Analytics goes first because it has to be collecting data from day one. The M7 revenue pool is worked out later from engaged reads, so no traffic before launch can be lost.

**Decided with the user (2026-10-10):**
- **Split:** M5a is analytics and reports; M5b is user management.
- **No money and no widget reports in M5a.**
  - `pub-pool`, `pub-payouts`, `abc-sponsors`, `abc-newspapers` and all of `/finance` come in M7.
  - `pub-widgets` and `pub-widget-pages` come in M8.
  - `pub-summary` shows traffic only, with the line "Earnings appear here once monthly statements start."
  - The doc-08 checks E2E-AN-40, 41, 42, 44 and 48–59 move to M7.
- **Calculator-use credit follows the brand the reader saw.** It uses the existing branding rule (`src/domain/sponsor.ts`, D34):
  - an institution article credits that institution;
  - an abcfinance article or a calculator page credits the sponsor whose "Sponsored by" is shown;
  - an independent-expert article credits nobody, and neither does a calculator shown unbranded because of an exclusive conflict.
- **abcfinance's super admin and desk manager can open any institution's reports, read-only,** through an institution picker. This departs from 04.9 and goes in decisions.md. Institution admins still see only their own institution.

**Decisions I made (recorded as D47–D51 in `docs/decisions.md`):**
- **D47:** the M5 split and the checks moved to M7 and M8 (above).
- **D48:** the beacon carries an extra field, `r`, holding the **host name** of `document.referrer` (no path). It is needed to tell search views apart, and doc 05's body has no referrer field. The server classifies search / another site / direct; a referrer on the same host counts as direct.
- **D49:** calculator credit goes to the brand that was shown (above). Institution reports for staff (above).
- **D50:** an engaged read counts on the **view's** Indian day, not the day the engaged beacon arrived. A read that crosses midnight stays on one row.
- **D51:** `abc-seo` thresholds. A "short summary" is under 70 characters. "Visibility" means live (indexed) or staging (noindex).

**Already in place (reuse, no migration expected):**
- **Schema:** `page_stats` (unique per tenant, page path and date), `page_views`, `calculator_uses` (unique with nulls not distinct), and `leads.tenantId` / `sourceVersionId` for leads per article and per paper.
- **Cron:** `prunePageViews()` in `src/server/jobs.ts`, already wired into the scheduled job.
- **Config:** `ENGAGED_MIN_SECONDS` in `src/server/env.ts`.
- **Helpers:**
  - `keyedHash`: `src/server/crypto/hash.ts`
  - `hit()` rate limiter: `src/server/ratelimit.ts`
  - `clientIp`: `src/server/http/client-ip.ts`
  - `indianDate`, `monthBounds`, `parseMonthOr`, `recentMonths`: `src/domain/time.ts`
  - `toCsv`: `src/domain/csv.ts`
  - `qualityReport`: `src/domain/leads.ts`
  - `calculatorSponsor` and the branding function: `src/domain/sponsor.ts`
  - `loadCalcContext`: `src/server/calc/rates.ts`
- **Permissions and menu:** `reports.institution`, `reports.publisher` and `reports.abcfinance` exist in `src/domain/permissions.ts`. The `/reports` area is already in `panel-menu.ts`, and `/reports/page.tsx` is a stub.
- **Panel patterns to copy:**
  - the paper switcher from `/publisher`;
  - `leadOrgsFor` and the audited `/leads/export` route handler, for the CSV route;
  - `requireArea` and `requestIp` from `src/server/auth/current.ts`.

## Acceptance

**`scripts/gen-acceptance-index.ts`:**
- E2E-AN and U-AN are due in `M5a`; E2E-USR and U-USR in `M5b`. The existing `sub` entries stay: `dates` in M0, `email addresses` and `passwords` in M2.
- `ID_OVERRIDES` moves E2E-AN-40, 41, 42, 44 and 48–59 to `M7`.
- Regenerate `checks.json` and bump `tests/acceptance/MILESTONE` to `M5a`.

**M5a checks:**

| Group | Checks |
| --- | --- |
| E2E-AN | 01, 03–39, 43, 45–47 (42); 02 is already covered |
| U-AN | 01–05 bot filter and referrer, 10–12 CSV (8) |

## Pure rules: `src/domain/analytics.ts` (new)

- **`isBot(ua)`:** a user agent that is missing or shorter than 20 characters is a bot. So is anything matching the pattern list: crawlers, headless browsers, monitors, link previewers, HTTP libraries and SEO bots (04.8). Checks U-AN-01 to 03.
- **`isMobile(ua)`** (U-AN-04).
- **`referrerType(refHost, ownHost)`** returns `search`, `site` or `direct`. The nine search engines are matched by host, `www.google.co.in` included (U-AN-05).
- **`parseHit(text)`** is a Zod schema:
  - `t` is `v`, `e` or `c`;
  - `pv` matches `[A-Za-z0-9_-]{12,40}`;
  - `p` starts with `/`, is at most 300 characters and has no query;
  - `k` is `article`, `calculator`, `section`, `home` or `other`;
  - `v` is an optional uuid;
  - `l` is `mr`, `en` or `hi`;
  - `calc` is a catalog slug, required when `t` is `c`;
  - `r` is optional, at most 255 characters.
  - It returns `null` on anything else.
- **`ANALYTICS`** holds the constants: 2 KB body cap, 120 events a minute, client thresholds 20 s and 50%, short page under 1.2 screens.
- **`csv.ts`** gains `percent(n, d)`: one decimal, and 0 when `d` is 0 (U-AN-12). Unit tests cover U-AN-10 and 11 against the existing `toCsv`.

## Beacon: `POST /_a/h` on newspaper hosts

**Routing (`src/proxy.ts`)**
- On a newspaper host, `/_a/h` is rewritten to `/sites/<host>/beacon` before the language split. This follows the `SITE_FILES` pattern; folders starting with `_` are private in the App Router.
- On the panel host it is a 404, because no route exists (E2E-AN-11).

**Route handler: `src/app/sites/[host]/beacon/route.ts`**
- Accepts POST only.
- Reads at most 2 KB of the body as text.
- Always answers `204` with `Cache-Control: no-store` and no cookies, whatever happens; errors are swallowed and logged.

**Service: `recordHit({ host, headers, body, now })` in `src/server/analytics/track.ts` (new)**

1. **Drop the hit** (still a 204) when any of these is true:
   - the tenant is unknown;
   - the `Origin` host isn't the request's Host, or there is no Origin;
   - `isBot`;
   - `parseHit` fails;
   - the language isn't one the paper publishes.
2. **Visitor hash and limit.** The visitor hash is `keyedHash("visitor", ip, ua, indianDate(now), tenantId)`. `hit("an:visitor", hash, 120, 60)` must be allowed (E2E-AN-27).
3. **View (`t = v`):**
   - **Trust check.** `v` is kept only if it is a `published` copy of this tenant in that language. Otherwise `versionId` is null and an `article` kind becomes `other` (E2E-AN-18 to 20).
   - **One SQL statement, as a CTE:** `INSERT INTO page_views … ON CONFLICT (id) DO NOTHING RETURNING`, then `INSERT INTO page_stats … ON CONFLICT (tenant_id, page_path, date) DO UPDATE SET views = views + 1, search_views = …, mobile_views = …`. The second insert runs only when the first one inserted a row.
   - This gives the "repeat ignored" rule (E2E-AN-07) and no lost updates when 10 first views arrive at once (E2E-AN-26).
   - No IP address is stored, only the visitor hash (E2E-AN-06).
4. **Engaged read (`t = e`):**
   - A conditional `UPDATE page_views SET engaged_at = now` requires: the same id, the same tenant, the same `page_path`, `engaged_at IS NULL`, and `viewed_at <= now - ENGAGED_MIN_SECONDS`.
   - Only when that UPDATE returns a row, `page_stats.engaged_reads + 1` on the view's day (D50).
   - This covers E2E-AN-13 to 17.
5. **Calculator use (`t = c`):**
   - The slug is added to the view's list by a conditional `UPDATE page_views SET calculators_used = array_append(…) WHERE … AND NOT (slug = ANY(calculators_used)) RETURNING version_id, kind`.
   - The credit comes from a new `calcCredit(...)` built on the branding rule in `sponsor.ts`:
     - the context is the version's article (type, organisation, section) or the calculator page;
     - the sponsorships come from `loadCalcContext`.
   - It ends with an upsert into `calculator_uses` (sponsor null when nobody gets credit). This covers E2E-AN-21 to 25.

## Tracker: `src/components/reader/Tracker.tsx` (client, new)

**Placement**
- Rendered by each page's view, not by the layout, so that 404 pages are never counted:
  - home;
  - section and article (`[...path]` views);
  - `calculators` and `calculators/[slug]`;
  - glossary and its entries, experts, partners.
- Props: `kind`, `versionId?`, `lang`.
- It renders `<span hidden data-tracker data-kind data-version>` so the HTML tests can see it (E2E-AN-01).

**What it sends**
- On mount, it makes `pv` (16 random bytes as base64url) and sends a `v` hit. The hit carries `p = location.pathname` and `r = new URL(document.referrer).hostname`, or nothing when there is no referrer.
- **Engaged read:**
  - visible time is added up with `visibilitychange` and `performance.now()`;
  - the deepest scroll is kept, as (`scrollY` + `innerHeight`) ÷ `scrollHeight`;
  - when the page has been visible 20 s and scrolled at least 50% (or the page is shorter than 1.2 screens), it sends one `e`.
- **Calculator use:** `Calculator.tsx` dispatches `window` event `abc:calc` with its slug on the reader's first change of a value. The tracker sends one `c` per slug per view.

**Transport and footprint**
- `navigator.sendBeacon("/_a/h", new Blob([json], { type: "text/plain" }))`, falling back to `fetch` with `keepalive`.
- No cookies or storage. It uses no `Intl` (gotcha 20).

## Reports

**Pure registry: `src/domain/reports.ts` (new)**
- **`REPORTS`:** key, set (`inst`, `pub` or `abc`), title, and column definitions with their kind (text, number or percent).
- **`reportsFor(ms)`** lists the keys a person may open:
  - `inst-*` for an institution account admin, and for the super admin and desk manager (read-only, D49);
  - `pub-*` for a paper's `publisher_admin`, and for staff on every paper;
  - `abc-*` for staff.
  - Writers and editors get none (E2E-AN-37, 47).
- **`canOpenReport(ms, key, scopeId)`.** `permissions.ts`: `reports.institution` gains `global: STAFF_ADMINS`.

**Services: `src/server/reports/`, one file per set**
- Each report is `run(scopeId, month) → { columns, rows, totals? }`, read from `page_stats`, `calculator_uses`, `leads` and the article and version tables, in Indian-calendar months (`monthBounds`).

| Report | What it shows |
| --- | --- |
| `inst-articles` | Each article: views, engaged reads, engaged rate, leads |
| `inst-newspapers` | Reads by paper |
| `inst-languages` | Reads by language |
| `inst-calculators` | Calculator uses credited to the institution |
| `inst-leads` | Status counts for the month through `qualityReport` (aggregates only, no lead details) |
| `inst-plan` | Papers on the plan vs allowed; articles first published this month vs `articlesPerMonth` |
| `pub-summary` | Views, engaged reads, engaged rate, search share, phone share, copies published, and the earnings line |
| `pub-traffic` | By page type: institution, abcfinance or independent article (from `articles.type` through `versionId`), calculators, home and sections, other |
| `pub-top-pages` | Top 25 by views |
| `pub-approvals` | Copies published in the month, explicit vs deemed, with who decided (event actor or `actorLabel`) and when; totals |
| `abc-articles` | Top articles across papers |
| `abc-seo` | Per paper: visibility (live/indexed or staging/noindex, E2E-AN-45), search share, engaged rate. Lists: single-language articles, overdue reviews (`reviewBy` < today), summaries under 70 characters, published pages with no views this month |

- **`runReport(actor, key, scopeId, month)`** checks `canOpenReport`. A scope the person may not see, or another sponsor's data, is `forbidden()` (E2E-AN-31, 35, 39).

**Pages and export**
- **`/reports`:**
  - a scope switcher: institution, or paper for publishers and staff, in the `/publisher` switcher style;
  - report tabs as links (`?report=&month=&org=|paper=`);
  - 12 month buttons from `recentMonths`, with an invalid month falling back to the current one (E2E-AN-36);
  - one `ReportTable` (shadcn table, numbers right-aligned, scrolls sideways on phones);
  - a "Download CSV" link.
  - No charts (charts are phase 2).
- **`/reports/export/route.ts`:** the same guard, `toCsv`, `Content-Disposition` with the key and month, and an audit row `report.export` with key, scope and month (E2E-AN-33, 34).
- **Components:** `src/components/panel/ReportTable.tsx` and `MonthPicker.tsx`.

## Seed: `db/seed/traffic.ts` (new; TESTING.md's "45 days of traffic")

- A fixed-seed random generator, so the same seed gives the same data.
- It writes `page_stats` for every published copy plus home, sections and calculator pages, over the last 45 Indian days.
- It writes `calculator_uses` credited by the same `calcCredit`.
- No `page_views` rows are seeded.
- Invented figures are noted in `db/seed/README.md`.

## Tests

**Unit: `tests/unit/analytics.test.ts`**
- U-AN-01 to 05; `parseHit` edge cases.
- U-AN-10 to 12 in `tests/unit/csv.test.ts`.
- `reportsFor` / `canOpenReport` per role.

**Integration: `tests/integration/analytics.test.ts`**
- `recordHit` with an injected `now`: dedupe; the engaged window (backdated `viewed_at`); calculator credit for each brand case; day boundary (D50).
- Prune: rows 31 days old are deleted and rows 29 days old are kept.

**End-to-end, HTTP: `tests/e2e/analytics.test.ts`**
- Beacons are posted with the right `Origin` and a browser user agent. Each test uses a unique path such as `/e2e-<rand>` or `kind: other`, so the seeded traffic doesn't interfere.
- Engaged reads backdate `page_views.viewed_at` in the database instead of waiting 15 s.
- Ten parallel posts for E2E-AN-26; a flood loop for E2E-AN-27; old rows plus the cron endpoint for E2E-AN-28.
- Helpers go in `tests/e2e/analytics-helpers.ts`.

**End-to-end, reports: `tests/e2e/reports.test.ts`**
- Access per role: admin.amc, admin.gi, writer.amc, admin.tb, super.abc, desk.abc, editor.abc.
- Table numbers vs a direct database sum; CSV parity and BOM; month picker; another sponsor's data refused; `abc-seo` marks Paper B as noindex.
- Staff can open an institution's reports (D49).

**Browser: one Playwright test (`tests/e2e/tracker-browser.test.ts`)**
- Open an article: a view is recorded with its version.
- Change a calculator value: one calculator use is recorded.
- Uses the `E2E_CHROMIUM` override from gotcha 19.

**Existing tests:** the stub expectations for `/reports` in the panel tests are updated.

## Order of work

1. Acceptance mapping (M5a, M5b, M7 overrides), plus decisions D47–D51, plus saving this plan as `docs/plans/m5a-analytics-reports.md`.
2. `domain/analytics.ts` and `csv.percent`, with unit tests.
3. Beacon route, proxy rewrite and `recordHit`, with integration and HTTP e2e tests.
4. Tracker component and the `abc:calc` event, with the browser test.
5. Report registry, services, `/reports` and the export route, with e2e tests.
6. Traffic seed; walk through TESTING.md §5 steps 1, 2 and 4 by hand (the finance step is M7).
7. Polish review with `make-interfaces-feel-better` on `/reports` at phone width.
8. Updates: `graphify update .`, handoff.md, the README run notes if needed; commit and push to `main`.

## Verification

- `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test && corepack pnpm test:int`.
- `corepack pnpm test:e2e`. Warn the user first: the build takes about 10 minutes. Use `E2E_CHROMIUM=…` for the browser test.
- `npx tsx scripts/gen-acceptance-index.ts --check M5a` passes, and CI goes green on push.
- **Manual check:**
  - `corepack pnpm db:reset`;
  - on the user's `next dev`, open an article on `tarunbharat.localhost:3000`, stay about 25 s and scroll;
  - as `admin.amc` and `admin.tb`, open **Reports** for this month: the view and the engaged read are there;
  - download a CSV and open it in Excel or LibreOffice: Marathi displays correctly.
