# M4: Calculators, sponsor rates and leads

## Context

M3 (commit `1473428`, CI green) closed the article workflow. M4 builds what sponsors pay for (04.6, 04.7, 06.4, 06.5):
- **seven working calculators** on the reader site, in Marathi and English, branded by the right sponsor and using that sponsor's rates;
- the **rates panel** (`/calculators`): sponsors' account admins edit their rates, and the super admin edits abcfinance's defaults for unsponsored calculators, each with an "as of" date;
- **lead capture**: a consented form at the end of institution articles and under sponsored calculators, routed only to the sponsor, encrypted and rate-limited;
- the sponsor's **Leads inbox** (`/leads`): status and notes, consent record, quality report, CSV export and erasure.

"Leads flowing" is part of the phase gate, so this milestone makes the product sellable.

**Decided with the user (2026-10-09):**
- **Split into M4a and M4b**, like M3, each with its own commit, CI gate and review:
  - **M4a, calculators and rates:** U-CALC 01–30 and E2E-CALC 01–14, 16–33;
  - **M4b, leads:** U-LEAD 01–12, E2E-LEAD 01–53, and E2E-CALC-15 (a sponsored calculator offers a lead call-to-action, which needs the form).
- **The new-lead email carries no personal details**: paper, interest, source page, time and a link to `/leads`. Name, mobile and city are seen only after signing in with two-step verification. This departs from 04.6/05.4 (D36), flagged for the business.
- **Calculator inputs are a slider plus a number box.** Results update as you drag, and the first result is rendered on the server, so nothing shifts on load.
- **Exclusivity wins inside a section.** In a category with an exclusive sponsor, any other sponsor's calculator is unbranded, has no call-to-action and uses abcfinance's rates. This applies even on another institution's own article. That article's end-of-article lead form for its author stays (D34).
- **Staging papers capture leads exactly like live ones**, emails included.
- **A repeat from the same mobile to the same sponsor within 24 hours** stores nothing and tells the reader "we already have your request" (TESTING.md wording).
- **Add a demo user `admin.li`**, account admin of Sample Life Insurer, so term-cover leads have an inbox and an email recipient.

**What the docs don't give, so we define it** (each recorded as a decision and flagged for review where relevant):
- the allowed range of every field;
- the reader inputs' default values;
- the Marathi consent text and Marathi interest labels (drafts, extending D10);
- the path of the lead submission (a Server Action);
- where retention comes from: `organisations.leadRetentionDays`. Doc 03 puts it there; doc 08 says "the sponsor's contract", but publisher contracts are a different entity.

**Already in place (reuse):**
- **Schema:** `leads`, `calculator_rates` (unique per organisation and calculator), `sponsorships` (`sectionSlugs[]`, `exclusive`, `startsOn`/`endsOn`), `organisations.leadRetentionDays` (default 365) and `sections.calculatorSlugs`. **No migration is expected.**
- **Crypto:**
  - `seal`, `open`, `sealOrNull`, `openOrNull` in `src/server/crypto/secret-box.ts`;
  - `keyedHash(...parts)` in `src/server/crypto/hash.ts`.
- **Infrastructure:**
  - `hit(scope, subject, limit, windowSeconds)` (`src/server/ratelimit.ts`);
  - `queueEmail(input, tx)`, `sendQueued(limit, mailer)` and `readOutbox` (`src/server/mail/outbox.ts`), with `publicUrl()` in `src/server/mail/templates.ts`;
  - `audit()`.
- **Scheduled job:** `eraseExpiredLeads(now)` in `src/server/jobs.ts`, already run by cron.
- **Guards:** `requireArea`, `assertSameOrigin`, `requestIp`, `can` and `organisationsFor`. The permissions `leads.view` and `rates.edit` (an account admin, in their own organisation) and `rates.edit.defaults` (super admin) already exist.
- **Reader site:**
  - `ArticleBody`'s `renderCalculator` prop;
  - `CalculatorPlaceholder` (to be replaced);
  - `src/domain/calc/catalog.ts` (slugs plus en/mr names and descriptions);
  - `t()`, `pick()` and `formatDate()` in `src/domain/i18n.ts`;
  - `getSite()`/`Site` in `src/app/sites/site.ts`.
