import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/server/db/client";
import { audit } from "@/server/audit";
import { keyedHash } from "@/server/crypto/hash";
import { hit } from "@/server/ratelimit";
import { dummyPasswordHash, verifyPassword } from "./password";
import { createSession, membershipsOf, type NewSession } from "./sessions";
import { normaliseEmail } from "@/domain/email";
import { MAX_PASSWORD_LENGTH } from "@/domain/password-policy";
import { twoStepRequired } from "@/domain/permissions";
import {
  LOCK_AFTER_FAILURES,
  LOCK_MINUTES,
  SIGNIN_ADDRESS_LIMIT,
  SIGNIN_ADDRESS_WINDOW_SECONDS,
} from "@/domain/auth-limits";

/**
 * Password sign-in (04.12, 06.1).
 *
 * - An unknown email, a wrong password and (D16) a locked account all cost one scrypt check.
 *   Unknown and wrong give the same answer; unknown emails lock after the same number of tries,
 *   so the lock message doesn't reveal which addresses have accounts.
 * - Wrong passwords and wrong codes share one counter; the fifth consecutive failure locks the
 *   account for 15 minutes. The counter resets only when sign-in completes (D15).
 * - A deactivated account is told so only after the correct password.
 * - Every address gets 20 password and code posts per 15 minutes (D17).
 */
export type SignInResult =
  | { kind: "invalid" }
  | { kind: "locked" }
  | { kind: "tooMany" }
  | { kind: "disabled" }
  | { kind: "ok"; session: NewSession; next: "/dashboard" | "/login/verify" | "/account/security" };

export async function addressAllowed(ip: string): Promise<boolean> {
  const r = await hit("signin:ip", ip, SIGNIN_ADDRESS_LIMIT, SIGNIN_ADDRESS_WINDOW_SECONDS);
  return r.allowed;
}

export function isLocked(user: { lockedUntil: Date | null }, now = new Date()): boolean {
  return user.lockedUntil !== null && user.lockedUntil > now;
}

/**
 * Counts one failed password or code. The fifth in a row locks the account and starts the
 * count again, so the next lock needs five more. Returns whether this failure locked it.
 */
export async function recordFailure(userId: string, ip: string, kind: "password" | "code") {
  const [row] = await db().execute<{ locked: boolean }>(sql`
    UPDATE users SET
      failed_logins = CASE WHEN failed_logins + 1 >= ${LOCK_AFTER_FAILURES} THEN 0 ELSE failed_logins + 1 END,
      locked_until  = CASE WHEN failed_logins + 1 >= ${LOCK_AFTER_FAILURES}
                           THEN now() + make_interval(mins => ${LOCK_MINUTES}) ELSE locked_until END
    WHERE id = ${userId}
    RETURNING (failed_logins = 0 AND locked_until > now()) AS locked`);
  const locked = Boolean(row?.locked);
  await audit({
    userId,
    action: kind === "password" ? "auth.signin_failed" : "auth.2fa_failed",
    ip,
  });
  if (locked) await audit({ userId, action: "auth.signin_blocked", detail: { after: kind }, ip });
  return locked;
}

/** Sign-in finished (password, plus a code where needed): clear failures, note the time. */
export async function recordSuccess(userId: string): Promise<void> {
  await db()
    .update(schema.users)
    .set({ failedLogins: 0, lockedUntil: null, lastSignInAt: new Date() })
    .where(eq(schema.users.id, userId));
}

export async function signIn(input: {
  email: string;
  password: string;
  ip: string;
}): Promise<SignInResult> {
  if (!(await addressAllowed(input.ip))) {
    await audit({ action: "auth.signin_limited", ip: input.ip });
    return { kind: "tooMany" };
  }
  const email = normaliseEmail(input.email);
  const password = input.password.slice(0, MAX_PASSWORD_LENGTH + 1);
  const [user] = email
    ? await db().select().from(schema.users).where(eq(schema.users.email, email))
    : [];

  if (!user) {
    await verifyPassword(password, await dummyPasswordHash());
    const tries = await hit("signin:email", email, LOCK_AFTER_FAILURES, LOCK_MINUTES * 60);
    await audit({
      action: "auth.signin_failed",
      detail: { unknownEmail: keyedHash("email", email) },
      ip: input.ip,
    });
    return { kind: tries.count > LOCK_AFTER_FAILURES ? "locked" : "invalid" };
  }

  if (isLocked(user)) {
    await verifyPassword(password, await dummyPasswordHash());
    await audit({ userId: user.id, action: "auth.signin_blocked", ip: input.ip });
    return { kind: "locked" };
  }

  if (!(await verifyPassword(password, user.passwordHash))) {
    await recordFailure(user.id, input.ip, "password");
    return { kind: "invalid" };
  }

  if (user.disabledAt) {
    await audit({ userId: user.id, action: "auth.signin_disabled", ip: input.ip });
    return { kind: "disabled" };
  }

  const needsCode = twoStepRequired(await membershipsOf(user.id), user.totpEnabled);
  const session = await createSession(user.id, { mfaVerified: !needsCode });
  if (!needsCode) await recordSuccess(user.id);
  await audit({
    userId: user.id,
    action: "auth.signin",
    detail: { twoStep: needsCode ? (user.totpEnabled ? "code" : "setup") : "not_required" },
    ip: input.ip,
  });
  return {
    kind: "ok",
    session,
    next: !needsCode ? "/dashboard" : user.totpEnabled ? "/login/verify" : "/account/security",
  };
}
