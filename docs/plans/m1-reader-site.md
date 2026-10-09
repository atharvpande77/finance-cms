# M1: Tenancy and the reader site

## Context

M0 shipped the foundations: schema, crypto, jobs, seed and the test harness (repo `atharvpande77/finance-cms`). The overall plan is in `docs/implementation-plan.md`.

M1 makes each newspaper's finance section real:
- a request to `tarunbharat.localhost` (later `money.tarunbharat.net`) is resolved to its newspaper;
- it serves the public pages in Marathi or English, with that paper's theme, labels, disclaimers and SEO tags (canonical, hreflang, JSON-LD, sitemap, robots).

There is no workflow, leads, calculator logic or ads yet. Published content comes from the seed.

**Decided with the user:**
- **Look:** follow tarunbharat.net's visual identity inside our modern, clean design.
  - Measured from the live site: cream page `#fffbf4`, ink `#212529`, red wordmark (logo red about `#f00`, navy secondary), black utility strip, light menu bar `#fafafa` with a **3px black bottom rule**, menu items in **Karma** bold, headlines in **Noto Sans**.
- **Calculators:** `{{calc:slug}}` and `/calculators` render **reserved-height placeholder cards** until M4.

**Findings that shape the design:**
- **Next 16.4 rules** (bundled docs at `node_modules/next/dist/docs/`):
  - routing lives in `src/proxy.ts` (Node runtime);
  - `params` and `headers()` are async;
  - `NextResponse.redirect(url, 308)`;
  - multiple root layouts are allowed and must each render `<html>`/`<body>`;
  - `sitemap.ts` receives no route params, so we use route handlers instead.
  - `cacheComponents` is off. Turning it on would force `generateStaticParams` on every root param, which can't work for hosts added at runtime.
- **Test client bug:** Node's `fetch` drops a custom `Host` header (verified: the server saw `127.0.0.1`). `tests/http-client.ts` must switch to `node:http`, or every newspaper-host test would really hit the panel host.

## Routing: `src/proxy.ts` (new)

1. Normalise the host: lower-case, port stripped.
2. Look up the tenant through `src/server/tenants.ts` → `resolveHost()`:
   - it uses an in-memory list refreshed every `TENANT_CACHE_SECONDS` (30 s; tests set 0);
   - one small query per refresh, through the existing `db()` client.
3. **Newspaper host:**
   - The first path segment decides the language:
     - It's a non-default language the paper publishes: `lang` = that segment.
     - It's the default language: **308** to the unprefixed path, keeping the query string.
     - Anything else: `lang` = the default, and the whole path is the page.
   - `/sitemap.xml` and `/robots.txt` are rewritten to `/sites/{host}/{file}`. Everything else goes to `/sites/{host}/{lang}/{rest}`.
   - For staging papers, add `X-Robots-Tag: noindex, nofollow` to every response.
4. **Panel host:** the `APP_URL` host, plus `localhost` and `127.0.0.1` so the VPS cron curl works. Passed through untouched.
   - A direct request to `/sites/...` returns 404, so the internal routes can't be reached from outside.
5. **Unknown host:** a plain 404 ("unknown hosts serve nothing", 02 §2.1).
6. **Matcher:** excludes `_next/static`, `_next/image`, `favicon.ico`.

**Pure helper:** `src/domain/urls.ts`
- `splitLanguage(path, tenant)` → `{ kind: "redirect" | "page", lang, rest }`
- `localePath(tenant, lang, path)` builds public URLs (no prefix for the default language)
- `siteOrigin(host)` derives scheme and port from `APP_URL`: `http://x.localhost:3000` in dev, `https://x` in prod.
- Unit-tested.

## Routes under `src/app/sites/[host]/`

```
[lang]/layout.tsx                  root layout: <html lang>, theme vars, fonts, header/menu, footer
[lang]/page.tsx                    home: latest articles, 8 sections, 7 calculator cards
[lang]/[section]/page.tsx          section: blurb, articles, its calculators, disclaimer
[lang]/[section]/[slug]/page.tsx   article
[lang]/calculators/page.tsx, calculators/[slug]/page.tsx   placeholder list and pages
[lang]/glossary/page.tsx, glossary/[slug]/page.tsx
[lang]/experts/[slug]/page.tsx     author: bio, credentials, licence, disclosed affiliations, articles
[lang]/partners/[slug]/page.tsx    institution profile and its articles
[lang]/not-found.tsx               themed "not found" in the page language
sitemap.xml/route.ts, robots.txt/route.ts
```

