# M3b: Release, the publisher queue and deemed approval

## Context

M3a (commit `44a2eb9`, CI green) took articles from Draft to Editing. M3b takes them from Editing to readers (doc 04.3):
- an abcfinance editor **releases** a language version to several newspapers, with a per-paper preview of the rules;
- each paper's editor **approves, holds or takes down** their copy in the publisher queue;
- copies that need no explicit approval **publish themselves** when their window ends (cron, plus a "publish anything past its window now" button).

When M3b is done, every E2E-WF, E2E-UI and U-WF check is covered, and the whole M3 is closed.

**Decided with the user (2026-10-09):**
- **Caching is deferred to M6**, after measuring on the VPS. M3b adds a no-op `contentChanged()` hook that is called on publish, hold and take-down, so caching later is one function. This replaces D11's "caching in M3" (new decision D26).
- **A taken-down article answers 404** like any missing page: the themed not-found page, noindex, gone from the sitemap, and the canonical moves to the next paper still publishing it (D8, which already works).
- **Queue access:**
  - newspaper editors decide on their own paper's copies;
  - newspaper admins see their paper's queue read-only;
  - **super admin and desk manager see every paper's queue read-only** and can press "publish anything past its window now";
  - newspaper editors can press it for their own paper.
- **One milestone,** gated by `--check M3b`.
- **No edits after release** (as 04.2 specifies). A live typo is fixed by taking the article down; corrections can be a later feature. This is noted for the business as D31.
- **No email to newspaper editors** on release. They use the queue and the dashboard's "Waiting for you"; a digest is a known gap (09.2).
- **The release note is shown to the papers' editors** on each queue card and copy preview, and is kept in the workflow history.

**Already in place (reuse):**
- **Schema** (no migration expected):
  - `article_versions`: `tenantId` (a copy), `approvalType`, `publishedAt`, `autoApproveAt`, `heldAt`, `requiresExplicit`, `explicitReasons[]`, `rev`, the partial unique index `article_versions_one_copy`, and an index on `(state, autoApproveAt)`;
  - `tenants`: `languages`, `autoApproveHours` (default 24), `heldSectionSlugs`;
  - `workflow_events.actorLabel` for system actions.
- **Workflow code:**
  - `src/domain/workflow.ts`: `allowedActions` (Editing already allows `release`), `nextState(…, "release")` → `with_publisher`, `isBeforeRelease` (locks the slug once released);
  - `src/domain/checks.ts`: `runChecks` (a flagged check forces explicit approval);
  - `src/server/articles/service.ts`: the `event()` helper (workflow event plus audit in one transaction), the `CONFLICT` pattern, `isUniqueViolation`.
- **Reader site:** shows only `published` copies; the explicit/deemed labels, canonical (`canonicalCopy`, D8), hreflang and sitemap are already built in M1.
- **Cron:** `src/server/jobs.ts` `runScheduledJob` already calls `sendQueued()`, so the "outbox sender in cron" item is done. `publishDeemed()` is the stub to fill.
- **Guards and UI:**
  - `requireArea`, `assertSameOrigin`, `requestIp` (`src/server/auth/current.ts`);
  - `can()` and `hasRole()` (`src/domain/permissions.ts`; `copy.decide` and `copy.view` already exist);
  - `StepForm`, `ReturnForm`, `FormError`, `SubmitButton`, `Badge`, `Card`.
- **Tests:** `submitForm` (array fields, `{ page }` replay), `signInFully`, `person`, and `tests/e2e/article-helpers.ts`.

## Acceptance

- **`scripts/gen-acceptance-index.ts`:** none needed. The E2E-WF, E2E-UI and U-WF groups already default to `M3b`.
- **`tests/acceptance/MILESTONE`** → `M3b`.

| Group | M3b checks |
| --- | --- |
| E2E-WF | 13–24, 26–34, 39 (22) |
| E2E-UI | 14–17, 19, 24, 26, 28 (8); 29 and 30 (cron) are already covered |
| U-WF | publisher side 09–13, explicit and deemed approval 14–19 (11) |

## Pure rules: `src/domain/`

**`publishing.ts` (new): the 04.3 rules.**
- **`ExplicitReason = "first_articles" | "flagged" | "held_section"`**, with an English label for each, e.g. "Editor must approve explicitly: one of the first 3 articles from this institution".
- **`explicitReasons({ articleType, publishedFromInstitution, flagged, sectionSlug, heldSectionSlugs })`**: first-3 applies only to institution articles, counting distinct articles with at least one published version on that paper.
- **`releasePlan(paper, language, alreadyHas)`** → `{ action: "create" | "skip" | "refuse", reason }`.
  - refuse: "Tarun Bharat doesn't publish English";
  - skip: "Already has this version".
- **`autoApproveAt(releasedAt, hours, requiresExplicit)`** → the deadline, or `null` when the copy needs explicit approval.
- **`copyActions(ms, copy)`:**
  - the paper's `publisher_editor` can approve, hold or take down a `with_publisher` copy;
  - a held copy can be approved or taken down, but not held again;
  - a `published` copy can only be taken down;
  - admins and everyone else get none.
