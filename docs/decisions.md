# Decisions log

Where the rebuild departs from, or fills a gap in, the handover pack. Newest last. Each entry says
what was decided, why, and where it lives. The business decisions the reference made (09.3) still
apply unless an entry here changes one.

## D1. Rebuild from the docs, in Next.js on our own VPS (2026-10-09)

No access to the reference repository. Stack and hosting are in `docs/implementation-plan.md`.

## D2. Newspaper TLS through certbot, not automatic issuance (2026-10-09)

Doc 07.3 says TLS is issued automatically once a newspaper's CNAME points at us. Our VPS already
runs nginx, so each new finance host gets its certificate from one command,
`deploy/add-tenant-host.sh <host>`. It needs no code change or redeploy, and nginx loads
certificates by SNI name, so its config doesn't change either.

## D3. Join tables instead of id arrays for plan newspapers and article targets (2026-10-09)

Doc 03 stores `Plan.tenantIds[]` and `Article.targetTenantIds[]`. We use `plan_tenants` and
`article_targets` so the database enforces the foreign keys. Behaviour is unchanged.

## D4. Plans carry start and end dates (2026-10-09)

Doc 03 gives plans no dates, but the monthly pool (04.9) needs to know which plans were active in a
month. `plans.starts_on` / `ends_on` were added.

## D5. "Released" masters are stored as `with_publisher` (2026-10-09)

Doc 03 lists the version states without a separate "released" one, and 04.2 says the master
"shows as With publisher" after release. A master's tenant is null, so it is never confused with a
paper copy.

## D6. Rate limits and calculator-use rows (2026-10-09)

- Rate limits live in an UNLOGGED Postgres table instead of process memory, so they hold across
  restarts and instances. This closes gap 06.7 #1 for the shared store.
- `calculator_uses.sponsor_org_id` is a nullable foreign key with a `NULLS NOT DISTINCT` unique
  key, instead of the reference's `''` placeholder.
- `widget_stats.card_id` keeps `''` for the menu link and has no foreign key, so click history
  survives card deletion.

## D7. Database-level invariants (2026-10-09)

Triggers enforce three rules from 03.7:
- a role must match its organisation's type;
- a paper copy's newspaper must publish its language;
- audit events are never edited.

The last-admin rules stay in the service layer (M5) because they depend on who is acting.

## D8. Canonical goes to the earliest *currently published* copy (2026-10-09, M1)

Doc 04.4 says a copy that runs on several papers points its canonical at the first paper that
published it. It doesn't say what happens when that paper takes the article down. We point at the
earliest copy that is still published, so a takedown moves the canonical to the next-earliest paper
and no live page ever canonicalises to a 404.

Lives in `canonicalCopy()` (`src/server/content/queries.ts`).

## D9. hreflang includes `x-default` (2026-10-09, M1)

Pages list one alternate per language the page exists in on that paper (04.4). When the page
exists in the paper's default language, we add `x-default` pointing at that version, as search
engines recommend. An English-only article on a Marathi-first paper therefore has no `x-default`.

## D10. Reader labels in Marathi are drafts (2026-10-09, M1)

The handover gives no Marathi wording for "Partner content", the approval lines or the other reader
strings (`src/domain/i18n.ts`). Ours are first drafts. A native editor and compliance must review
them before launch, along with the disclaimers and consent text (09.4).

## D11. Page caching arrives with publishing (2026-10-09, M1)

In M1, reader pages render per request from indexed queries, with only the 30-second tenant cache
(02 §2.4). Tag-based caching, purged on publish, takedown and edit, comes in M3, where those events
exist and the purge can be tested end to end.

## D12. Next.js runtime notes (2026-10-09, M1)

- **Never start the server with `HOSTNAME=127.0.0.1`.** Next treats a proxy rewrite as internal only
  when its origin matches the server's own, and it normalises 127.0.0.1 to `localhost` in request
  URLs. The rewrite then becomes an external proxy request that loops. The Docker image and the e2e
  harness use `0.0.0.0`.
- **`notFound()` pages are drawn by the browser.** Next 16 answers `notFound()` with a real 404
  status and `noindex`, then renders the page's themed "not found" UI on the client. Crawlers get
  the 404; readers see the paper's page.
