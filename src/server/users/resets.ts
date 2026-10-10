import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { db, schema } from "@/server/db/client";
import { audit } from "@/server/audit";
import { keyedHash, newToken, sha256 } from "@/server/crypto/hash";
import { hit } from "@/server/ratelimit";
import { queueEmail } from "@/server/mail/outbox";
import { passwordChangedEmail, passwordResetEmail, publicUrl } from "@/server/mail/templates";
import { hashPassword } from "@/server/auth/password";
import { endAllSessions } from "@/server/auth/sessions";
import {
  RESET_MINUTES,
  RESET_PER_ADDRESS,
  RESET_PER_SOURCE,
  RESET_WINDOW_SECONDS,
} from "@/domain/auth-limits";
import { isEmail, normaliseEmail } from "@/domain/email";
import { checkPassword, type PasswordProblem } from "@/domain/password-policy";
import { linkUsable } from "@/domain/users";
import { loadTarget, NOT_FOUND, type Admin, type Result } from "./common";

/** Password reset links (04.12, 06.2): hashed, single use, 60 minutes, newest only. */

const r = schema.passwordResets;
const u = schema.users;

async function createReset(
  user: { id: string; name: string; email: string },
  requestedBy: { id: string; name: string } | null,
) {
  const token = newToken();
  const link = publicUrl(`/reset/${token}`);
  await db().transaction(async (tx) => {
    await tx.insert(r).values({
      userId: user.id,
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + RESET_MINUTES * 60_000),
      requestedById: requestedBy?.id ?? null,
    });
    await queueEmail(
      {
        to: user.email,
        kind: "password_reset",
        createdById: requestedBy?.id ?? null,
        ...passwordResetEmail(user, link, requestedBy?.name),
      },
      tx,
    );
  });
}

/**
 * "Forgot password" (04.12). The caller always shows the same answer: whether the address has
 * an account, is deactivated, is malformed or is over its limit is never revealed.
 */
export async function requestReset(rawEmail: string, ip: string): Promise<void> {
  const email = normaliseEmail(rawEmail.slice(0, 320));
  const source = await hit("reset:ip", ip, RESET_PER_SOURCE, RESET_WINDOW_SECONDS);
  if (!source.allowed || !isEmail(email)) {
    await audit({ action: "auth.reset_refused", detail: { limited: !source.allowed }, ip });
    return;
  }
  const perAddress = await hit("reset:email", email, RESET_PER_ADDRESS, RESET_WINDOW_SECONDS);
  const [user] = await db().select().from(u).where(eq(u.email, email));
  if (!perAddress.allowed || !user || user.disabledAt) {
    await audit({
      userId: user?.id ?? null,
      action: "auth.reset_refused",
      detail: user
        ? { limited: !perAddress.allowed, deactivated: user.disabledAt !== null }
        : { unknownEmail: keyedHash("email", email) },
      ip,
    });
    return;
  }
  await createReset(user, null);
  await audit({ userId: user.id, action: "auth.reset_requested", ip });
}

/** An administrator emails a person a reset link (04.12). The admin never sees the link. */
export async function sendResetLink(
  admin: Admin,
  orgId: string,
  userId: string,
  ip: string,
): Promise<Result> {
  const target = await loadTarget(admin, orgId, userId);
  if (!target) return { ok: false, error: NOT_FOUND };
  if (!target.actions.includes("resetLink")) {
    return {
      ok: false,
      error: target.elsewhere.length
        ? "This person also belongs to another organisation. Ask abcfinance to send the link."
        : "You can't send a reset link to this account.",
    };
  }
  await createReset(target.user, admin.user);
  await audit({
    userId: admin.user.id,
    action: "user.reset_link_sent",
    detail: { targetUserId: userId, organisationId: orgId },
    ip,
  });
  return { ok: true };
}

export type ResetLink =
  | { state: "ok"; resetId: string; user: typeof schema.users.$inferSelect }
  | { state: "expired" | "used" | "invalid" };

/** What the reset page may show: the link must be usable, the newest, and the account active. */
export async function openReset(token: string, now = new Date()): Promise<ResetLink> {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return { state: "invalid" };
  const [row] = await db()
    .select({ reset: r, user: u })
    .from(r)
    .innerJoin(u, eq(u.id, r.userId))
    .where(eq(r.tokenHash, sha256(token)));
  if (!row) return { state: "invalid" };
  const state = linkUsable(row.reset, now);
  if (state !== "ok") return { state };
  if (row.user.disabledAt) return { state: "used" };
  const [newest] = await db()
    .select({ id: r.id })
    .from(r)
    .where(eq(r.userId, row.user.id))
    .orderBy(desc(r.createdAt), desc(r.id))
    .limit(1);
  if (newest?.id !== row.reset.id) return { state: "used" };
  return { state: "ok", resetId: row.reset.id, user: row.user };
}

export type CompleteResetResult =
  | { kind: "ok" }
  | { kind: "link"; state: "expired" | "used" | "invalid" }
  | { kind: "mismatch" }
  | { kind: "weak"; problems: PasswordProblem[] };

/**
 * Sets the new password (04.12): clears any lockout, ends every session, emails a notice, and
 * leaves two-step verification as it is. The link is spent in the same transaction, so it
 * works once even when posted twice at the same moment.
 */
export async function completeReset(input: {
  token: string;
  password: string;
  confirm: string;
  ip: string;
}): Promise<CompleteResetResult> {
  const link = await openReset(input.token);
  if (link.state !== "ok") return { kind: "link", state: link.state };
  if (input.password !== input.confirm) return { kind: "mismatch" };
  const problems = checkPassword(input.password, link.user);
  if (problems.length) return { kind: "weak", problems };

  const passwordHash = await hashPassword(input.password);
  const now = new Date();
  const done = await db().transaction(async (tx) => {
    const spent = await tx
      .update(r)
      .set({ usedAt: now })
      .where(and(eq(r.id, link.resetId), isNull(r.usedAt), gt(r.expiresAt, now)))
      .returning({ id: r.id });
    if (spent.length === 0) return false;
    await tx
      .update(u)
      .set({ passwordHash, failedLogins: 0, lockedUntil: null })
      .where(eq(u.id, link.user.id));
    const ended = await endAllSessions(link.user.id, tx);
    await queueEmail(
      {
        to: link.user.email,
        kind: "password_changed",
        createdById: link.user.id,
        ...passwordChangedEmail(link.user, now, "reset"),
      },
      tx,
    );
    await audit(
      {
        userId: link.user.id,
        action: "auth.password_reset",
        detail: { endedSessions: ended },
        ip: input.ip,
      },
      tx,
    );
    return true;
  });
  return done ? { kind: "ok" } : { kind: "link", state: "used" };
}
