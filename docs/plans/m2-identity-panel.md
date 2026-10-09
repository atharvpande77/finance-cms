# M2: Identity and the panel shell

## Context

M0 (schema, crypto, audit, rate limits, outbox, seed) and M1 (tenancy and the reader site) are done. The panel host still shows a placeholder ("Sign-in and the panels arrive in M2"). M2 makes the abcfinance host usable: people sign in with a password, pass two-step verification where their role needs it, and land in a role-aware panel shell with a dashboard. Everything later (M3 workflow, M4 leads, M5 users) hangs off this milestone's session, guard and permission helpers, so their shapes are frozen here.

Sources: 04.1 roles, 04.12 sign-in and sessions, 05.2 abcfinance host, 06.1 authentication, 06.5 abuse, 06.6 audit, 09.3 #10–11, doc 08 "Sign-in, two-step…" (20 checks) and the unit groups "Passwords, TOTP…" and "Emails, role rules…".

**Decided with the user (2026-10-09):**
- **Forms are Server Actions**, as in the reference (doc 10 `actions/*.ts`). They work without JS. The e2e client gains `submitForm()`, which copies a form's hidden inputs (including `$ACTION_*`) the way a browser would.
- **Change password (`/account/password`) moves from M5 into M2.** Its 9 e2e checks (E2E-USR-89…97) and the U-USR email and password checks come with it.
- **Per-address sign-in limit:** 20 posts (password and code) per address per 15 minutes.
- **Menu:** each role sees its full menu now. Unbuilt areas are guarded stub pages ("arrives in M3" and so on), so the permission guards are tested from day one.

