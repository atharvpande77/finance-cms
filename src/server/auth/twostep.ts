import { and, eq, isNull, sql } from "drizzle-orm";
import QRCode from "qrcode";
import { db, schema } from "@/server/db/client";
import { audit } from "@/server/audit";
import { open, seal } from "@/server/crypto/secret-box";
import { hit } from "@/server/ratelimit";
import { addressAllowed, isLocked, recordFailure, recordSuccess } from "./signin";
import { upgradeSession, type NewSession } from "./sessions";
import { newTotpSecret, otpauthUri, verifyTotp } from "@/domain/totp";
import { ENROL_CODE_LIMIT, ENROL_CODE_WINDOW_SECONDS } from "@/domain/auth-limits";

/** Two-step verification (TOTP): set-up and the second sign-in step (04.12, 06.1). */

export type Enrolment = { secret: string; uri: string; qrSvg: string };

/**
 * The pending secret for a person setting up two-step, created on first visit and reused on
 * reload so the QR code they scanned stays valid. Stored encrypted.
 */
export async function startEnrolment(userId: string): Promise<Enrolment | null> {
  const u = schema.users;
  const [user] = await db().select().from(u).where(eq(u.id, userId));
  if (!user || user.totpEnabled) return null;
  if (!user.totpSecretEnc) {
    // Only one secret wins if two tabs open the page at once.
    await db()
      .update(u)
      .set({ totpSecretEnc: seal(newTotpSecret()), totpLastStep: null })
      .where(and(eq(u.id, userId), isNull(u.totpSecretEnc), eq(u.totpEnabled, false)));
  }
  const [fresh] = await db()
    .select({ enc: u.totpSecretEnc, email: u.email })
    .from(u)
    .where(eq(u.id, userId));
  const secret = open(fresh!.enc!);
  const uri = otpauthUri({ issuer: "abcfinance", account: fresh!.email, secret });
  const qrSvg = await QRCode.toString(uri, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
  return { secret, uri, qrSvg };
}

/**
 * Accepts the step only if it is later than the last one used, in one statement, so a code
 * can't be used twice even by two requests at the same moment.
 */
async function claimStep(userId: string, step: number, enable: boolean): Promise<boolean> {
  const rows = await db().execute(sql`
    UPDATE users SET totp_last_step = ${step}, totp_enabled = totp_enabled OR ${enable}
    WHERE id = ${userId}
      AND (totp_last_step IS NULL OR totp_last_step < ${step})
      AND totp_enabled = ${!enable}
    RETURNING id`);
  return rows.length === 1;
}

export type CodeResult =
  | { kind: "ok"; session: NewSession }
  | { kind: "invalid" }
  | { kind: "locked" }
  | { kind: "tooMany" };

/** Confirms set-up with a first code. Wrong codes here are rate-limited but don't lock (D15). */
export async function confirmEnrolment(input: {
  userId: string;
  sessionId: string;
  code: string;
  ip: string;
}): Promise<CodeResult> {
  const limit = await hit("enrol:user", input.userId, ENROL_CODE_LIMIT, ENROL_CODE_WINDOW_SECONDS);
  if (!limit.allowed) return { kind: "tooMany" };
  const [user] = await db().select().from(schema.users).where(eq(schema.users.id, input.userId));
  if (!user?.totpSecretEnc || user.totpEnabled) return { kind: "invalid" };
  const step = verifyTotp(open(user.totpSecretEnc), input.code, Date.now());
  if (step === null || !(await claimStep(user.id, step, true))) {
    await audit({
      userId: user.id,
      action: "auth.2fa_failed",
      detail: { setup: true },
      ip: input.ip,
    });
    return { kind: "invalid" };
  }
  await recordSuccess(user.id);
  const session = await upgradeSession(input.sessionId);
  await audit({ userId: user.id, action: "auth.2fa_enrolled", ip: input.ip });
  return { kind: "ok", session };
}

/** The second sign-in step. Wrong and replayed codes count toward the lockout. */
export async function verifyCode(input: {
  userId: string;
  sessionId: string;
  code: string;
  ip: string;
}): Promise<CodeResult> {
  if (!(await addressAllowed(input.ip))) return { kind: "tooMany" };
  const [user] = await db().select().from(schema.users).where(eq(schema.users.id, input.userId));
  if (!user?.totpSecretEnc || !user.totpEnabled) return { kind: "invalid" };
  if (isLocked(user)) {
    await audit({ userId: user.id, action: "auth.signin_blocked", ip: input.ip });
    return { kind: "locked" };
  }
  const step = verifyTotp(open(user.totpSecretEnc), input.code, Date.now());
  if (step === null || !(await claimStep(user.id, step, false))) {
    const locked = await recordFailure(user.id, input.ip, "code");
    return { kind: locked ? "locked" : "invalid" };
  }
  await recordSuccess(user.id);
  const session = await upgradeSession(input.sessionId);
  await audit({ userId: user.id, action: "auth.2fa_ok", ip: input.ip });
  return { kind: "ok", session };
}
