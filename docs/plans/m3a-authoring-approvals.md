# M3a: Article authoring and institution approvals

## Context

M2 shipped identity and the panel shell (commit `819b3f8`; CI green). M3, the article workflow (doc 04.2–4.3), is the largest milestone at about 93 checks, so the user asked to split it in two:

- **M3a (this plan): writing and approving, up to the Editing state.**
  - the article editor with live preview and automated checks;
  - the institution approval chain (Draft → In approval → Compliance review → Editing) and the abcfinance shortcut (Draft → Editing);
  - returns with comments, add a language;
  - optimistic concurrency;
  - workflow events and audit;
  - "your turn" markers, and the dashboard's "Waiting for you".
- **M3b (next): from Editing to the reader.**
  - release to papers, with the explicit-approval rules and a preview;
  - the publisher queue (approve, hold, take down);
  - the deemed-approval sweep in cron, plus "publish anything past its window now";
  - tag caching with purge (D11);
  - the outbox sender in cron;
  - the reader-visibility checks.

**Decided with the user (2026-10-09):**
- **Editor:** a plain markup textarea with a **live preview and live checks** beside it (tabs on phones) and a short markup cheat-sheet. Save and submit are Server Actions, so it works without JS.
- **Slug:** an editable field, required on create.
  - Auto-filled from a Latin-script headline; the writer types it for a Marathi one.
  - Allowed characters: `a–z 0–9 -`. All languages of an article share it.
  - **Fixed once the article is first released**, which happens in M3b. Until then, editable on the article page.
- **Byline:** pick an **author profile** of your organisation.
  - Institution people: their institution's authors → an institution article.
  - abcfinance staff: a staff author (→ `abcfinance`) or an independent expert (→ `independent`). The profile's `contributorType` sets `articles.type`.

**Already in place (reuse):**
- **Schema** (`src/server/db/schema.ts`): `articles`, `article_targets`, `article_versions` (with `state`, `rev` for optimistic concurrency, and the partial unique index "one master per article and language"), `workflow_events`, `authors`, `sections`, `tenants.languages`. **No migration is expected.**
- **Rules and helpers:**
  - `can()`, `hasRole()` and `Membership` in `src/domain/permissions.ts`; `ABC_EDITOR_ROLES` in `src/domain/roles.ts`;
  - `parseBody`, `unknownCalculators` and `classifyLink` in `src/domain/markup.ts`; `CALCULATOR_SLUGS` in `src/domain/calc/catalog.ts`.
- **Services and guards:**
  - `audit()` (`src/server/audit.ts`), which takes a transaction;
  - `requireUser`, `requireArea`, `assertSameOrigin` and `requestIp` (`src/server/auth/current.ts`).
- **UI:** `ArticleBody` (`src/components/reader/ArticleBody.tsx`), plus the panel UI kit and helpers (`src/components/ui/*`, `PageHeader`, `FormError`, `SubmitButton`).
- **Tests:** `submitForm()`, `person()` and `signInFully()` (`tests/http-client.ts`, `tests/e2e/auth-helpers.ts`).

## Acceptance split

- **`scripts/gen-acceptance-index.ts`:**
  - `milestoneNumber()` learns sub-milestones (`M3a` = 3.1, `M3b` = 3.2);
  - the E2E-WF, E2E-UI and U-WF groups move to `M3b`;
  - M3a items are pulled forward with `sub` / `ID_OVERRIDES`.
- **`tests/acceptance/MILESTONE`** → `M3a`.

| Group | M3a | M3b (stays) |
| --- | --- | --- |
| E2E-WF (40) | 01–12, 25, 35–38, 40 (**18**) | 13–24, 26–34, 39 (needs release; 39 is "every step", so it's checked after M3b's steps exist) |
| E2E-UI (30; 5 done in M1, 2 cron already covered) | 01–13, 18, 27 (**15**) | 14–17, 19, 24, 26, 28 |
| U-WF (23) | "institution side", "abcfinance side", "automated checks" (**12**) | "publisher side", "explicit approval and deemed approval" |

**M3a total: 45 checks.**

## Pure rules: `src/domain/` (unit tests)

**`workflow.ts` (new): one table drives the pages, the service and the "your turn" markers.**
- **Types:** `MasterState = draft | in_approval | compliance_review | editing | with_publisher`; `WorkflowAction = save | submit | approve | return | add_language` (`release` is declared now, built in M3b).
- **`allowedActions(ms, article, version)`** (article = `{type, organisationId}`):
  - **Draft:**
    - `save` and `submit` for the author side: institution writer or account admin **of that institution**; for abcfinance and independent articles, abcfinance writer or editor roles.
  - **In approval:** `approve` and `return` for `institution_approver` of that institution.
  - **Compliance review:** `approve` and `return` for `institution_compliance` of that institution.
  - **Editing:** `save`, `return` and `release` for `ABC_EDITOR_ROLES`.
  - **Anything else** (and **any paper copy**): no text edits.
