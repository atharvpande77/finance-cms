# abcfinance

A finance section that runs inside partner newspapers' websites. Banks, insurers and fund houses
publish reviewed articles and sponsored calculators on the newspapers' own subdomains (for example
`money.tarunbharat.net`). Readers ask to be contacted, and those leads go only to the sponsor. The
newspaper earns a share of the sponsor's subscription and of ad revenue.

This is a rebuild from the client's handover pack and specification. Those are confidential and are
**not in this repository**: team members keep them locally in `docs/handover/`, `docs/TESTING.md`
and `docs/abcfinance-phase1-spec.pdf` (all gitignored). The plan is in
[`docs/implementation-plan.md`](docs/implementation-plan.md), and departures from the pack are in
[`docs/decisions.md`](docs/decisions.md).

## Status

| Milestone                                                                                      | State        |
| ---------------------------------------------------------------------------------------------- | ------------ |
| M0 Foundations: schema, crypto, jobs, seed, test harness, CI, deploy files                     | done         |
| M1 Tenancy and reader site: host routing, themes, Marathi and English, SEO, sitemap and robots | done         |
| M2 Identity and panel shell                                                                    | next         |
| M3–M10                                                                                         | see the plan |

Acceptance-check coverage: run `corepack pnpm acceptance:index` (needs the local handover docs) to
write `tests/acceptance/INDEX.md`.

## Run it locally

You need Node.js 22 or newer, pnpm 10 (through corepack), and Docker.

```bash
corepack pnpm install
cp .env.example .env          # then set APP_SECRET and CRON_SECRET (commands are in the file)
corepack pnpm db:up           # Postgres 17 on 127.0.0.1:5433, plus the abcfinance_test database
corepack pnpm db:migrate
corepack pnpm db:seed         # demo world: 3 newspapers, 3 institutions, 15 users
corepack pnpm dev             # http://localhost:3000
```

The newspaper sites are at http://tarunbharat.localhost:3000, http://paperb.localhost:3000 and
http://paperc.localhost:3000. Chrome and Edge resolve `*.localhost` without setup.

Demo accounts are `<name>@demo.abcfinance.test` with password `Demo-Pass-2026`. The names are in
`db/seed/data.ts`. To start over, run `corepack pnpm db:reset`.

Every role except the two writer roles needs two-step verification. The first sign-in shows a QR
code to scan with an authenticator app. Without one, open the set-up page once, then print the
current code with `npx tsx scripts/totp.ts approver.amc` (development databases only).

> **WSL:** if `pnpm` on your PATH is the Windows build, call it as `corepack pnpm`.

## Scripts

| Script                              | What it does                                                                                     |
| ----------------------------------- | ------------------------------------------------------------------------------------------------ |
| `dev`, `build`, `start`             | Next.js                                                                                          |
| `lint`, `typecheck`                 | ESLint and `tsc`                                                                                 |
| `test`                              | Unit tests (pure rules, no database)                                                             |
| `test:int`                          | Integration tests against the `abcfinance_test` database                                         |
| `test:e2e`                          | Builds the app, starts it on port 3100 against the test database, and drives it over HTTP        |
| `db:up`, `db:down`                  | Start and stop the dev database container                                                        |
| `db:generate`                       | New migration from changes to `src/server/db/schema.ts`                                          |
| `db:migrate`, `db:seed`, `db:reset` | Apply migrations, load the demo world, drop everything and reload                                |
| `acceptance:index`                  | Write `tests/acceptance/INDEX.md` (local only) and `checks.json` from doc 08 and the test titles |

## Layout

```
src/domain/     pure business rules (no database); unit-tested
src/server/     database, services, crypto, mail, jobs: everything that touches state
src/app/        routes: reader site, panels, endpoints
db/             SQL migrations and the demo seed
tests/          unit, integration, e2e, acceptance index
deploy/         Dockerfile, compose stack, nginx config, certificate and backup scripts
docs/           plan and decisions (the client's handover pack is local only)
```

Only `src/server/` talks to the database, and pages and endpoints call services there. Business
rules live once in `src/domain/` (doc 02 §2.1 #5).

## Tests and the acceptance checks

The 651 checks in doc 08 are the definition of done. Each has an ID (e.g. `E2E-WF-12`,
`U-CALC-07`). A test covers a check by putting the ID in square brackets in its title. CI fails
when a check due by the current milestone (`tests/acceptance/MILESTONE`) has no test. CI reads
`tests/acceptance/checks.json`, which holds only IDs and milestones, not the check text.

## Deploying

The target is our own VPS in India, with the existing nginx in front:

- `deploy/docker-compose.yml`: app and Postgres.
- `deploy/nginx/`: site config. Newspaper hosts' certificates are loaded by SNI name.
- `deploy/add-tenant-host.sh`: issues the certificate for a new newspaper host.
- `deploy/backup/`: nightly encrypted dumps.
- `deploy/cron.example`: the scheduled job and the backup.