- **Per-host `sitemap.xml` and `robots.txt` are route handlers at `sitemap-xml` and `robots-txt`.**
  Folders named `sitemap.xml` would be taken as Next's own static metadata file, which can't see the
  host.

## D13. Sections and articles share one catch-all route (2026-10-09, M1)

`/<section>` and `/<section>/<slug>` are served by `(site)/[...path]`. Any deeper or unknown path
then ends in the paper's themed 404 rather than Next's default page.

## D14. Tarun Bharat is Marathi-only (2026-10-09, user decision)

The handover's demo world gives Tarun Bharat Marathi plus English at `/en` (TESTING.md §1). The
real Tarun Bharat finance section is Marathi-only, so its tenant row lists only `mr`. English demo
copies moved to Paper B (English first, Marathi at `/mr`), and `sip-basics` gained a Marathi version.

TESTING.md walk-through URLs under `tarunbharat.localhost:3000/en/...` don't apply; the same pages
are unprefixed in Marathi, and the English cases live on `paperb.localhost:3000`. Phase 1's "at
least two languages" is still met across papers. Languages are tenant data: re-enabling English
means adding `en` to the row, with no deploy.

## D15. One failure counter for passwords and codes, reset only by a finished sign-in (2026-10-09, M2)

04.12 locks an account after 5 wrong passwords **or codes**. A correct password alone doesn't
reset the count. If it did, someone who knew the password could try 4 codes, sign in again and
try 4 more, forever. The count resets only when sign-in completes (the password, plus a code where
one applies). The fifth failure locks the account for 15 minutes and starts the count again.

Wrong codes on the **set-up** page don't count toward the lock: the person has just proved their
password and is scanning a brand-new key. Instead, those codes are limited to 10 per person per
15 minutes.

Lives in `recordFailure()` (`src/server/auth/signin.ts`) and `src/server/auth/twostep.ts`.

## D16. The lock message doesn't reveal which emails have accounts (2026-10-09, M2)

A locked account says "Too many attempts. This account is locked for 15 minutes." Unknown emails
"lock" after the same 5 tries (counted in the rate-limit table under a keyed hash). The message
therefore can't be used to find real accounts. A locked account still runs one scrypt check, so
it takes the same time as any other attempt.

## D17. Per-address sign-in limit: 20 posts per 15 minutes (2026-10-09, M2, user decision)