- **`isDue(copy, now)`:** `with_publisher`, not held, not explicit, and `autoApproveAt <= now`.

**Other domain changes:**
- **`permissions.ts`:** add `copy.oversee` (global: super admin and desk manager) and `copy.run_due` (publisher editor of the paper, or `copy.oversee`).
- **`panel-menu.ts`:** the `/publisher` area opens with `copy.view` **or** `copy.oversee`. The M2 panel test that expects super.abc to get a 403 on `/publisher` is updated.

## Services: `src/server/publishing/` (new)

- **`release.ts`**
  - **`releasePreview(actor, versionId)`:** for each paper (targets pre-ticked, others listed), the plan and explicit reasons for the release form.
  - **`release(actor, versionId, rev, tenantIds, note, ip)`**, in one transaction:
    - the editor role is checked with `can(…, "release")`;
    - the master moves `editing` → `with_publisher` with the `rev` check (CONFLICT on a stale page);
    - `runChecks` decides whether the copy is flagged;
    - per paper: refuse or skip, otherwise insert a copy (`state with_publisher`, `requiresExplicit`, `explicitReasons`, `autoApproveAt`);
    - events and an audit row (`article.release`) carry the note. Each copy's creation event (`action "release"`) stores the note as its comment, which is where the queue reads it from.
  - **Refusals:**
    - "Choose at least one newspaper";
    - a language a chosen paper doesn't publish (clear message);
    - every chosen paper already has it.
  - **Re-release:** an article already `with_publisher` can be sent to more papers (E2E-WF-17 "releasing twice to the same paper is refused"). The master stays `with_publisher`; new papers get new copies.
- **`decide.ts`**: `approve`, `hold(reason)`, `takeDown(reason)`. Each copy decision:
  - is checked with `copyActions` against the copy's paper;
  - uses a conditional UPDATE on `rev` and `state`;
  - writes an event and an audit row (`copy.approve`, `copy.hold`, `copy.take_down`);
  - calls `contentChanged()`.
  - **Approve:** sets `state published`, `approvalType explicit`, `publishedAt now`, `lastReviewedAt now`, and clears `heldAt` and `autoApproveAt`.
  - **Hold:** sets `heldAt` and clears `autoApproveAt` (stops the clock).
  - **Take down:** sets `state unpublished`.
  - A missing reason gives "Give a reason".
- **`deemed.ts`: `publishDue(now, scope?)`**, used by cron and the button.
  - Inside one transaction: `SELECT … WHERE state='with_publisher' AND held_at IS NULL AND NOT requires_explicit AND auto_approve_at <= now FOR UPDATE SKIP LOCKED`. Then update those rows: `published`, `approvalType deemed`, `publishedAt now`.
  - Events carry `actorLabel "deemed approval (system)"` and no user. Audit: `copy.deemed_approve`.
  - **`SKIP LOCKED`:** a human decision in progress wins.
  - **Idempotent:** running it twice publishes nothing new.
  - `scope` limits it to one paper for a newspaper editor's button.
  - `jobs.ts` `publishDeemed` calls it.
- **`queue.ts`**
  - **`queueFor(actor, tenantId?)`:** the papers the person may see, with waiting copies (reasons, deadline, held state, article, language, headline) and live copies; the newest first.
  - **`copiesFor(articleId)`:** the per-paper copy table on the article page.
- **`src/server/content/events.ts`:** `contentChanged({ tenantIds, articleId })`, a documented no-op until M6 (D26).

## Pages and actions

- **`(panel)/articles/[id]/[lang]/page.tsx`**
  - **Release form** (replaces the M3a placeholder): one checkbox per paper with its plan and explicit-approval reasons, an optional note, and a **"Send to selected papers"** button (`data-form="release"`).
  - **After release:** a "Newspapers" table shows each copy's state (waiting / held / published / taken down), approval type and deadline (`data-copy="<tenant slug>"`).
- **`(panel)/publisher/page.tsx`** (replaces the stub): a paper switcher (for people with more than one paper, or staff), then "Waiting for a decision" and "Live" lists.
  - **Waiting cards:** headline, institution, language, explicit reasons or "Publishes automatically at …", the editor's release note, held badge and reason, and a preview link.
  - **Buttons, for editors only:** Approve and publish now; Hold (reason); Take down (reason).
  - **"Publish anything past its window now"** for `copy.run_due` people.
  - Built for phones first (the editor decides in seconds).
- **`(panel)/publisher/[copyId]/page.tsx`:** a read-only preview of the copy, rendered with `ArticleBody` and the paper's link hosts, plus the same decision buttons. Publisher users can't open `/articles`, so this is where they read the text.
- **`src/app/(platform)/_actions/publishing.ts`:** `releaseAction`, `approveCopyAction`, `holdCopyAction`, `takeDownCopyAction`, `runDueAction`. Each follows the M3a pattern (`assertSameOrigin` → guard → service → 303 with `?done=`) and keeps failures inline via `useActionState`.
- **Dashboard "Waiting for you":** publisher editors see their waiting copies (explicit first, then by deadline).
- **Articles list:** an "Overdue review" badge where `reviewBy` < today (04.3 review dates; flag only).

