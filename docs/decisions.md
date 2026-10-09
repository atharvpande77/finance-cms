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