The docs give no figure for this limit (gap 06.7 #1). Password and code posts from one address
share a budget of 20 per 15 minutes. This leaves room for a newsroom behind one office address
and stops spraying across accounts. The counter is in Postgres (D6), and the address is nginx's
`X-Real-IP`.

## D18. Session cookie security follows `APP_URL` (2026-10-09, M2)

06.1 says "Secure in production". We set `Secure` whenever `APP_URL` is https, and name the cookie
`__Host-abc_session`, so browsers also refuse a `Domain` or a non-root path. Over http (local
development, and the e2e suite, which runs a production build on `http://localhost:3100`) it is
plain `abc_session` without `Secure`.

## D19. A new session token once two-step is done (2026-10-09, M2)

After the password, the session is stored with `mfaVerified = false`. When the code is accepted,
that session is replaced by a new one (new token, same expiry). A token seen before the second
step is never a fully signed-in one.

## D20. Change password arrives in M2 (2026-10-09, user decision)

`/account/password` is on every role's menu, and it is the first user of the password policy, so
it moved from M5 into M2 with its checks (E2E-USR-89…97, U-USR email and password rules). The rest
of user management stays in M5.

## D21. Panel forms are Server Actions (2026-10-09, M2, user decision)

As in the reference (doc 10, `actions/*.ts`), every panel command is a Server Action. Forms work
without JavaScript and are tested over HTTP: the e2e client's `submitForm()` posts them as a browser
would. The same-origin rule for form posts (06.1) is enforced twice:
- Next refuses an action whose `Origin` differs from the host;
- `assertSameOrigin()` also pins `Origin` to `APP_URL`'s origin.

Panel areas outside a person's roles answer **403** through `forbidden()` (`experimental.authInterrupts`).

## D22. Concurrent edits are caught on saves too (2026-10-09, M3a)

04.2 says that when two people act on the same version at once, exactly one succeeds and the
other is told someone else changed it. We apply the rule to text saves as well as to workflow
steps. Every form carries the version's `rev`, and each save or step is a single
`UPDATE … WHERE rev = $rev AND state = $state`. A stale page gets "Someone else changed this
article while you were looking at it. Reload to see their changes." and its text is kept.

Lives in `src/server/articles/service.ts`.

## D23. The web address (slug) is an editable field, fixed at the first release (2026-10-09, M3a, user decision)

Marathi headlines don't make readable slugs, and transliteration would need a table to get
right. The new-article form has a required "Web address" field (lower-case Latin letters, digits
and single hyphens, 3–80 characters). It is filled in from a Latin-script headline until the
writer edits it. All languages of an article share the slug. It can change until the article is
first released (M3b), and then it is fixed, so published URLs never change.

## D24. The byline is an author profile, and its type sets the article type (2026-10-09, M3a, user decision)

Doc 03 has `Article.author` and `Article.type` but doesn't say how a writer chooses them. The
new-article form lists the author profiles the person may write under:
- institution writers and admins: their institution's authors, giving an institution article;
- abcfinance writers and editors: staff authors (an abcfinance article) or independent experts
  (an independent article).

Author profiles aren't tied to user accounts, which matches the seed.

## D25. An article you may not see answers 404 (2026-10-09, M3a)

Opening another institution's article gives the same "not found" as an article that doesn't
exist, so ids can't be probed. Areas outside a person's roles still answer 403 (D21), because
the menu already tells them the area exists.

## D26. Page caching is deferred to M6, behind one hook (2026-10-09, M3b, user decision)

Replaces D11's timing. Reader pages keep rendering per request from indexed queries; caching is
added in M6 only if measurements on the VPS call for it. Every change readers can see (publish,
deemed publish, hold, take-down) already calls `contentChanged({ tenantIds, articleId })` in
`src/server/content/events.ts`, a documented no-op for now, so adding caching later is one
function.

## D27. A taken-down article answers 404 (2026-10-09, M3b, user decision)

04.3 says a take-down removes the article "from the reader site immediately". We answer exactly as
for any missing page: the paper's themed not-found page with a real 404 and `noindex`. It also
leaves the sitemap, and its canonical moves to the next paper still publishing it (D8). There is
no "410 Gone" or tombstone page.

## D28. abcfinance oversees the queues read-only (2026-10-09, M3b, user decision)

04.1 gives the publisher queue to the papers. Who sees it and acts:
- a paper's `publisher_editor` decides on that paper's copies;
- its `publisher_admin` sees the paper's queue, read-only (as 04.3 says);
- `abcfinance_super_admin` and `abcfinance_desk_manager` see every paper's queue, read-only
  (`copy.oversee`), so the desk can follow up on what is stuck;
- "publish anything past its window now" (`copy.run_due`) is open to a paper's editors for their
  papers and to those two staff roles for every paper. It runs the same sweep as the scheduled
  job, so it can only publish what is already due, and the audit row names who pressed it.

## D29. Sending a released article to more papers (2026-10-09, M3b)

04.3 allows a release to skip papers that already have the version, which implies releasing the
same version again. An editor can send an article that is already "With publisher" to more
papers from its page. The master stays "With publisher"; only the new papers get copies. Choosing
only papers that already have it is refused ("releasing twice to the same paper is refused").

## D30. The deemed sweep skips rows a person is deciding on (2026-10-09, M3b)

04.3 says concurrent decisions win over the scheduled job. The sweep selects due copies with
`FOR UPDATE SKIP LOCKED` in one transaction, so a copy whose row a person's decision has locked
is left for the next run. Both the sweep and the decisions are conditional updates on the copy's
`rev`, so whichever comes second changes nothing (the person is told someone else changed it).

## D31. No corrections after release in phase 1 (2026-10-09, M3b, user decision; for the business)

04.2 says text can be edited only in Draft and Editing, and paper copies are never edited. So once
an article is released, a typo cannot be fixed in place: the paper's editor takes the copy down,
and the article is written again as a new one. Corrections (a new version replacing a live copy)
can be a later feature if the papers need it. **To confirm with the business.**