- **`nextState(type, state, action)`:** submit goes to `in_approval` for institution articles and to `editing` for the others; approve moves to the next stage; return goes to `draft`.
- **`validateSubmit(version)`:** headline required, body ≥ 20 characters.
- **`returnNeedsComment`:** a return without a comment is refused.
- **`isYourTurn(ms, article, version)`:** true when a non-save action is allowed, or a save in draft by the author side.
- **`canView(ms, article)`:**
  - abcfinance staff see everything;
  - institution members see their own institution's articles;
  - publisher users see none here.
- **`canAddLanguage(ms, article)`:** the author side.

**`checks.ts` (new): the automated checks (04.2).**
- `runChecks({headline, body}, language)` → `{ ok, flags: {code, message}[] }`.
- **Length:** headline < 8 characters, body < 80.
- **English patterns:** guaranteed / assured / fixed returns, risk-free, 100% safe/secure/guaranteed, double your money, buy/sell this stock/share/fund.
- **Marathi patterns:** e.g. हमखास / खात्रीशीर / निश्चित परतावा, जोखीममुक्त / धोकामुक्त, पैसे दुप्पट.
- **Calculators:** an unknown `{{calc:x}}`, via `unknownCalculators(parseBody(body), CALCULATOR_SLUGS)`.
- **Pure, no Node-only APIs,** so the editor runs it client-side for live feedback.

**`slug.ts` (new):** `suggestSlug(headline)` (Latin letters only; otherwise empty) and `isSlug(s)` (`^[a-z0-9]+(?:-[a-z0-9]+)*$`, 3–80 characters).

## Services: `src/server/articles/`

- **`queries.ts`**
  - `listForUser(session)`: articles the person may view, with each language's master version, its state and a `yourTurn` flag; "your turn" first.
  - `getForUser(session, articleId, lang)`: the article, this master version, the other languages, the targets, and the history (workflow events with who did it). Returns `null` when the person can't view it, so the page answers **404**, not 403, and doesn't reveal that the article exists.
  - `waitingFor(session)`: drives the dashboard's "Waiting for you".
  - Form options: sections, papers (tenants), and the author profiles this person may pick.
- **`service.ts`**: every write is a transaction that also writes a `workflow_events` row and an `audit()` row (`article.create`, `article.save`, `article.submit`, …). That gives the history page, E2E-WF-40 ("events record who") and 06.6.
  - **`createArticle(session, input)`**
    - Zod-validated: section, master language (`en`/`mr`), author profile, target papers (≥ 1), headline, slug, summary, body.
    - The author profile must belong to the person's organisation (or, for abcfinance staff, be a staff author or an independent expert). The type is derived from the profile.
    - `organisationId` = the institution, or the abcfinance org.
    - `reviewBy` = 6 months from creation.
    - Creates a master version in `draft`, and the `article_targets` rows.
    - A duplicate slug gives a clear message.
  - **`saveVersion(session, versionId, rev, fields)`**
    - `UPDATE … SET …, rev = rev + 1 WHERE id = $id AND rev = $rev AND state = $state`.
    - Zero rows means **"Someone else changed this article. Reload to see their changes."** (04.2, D22).
    - Also covers slug and target edits, allowed only before release.
  - **`transition(session, versionId, rev, action, comment?)`**
    - Checks permission and comment with the domain rules.
    - The same conditional UPDATE, so of two simultaneous submits **exactly one wins** and the version moves once (E2E-WF-37/38).
  - **`addLanguage(session, articleId, fromLang, toLang)`**
    - Inserts a new master in `draft`, copying the source's headline, summary and body for a person to rewrite (04.4: transcreation isn't built).
    - The partial unique index refuses a second copy of the same language; the service turns that into "This article already has a Marathi version."
    - Allowed languages: `en`, `mr`.

## Pages and actions: `src/app/(platform)/(panel)/articles/`

```
page.tsx                       list (replaces the M2 stub): "Your turn" badge, languages with state badges,
                               section, last change; "New article" button for people who may create
new/page.tsx                   new-article form (sections, language, author, papers all ticked, headline, slug, summary, body)
[id]/[lang]/page.tsx           the article: state header, editor or read-only view, action buttons allowed
                               by allowedActions, return-with-comment form, add-language form, history
src/app/(platform)/_actions/articles.ts   create, save, submit, approve, return, addLanguage
                               (each: assertSameOrigin → requireArea("articles") → service → redirect 303
                               to the article page with ?done=<action> for the success notice)
```

- **Forms:** each one carries hidden `versionId` and `rev`. Failures come back through `useActionState`, and the text the person typed is kept.
- **`src/components/panel/ArticleEditor.tsx`** (client component):
  - the textarea, and a preview using a panel variant of `ArticleBody`;
  - the live checks list from `runChecks`;
  - the slug auto-filled from the headline until the writer edits it;
  - Preview and Edit tabs below `md`.