- **Seed:**
  - sponsorships: AMC for mutual funds (SIP); General Insurer for health and motor; Life Insurer for life (term), exclusive;
  - EMI, home-loan eligibility and gold loan stay unsponsored;
  - institution articles `sip-basics` (embeds SIP) and `health-cover-for-parents`; the independent-expert `emergency-fund-first` (embeds SIP); the abcfinance `how-much-term-cover`.
- **Tests:** `HttpClient.submitForm` (works on newspaper hosts), `person()`, `signInFully`, and the actor helper in integration tests.

## Acceptance gating

- **`scripts/gen-acceptance-index.ts`:**
  - E2E-CALC and U-CALC → `M4a`;
  - E2E-LEAD and U-LEAD → `M4b`;
  - `ID_OVERRIDES["E2E-CALC-15"] = "M4b"`.
- **`tests/acceptance/MILESTONE`** is `M4a` after part 1 and `M4b` after part 2.

---

# M4a: Calculators and rates

## Pure rules (`src/domain/calc/`)

**`formulas.ts`: the seven formulas from 04.7**, each returning plain numbers.
- **`emiPayment(P, annualPct, months)`.** At a zero rate it is P/n.
- **`loanFromEmi(emi, annualPct, months)`**, the inverse of `emiPayment`.
- **`emi(...)`** gives `{ emi, total, interest }`.
- **`sip(monthly, annualPct, years)`** gives `{ futureValue, invested, gains }`. Payments are an annuity due; at a zero return it is just the sum paid in.
- **`homeLoanEligibility({ income, existingEmis, years, rate, foirPct })`** gives `{ maxEmi, loan }`.
- **`goldLoan({ grams, karat, goldPrice, ltvPct, rate, months, repayment })`** gives `{ value, loan, monthly, interest, totalRepay }`, with three repayment types: `interest_monthly`, `emi` and `at_end` (compounded monthly).
- **`motorPremium({ kind, band, vehicleAge, idv, claimFreeYears }, rates)`:**
  - own damage by age band (under 5, 5 to 10, over 10 years);
  - No Claim Bonus slabs 0/20/25/35/45/50 on own damage only;
  - third-party premium by engine band;
  - GST 18%;
  - returns the steps, the NCB saving and next year's NCB.
- **`healthCover({ eldestAge, cityTier, adults, children, existingCover }, rates)`:** rounds to the nearest ₹2,50,000, clamps to ₹5 lakh–₹1 crore, and returns the gap.
- **`termCover({ annualIncome, age, liabilities, dependants, existingCover }, rates)`:**
  - years = clamp(retirement age − age, 5, 25);
  - income share = 0.3, or 0.6 + 0.05·(min(dependants, 5) − 1);
  - rounds up to the next ₹5 lakh;
  - returns the multiple of income.

**`fields.ts`: each calculator's definition (in code, as doc 03 allows).**
- **Reader inputs:** key, en/mr label, unit, default, min, max, step, and slider scale (`linear` or `log` for money ranges).
- **Editable rate fields:** key, en/mr label, unit, default, min, max, plus the "how this is worked out" text (en/mr).
- **`BUILTIN_RATES_AS_OF`** = `2026-10-01`.

The full table is below. The defaults reproduce doc 08's scenarios.