- Static segments (`calculators`, `glossary`, `experts`, `partners`) win over `[section]`.
- Every page calls `notFound()` when its data is missing, and checks that `lang` is one of the tenant's languages.
- `generateMetadata` on each page sets:
  - title;
  - description;
  - `alternates.canonical` and `alternates.languages`;
  - Open Graph;
  - `robots: { index: false, follow: false }` for staging papers.

**Article page contents, top to bottom:**
1. Breadcrumb (section).
2. "Partner content" label (institution articles) or "Independent expert" tag.
3. Headline and summary.
4. Byline linking to `/experts/<author>`, with credentials, disclosed affiliations, and the published and last-reviewed dates.
5. Body.
6. Section disclaimer box.
7. Approval line at the bottom:
   - explicit approval: "Approved by the {paper} editor";
   - deemed approval: "Published by the {paper} finance desk".
8. Related reads: same paper, language and section; newest 3; excluding this article.
9. `Article` JSON-LD as a native `<script>`, with `<` escaped.

Expert pages also get `Person` JSON-LD.

## SEO rules

| Item | Rule |
| --- | --- |
| hreflang | one alternate per language **published on this paper** for the article; static pages list every language the paper publishes; `x-default` = the default-language URL |
| Language switcher | in the header: the same page in the other language if it exists, otherwise that language's home |
| Canonical | the earliest **currently published** copy of the same article in the same language across papers. If the first paper takes the article down, the canonical moves to the next earliest. This settles a question the docs leave open; logged as **D8** |
| Sitemap | per host. Every public URL in each language: home, sections, calculators list and pages, glossary, experts and partners with published content, and articles. `xhtml:link` alternates on each. Published content only |
| robots.txt | live: `Allow: /` plus `Sitemap:`. Staging: `Disallow: /` |

## Content and markup

**Body markup**: `src/domain/markup.ts`, pure.
- `parseBody(text)` → typed blocks:
  - `paragraph`
  - `heading`
  - `list`
  - `calculator{slug}`
- Inline nodes are `text`, `bold` and `link`.
- `classifyLink(href, siteHosts)` returns one of:
  - `internal`: `/…` (but not `//`), or an absolute URL on the paper's own host;
  - `external`: `http(s)`;
  - `unsafe`: anything else, rendered as plain text.
- `linkRel(articleType)` gives:
  - institution articles: `sponsored noopener noreferrer`;
  - other articles: `noopener noreferrer`;
  - external links open in a new tab;
  - internal links stay plain.
- `unknownCalculators(blocks)` is exported for M3's automated checks.

**Rendering**: `src/components/reader/ArticleBody.tsx` maps blocks to React elements. No `dangerouslySetInnerHTML` anywhere.

**Calculator catalogue**: `src/domain/calc/catalog.ts`.
- The 7 slugs with en/mr names and one-line descriptions.
- `CalculatorPlaceholder.tsx` is a card with a fixed `min-height`, so M4 can replace it without layout shift.

**Reader strings**: `src/domain/i18n.ts`, an en/mr dictionary.
- Labels, section headings, footer, 404.
- Marathi is a draft, flagged for native and legal review in `decisions.md`.

**Queries**: `src/server/content/queries.ts`, wrapped in React `cache()`.
- Published copies for a tenant and language: latest, by section, by slug, related, by author, by organisation.
- Canonical copy and published languages for an article.
- Sections, glossary, authors, partner organisations.
- Only `state = 'published'` copies whose `tenantId` matches are ever returned.

**Caching**: no page or data cache in M1, apart from the 30 s tenant list. Pages render per request from indexed queries. Tag-based caching with purge on publish and takedown moves to **M3**, where publish and takedown exist and the purge can be tested.

## Theme, fonts and design (follows tarunbharat.net)

**Theme tokens**: extend `TenantTheme` in `src/server/db/schema.ts`. It's JSON, so no migration is needed.
- Colours: `primary`, `accent`, `bg`, `surface`, `ink`, `muted`, `rule`, `bar`.
- Font keys: `displayFont`, `headingFont`, `bodyFont`.
- The layout writes them as CSS variables on `<html>`. Tailwind v4 `@theme inline` maps the variables to utilities.