**Already in place (reuse, don't rewrite):**
- `users` / `memberships` / `sessions` / `audit_events` tables (`src/server/db/schema.ts`). They already have `totpSecretEnc`, `totpEnabled`, `totpLastStep`, `failedLogins`, `lockedUntil`, `disabledAt`, `lastSignInAt`, `sessions.tokenHash` and `mfaVerified`. **No migration is needed.**
- `hashPassword` / `verifyPassword` / `dummyPasswordHash` / `MAX_PASSWORD_LENGTH` in `src/server/auth/password.ts`.
- `newToken`, `sha256`, `keyedHash`, `constantTimeEqual` in `src/server/crypto/hash.ts`; `seal` / `open` in `src/server/crypto/secret-box.ts`.
- `ROLES`, `ROLE_LABELS`, `organisationTypeOf`, `rolesFor`, `needsTwoStep`, `ABC_EDITOR_ROLES` in `src/domain/roles.ts`.
- `hit(scope, subject, limit, window)` in `src/server/ratelimit.ts`, `audit()` in `src/server/audit.ts`, `clientIp()` in `src/server/http/client-ip.ts`, and the outbox writer in `src/server/mail/outbox.ts`.
- `qrcode` is already a dependency.
- The cookie-keeping `HttpClient` in `tests/http-client.ts` and the e2e harness in `tests/e2e/global-setup.ts`.

## Step 0: Save this plan, then spike

- Copy this plan to `docs/plans/m2-identity-panel.md`.
- **Spike (about 1 hour):** one throwaway page with a Server Action form (both a plain `action={fn}` and a `useActionState` form). Build, run standalone, and post it from `HttpClient` as multipart with the scraped hidden fields. Confirm:
  1. `redirect()` answers 303 + Location;
  2. the `useActionState` error renders in the HTML response;
  3. a wrong `Origin` is refused;
  4. `cookies().set` works from the action.
- If no-JS posts can't be made reliable, fall back to route handlers for the auth commands only, and record that as a decision.
- Also check in `node_modules/next/dist/docs/` before use:
  - `forbidden()` / `experimental.authInterrupts`;
  - two route groups sharing an `account/` segment.

## Pure rules: `src/domain/` (unit tests)

| File | Contents |
| --- | --- |
| `totp.ts` (new) | Base32 encode/decode; `hotp(secret, counter)`; `totpAt(secret, step)`; `verifyTotp(secret, code, nowMs)` returns the matched step or `null` (±1 step); `isFreshStep(step, lastStep)`; `otpauthUri({issuer:"abcfinance", account, secret})`. SHA-1, 6 digits, 30 s. |
| `password-policy.ts` (new) | `checkPassword(pw, {email, name})` returns a list of reason codes: 10–200 characters, letters plus at least one digit, at least 4 distinct characters, not on the common list, doesn't contain the email local part or first name when that is 4+ characters (case-insensitive). The common list is a short inline array (~200 entries). |
| `email.ts` (new) | `normaliseEmail` (trim, lower-case) and `isEmail`. |
| `permissions.ts` (new) | `Membership = {organisationId, organisationType, role}`. `hasRole(ms, role, orgId)` checks per role per organisation. `can(ms, action, resource)` encodes the **whole 04.1 table** as named actions (`article.edit`, `article.approve`, `copy.decide`, `reports.publisher`, `leads.view`, `rates.edit`, `widgets.manage`, `ads.view`/`ads.change`, `finance`, `users.manage`, `user.deactivate`). `twoStepRequired(ms, totpEnabled)` covers required roles and voluntary enrolment. |
| `panel-menu.ts` (new) | `panelMenu(ms)` → ordered `{href, label, milestone?}` items per 05.2's "Who" column, built on `can()`. |
| `auth-limits.ts` (new) | Constants: `LOCK_AFTER = 5`, `LOCK_MINUTES = 15`, `SESSION_HOURS = 12`, `SIGNIN_IP_LIMIT = 20 / 15 min`. |

## Services: `src/server/auth/`

- **`session.ts`**
  - **Cookie:** `abc_session`, or `__Host-abc_session` when secure. HttpOnly, SameSite=Lax, Path=/. `Secure` follows the **`APP_URL` scheme** (https), not `NODE_ENV`, because e2e runs a production build over http.
  - `createSession(userId, {mfaVerified})`: `newToken()`; stores `sha256` and `expiresAt = now + 12 h`.
  - `getSession()`: wrapped in React `cache`. Reads the cookie, joins `users` + memberships + organisations, rejects expired sessions and **disabled users**.
  - `markMfaVerified()`: rotates the token (new row, old row deleted).
  - `endSession()`, `endOtherSessions(userId, keepId)`, `endAllSessions(userId)`.
- **`signin.ts`**: `signIn({email, password, ip})` returns `ok | needsCode | needsEnrol | invalid | locked | disabled | tooMany`.
  - **Per-address limit:** `hit("signin:ip", ip, 20, 900)` runs first.
  - **Unknown email:** checked against `dummyPasswordHash()`, and still counted, so it gives the same answer and takes the same time.
  - **Locked account:** a dummy hash is still checked for timing. The answer is "too many attempts, try again in 15 minutes".
    - **Unknown emails "lock" the same way** through `hit("signin:email", keyedEmail, 5, 900)`, so the lock message doesn't reveal which accounts exist.
  - **Wrong password:** `failedLogins + 1`. At 5, `lockedUntil = now + 15 min`, audited as `auth.signin_blocked`.
  - **Disabled account:** told so only after the correct password.
  - **Lockout counter:** reset **only on a complete sign-in** (password, plus a code where needed). Otherwise a known password would reset the count and leave TOTP codes open to guessing.
- **`twostep.ts`**
  - `startEnrolment(user)`: reuses a pending (not yet enabled) secret or creates one, stored with `seal`. Returns the key and a QR SVG (`qrcode.toString(uri, {type:"svg"})`).
  - `confirmEnrolment(user, code)`: enables 2FA, records the step, marks the session verified.
    - Wrong enrolment codes are rate-limited per user (`hit`) but **don't count toward lockout**, so a person fumbling a new app can't lock themselves out.
  - `verifyCode(user, code, ip)`: the per-address limit applies.
    - **Replay guard** is a single statement: `UPDATE users SET totp_last_step=$s WHERE id=$id AND (totp_last_step IS NULL OR totp_last_step < $s) RETURNING id`, so two simultaneous uses of a code can't both win.
    - Failures feed the same lockout counter.
- **`password-change.ts`**: `changePassword(user, sessionId, {current, next, confirm})`.
  - Checks: current password correct; new ≠ old; confirmation matches; `checkPassword`.
  - On success: hash and save, `endOtherSessions`, queue a "password changed" email (template in `src/server/mail/templates.ts`, built from `APP_URL`), audit.
- **`guard.ts`**: the data-access layer that every panel page **and** every action calls. Layouts are not enough (Next docs: layouts don't re-run on navigation).
  - `requireUser()`:
    - no session → `redirect("/login")`;
    - 2FA required but not enrolled → `/account/security`;
    - enrolled but session not verified → `/login/verify`.
  - `requirePermission(action, resource?)` → `forbidden()` (or a 403 page if the spike rules it out).
  - `requirePendingUser()` is for `/login/verify` and `/account/security`.
- **`origin.ts`**: `assertSameOrigin()` checks `Origin` against `APP_URL`'s origin, on top of Next's own Origin-vs-Host check. Every panel action calls it.
- **Audit actions:** `auth.signin`, `auth.signin_failed`, `auth.signin_blocked`, `auth.2fa_enrolled`, `auth.2fa_ok`, `auth.2fa_failed`, `auth.signout`, `auth.password_changed`. Each records the IP and the user (where known). Failures on unknown emails store a keyed hash of the email, never the address.
- **`src/server/jobs.ts`:** add a prune of expired sessions. The response shape in doc 05 stays the same.

## Routes: `src/app/(platform)/`

```
layout.tsx                    root <html> (exists); add the panel font and tokens
page.tsx                      redirect → /dashboard
(auth)/layout.tsx             calm centred card shell (no menu)
(auth)/login/page.tsx + actions.ts           email + password (useActionState for inline errors, keeps the email)
(auth)/login/verify/page.tsx                 6-digit code (inputmode=numeric, autocomplete=one-time-code)
(auth)/account/security/page.tsx             QR + manual key + confirm code; also voluntary enrolment for writers
(panel)/layout.tsx            shell: sidebar on desktop, top bar + sheet on phones; user menu with sign-out
(panel)/dashboard/page.tsx    roles grouped by organisation; "Waiting for you" (empty state, M3 fills it); recent activity = own last 10 audit events; 2FA status
(panel)/account/password/page.tsx + actions.ts
(panel)/{articles,publisher,leads,calculators,reports,finance,widgets,ads,users}/page.tsx
                              guarded stubs: requirePermission + "arrives in Mx"
src/app/actions/auth.ts       signOut (POST)
```

- **Proxy:** unchanged. The panel host already passes through, and the auth checks stay in the data-access layer, not the proxy.
- **UI:**
  - **shadcn/ui** (the implementation plan's choice) is initialised for the panel tree only: `components.json`, `src/components/ui/{button,input,label,card,alert,sheet,badge,separator}`, and its tokens in `(platform)/globals.css`.
  - The palette stays a neutral placeholder until the business picks abcfinance's identity (11.4).
  - Polish pass with the `make-interfaces-feel-better` skill. Check the shell at 375 px, because the publisher queue lands here in M3.

## Tests

**Test client:** `tests/http-client.ts` gains:
- `submitForm(res, formName, fields)`: parses the `<form data-form="…">` with `node-html-parser` (dev dependency), copies its hidden inputs, sends multipart with `Origin: PANEL_ORIGIN`, and follows nothing;
- `signIn(client, user)`.

**Fixtures** (`tests/e2e/fixtures.ts`):
- `totpFor(secret, step)`;
- a reader that pulls a user's secret from the test DB and decrypts it;
- `outboxFor(email)`, which decrypts outbox rows.

| Kind | File | Covers |
| --- | --- | --- |
| Unit | `tests/unit/totp.test.ts` | U-AUTH-04…07: RFC 6238 SHA-1 vectors, truncated to 6 digits; base32 round-trip; drift; replay |
| Unit | `tests/unit/password-policy.test.ts`, `email.test.ts` | U-AUTH-03, U-USR-01/02, U-USR-14…18 |
| Unit | `tests/unit/permissions.test.ts` | U-AUTH-10, each 04.1 row, the menu per demo role |
| Integration | `tests/integration/auth.test.ts` | Lockout and its expiry; unknown-email lock parity; per-address limit; counter reset only on full sign-in; disabled user; concurrent replay (one winner); sessions ended on password change; expired sessions rejected; hashed token stored |
| E2E | `tests/e2e/auth.test.ts` | E2E-AUTH-01…20, in doc-08 order, with writer.amc, approver.amc and a separate user for lockout (writer.gi). Codes after enrolment use the next step so the replay guard doesn't trip the test. |
| E2E | `tests/e2e/account-password.test.ts` | E2E-USR-89…97 |
| E2E | `tests/e2e/panel.test.ts` | Menu per role; stub pages refuse the wrong role; a cross-origin form post is refused; the panel needs a session (no E2E ID, kept as regression tests) |

**Acceptance bookkeeping:**
- `scripts/gen-acceptance-index.ts`:
  - U-USR group: `sub: { "email addresses": "M2", passwords: "M2" }`;
  - `ID_OVERRIDES`: E2E-USR-89…97 → M2.
- `tests/acceptance/MILESTONE` → `M2`.
- Newly due: 20 E2E-AUTH + 6 U-AUTH + 7 U-USR + 9 E2E-USR = **42 checks**.

## Docs to update

- **`docs/decisions.md`**:
  - D15: lockout counting, and why the counter resets only on a full sign-in;
  - D16: one lock message for known and unknown emails;
  - D17: per-address limit 20 / 15 min;
  - D18: `Secure` follows the `APP_URL` scheme, plus the `__Host-` prefix;
  - D19: token rotated when 2FA completes;
  - D20: change password moved to M2;
  - D21: forms are Server Actions plus an explicit `APP_URL` origin check.
- **`handoff.md`:** update status and gotchas. It is untracked: confirm with the user whether it should be committed (it's not one of the confidential docs).
- **`README` run section:** note how to compute a TOTP code for demo accounts locally, e.g. a `scripts/totp.ts <email>` dev helper that reads and decrypts the secret.

## Order of work

1. Step 0 spike.
2. Domain modules and unit tests.
3. Session, sign-in and 2FA services, with integration tests.
4. Install shadcn; build the auth pages and actions.
5. Panel shell, dashboard and stubs; change password.
6. Test client `submitForm` and the e2e suites.
7. Acceptance index, `MILESTONE`, decisions, handoff.
8. Polish review and screenshots.
9. Commit and push to `main`.

## Verification

- `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test && corepack pnpm test:int && corepack pnpm test:e2e`
- `npx tsx scripts/gen-acceptance-index.ts --check M2` exits 0. CI is green on push.
- **Manual walk-through** (TESTING.md demo accounts). Build, then run the standalone server on :3200 with `HOSTNAME=0.0.0.0`, leaving the user's `next dev` on :3000 alone.
  - writer.amc signs in straight to the dashboard with its roles shown.
  - approver.amc is sent to the QR page; enrol with an authenticator app (or `scripts/totp.ts`); the dashboard opens.
  - Sign out, sign in again, enter the code.
  - Five wrong passwords lock the account.
  - Change the password; a second session is ended.
  - The menu differs between super.abc, editor.tb and admin.amc.
- **Screenshots** of the sign-in, 2FA and dashboard pages at 375 px and 1280 px, with Playwright's headless shell (gotcha 10).