## Seed: `db/seed/workflow.ts` (extend)

The two TESTING.md §2B articles already with the papers:

| Article | Type | Copies | Approval |
| --- | --- | --- | --- |
| "Home loan balance transfer" | abcfinance, home loan, mr + en | Tarun Bharat mr, Paper B en | Deemed, due in about 20 h (TB) and about 3 h (Paper B) |
| "Index funds in plain words" | AMC, mutual funds, mr + en | Tarun Bharat mr, Paper B en | `requiresExplicit` with `first_articles` (AMC has fewer than 3 published on each paper) |

- Each gets workflow events.
- The deadlines are set from seed time, so a reset re-arms them.
- `db/seed/README.md` is updated.

## Tests

| Kind | File | Covers |
| --- | --- | --- |
| Unit | `tests/unit/publishing.test.ts` | U-WF-09…19: copy actions per role and state; held, live and admin rules; nobody edits a copy; deemed for routine articles; first-3 for institutions only; held sections and flags force explicit; the window starts now and never for explicit copies; due-ness |
| Integration | `tests/integration/publishing.test.ts` | Release refuses an unsupported language and all-skipped; the sweep is idempotent; `SKIP LOCKED` (a held or locked row is not published); a human decision racing the sweep wins; take-down moves the canonical (D8); events and audit rows for every step, including the system actor |
| E2E | `tests/e2e/publishing.test.ts` | E2E-WF-13…24, 26…34, 39, through real forms. editor.abc releases an AMC article: one Marathi version to Tarun Bharat, plus English to Paper B. Covers: Tarun Bharat refused for English; editor.b can't touch the TB copy; admin.tb sees no buttons; hold/approve/take-down; deemed via the button with `autoApproveAt` moved into the past in the test DB; explicit and held copies never auto-publish; a flagged article (the "assured returns" seed) needs explicit approval; add a language to a released article (WF-34); a full audit trail (WF-39) |
| E2E | `tests/e2e/publishing-ui.test.ts` | E2E-UI-14…17, 19, 24, 26, 28: the release form and its per-paper rules; after release both papers are waiting; the queue says explicit approval is needed; approve publishes on Tarun Bharat; the other paper doesn't show it until its editor decides; take-down gives 404 and drops it from the sitemap; admin.tb sees no decision buttons |

- The M2 `panel.test.ts` gets updated expectations: super.abc's menu gains `/publisher`, and `/publisher` is no longer a stub.
- Tests create their own articles. Seed rows are only read.

## Docs

- **`docs/decisions.md`:**
  - D26: caching is deferred to M6 behind `contentChanged()`, replacing D11's timing;
  - D27: a taken-down article is a 404;
  - D28: abcfinance oversight of the queue is read-only, plus the run-now button;
  - D29: re-release to more papers keeps the master `with_publisher`;
  - D30: the deemed sweep uses `FOR UPDATE SKIP LOCKED`, so humans win;
  - D31: no corrections after release in phase 1 (take down instead), flagged for the business.
- **`docs/implementation-plan.md`:** M3b's caching line moves to M6.
- **`docs/plans/m3b-release-publishing.md`:** a copy of this plan.
- **`handoff.md`** (local, never committed): M3b status, gotchas, and next steps → **M4**.

## Order of work

1. Save the plan; `domain/publishing.ts` and the permissions/menu changes, with unit tests.
2. Publishing services and `contentChanged()`; wire `publishDeemed`; integration tests.
3. The release form and copy table on the article page.
4. The publisher queue, copy preview and actions; dashboard and overdue badge.
5. Seed the two "with publisher" articles; `corepack pnpm db:reset` (it wipes local 2FA set-ups: say so in the summary).
6. E2E suites; update `panel.test.ts`; shuffled-order run.
7. `MILESTONE` → `M3b`, decisions, implementation plan, handoff.
8. Polish review and screenshots of the queue at 375 px (phone first) and the release form at 1280 px.
9. Commit and push to `main`; confirm CI.

## Verification

- `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test && corepack pnpm test:int && corepack pnpm test:e2e`, plus `npx vitest run --project e2e --sequence.shuffle.files` with `E2E_SKIP_BUILD=1`.
- `npx tsx scripts/gen-acceptance-index.ts --check M3b` passes, and CI is green.
- **Manual walk-through** (TESTING.md §2A steps 5–8 and §2B) on a standalone build on :3200 against the dev DB:
  - editor.abc releases to Tarun Bharat and Paper B, and sees each paper's rule;
  - editor.tb holds, then approves; the article is live at `tarunbharat.localhost:3200/<section>/<slug>` with "Approved by the Tarun Bharat editor";
  - Paper B doesn't show it until editor.b decides;
  - take-down gives 404;
  - as super.abc, "publish anything past its window now" publishes only what is due.