**Fonts**: `src/app/sites/fonts.ts`, a registry built with `next/font/google` (self-hosted at build time).

| Key | Font | Settings |
| --- | --- | --- |
| `karma` | Karma | weights 400, 700 |
| `noto-sans` | Noto Sans Devanagari | variable, covers Latin too |
| `mukta` | Mukta | weights 400, 600, 700 |
| `open-sans` | Open Sans (replaced Source Sans 3, whose glyph spacing rendered broken) | |

- Each uses `variable` and `display: swap`.
- The layout adds only the tenant's chosen fonts, plus Noto Sans Devanagari as the Marathi fallback, so only those preload.

**Seed themes** (`db/seed/data.ts`):

| Paper | Colours | Fonts |
| --- | --- | --- |
| Tarun Bharat | bg `#fffbf4`, surface `#fff`, ink `#212529`, muted `#5f6368`, primary `#c8102e` (logo red, darkened for AA contrast on cream), accent `#303090` (logo navy), rule and bar `#000` | display Karma, heading and body Noto Sans |
| Paper B | blue | Open Sans |
| Paper C | green | Mukta |

TESTING.md describes Tarun Bharat as "red". The red stays as the brand accent and wordmark, so that still holds.

**Layout** (`src/components/reader/`):
- `UtilityBar`: black strip with "← {paper name}" linking to `mainSiteUrl`, and the language switcher on the right.
- `Masthead`: the paper's wordmark in display font and primary colour, plus the menu label (अर्थविश्व / Money).
- `SectionMenu`: the 8 sections in Karma bold on `#fafafa` with the 3px rule. It's sticky, and scrolls sideways on phones, so it needs no JavaScript.
- `Footer`: "Powered by abcfinance", glossary, calculators, and the language switcher.
- Body text is 16px minimum and colours meet AA contrast.
- The reader layout's `<body>` gets `suppressHydrationWarning`, for the same extension issue as the panel layout.
- No client JavaScript in M1. Calculators (M4) and the tracker (M5) will be the only scripts.
- The `make-interfaces-feel-better` skill is used for a quick polish review at the end.

## Seed content (M1)

`db/seed/data.ts` gets `articles`: 7 articles and their published paper copies. Each copy has `publishedAt`, `approvalType`, `lastReviewedAt` and a summary, and gets a seed workflow event.

| Article | Type, section, author | Published copies |
| --- | --- | --- |
| `sip-basics` (named in TESTING) | AMC institution article, mutual-funds, Anita Kulkarni | Tarun Bharat English (explicit approval), then Paper B English a few days later (deemed). Demonstrates canonical → first paper. No Marathi version, which demos the switcher falling back to home |
| `home-loan-checklist` (named in TESTING) | abcfinance, home-loan, abcfinance desk | Tarun Bharat mr + en (deemed). Paper C mr. Long body with headings and a list |
| `emergency-fund-first` | independent expert, mutual-funds, Suresh Patil | Tarun Bharat en + mr, Paper B en |
| `elss-tax-saving` | AMC, mutual-funds | Tarun Bharat en (related reads for `sip-basics`) |
| `health-cover-for-parents` | General Insurer, health-insurance, Rahul Deshmukh | Tarun Bharat en + mr (explicit) |
| `how-much-term-cover` | abcfinance, life-insurance (the exclusive category) | Tarun Bharat en + mr |
| `gold-loan-before-you-pledge` | abcfinance, gold-loans | Tarun Bharat mr, Paper C mr |

- **Embedded calculators:**
  - `sip-basics`: `{{calc:sip}}`;
  - `home-loan-checklist`: `{{calc:emi}}`;
  - the health article: `{{calc:health-cover}}`;
  - the term-cover article: `{{calc:term-cover}}`;
  - the gold-loan article: `{{calc:gold-loan}}`.
- **Links:** `sip-basics` has one outbound link and one internal glossary link; `home-loan-checklist` has one outbound link.
- These 7, plus the 7 workflow-state articles TESTING names for M3, make the 14 in doc 07.7.