- **Refactor:** `ArticleBody` currently needs a reader `Site`. Change it to take only what it uses (article type, the site's hosts for link rules), so the panel preview and the reader share one renderer. Then add a small `.article-preview` style to the panel CSS.
- **Dashboard:** "Waiting for you" lists `waitingFor()` items, each linking to its article. This replaces the M2 empty state; the empty state stays when nothing is waiting.
- **Publisher users:** already get a 403 on `/articles` from M2 (E2E-UI-18). Institution writers already get a 403 on `/publisher` (E2E-UI-27). M3a adds tests for both.

## Seed: `db/seed/workflow.ts` (new)

The pre-release workflow articles that TESTING.md §2B names, with matching master states:

| Article | Who / where | State | Notes |
| --- | --- | --- | --- |
| "Debt funds vs equity funds" | `writer.amc` | `draft` | |
| "Cashless or reimbursement…" | General Insurer | `in_approval` | for `approver.gi` |
| "Fixed deposit or mutual fund" | | `editing` | text says "assured returns", so the check flags it |
| "Education loan: moratorium" | abcfinance article | `editing` | |
| "Riders on a term plan" | Life Insurer | `compliance_review` | |

- Each gets plausible workflow events.
- The two "with publisher" articles ("Home loan balance transfer", "Index funds in plain words") wait for M3b.
- Invented content is noted in `db/seed/README.md`.

## Tests

| Kind | File | Covers |
| --- | --- | --- |
| Unit | `tests/unit/workflow.test.ts` | U-WF institution side (5) and abcfinance side (3); `nextState`, `isYourTurn`, `canView` |
| Unit | `tests/unit/checks.test.ts` | U-WF automated checks (4), English and Marathi |
| Unit | `tests/unit/slug.test.ts` | suggest and validate |
| Integration | `tests/integration/articles.test.ts` | Optimistic concurrency on save and transition (one winner); a duplicate language is refused; every transition writes a workflow event and an audit row in one transaction; a non-member can't view |
| E2E | `tests/e2e/workflow.test.ts` | E2E-WF M3a IDs, through real forms: writer.amc creates and submits; approver.gi is refused; compliance can't jump the approver; return needs a comment; editor.abc edits; writer.abc's article goes straight to Editing; add Marathi; double add refused; two parallel submits with the same `rev`; event actors |
| E2E | `tests/e2e/articles-ui.test.ts` | E2E-UI M3a IDs: the Articles area and New button, the form lists sections and papers, create redirects, editor and Submit, save shows the headline, the draft isn't on the reader site, another org's writer gets a 404, submit locks editing, "Your turn" for the approver, the return error, the approver and compliance steps, publisher → 403 on `/articles`, writer → 403 on `/publisher` |

The approvers use `signInFully()` (2FA). Fresh test articles are created per test, so the seed isn't mutated in ways other suites rely on.

## Docs

- **`docs/implementation-plan.md`:** split M3 into M3a and M3b.
- **`docs/decisions.md`:**
  - D22: concurrency covers saves as well as transitions ("someone else changed it");
  - D23: the slug is an editable field, fixed at first release;
  - D24: the byline is an author profile, and its contributor type sets the article type;
  - D25: an article you can't view answers 404, not 403.
- **`docs/plans/m3a-authoring-approvals.md`:** a copy of this plan.
- **`handoff.md`** (local only, never committed): status and next steps.

## Order of work

1. Save the plan; acceptance-script sub-milestones.
2. `domain/workflow.ts`, `checks.ts`, `slug.ts` with unit tests.
3. Article queries and service, with integration tests.
4. Refactor `ArticleBody` for shared preview.
5. Pages, actions and the `ArticleEditor` component; dashboard "Waiting for you".
6. Seed workflow articles.
7. E2E suites.
8. `MILESTONE` → `M3a`, decisions, implementation plan, handoff.
9. Polish review (make-interfaces-feel-better) with screenshots at 375 px and 1280 px.
10. Commit and push to `main`; confirm CI.

## Verification

- `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test && corepack pnpm test:int && corepack pnpm test:e2e`
- `npx tsx scripts/gen-acceptance-index.ts --check M3a` passes, and CI is green.
- **Manual walk-through** on a standalone build on :3200 (`HOSTNAME=0.0.0.0`), following TESTING.md §2A steps 1–4 plus §2B/C:
  - `writer.amc` creates an article in English;
  - `approver.amc` tries a return without a comment (refused), then approves;
  - `compliance.amc` approves;
  - `editor.abc` sees it in Editing and can edit it;
  - two tabs saving the same version → the second is told someone else changed it;
  - add a Marathi version;
  - the seeded "Fixed deposit…" article shows the "assured returns" flag.
- **Screenshots** of the list, the editor (desktop split, and phone tabs) and the history.
