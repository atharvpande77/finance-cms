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