**E2E fixtures, not seed:** a test helper inserts the negative cases directly in the test database.
- An article with `javascript:` and `//evil` links.
- A master draft.
- A `with_publisher` copy.
- An `unpublished` copy.
- A copy on another paper.

**Dev database:** the seed won't update existing rows, so run `pnpm db:reset` once to get the new themes. This is noted in the README.

## Acceptance checks moved to M1

In `scripts/gen-acceptance-index.ts`, add per-ID overrides. These checks are fully satisfiable with seeded live articles:

| ID | Check |
| --- | --- |
| E2E-UI-20 | readers can open the live article |
| E2E-UI-21 | Partner content label and editor's sign-off |
| E2E-UI-22 | mutual fund disclaimer |
| E2E-UI-23 | canonical and hreflang |
| E2E-UI-25 | the article is in that paper's sitemap |
| E2E-ADS-34 to 37 | link rel and safe links |
| E2E-AN-02 | reader pages set no cookies |
| U-ADS-10 | recognises block types |
| U-ADS-31 to 34 | outbound links |

E2E-UI-06, 19, 24 and 26 stay in M3, because they test the workflow transitions themselves. Set `tests/acceptance/MILESTONE` to `M1`.

## Files

| | Files |
| --- | --- |
| New | `src/proxy.ts`, `src/domain/{urls,markup,i18n}.ts`, `src/domain/calc/catalog.ts`, `src/server/tenants.ts`, `src/server/content/queries.ts`, `src/app/sites/**`, `src/components/reader/*`, `tests/unit/{urls,markup}.test.ts`, `tests/integration/content.test.ts`, `tests/e2e/{reader,seo,links}.test.ts`, `tests/e2e/fixtures.ts` |
| Changed | `src/server/db/schema.ts` (`TenantTheme`), `db/seed/{data,index}.ts` and `db/seed/README.md`, `tests/http-client.ts` (`node:http`), `scripts/gen-acceptance-index.ts`, `docs/decisions.md` (D8 canonical, D9 hreflang `x-default`, D10 Marathi labels need review, D11 caching deferred to M3), `README.md` (status) |
| Reused | `env()` (`src/server/env.ts`), `db()` (`src/server/db/client.ts`), `indianDate` (`src/domain/time.ts`), the seed runner pattern, `HttpClient` and the e2e global setup |
| Housekeeping | commit the pending Grammarly fix in `src/app/(platform)/layout.tsx` and the `AGENTS.md` Next generated, as M1's first commit |

## Verification

- **Unit:**
  - `splitLanguage` cases: default prefix → redirect; Paper C `/en` → treated as a page; query strings kept;
  - `localePath` and `siteOrigin`;
  - markup parsing, link classification and rel rules (tagged U-ADS-10, 31–34).
- **Integration:** the content queries return only published copies of the right tenant and language; canonical goes to the earliest published copy and moves after a takedown; related reads exclude the current article.
- **E2E** (HTTP through the fixed client, against `next start`):
  - **Routing:**
    - each host gets its own theme colour and `<html lang>`;
    - `/mr/...` on Tarun Bharat → 308 to `/...`;
    - `/en/...` on Paper B → 308;
    - unknown host → 404;
    - `/sites/...` on the panel host → 404.
  - **Pages:**
    - every route in the TESTING §1 walkthrough returns 200, and `/en/nonexistent` returns a themed 404;
    - the article has the labels, disclaimer, byline link, approval line, related reads and JSON-LD.
  - **SEO:**
    - canonical on Paper B's `sip-basics` points to Tarun Bharat;
    - hreflang lists only published languages;
    - sitemap contents and robots for live vs staging;
    - staging pages carry `noindex`.
  - **Not visible to readers:** drafts, `with_publisher`, `unpublished` and other papers' copies all return 404.
  - **Link fixtures** (E2E-ADS-34..37), and no `Set-Cookie` on any reader page (E2E-AN-02).
- **Gate:** CI runs `gen-acceptance-index --check M1` green, along with lint and typecheck.
- **Manual:**
  - `pnpm db:reset && pnpm dev`, then walk TESTING §1 on `tarunbharat.localhost:3000`, `paperb.localhost:3000` and `paperc.localhost:3000` at desktop and 390px widths;
  - the headless browser console check shows no errors;
  - Lighthouse on the article page: CLS 0, no render-blocking scripts.