| Calculator | Reader inputs (default) | Editable rates (default [range]) |
| --- | --- | --- |
| `emi` | amount 20 lakh; rate; tenure 20 y | rate 8.75 [1–30] |
| `sip` | monthly 5,000; expected return; years 10 | expectedReturn 12 [1–30] |
| `home-loan-eligibility` | income 1,00,000; existing EMIs 10,000; tenure 20 y; rate | rate 8.75 [1–30]; foirPct 50 [20–70] |
| `gold-loan` | grams 50; karat 22; months 12; repayment (`interest_monthly`) | goldPrice 11,000 [1,000–50,000]; ltvPct 75 [10–85]; rate 11.5 [5–36] |
| `motor-premium` | car, 1000–1500 cc, age 3, IDV 5 lakh, 3 claim-free years | 7 third-party premiums (04.7 figures, [100–50,000]); 6 own-damage rates (car 3.1/3.3/3.4, two-wheeler 1.7/1.8/1.9, [0.5–10]) |
| `health-cover` | eldest 35, large city, 2 adults, 1 child, existing 5 lakh | baseMetro 10 lakh, baseLarge 7.5 lakh, baseOther 5 lakh [1–50 lakh] |
| `term-cover` | income 10 lakh, age 35, liabilities 20 lakh, 2 dependants, existing 25 lakh | retirementAge 60 [50–70] |

GST (18%), the NCB slabs, the health age factors and the term income shares are fixed by 04.7 and not editable.

**Expected default results** (asserted in tests):

| Calculator | Result |
| --- | --- |
| EMI | 17,674.21 a month; total 42,41,811.40 |
| SIP | 11,61,695.38 (invested 6,00,000) |
| Home loan eligibility | max EMI 40,000; loan 45,26,368.14 |
| Gold loan | value 5,04,166.67; loan 3,78,125; interest-monthly 3,623.70 a month |
| Motor | own damage 15,500; NCB saving 5,425; total with GST 15,919.38; next NCB 45% |
| Health | 17,50,000; gap 12,50,000 |
| Term | 1,60,00,000 (16× income) |

**`rates.ts`:**
- **`mergeRates(slug, saved)`** keeps only known numeric keys within range and uses the defaults for everything else.
- **`validateRates(slug, form, asOf, today)`:**
  - every field is required, numeric, in range, with at most 2 decimals;
  - messages say which field and what range;
  - **`asOfOk`**: a real date, not after today (India time), within 5 years.

**`money.ts`: Indian number words, without `Intl`** (so server and browser render the same text and hydration never mismatches).
- `formatRupees(n, lang)` uses Indian grouping (12,34,567).
- `formatAmountWords(n, lang)` gives "₹45.26 lakh" / "₹1.6 crore". In Marathi it is "₹४५.२६ लाख" / "₹१.६ कोटी", with Devanagari digits.
- The unit is chosen after rounding, so 99,99,999 doesn't read as "100 lakh".
- `toAsciiDigits()` lets the number boxes accept Devanagari digits.

**`src/domain/sponsor.ts`: the branding matrix (04.7 and D34), a single pure function used by every surface.**
- **Input:** `brandingFor({ context, calculatorSlug, sponsorships, sections, today })`, where `context` is one of:
  - `{ kind: "institution_article", orgId, sectionSlug }`
  - `{ kind: "independent_article" }`
  - `{ kind: "abcfinance_article", sectionSlug }`
  - `{ kind: "calculator_page" }`
  - `{ kind: "section_page", sectionSlug }`
- **Output:** `{ brand: { orgId, label: "calculator_by" | "sponsored_by" } | null, ratesOrgId: string | null, leadCta: boolean }`.
- **Rules:**
  - "Active" means `startsOn ≤ today ≤ endsOn` (a null end date means open-ended).
  - **Choosing the sponsor:**
    - candidates are active sponsorships of the context's section, if it lists the calculator; otherwise of any section that lists it;
    - an exclusive sponsorship comes first, then the earliest start, then id.
  - **Institution article:** its own brand ("Calculator by …"). The call-to-action points at the end-of-article form.
  - **Independent-expert article:** no brand.
  - **Abcfinance article, calculator page or section page:** "Sponsored by …" plus a call-to-action.
  - **Exclusivity:** an exclusive sponsor of the context's section suppresses every other sponsor: no brand, no call-to-action, abcfinance's rates. This includes an institution article in that section (D34).
  - **Rates follow the brand:** `ratesOrgId === brand?.orgId`, so an unbranded calculator never quietly uses a sponsor's rates.

## Server

