import { and, eq, gt, isNull, lt, ne, sql } from "drizzle-orm";
import { db, schema, type Db, type Tx } from "@/server/db/client";
import { newToken, sha256 } from "@/server/crypto/hash";
import { SESSION_HOURS } from "@/domain/auth-limits";
import { twoStepRequired, type Membership } from "@/domain/permissions";

/**
 * Sessions stored in the database (06.1): a random 256-bit token goes in the cookie, only its
 * SHA-256 is stored, and each lasts 12 hours. This module never touches cookies; the Next-bound
 * wrapper is `server/auth/current.ts`.
 */

export type SessionMembership = Membership & { organisationName: string };

export type SessionInfo = {
  sessionId: string;
  mfaVerified: boolean;
  expiresAt: Date;
  user: { id: string; name: string; email: string; totpEnabled: boolean };
  memberships: SessionMembership[];
  /** Two-step applies to this person (a role needs it, or they switched it on). */
  twoStepRequired: boolean;
};

export type NewSession = { id: string; token: string; expiresAt: Date };

export async function createSession(
  userId: string,
  opts: { mfaVerified: boolean },
  conn: Db | Tx = db(),
): Promise<NewSession> {
  const token = newToken();
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 3600_000);
  const [row] = await conn
    .insert(schema.sessions)
    .values({ userId, tokenHash: sha256(token), mfaVerified: opts.mfaVerified, expiresAt })
    .returning({ id: schema.sessions.id });
  return { id: row!.id, token, expiresAt };
}

export async function membershipsOf(userId: string, conn: Db | Tx = db()) {
  const m = schema.memberships;
  const o = schema.organisations;
  return conn
    .select({
      organisationId: m.organisationId,
      organisationType: o.type,
      organisationName: o.name,
      role: m.role,
    })
    .from(m)
    .innerJoin(o, eq(o.id, m.organisationId))
    .where(eq(m.userId, userId))
    .orderBy(o.name, m.role);
}

/** The live session for a cookie token, or null when unknown, expired, or the user is deactivated. */
export async function loadSession(token: string | undefined | null): Promise<SessionInfo | null> {
  if (!token) return null;
  const s = schema.sessions;
  const u = schema.users;
  const [row] = await db()
    .select({
      sessionId: s.id,
      mfaVerified: s.mfaVerified,
      expiresAt: s.expiresAt,
      id: u.id,
      name: u.name,
      email: u.email,
      totpEnabled: u.totpEnabled,
    })
    .from(s)
    .innerJoin(u, eq(u.id, s.userId))
    .where(and(eq(s.tokenHash, sha256(token)), gt(s.expiresAt, new Date()), isNull(u.disabledAt)));
  if (!row) return null;
  const memberships = await membershipsOf(row.id);
  return {
    sessionId: row.sessionId,
    mfaVerified: row.mfaVerified,
    expiresAt: row.expiresAt,
    user: { id: row.id, name: row.name, email: row.email, totpEnabled: row.totpEnabled },
    memberships,
    twoStepRequired: twoStepRequired(memberships, row.totpEnabled),
  };
}

/**
 * Replaces a session with a fresh, two-step-verified one (new token, same expiry), so the token
 * that existed before the second step stops working (D19).
 */
export async function upgradeSession(sessionId: string, conn: Db | Tx = db()): Promise<NewSession> {
  const [old] = await conn
    .delete(schema.sessions)
    .where(eq(schema.sessions.id, sessionId))
    .returning();
  if (!old) throw new Error("Session not found");
  const token = newToken();
  const [row] = await conn
    .insert(schema.sessions)
    .values({
      userId: old.userId,
      tokenHash: sha256(token),
      mfaVerified: true,
      expiresAt: old.expiresAt,
    })
    .returning({ id: schema.sessions.id });
  return { id: row!.id, token, expiresAt: old.expiresAt };
}

export async function endSession(sessionId: string): Promise<void> {
  await db().delete(schema.sessions).where(eq(schema.sessions.id, sessionId));
}

/** Ends every session of the user except `keepId` (voluntary password change). */
export async function endOtherSessions(
  userId: string,
  keepId: string,
  conn: Db | Tx = db(),
): Promise<number> {
  const s = schema.sessions;
  const rows = await conn
    .delete(s)
    .where(and(eq(s.userId, userId), ne(s.id, keepId)))
    .returning({ id: s.id });
  return rows.length;
}

/** Ends every session of the user (reset, two-step reset, deactivation). */
export async function endAllSessions(userId: string, conn: Db | Tx = db()): Promise<number> {
  const s = schema.sessions;
  const rows = await conn.delete(s).where(eq(s.userId, userId)).returning({ id: s.id });
  return rows.length;
}

export async function pruneExpiredSessions(): Promise<number> {
  const rows = await db()
    .delete(schema.sessions)
    .where(lt(schema.sessions.expiresAt, sql`now()`))
    .returning({ id: schema.sessions.id });
  return rows.length;
}
