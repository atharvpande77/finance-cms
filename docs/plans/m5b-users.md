# M5b: Invitations, password reset and user management

## Context

M5a (analytics and reports, `f843c51`, CI green) is done. Every acceptance check due by M5a is covered (332 of 651).

M5b finishes M5. It adds everything people need to get into and manage the panels without a developer:
- **Invitations by email:** a new person sets their name and password; someone who already has an account adds the roles with their password.
- **Forgot and reset password.**
- **The `/users` page:** invite, re-send and withdraw invitations, change roles, remove from the organisation, reset two-step, send a reset link, deactivate and reactivate.
- **`/dev/outbox`:** shows queued email during development.

The phase gate needs this: the first sponsor's people must be invited before launch (M6).

**Decided with the user (2026-10-10):**
- **One milestone,** gated by `--check M5b` (about 91 E2E-USR and 11 U-USR checks).
- **Removing someone's only role keeps the account, without access.**
  - At sign-in they see "You aren't part of any organisation yet" and nothing else.
  - They can be invited again later through the existing-account path (their password).
  - Deactivation stays a separate action for the super admin.

**Rules from the docs (04.12, 05.2–5.4, 06, 09.3 #1, #11):**
- **Who manages whose users:**
  - an institution's account admin manages only that institution;
  - the super admin manages every organisation, newspapers included;
  - newspaper admins and everyone else manage nobody (E2E-USR-04).
- **Invitations** last 7 days and are used once. A new one replaces a pending invitation to the same address and organisation. They can be re-sent (new link, old one dead) or withdrawn.
- **Reset links** last 60 minutes and are used once; only the newest works.
  - At most 3 an hour per address and 10 an hour per source address.
  - The answer is the same whether or not the address has an account; a deactivated account gets no email.
  - A reset clears the lockout, ends every session, emails a notice, and leaves two-step on.
- **Guards:**
  - an organisation keeps an administrator (institutions their account admin, abcfinance its super admin; newspapers have no such rule);
  - nobody removes or deactivates themselves;
  - the last active super admin can't be deactivated or demoted;
  - an institution admin can't reset two-step or send a reset link for someone who also belongs to another organisation;
  - an institution admin can't assign roles of another organisation type.
- **Link pages** (`/forgot`, `/reset/<token>`, `/invite/<token>`) send `Referrer-Policy: no-referrer`, `Cache-Control: no-store` and `X-Robots-Tag: noindex`.
- **Links in email** are built from `APP_URL`; `publicUrl()` already does this.

**Decisions I'll record (D52–D56):**
- **D52:** an account with no roles stays and has no access (above).
- **D53:** nobody edits their own roles. Another admin must, which also stops someone demoting themselves out of the last admin seat.
- **D54:** an institution admin sees "Also has roles in another organisation" on such a person, without the other organisation's name. The super admin sees the names.
- **D55:** "only the newest reset link works" is checked when the link is used: a link works only if it is the person's latest reset row. No extra column is needed.
- **D56:** without `SMTP_URL`, the inviter alone sees the invitation link, once, in the form's response. It is never put in a URL or shown on the page to other admins (E2E-USR-10). Admin-sent reset links are never shown (E2E-USR-87).

**Already in place (reuse; no migration expected):**
- **Schema:** `invitations` (email, nameHint, organisationId, roles[], tokenHash, invitedById, expiresAt, acceptedAt, revokedAt) and `password_resets` (userId, tokenHash, expiresAt, usedAt, requestedById). `users` has `disabledAt`, `lastSignInAt`, `failedLogins`, `lockedUntil` and the TOTP fields; `memberships` is unique per user, organisation and role. A database trigger enforces that a role matches its organisation's type (D7).
- **Auth** (`src/server/auth/`):
  - `hashPassword`, `verifyPassword`;
  - `signIn`, which already says "deactivated" only after the right password;
  - `recordFailure`, `recordSuccess` (sets `lastSignInAt`);
  - `createSession`, `endAllSessions`, `endOtherSessions`, `membershipsOf`;
  - `loadSession`, which already rejects deactivated users;
  - `changePassword` and its form, as the pattern to follow.
- **Shared helpers:**
  - `newToken`, `sha256`, `keyedHash`: `src/server/crypto/hash.ts`
  - `hit()` rate limiter, `audit()`
  - `queueEmail`, `readOutbox`: `src/server/mail/outbox.ts`
  - `publicUrl`, `passwordChangedEmail`: `src/server/mail/templates.ts`
- **Domain rules:**
  - `checkPassword`, `PASSWORD_PROBLEM_TEXT`;
  - `normaliseEmail`, `isEmail`;
  - `ROLES`, `rolesFor`, `organisationTypeOf`, `ROLE_LABELS`, `roleNeedsTwoStep`;
  - `can(ms, "users.manage", orgId)`, `can(ms, "user.deactivate")`.
- **Menu:** the `users` area in `panel-menu.ts`.
- **Panel patterns:**
  - the forms with `useActionState` (`PasswordForm.tsx`);
  - redirect-with-`?done=` forms (leads);
  - the organisation switcher (`/leads`, `/reports`);
  - `requireArea`, `assertSameOrigin`, `requestIp`.
- **Tests:**
  - `submitForm` (hidden inputs, ticked boxes, `{ page }` replay);
  - `person()`, `signInFully`, `freshCode`, `latestEmail` (decrypts the outbox; the e2e server runs without `SMTP_URL`).

## Acceptance

- **`scripts/gen-acceptance-index.ts`:** none needed. E2E-USR and U-USR already default to `M5b` (D47), and the change-password and email/password checks stay in M2.
- **`tests/acceptance/MILESTONE`** → `M5b`.

| Group | M5b checks |
| --- | --- |
| E2E-USR | 01–88, 98–100 (91) |
| U-USR | 03–13 (11) |

## Pure rules: `src/domain/users.ts` (new)

- **`ROLES_BY_KIND` and `checkRoles(orgType, roles)`:**
  - a role from another kind of organisation gives "Newspaper editor isn't a role in an institution";
  - no role at all gives "Choose at least one role".
  - Checks U-USR-03 and 04.
- **`canManageUsers(ms, orgId)`** wraps `can(…, "users.manage", orgId)`. **`manageableOrgTypes(ms)`** gives institutions for an account admin and every kind for the super admin. Checks U-USR-05 to 07.
- **`linkUsable({ expiresAt, usedAt?, acceptedAt?, revokedAt? }, now)`** returns `ok`, `expired` or `used` (U-USR-08, 09).
- **`ADMIN_ROLE`:** `institution` → `institution_account_admin`, `abcfinance` → `abcfinance_super_admin`, `publisher` → none.
- **`keepsAnAdmin(orgType, members, change)`.**
  - `members` are the organisation's current memberships, with active flags.
  - `change` is either `{ userId, roles }` or `{ remove: userId }`.
  - It refuses a change that leaves no active holder of the admin role, and allows changes that keep one.
  - Checks U-USR-10 to 13.
- **`guardTarget({ actorMs, actorId, orgId, target })`** gives the per-person actions an admin may take (`roles`, `remove`, `reset2fa`, `resetLink`, `deactivate`, `reactivate`):
  - nothing on oneself;
  - two-step reset and reset link are left out when an institution admin's target belongs elsewhere too;
  - deactivate and reactivate only for the super admin.
  - The page uses it to hide buttons, and the services use it to refuse forged requests.
- **Constants:** `INVITE_DAYS = 7`, `RESET_MINUTES = 60`, `RESET_PER_ADDRESS = 3`, `RESET_PER_SOURCE = 10` (an hour each), in `auth-limits.ts`.

## Services: `src/server/users/` (new)

**`invitations.ts`**
- **`invite(actor, { orgId, email, nameHint, roles }, ip)`:**
  - **Checks:** the actor manages the organisation; the email is valid; the roles pass `checkRoles`.
  - **Refused:** the address belongs to a deactivated account (E2E-USR-44), or that person already holds every one of those roles there (E2E-USR-16).
  - **In one transaction:** earlier pending invitations to the same address and organisation get `revokedAt`; a new row is inserted with a hashed `newToken()` and a 7-day expiry; the invitation email is queued; an audit row `user.invited` is written.
  - Returns `{ ok, link? }`, where `link` is set only when `SMTP_URL` is unset (D56).
- **`resend(actor, invitationId)`:** gives the same invitation a new token and a fresh week (new link, the old one dead, E2E-USR-35; D57). **`withdraw(actor, invitationId)`.** Both check that the actor manages the invitation's organisation.
- **`openInvitation(token)`** returns `{ state: "ok" | "expired" | "used" | "invalid", invitation, org, inviter, existingUser }` for the page.
- **`acceptNew(token, { name, password, confirm }, ip)`:**
  - checks the password policy (with the invitee's email and name), the confirmation, and that a name was given;
  - in a transaction: a conditional `UPDATE invitations SET accepted_at` (still pending and unexpired), so only one accept can win; then the user and memberships are inserted;
  - creates a session (verified only if two-step isn't needed), records the sign-in, writes an audit row `invitation.accepted`;
  - returns where to go next: the dashboard, or `/account/security` (E2E-USR-37, 38).
- **`acceptExisting(token, password, ip)`:**
  - a wrong password goes through `recordFailure` (it counts towards the lockout), and no roles are added (E2E-USR-40);
  - the right one adds the missing memberships, marks the invitation used, audits it, and sends the person to `/login` (E2E-USR-41).

**`resets.ts`**
- **`requestReset(email, ip)`:**
  - always returns the same result;
  - checks `hit("reset:ip", ip, 10, 3600)` and `hit("reset:email", email, 3, 3600)`;
  - only a real, active account gets a row and an email (E2E-USR-67 to 72);
  - audit `auth.reset_requested`, with the address keyed-hashed when it is unknown.
- **`sendResetLink(actor, orgId, userId, ip)`** is the admin's version: `guardTarget` must allow `resetLink`; the email variant names the admin; the link is never returned (E2E-USR-86 to 88).
- **`openReset(token)`** checks: the link is usable, it is the newest row for the person (D55), and the account is active (E2E-USR-85). It returns the account's email for the page.
- **`completeReset(token, { password, confirm }, ip)`:**
  - checks the password policy and the confirmation;
  - in a transaction, a conditional `usedAt`;
  - sets the password, clears `failedLogins` and `lockedUntil`, runs `endAllSessions`;
  - queues `passwordChangedEmail` and writes an audit row `auth.password_reset`;
  - leaves two-step as it is (E2E-USR-77 to 84).

**`manage.ts`**
- **`usersPage(actor, orgId)`** lists people with:
  - their roles here and two-step status;
  - their last sign-in;
  - whether they are deactivated;
  - whether they have roles elsewhere (organisation names for the super admin only, D54);
  - the actions `guardTarget` allows.
  - Pending invitations come with expired/pending markers.
- **`setRoles(actor, orgId, userId, roles, ip)`:** `checkRoles`, `keepsAnAdmin`, not oneself (D53), and not the last active super admin's role. It replaces the person's memberships in that organisation. Audit `user.roles_changed` with before and after (E2E-USR-45 to 47).
- **`removeFromOrg(actor, orgId, userId, ip)`:** `keepsAnAdmin`, not oneself. Deletes the person's memberships there; the account stays (D52). Audit `user.removed` (E2E-USR-48 to 50).
- **`resetTwoStep(actor, orgId, userId, ip)`:**
  - refused for oneself (E2E-USR-64);
  - refused when it isn't set up, with a clear message (E2E-USR-65);
  - refused when the target belongs elsewhere and the actor is an institution admin;
  - clears the secret, `totpEnabled` and `totpLastStep`, runs `endAllSessions`, emails the person, writes an audit row `user.2fa_reset` (E2E-USR-61 to 63).
- **`setActive(actor, userId, active, ip)`:**
  - super admin only (E2E-USR-52, 53), never oneself (E2E-USR-60);
  - the last active super admin can't be deactivated;
  - deactivation sets `disabledAt` and runs `endAllSessions` (E2E-USR-55); reactivation clears it (E2E-USR-59);
  - audit `user.deactivated` or `user.reactivated`.
- **Org scoping:** every service first checks that the target has a membership in the organisation the actor is managing. A forged id from elsewhere answers "Person not found" (E2E-USR-50).

**Mail (`src/server/mail/templates.ts`):**
- `invitationEmail(inviter, org, roles, link, expiresAt)`;
- `passwordResetEmail(person, link, { byAdmin? })`: one-time link, 60 minutes, and "ignore this if you didn't ask";
- `twoStepResetEmail(person, admin, at)`.
- All links are built with `publicUrl`, so a forged `Host` or `X-Forwarded-Host` can't change them (E2E-USR-98).

## Pages and actions

**Link pages, in `src/app/(platform)/(auth)/`:**
- **`forgot/page.tsx`:** one email field, and the same confirmation whatever happens.
- **`reset/[token]/page.tsx`:** shows the account's email, a new password and its confirmation. An expired, used or unknown link gets a plain message.
- **`invite/[token]/page.tsx`:** shows who invited you, the organisation and the roles, and nothing else (E2E-USR-19). Then either:
  - **new person:** name (pre-filled from `nameHint`), password and confirmation;
  - **existing account:** "Enter your password to add these roles".
  - An unknown link shows "This link isn't valid"; an expired one says so.
- **Headers:** the proxy sets `Referrer-Policy: no-referrer` and `X-Robots-Tag: noindex` on these paths of the panel host, and the pages also set `metadata.referrer = "no-referrer"`. They are dynamic, so Next sends `Cache-Control: … no-store …`; the e2e tests assert all three (E2E-USR-20, 66, 74).
- **Actions:** `_actions/users.ts` (Users page) and `_actions/auth.ts` (forgot, reset, accept). Each uses `assertSameOrigin` and `useActionState`, like `PasswordForm`.
- **Sign-in page:** gains a "Forgot your password?" link, and a "Password changed; sign in with the new one" message on `?reset=done` and `?invited=done`.
- **No roles:** when a person has none, the dashboard shows "You aren't part of any organisation yet" (D52).

**`/users` (replaces the stub):**
- **Organisation switcher:** an account admin sees their institutions; the super admin sees every organisation, grouped as institutions, newspapers, abcfinance.
- **Invite form:** email, name (optional), role checkboxes for that organisation's type. With no email service, a one-time "Copy this link" box appears for the sender.
- **People list:** roles as badges, plus two-step, last sign-in, deactivated and "Also has roles in another organisation" markers.
- **Pending invitations:** pending or expired, each with Re-send and Withdraw.
- **Manage a person: `/users/[userId]?org=`.** Role checkboxes with Save, then Remove from organisation, Reset two-step, Email a reset link and Deactivate/Reactivate, each shown only when `guardTarget` allows it. On phones the actions stack, and the destructive ones use the `destructive` button.

**`/dev/outbox`** (`src/app/(platform)/dev/outbox/page.tsx`):
- under `next dev` only: `notFound()` unless `NODE_ENV === "development"`, and it isn't reachable on newspaper hosts;
- lists `readOutbox()` (to, subject, kind, time, decrypted body) with links made clickable;
- the e2e production server must give a 404 (E2E-USR-99).

## Tests

- **Unit: `tests/unit/users.test.ts`** covers U-USR-03 to 13 against `domain/users.ts`.
- **Integration: `tests/integration/users.test.ts`:**
  - two simultaneous accepts of one invitation: exactly one wins;
  - newest-reset-link rule (D55);
  - the last-admin and last-super-admin guards in the services;
  - token hashes only in the database (E2E-USR-09 is also checked over HTTP).
- **End-to-end** (with helpers in `tests/e2e/user-helpers.ts`):
  - **Helpers:** `freshEmail()`, `linkFrom(to, kind)` (reads the newest outbox email's link), `inviteAs(client, org, email, roles)`, and `throwawayUser(org, roles)`, which inserts a user for the destructive tests.
  - **`invitations.test.ts`:** E2E-USR-01 to 44.
  - **`user-admin.test.ts`:** E2E-USR-45 to 65 and 86 to 88. These use throwaway users; demo accounts are never deactivated, or are restored afterwards.
  - **`password-reset.test.ts`:** E2E-USR-66 to 85 and 98 to 100.
  - Each person signs in once per suite in `beforeAll` (handoff gotcha 26).
- **Existing tests:** `panel.test.ts` treats `/users` as built.

## Order of work

1. Decisions D52–D56; save this plan as `docs/plans/m5b-users.md`; `MILESTONE` → `M5b`.
2. `domain/users.ts` and the limits, with unit tests.
3. Email templates; `resets.ts` with the forgot, reset and link-page headers in the proxy; `/dev/outbox`; the password-reset tests.
4. `invitations.ts` and the invite page; the invitation tests.
5. `manage.ts`, `/users` and `/users/[userId]`; the user-admin tests.
6. Dashboard "no roles" state; sign-in page links and messages.
7. Walk through TESTING.md §8 by hand on `next dev` with `/dev/outbox`; screenshot review at 375 px and 1280 px (the polish skill is disabled for model use).
8. Update handoff.md (kept local); commit and push to `main`.

## Verification

- `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test && corepack pnpm test:int`.
- `corepack pnpm test:e2e`. Warn the user first: the build takes up to about 10 minutes. Use `E2E_CHROMIUM=…` for the browser tests.
- `npx tsx scripts/gen-acceptance-index.ts --check M5b` must report every E2E-USR and U-USR check covered.
- CI is green after the push.
- **Manual check (TESTING.md §8):**
  1. As admin.amc, invite a writer. Open the link from `/dev/outbox` in a private window, set a weak password first, then a good one, and land signed in.
  2. Change that person's role, remove them, and check that removing the only admin is refused.
  3. Forgot password: the same answer for any address; the reset link works once.
  4. As super.abc, invite compliance into Sample Life Insurer, then deactivate and reactivate a test user.

## Changed after M5b (2026-10-10, D58)

- Invitations: the admin copies the one-time link and sends it themselves. The invitation email
  is behind `INVITE_EMAILS=1`, off by default.
- Password reset (forgot, reset page, admin reset links) is behind `PASSWORD_RESET=1`, off
  until email exists. Its checks are due with M6.