**`src/server/calc/rates.ts`:**
- **`loadCalcContext()`** is `cache()`d with no arguments, so it is fetched once per request. It loads active sponsorships, sections (with their calculator slugs), every `calculator_rates` row (at most orgs × 7) and the abcfinance org id.
- **`resolveRates(slug, ratesOrgId)`** picks the first org in `[ratesOrgId, abcfinance]` that has a row, and falls back to the built-in defaults. It returns `{ rates: mergeRates(...), asOf, source }`.
- **`saveRates(actor, orgId, slug, form, asOf, ip)`:**
  - allowed only with `can(ms, "rates.edit", orgId)`, or with `rates.edit.defaults` when `orgId` is abcfinance;
  - runs `validateRates`;
  - upserts the row (`updatedById`, `ratesAsOf`) and writes audit `rates.save` with the old and new values.
- **`resetRates(...)`** deletes the org's row, so the calculator falls back to abcfinance's rates or the built-in defaults, and writes audit `rates.reset`.
- **`ratesChanged()`** is a no-op hook next to `contentChanged()`, for M6 caching (D26).
- **`ratesPanel(actor)`:** the organisations this person edits; for each, every calculator's fields, saved values, as-of date and source.

**`src/server/content/queries.ts`:** add `orgId` to `PublishedCopy`.

## Reader site

