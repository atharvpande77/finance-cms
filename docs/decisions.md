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

## D32. Calculator ranges and reader defaults are ours (2026-10-09, M4a)

04.7 gives the formulas and default rates, and says every editable field has an allowed range,
but gives no ranges and no starting values for the reader's inputs. We define them in
`src/domain/calc/fields.ts`:
- **reader defaults** reproduce doc 08's scenarios (a ₹20 lakh loan over 20 years; ₹5,000 a month
  for 10 years; 50 g of 22 K gold; a car of 1000–1500 cc, 3 years old, IDV ₹5 lakh, 3 claim-free
  years; a family of two adults and a child led by a 35-year-old in a large city; a 35-year-old
  earning ₹10 lakh with two dependants);
- **ranges** are wide enough for real use and narrow enough to refuse typing mistakes (for
  example an interest rate of 1–30%, a loan-to-value of 10–85%);
- the built-in rates are dated **1 October 2026** ("rates as of").

All rates stay placeholders until each sponsor confirms its own (09.3 #13). The Marathi labels
are a first draft (D10).

## D33. Rate precedence works per saved row, and rates follow the brand (2026-10-09, M4a)

04.7's precedence (the sponsor's saved rates, else abcfinance's, else built-in) is applied per
calculator row: the first organisation with a saved row supplies all its figures and its "as
of" date, and any saved figure that is out of range falls back to the built-in one. The
organisation whose rates apply is always the one whose brand is shown, so an unbranded
calculator (an independent expert's article, or one suppressed by exclusivity, D34) uses
abcfinance's rates, never a sponsor's. "Reset to standard defaults" deletes the organisation's
row. A save or reset shows at once (pages render per request, D26) and calls the
`ratesChanged()` hook.

## D34. Calculator sponsor and exclusivity (2026-10-09, M4a, user decision)

The handover doesn't say which sponsorship wins when a calculator sits in several sections, or
what happens in an exclusive category to another institution's own article. We decide, in one
function (`src/domain/sponsor.ts`):
- a calculator's sponsor is an active sponsorship (started, not ended, India dates) of a section
  that lists it: the page's own section first, then an exclusive sponsorship, then the earliest
  start;
- an institution's article shows only that institution's brand ("Calculator by …") and its rates;
- an independent expert's article shows no sponsor;
- an abcfinance article, a section page and a calculator's own page show "Sponsored by …";
- **exclusivity wins inside its section**: any other sponsor's calculator there is unbranded,
  with no lead call-to-action and abcfinance's rates. This applies even on another institution's
  own article in that section; the article's end-of-article lead form for its author stays (M4b).

## D35. Lead capture is a Server Action on the newspaper's own page (2026-10-09, M4b)

The handover gives no path for submitting a lead. As with the panel (D21), the form posts a
Server Action from the reader page itself, so it works without JavaScript and its errors and
thank-you are drawn in place. Action ids are global, so the action trusts nothing from the
form: the paper comes from the `Host` header, the `Origin` must be that same host (Next also
checks this), and the sponsor is worked out on the server from what the form points at (a
published institution article on this paper, or a calculator whose branding there offers a
call-to-action, D34). The source page is rebuilt on the server too. Staging papers capture
leads exactly like live ones (user decision). The proxy now removes any page headers a client
sends to the panel host.

## D36. The new-lead email carries no personal details (2026-10-09, M4b, user decision; for the business)

04.6 and 05.4 say each new lead emails the sponsor's account admins "with the details". Email
leaves our control (the mail provider and inboxes keep copies that our erasure and retention
can't reach), so the email names the paper, the interest, the page and the time, and links to
the Leads inbox. Name, mobile and city are seen only after signing in with two-step
verification. **To confirm with the business.**

## D37. Lead retention comes from the sponsor organisation (2026-10-09, M4b)

Doc 08 says the retention date is set "from the sponsor's contract", but contracts in doc 03
are with newspapers, and doc 03 gives `Organisation.leadRetentionDays` (default 365). A lead is
erased `leadRetentionDays` after it arrives, using its sponsor's value. The seed gives the
General Insurer 180 days so tests can tell the source apart.

## D38. Lead limits and erasure, in detail (2026-10-09, M4b)

- The 5-per-hour limit counts valid submissions per address (keyed hash); a filled honeypot
  and invalid forms count toward nothing.
- The 3-per-day limit counts **stored leads** for a phone number over a sliding 24 hours,
  under a per-number database lock, so simultaneous submissions can't get past it. Erased
  leads no longer count.
- A repeat to the same sponsor within 24 hours stores nothing and tells the reader "we already
  have your request" (TESTING.md's wording), and doesn't count toward the phone limit.
- Erasing (on request or at retention) also blanks the address hash and the sponsor's note,
  which may name the person. The consent record and status stay.
- The CSV export is a POST from the panel's own form (a link elsewhere can't start downloads in
  someone's name), and every cell is quoted with formula characters neutralised.

## D39. Marathi consent text and interest labels are drafts (2026-10-09, M4b)

The handover gives only the English consent wording and says Marathi labels exist. Ours, in
`src/domain/leads.ts`, are a first draft and, like D10, need legal and native review before
launch (09.3 #12). The consent version stays `v1`; a reviewed wording should become `v2`.

## D40. Junk % is the share of all leads (2026-10-09, M4b)

04.6 lists worked %, qualified % (of worked leads that aren't junk) and junk %, without saying
junk of what. We use junk ÷ all leads, so a sponsor sees how much of what arrives is unusable.


## D41. A development-only two-step test code (2026-10-10, user decision)

For quick local testing, `next dev` with `DEV_TOTP_BYPASS=1` accepts the fixed code `111111` for
two-step set-up and sign-in, so demo accounts can sign in without an authenticator app. It is
fenced three ways:
- it works only when `NODE_ENV` is `development`, so production builds (including the e2e
  suite's) ignore it;
- the server refuses to start if the flag is set in production;
- every sign-in through it is audited with `devBypass: true`.

The flag is documented in `.env.example` and off by default. Real codes keep working alongside it.

## D42. The writer is the author (2026-10-10, user decision; replaces D24)

The new-article form no longer asks for an author. A person files as themselves: their byline is
their own author profile, linked to their account (`authors.userId`) and created from their name
and organisation on their first article. The seed links the existing profiles to the demo writers
(`writer.amc` is Anita Kulkarni, `writer.gi` Rahul Deshmukh, `admin.li` Meera Joshi, `writer.abc`
the abcfinance desk), so demo bylines don't change. Independent experts can't sign in, so
abcfinance staff keep a "Written by" choice: themselves (an abcfinance article) or an expert they
file for (an independent-expert article). Someone who writes for two institutions also chooses.

## D43. The editor chooses the newspapers at release (2026-10-10, user decision)

Writers no longer pick newspapers. The release form pre-ticks the papers on the institution's
active plan (none for abcfinance's own and experts' articles), and the editor changes the ticks as
needed. `article_targets` is now written only at release. Doc 08's E2E-UI-02 ("new-article form
loads with sections and papers") is checked as: the form loads with sections, and has no paper,
author or web-address fields.

## D44. The editor sets the web address (2026-10-10, user decision; amends D23)

Writers never see the web address. It is generated when the article is created: readable from an
English headline, or a placeholder `draft-xxxxxx` (a Marathi headline, or one that would look like
a placeholder). Only abcfinance's editors change it, in Editing, and release is refused while it
is still a placeholder. The `draft-` prefix can't be saved by hand. Once released it is fixed, as
before.

## D45. Writers see only the articles they filed (2026-10-10, user decision)

04.1 lets institution roles see all of their institution's articles. An institution, or
abcfinance, can have several writers, so writers (`institution_writer`, `abcfinance_writer`) now
see only the articles they filed (`articles.createdById`), at every stage. An institution's
approvers, compliance officers and account admins still see all of its articles, and
abcfinance's editors see everything. Someone who is both a writer and a reviewer sees what the
reviewer role allows. An article a person may not see answers 404, as before (D25). The seed
records who filed each demo article: the byline's own writer, or `writer.abc` for the expert's.

Once released, an article's status in the list and on its page is shown per paper, for example
"Live on Tarun Bharat" or "Waiting at Paper B", instead of only "With publisher".

## D46. The institution chooses its newspapers; abcfinance's editor sends to all or some (2026-10-10, user decision; amends D43)

Both sides decide where an institution article runs:
- **the institution's approver** ticks the newspapers when approving it (In approval →
  Compliance review), choosing only from the papers on the institution's active plans. On the
  first approval every plan paper starts ticked; after a return, the previous choice does. Plan
  limits are otherwise not enforced in phase 1 (09.2); this is the one place they are.
- **abcfinance's editor** sees those papers pre-ticked on the release form and may untick any,
  but can't add a paper the institution didn't choose (shown as "Not chosen by …", and refused
  by the server).

abcfinance's own and independent experts' articles have no institution: the editor chooses any
papers at release, none pre-ticked. The choice is stored in `article_targets` and audited with
the approval.

## D47. M5 is split: analytics and reports first, then user management (2026-10-10, user decision)

M5 had about 160 checks. **M5a** is the tracker, the beacon and the reports; **M5b** is
invitations, password reset and the Users page. Analytics goes first so that engaged reads, from
which M7 works out the revenue pool, are collected from launch.

Money and widget reports wait for the features they report on:
- `pub-pool`, `pub-payouts`, `abc-sponsors`, `abc-newspapers` and the Finance page come with
  revenue sharing (M7). The doc-08 checks E2E-AN-40, 41, 42, 44 and 48–59 are mapped to M7.
- `pub-widgets` and `pub-widget-pages` come with the widgets (M8).
- Until then the newspaper summary shows traffic only and says earnings appear once monthly
  statements start.

The report CSV export is a POST from the panel's own form, like the leads export (D38), rather
than the GET link doc 05 shows: a link on another site can't start downloads or write audit rows
in someone's name.

## D48. The beacon carries the referrer's host name (2026-10-10, M5a)

Doc 05's beacon body has no referrer, but 04.8 counts views from search, and the beacon's own
`Referer` is the page itself. The tracker adds `r`, the **host name only** of
`document.referrer` (no path or query). The server classifies it as search (the nine engines in
04.8), another site, or direct; a referrer on the paper's own host is direct. Nothing else about
the referrer is stored.

## D49. Calculator credit follows the brand the reader saw; staff can read institution reports (2026-10-10, user decision)

- **Calculator use** (04.8) is credited to the organisation whose brand the calculator showed,
  using the same branding rule as the reader page (`src/domain/sponsor.ts`, D34): an
  institution article credits that institution; an abcfinance article or calculator page credits
  the sponsor shown as "Sponsored by". An independent expert's article, or a calculator shown
  unbranded because a rival holds the category exclusively, credits nobody. 04.8's literal
  wording ("else the sponsor of the calculator's section") would credit a sponsor whose brand
  was hidden.
- **Institution reports:** 04.9 gives them to the institution's account admins only. abcfinance's
  super admin and desk manager can also open any institution's reports, read-only, through an
  institution picker, so they can support a sponsor. The reports hold totals only; staff still
  never see individual leads (04.6).

## D50. An engaged read counts on the day of its view (2026-10-10, M5a)

The engaged beacon can arrive after midnight for a view opened before it. The engaged read is
added to the view's Indian day, so a view and its engaged read are always on the same daily row
and the engaged rate never goes above 100%.

## D51. SEO health thresholds (2026-10-10, M5a)

04.9 lists the `abc-seo` measures without thresholds. **Visibility** is the paper's status: live
papers are indexed, staging papers are noindex. A **short summary** is under 70 characters
(search engines show roughly 150; under 70 usually means a placeholder). **Overdue review**
means `reviewBy` is before today. **No views** means a published copy with no views in the
chosen month.

## D52. An account with no roles stays, without access (2026-10-10, user decision)

Removing someone's only role leaves their account in place. Signing in shows "You aren't part
of any organisation yet" and nothing else. They can be invited again later through the
existing-account path, with their password. Deactivation stays a separate super-admin action, so
removing the last role doesn't block a future invitation (E2E-USR-44 refuses deactivated people).

## D53. Nobody edits their own roles (2026-10-10, M5b)

04.12 says nobody removes or deactivates themselves. Changing one's own roles is refused too:
another administrator must do it. This also stops someone demoting themselves out of the last
administrator seat.

## D54. Other organisations are named only to the super admin (2026-10-10, M5b)

An institution's account admin sees "Also has roles in another organisation" on a person who
belongs elsewhere too (and the actions 04.12 forbids on them are hidden), but not which
organisation, which is another organisation's business. The super admin sees the names.

## D55. "Only the newest reset link works" is checked when the link is used (2026-10-10, M5b)

A reset link works only if it is the person's most recent reset row, still unused and unexpired.
Requesting a new one therefore retires the older links without touching them, and no extra
column is needed.

## D56. Without an email service, only the inviter sees the invitation link (2026-10-10, M5b)

When `SMTP_URL` is not set, the invitation is still queued, and the invite form's response
shows its link once, to the person who sent it (E2E-USR-10). The link is never put in a URL or
shown to other admins on the Users page. Reset links an administrator sends are never shown to
the administrator (E2E-USR-87).

## D57. Re-sending an invitation gives it a new token; forged hosts never reach the forms (2026-10-10, M5b)

- **Re-send** keeps the same invitation and gives it a new token and a fresh 7 days. The old
  link stops working at once because its hash no longer exists, and the Users page keeps showing
  the invitation, with the link for the sender when there is no email service (D56). A new
  invitation to the same address and organisation still replaces the pending one (04.12).
- **Forged hosts:** Next.js refuses any form post whose `X-Forwarded-Host` doesn't match its
  `Origin` before our code runs, and our own check pins `Origin` to `APP_URL`. So a request with
  a forged host sends nothing at all, and every link in email is still built from `APP_URL`
  (E2E-USR-98 tests both).