**`src/components/reader/calculators/` (the reader site's first client code):**
- **`Calculator.tsx`** (`"use client"`):
  - props: `slug`, `lang`, `rates`, `asOfLabel` (already formatted on the server), `brand` (name and label), `leadCta` (a React node slot, null in M4a), `embedded`;
  - one component that dispatches to per-calculator input and result layouts;
  - state starts from props only;
  - label ids come from `useId()`.
- **`RangeField.tsx`:**
  - a slider plus a number box (`type="text" inputMode="decimal"`);
  - accepts Devanagari digits and commas;
  - clamps on blur, never shows NaN;
  - log scale for money ranges;
  - keyboard and screen-reader labels.
- **Results:**
  - one large figure plus a short breakdown (EMI/total/interest; invested/gains; the motor steps; and so on);
  - "How this is worked out" in a `<details>`;
  - "Rates as of {date}";
  - "This is an estimate, not advice".
- **Test hooks:** `data-calc="<slug>"`, `data-rate-<key>`, `data-as-of`, `data-result-<key>` (raw numbers).

**Pages:**
- **`calculators/[slug]/page.tsx`:**
  - resolves branding (`calculator_page`) and rates;
  - renders `Calculator` with an explainer and "Sponsored by …" when branded;
  - the call-to-action slot is empty until M4b.
- **`calculators/page.tsx`**, the home page and section cards: the static card keeps its name and description ("coming soon" is removed), and `CalculatorPlaceholder` is renamed `CalculatorCard`.
- **`article-view.tsx`:** `renderCalculator` resolves branding from the article (`institution_article` with `copy.orgId`, `independent_article` or `abcfinance_article`) and renders `Calculator embedded`.
- **`section-view.tsx`:** the section's calculators are embedded with `section_page` branding.
- **Panel previews** (`articles/[id]/[lang]`, `/publisher/[copyId]`, `ArticleEditor`) keep a placeholder, so the panel never imports the lead form.

**i18n:** new strings in `src/domain/i18n.ts`:
- "Sponsored by {name}", "Calculator by {name}";
- "Rates as of {date}", "How this is worked out", "Estimate, not advice";
- the result labels.

Calculator field labels live in `fields.ts`.

## Panel: `/calculators`

**`(panel)/calculators/page.tsx`** (replaces the stub):
- an organisation switcher, when the person edits more than one (in practice the super admin sees only abcfinance's defaults);
- one card per calculator, collapsible on phones, containing:
  - every rate field, with its unit and allowed range shown;
  - the "Rates as of" date input;
  - **Save rates** (`data-form="rates-save"`);
  - **Reset to standard defaults** (`data-form="rates-reset"`);
  - the current source ("Your rates, as of …" or "Standard defaults").

**`_actions/calculators.ts`:** `saveRatesAction` and `resetRatesAction`. They follow the M3 pattern: `assertSameOrigin`, then `requireArea("calculators")`, then the service, then a 303 to `?done=`. Failures stay inline, keeping the values typed.

**`panel-menu.ts`:** remove `arrives: "M4"` from the calculators area. (Editors are already refused: only `rates.edit` and `rates.edit.defaults` open it.)

## Seed

- **`admin.li`** (Lena Admin, Sample Life Insurer, `institution_account_admin`) in `db/seed/data.ts`.
- **No `calculator_rates` rows** (the defaults must hold).
- **`db/seed/README.md`:** a calculators section (sponsors per calculator, the invented ranges and defaults) and the new user.

## M4a tests

| Kind | File | Covers |
| --- | --- | --- |
| Unit | `tests/unit/calc.test.ts` | U-CALC-01–30. EMI amortises to zero month by month; zero rates; inverses; SIP annuity due; the eligibility limits; gold purity and the three repayments; motor NCB slabs, steps, age bands, monotonic in claim-free years, a third-party rate per band; health and term rules; editable fields (defaults in range, unique keys); merge ignores bad values; validation messages; the as-of rule |
| Unit | `tests/unit/money.test.ts`, `tests/unit/sponsor.test.ts` | lakh/crore in en/mr and the rounding edge; the branding matrix: every context, exclusivity (D34), inactive or ended sponsorships, tie-breaks |
| Integration | `tests/integration/rates.test.ts` | precedence (sponsor, then abcfinance, then built-in); save/reset audit rows; refusals (another org, out of range, future date); a super admin can only edit abcfinance's rates |
| E2E | `tests/e2e/calculators.test.ts` | E2E-CALC-01–14 and 16: list and links; the default results via `data-result-*`; the assumptions note; repayment options; Marathi pages with lakh/crore words; who sponsors what; unsponsored calculators have no line or call-to-action |
| E2E | `tests/e2e/calculator-rates.test.ts` | E2E-CALC-17–33: access (writer, editor, admin), menu, save; the reader sees new rates and the as-of date at once (on `/calculators/<slug>` and `sip-basics`); other sponsors unaffected; out-of-range and future dates refused; another org refused; abcfinance defaults applied to `gold-loan`; reset restores 12%; audit. Resets in `afterAll`, because suites run in shuffled order |
| E2E | `tests/e2e/panel.test.ts` | `/calculators` is no longer a stub |

- Add one Playwright smoke test (`tests/e2e/calculator-browser.test.ts`, using the installed headless shell):
  - open `/calculators/emi` on Tarun Bharat;
  - change the amount;
  - check that the result updates and that the console shows no hydration errors.
- HTTP tests can't see either of those.

## M4a docs

- **`docs/decisions.md`:**
  - **D32:** calculator field ranges and reader defaults are defined here; the rates are placeholders for sponsors (09.3 #13).
  - **D33:** rate precedence works per row; unbranded calculators use abcfinance's or the built-in rates; reset deletes the row.
  - **D34:** sponsor resolution and exclusivity, including another institution's article in an exclusive section.
- **`docs/implementation-plan.md`:** M4 is split into M4a and M4b.
- **`docs/plans/m4-calculators-leads.md`:** a copy of this plan.

---

# M4b: Leads

## Pure rules (`src/domain/leads.ts`)

- **`normalizeIndianMobile(raw)`:**
  - strips spaces and hyphens; converts Devanagari digits;
  - removes `+91`, then `91` only from 12 digits and `0` only from 11;
  - accepts 10 digits starting with 6–9, otherwise null.
- **`CONSENT_VERSION = "v1"`** and **`consentText(sponsorName, lang)`:**
  - English is the 04.6 wording;
  - Marathi is our draft, flagged for legal and native review (D39);
  - deterministic, so what is stored equals what was shown.
- **`INTERESTS`:** per section, `{ key, en, mr }`, following 04.6 (credit cards included). Every section has options in both languages.
- **`validateLead(input, sectionSlug, lang)`:**
  - name 2–80 characters, city 2–60, neither containing `<` or `>`;
  - the mobile must be valid;
  - the interest must belong to the section;
  - consent must be ticked;
  - returns normalised values or messages in the reader's language.
- **`qualityReport(statusCounts)`:**
  - worked % = (contacted + qualified + junk) / total;
  - qualified % = qualified / (worked − junk);
  - junk % = junk / total (D40);
  - an empty inbox gives zeros, not NaN.
- **`LEAD_LIMITS`:** 5 per hour per address, 3 per day per phone, a 24-hour repeat window, `website` as the honeypot field.

## Capture: a Server Action on the newspaper host (D35)

**`src/app/sites/_actions/lead.ts`** exports `submitLeadAction`. It is the only reader-side action, and it is posted from the reader page itself, so it works without JS through `useActionState`. The steps, in order:

1. **Host check.** Find the tenant from `Host` with `tenantByHost`; refuse when there is none (action ids are global, so it could be posted to the panel). The `Origin` header must be present, its host:port must equal `Host`, and it must map to the same tenant. Refusals come back as form state, never `forbidden()`, because the `sites` tree has no 403 page.
2. **Honeypot** filled: return the thank-you state and write nothing.
3. **Validate** with `validateLead`. No limit is counted for invalid forms.
4. **Address limit:** `hit("lead:ip", ip, 5, 3600)`. Over the limit gets "Too many requests from your connection. Try again later."
5. **Resolve the source** from hidden references only (the server works out the sponsor):
   - **`versionId`** must be a **published** copy on **this tenant** of an **institution** article. The sponsor is its organisation, the section is the article's, and the language is the copy's.
   - **`calculator`** + **`section`** (optional) + **`page`**: `brandingFor` (with the same context the page used) must give `leadCta`. The sponsor is the brand's organisation.
   - Otherwise refuse with "This form can't be used here." (E2E-LEAD-23 to 26). The source page is rebuilt with `site.path(…)`, never taken from the browser.
6. **One transaction:**
   - take `pg_advisory_xact_lock(hashtext(phoneHash))`;
   - a repeat (same `phoneHash` and sponsor, within 24 hours) gets "We already have your request" and no row;
   - if the phone has 3 or more stored leads in 24 hours (counted from rows, so erased leads don't count), refuse;
   - otherwise insert the lead:
     - `seal()` the name, phone and city;
     - `phoneHash = keyedHash("lead:phone", phone)`;
     - `ipHash = keyedHash("lead:ip", ip, indianDate)`;
     - the interest key and label snapshot;
     - the consent text, version and time;
     - `sourcePage`, plus `sourceVersionId` or `sourceCalculator`;
     - `deleteAfter = now + org.leadRetentionDays` (D37);
   - `queueEmail` for each active account admin of the sponsor, `kind: "lead.new"`, with no personal details (D36): paper, interest, source page, time and a link to `/leads`.
7. **Server Action not found after a deploy:** the client catches it and shows "Please reload the page and try again."

**`src/server/leads/capture.ts`** holds steps 5 and 6, so integration tests can call it directly.

**`src/proxy.ts`:** on the panel host, delete any `x-abc-page-path` and `x-abc-page-lang` the client sent.

**`src/server/env.ts`:** log a warning at start-up when `NODE_ENV=production` and `TRUST_PROXY` is unset (otherwise every reader shares one address limit).

## Reader UI

**`src/components/reader/LeadForm.tsx`** (client):
- heading "Talk to {sponsor}";
- fields: name, mobile (`inputMode="tel"`), city, interest (a select of the section's options), the consent checkbox with the server-built text, and the hidden `website` field;
- states: errors inline, then thank-you / "we already have your request";
- id `lead-form`.

**Placement:**
- **End of an institution article** (`article-view.tsx`): after the body and before the disclaimer. Not on abcfinance or independent-expert articles.
- **Under a sponsored calculator** (`leadCta` from `brandingFor`):
  - on an institution article, a "Talk to {sponsor}" link to `#lead-form`;
  - elsewhere, a `<details>` with "Talk to {sponsor}" that opens the same form (works without JS), sourced from the calculator.
- The call-to-action is placed in the `leadCta` slot from M4a.

## Panel: `/leads`

**`src/server/leads/inbox.ts`:**
- **`leadsFor(actor, orgId, { status? })`:**
  - only with `can(ms, "leads.view", orgId)`;
  - decrypts with `openOrNull`;
  - erased leads show "Details deleted".
- **`setStatus(actor, leadId, status, note, ip)`:** checks the lead's sponsor; sets `contactedAt` the first time a lead moves off `new`; writes audit `lead.status`.
- **`eraseLead(actor, leadId, ip)`:** blanks the name, phone, city, `phoneHash`, `ipHash` and `note`; sets `erasedAt`; keeps the consent record and status; writes audit `lead.erase`.
- **`exportCsv(actor, orgId)`:** all of the org's leads, including the consent text, version and time; writes audit `leads.export` with the count.
- **`qualityFor(orgId)`:** feeds `qualityReport`.

**`src/domain/csv.ts`:** `toCsv(rows)`. UTF-8 with BOM, CRLF, every cell quoted, and cells starting with `= + - @`, tab or CR prefixed with `'`. M5's reports reuse it.

**Pages:**
- **`(panel)/leads/page.tsx`:**
  - organisation switcher (for someone who administers more than one);
  - the quality report (worked %, qualified %, junk %, total);
  - a status filter (`?status=`);
  - **lead cards, phone first:** name, mobile (a `tel:` link), city, interest, paper, source page and time;
  - status select plus note, **Save** (`data-form="lead-status"`);
  - a `<details>` "Consent record" (exact text, version, time);
  - **Delete details** behind a confirmation `<details>` (`data-form="lead-erase"`);
  - **Download CSV** (`data-form="leads-export"`).
- **`(panel)/leads/export/route.ts`:**
  - **POST** with `assertSameOrigin`, so a link from another site can't trigger downloads and audit rows;
  - `requireUser`, then `can("leads.view", org)` (signed out goes to `/login`; staff get 403);
  - headers `text/csv`, `attachment`, `no-store`, `nosniff`.
- **`_actions/leads.ts`:** `setLeadStatusAction` and `eraseLeadAction`.
- **`panel-menu.ts`:** remove `arrives: "M4"` from leads.

**Retention:** `eraseExpiredLeads` in `src/server/jobs.ts` also blanks `ipHash` and `note`.

## Seed

- **General Insurer `leadRetentionDays = 180`**, so a test can tell the retention source apart.
- **No demo leads** (TESTING.md starts with an empty inbox).

## M4b tests

| Kind | File | Covers |
| --- | --- | --- |
| Unit | `tests/unit/leads.test.ts` | U-LEAD-01–12: mobile formats and rejects; consent text names the sponsor in both languages and is deterministic; validation (normalises, consent required, language of messages, section interests, no markup, every section has both languages); quality report, including an empty inbox. Plus `csv.test.ts` |
| Integration | `tests/integration/leads.test.ts` | capture rules through `capture.ts`: tampered sources, the repeat window, the phone limit from rows, the advisory lock under concurrent submits, retention from the org; erase/export/status audit; `eraseExpiredLeads` blanks `ipHash` and `note` |
| E2E | `tests/e2e/leads-capture.test.ts` | E2E-LEAD-01–28 and E2E-CALC-15. Each test uses its own `person()` address and random mobiles, and asserts by its own `phoneHash`. LEAD-28 makes 6 valid submissions from one fresh address |
| E2E | `tests/e2e/leads-mail.test.ts` | E2E-LEAD-29–33: one email per lead to the sponsor's admins only, no personal details in the body (D36), bodies encrypted; LEAD-32/33 via `sendQueued(n, fakeMailer)` in-process (sent / failed kept with error) |
| E2E | `tests/e2e/leads-inbox.test.ts` | E2E-LEAD-34–53: inbox decrypted for admin.amc; quality report; consent record; isolation from admin.gi; writer refused; staff and signed-out export refused; status + note + contactedAt; filter; cross-sponsor change refused; CSV (consent, neutralised `=cmd`, own leads only, audited); erase keeps consent and stops phone matching; the purge via `POST /api/cron/deemed` after setting `deleteAfter` in the past; LEAD-53 via `leadsFor` directly |
| E2E | `tests/e2e/panel.test.ts` | `/leads` no longer a stub; admin.li's menu |

## M4b docs

- **`docs/decisions.md`:**
  - **D35:** lead capture is a Server Action on newspaper hosts with its own host and origin check; staging papers capture like live ones.
  - **D36:** the new-lead email carries no personal details (user decision; departs from 04.6/05.4).
  - **D37:** retention comes from the sponsor organisation's `leadRetentionDays`.
  - **D38:** limits and erasure:
    - the phone limit is counted from stored leads over a sliding 24 hours;
    - repeats count toward the address limit but not the phone limit;
    - the honeypot and invalid forms count toward neither;
    - erasure also blanks `ipHash` and `note`.
  - **D39:** the Marathi consent text and interest labels are our drafts (extends D10).
  - **D40:** junk % is junk ÷ all leads.
- **`handoff.md`** (local, never committed): status, gotchas, next steps (M5).

---

## Order of work

**M4a**
1. Save this plan as `docs/plans/m4-calculators-leads.md`. Acceptance mapping. `formulas.ts`, `fields.ts`, `rates.ts`, `money.ts` and `sponsor.ts` with unit tests.
2. `server/calc/rates.ts`, `orgId` on `PublishedCopy`, and the integration tests.
3. `Calculator` and `RangeField`; the calculator pages, article and section embeds, and cards.
4. The `/calculators` panel and its actions; seed `admin.li`; `corepack pnpm db:reset` (this wipes local 2FA set-ups: say so).
5. E2E suites, the Playwright smoke test, `panel.test.ts`; a shuffled-order run.
6. `MILESTONE` → `M4a`; D32–D34; the implementation plan; screenshots (an EMI page at 375 px in Marathi, the rates panel at 1280 px); a polish review with `make-interfaces-feel-better`.
7. Commit "M4a: calculators and sponsor rates", push, confirm CI.

**M4b**
1. `domain/leads.ts` and `domain/csv.ts` with unit tests.
2. `server/leads/capture.ts` and `inbox.ts`, the proxy and env hardening, the `jobs.ts` erase change, and the integration tests.
3. The lead action and form; placement on articles and under calculators.
4. The `/leads` page, its actions and the export route; seed the General Insurer's retention days; `db:reset`.
5. E2E suites; a shuffled-order run.
6. `MILESTONE` → `M4b`; D35–D40; handoff; screenshots (the lead form at 375 px in Marathi, the inbox at 375 px); polish review.
7. Commit "M4b: lead capture and the sponsor inbox", push, confirm CI.

## Verification (each part)

- `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test && corepack pnpm test:int && corepack pnpm test:e2e`, then `E2E_SKIP_BUILD=1 npx vitest run --project e2e --sequence.shuffle.files`.
- `npx tsx scripts/gen-acceptance-index.ts --check M4a` (then `M4b`) passes, and CI is green.
- **Walk-through** on a standalone build on :3200 against the dev DB (TESTING.md §3–4):
  - **M4a:**
    - `/en/calculators` lists seven;
    - Marathi pages use lakh/crore;
    - SIP is sponsored by AMC; EMI and gold loan are unsponsored;
    - admin.gi edits the motor third-party premium, the reader page shows it with the as-of date, and reset restores it;
    - an absurd value is refused.
  - **M4b:**
    - submit on `sip-basics`, then repeat ("we already have your request");
    - a calculator call-to-action lead;
    - admin.amc sees it, qualifies it, downloads the CSV and deletes the details;
    - admin.gi doesn't see it;
    - `/dev/outbox`-style check via `readOutbox`: one email per lead and no personal details.
