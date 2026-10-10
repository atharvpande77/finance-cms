import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { db, schema, type Tx } from "@/server/db/client";
import { env } from "@/server/env";
import { audit } from "@/server/audit";
import { newToken, sha256 } from "@/server/crypto/hash";
import { queueEmail } from "@/server/mail/outbox";
import { invitationEmail, publicUrl } from "@/server/mail/templates";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { createSession, type NewSession } from "@/server/auth/sessions";
import { addressAllowed, isLocked, recordFailure, recordSuccess } from "@/server/auth/signin";
import { isUniqueViolation } from "@/server/articles/service";
import { INVITE_DAYS } from "@/domain/auth-limits";
import { isEmail, normaliseEmail } from "@/domain/email";
import { checkPassword, type PasswordProblem } from "@/domain/password-policy";
import { needsTwoStep, ROLE_LABELS, type Role } from "@/domain/roles";
import { checkRoles, linkUsable } from "@/domain/users";
import { loadOrg, managedOrg, type Admin, type Org, type Result } from "./common";

/** Invitations (04.12): by email, single use, 7 days; only the token's hash is stored. */

const inv = schema.invitations;
const u = schema.users;
const m = schema.memberships;

/**
 * Invitation links go to the admin, who sends them on themselves (D58). The email is queued as
 * well only when INVITE_EMAILS is on.
 */
async function emailInvitation(
  tx: Tx,
  input: {
    to: string;
    admin: Admin;
    org: Org;
    roles: readonly Role[];
    link: string;
    expiresAt: Date;
  },
): Promise<boolean> {
  if (!env().INVITE_EMAILS) return false;
  await queueEmail(
    {
      to: input.to,
      kind: "invitation",
      createdById: input.admin.user.id,
      ...invitationEmail({
        inviter: input.admin.user.name,
        organisation: input.org.name,
        roles: input.roles.map((r) => ROLE_LABELS[r]),
        link: input.link,
        expiresAt: input.expiresAt,
      }),
    },
    tx,
  );
  return true;
}

export type InvitationLink = { email: string; link: string; emailed: boolean };

async function createInvitation(
  admin: Admin,
  org: Org,
  email: string,
  nameHint: string | null,
  roles: Role[],
  ip: string,
): Promise<InvitationLink> {
  const token = newToken();
  const link = publicUrl(`/invite/${token}`);
  let emailed = false;
  const expiresAt = new Date(Date.now() + INVITE_DAYS * 86_400_000);
  await db().transaction(async (tx) => {
    // A new invitation replaces any pending one to the same address and organisation.
    await tx
      .update(inv)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(inv.email, email),
          eq(inv.organisationId, org.id),
          isNull(inv.acceptedAt),
          isNull(inv.revokedAt),
        ),
      );
    const [row] = await tx
      .insert(inv)
      .values({
        email,
        nameHint,
        organisationId: org.id,
        roles,
        tokenHash: sha256(token),
        invitedById: admin.user.id,
        expiresAt,
      })
      .returning({ id: inv.id });
    emailed = await emailInvitation(tx, { to: email, admin, org, roles, link, expiresAt });
    await audit(
      {
        userId: admin.user.id,
        action: "user.invited",
        detail: { invitationId: row!.id, organisationId: org.id, roles },
        ip,
      },
      tx,
    );
  });
  return { email, link, emailed };
}

export async function invite(
  admin: Admin,
  input: { orgId: string; email: string; nameHint: string; roles: Role[] },
  ip: string,
): Promise<Result<InvitationLink>> {
  const org = await managedOrg(admin, input.orgId);
  if (!org) return { ok: false, error: "You can't invite people into that organisation." };
  const email = normaliseEmail(input.email);
  if (!isEmail(email)) return { ok: false, error: "Enter a valid email address." };
  const problems = checkRoles(org.type, input.roles);
  if (problems.length) return { ok: false, error: problems.join(" ") };
  const nameHint = input.nameHint.trim().slice(0, 80) || null;

  const [existing] = await db().select().from(u).where(eq(u.email, email));
  if (existing?.disabledAt) {
    return {
      ok: false,
      error: "That account is deactivated. Ask abcfinance to reactivate it first.",
    };
  }
  if (existing) {
    const held = await db()
      .select({ role: m.role })
      .from(m)
      .where(and(eq(m.userId, existing.id), eq(m.organisationId, org.id)));
    const heldRoles = new Set(held.map((h) => h.role));
    if (input.roles.every((r) => heldRoles.has(r))) {
      return { ok: false, error: `${email} already has those roles in ${org.name}.` };
    }
  }
  return { ok: true, ...(await createInvitation(admin, org, email, nameHint, input.roles, ip)) };
}

/** The invitation, if the admin manages its organisation. */
async function managedInvitation(admin: Admin, invitationId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(invitationId)) return null;
  const [row] = await db().select().from(inv).where(eq(inv.id, invitationId));
  if (!row || row.acceptedAt || row.revokedAt) return null;
  const org = await managedOrg(admin, row.organisationId);
  return org ? { row, org } : null;
}

/**
 * A new link for a pending or expired invitation (04.12): the same invitation gets a new token
 * and a fresh week, so the old link stops working (D57).
 */
export async function resend(
  admin: Admin,
  invitationId: string,
  ip: string,
): Promise<Result<InvitationLink>> {
  const found = await managedInvitation(admin, invitationId);
  if (!found) return { ok: false, error: "Invitation not found." };
  const { row, org } = found;
  const token = newToken();
  const link = publicUrl(`/invite/${token}`);
  const expiresAt = new Date(Date.now() + INVITE_DAYS * 86_400_000);
  let emailed = false;
  await db().transaction(async (tx) => {
    await tx
      .update(inv)
      .set({ tokenHash: sha256(token), expiresAt })
      .where(eq(inv.id, row.id));
    emailed = await emailInvitation(tx, {
      to: row.email,
      admin,
      org,
      roles: row.roles,
      link,
      expiresAt,
    });
    await audit(
      {
        userId: admin.user.id,
        action: "invitation.resent",
        detail: { invitationId: row.id, organisationId: org.id },
        ip,
      },
      tx,
    );
  });
  return { ok: true, email: row.email, link, emailed };
}

export async function withdraw(admin: Admin, invitationId: string, ip: string): Promise<Result> {
  const found = await managedInvitation(admin, invitationId);
  if (!found) return { ok: false, error: "Invitation not found." };
  await db().update(inv).set({ revokedAt: new Date() }).where(eq(inv.id, invitationId));
  await audit({
    userId: admin.user.id,
    action: "invitation.withdrawn",
    detail: { invitationId, organisationId: found.org.id },
    ip,
  });
  return { ok: true };
}

export type OpenInvitation =
  | {
      state: "ok";
      invitation: typeof schema.invitations.$inferSelect;
      org: Org;
      inviter: string;
      existingUser: { id: string } | null;
    }
  | { state: "expired" | "used" | "invalid" };

/** What the invitation page may show: who invited you, where, and as what (E2E-USR-19). */
export async function openInvitation(token: string, now = new Date()): Promise<OpenInvitation> {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return { state: "invalid" };
  const [row] = await db()
    .select()
    .from(inv)
    .where(eq(inv.tokenHash, sha256(token)));
  if (!row) return { state: "invalid" };
  const state = linkUsable(row, now);
  if (state !== "ok") return { state };
  const org = await loadOrg(row.organisationId);
  if (!org) return { state: "invalid" };
  const [existing] = await db()
    .select({ id: u.id, disabledAt: u.disabledAt })
    .from(u)
    .where(eq(u.email, row.email));
  if (existing?.disabledAt) return { state: "used" };
  const [inviter] = row.invitedById
    ? await db().select({ name: u.name }).from(u).where(eq(u.id, row.invitedById))
    : [];
  return {
    state: "ok",
    invitation: row,
    org,
    inviter: inviter?.name ?? "abcfinance",
    existingUser: existing ? { id: existing.id } : null,
  };
}

/** Spends the invitation; false when someone else already did (one accept wins). */
async function spend(tx: Tx, id: string) {
  const rows = await tx
    .update(inv)
    .set({ acceptedAt: new Date() })
    .where(
      and(
        eq(inv.id, id),
        isNull(inv.acceptedAt),
        isNull(inv.revokedAt),
        gt(inv.expiresAt, new Date()),
      ),
    )
    .returning({ id: inv.id });
  return rows.length === 1;
}

export type AcceptResult =
  | { kind: "ok"; session: NewSession; next: "/dashboard" | "/account/security" }
  | { kind: "link"; state: "expired" | "used" | "invalid" }
  | { kind: "name" }
  | { kind: "mismatch" }
  | { kind: "weak"; problems: PasswordProblem[] };

/** A new person accepts: chooses a name and password and is signed in (04.12). */
export async function acceptNew(input: {
  token: string;
  name: string;
  password: string;
  confirm: string;
  ip: string;
}): Promise<AcceptResult> {
  const open = await openInvitation(input.token);
  if (open.state !== "ok") return { kind: "link", state: open.state };
  if (open.existingUser) return { kind: "link", state: "invalid" };
  const name = input.name.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 80 || /[<>]/.test(name)) return { kind: "name" };
  if (input.password !== input.confirm) return { kind: "mismatch" };
  const email = open.invitation.email;
  const problems = checkPassword(input.password, { email, name });
  if (problems.length) return { kind: "weak", problems };

  const passwordHash = await hashPassword(input.password);
  const roles = open.invitation.roles;
  let userId: string | null = null;
  try {
    userId = await db().transaction(async (tx) => {
      if (!(await spend(tx, open.invitation.id))) return null;
      const [user] = await tx
        .insert(u)
        .values({ name, email, passwordHash })
        .returning({ id: u.id });
      await tx
        .insert(m)
        .values(roles.map((role) => ({ userId: user!.id, organisationId: open.org.id, role })));
      await audit(
        {
          userId: user!.id,
          action: "invitation.accepted",
          detail: {
            invitationId: open.invitation.id,
            organisationId: open.org.id,
            roles,
            newAccount: true,
          },
          ip: input.ip,
        },
        tx,
      );
      return user!.id;
    });
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
  }
  if (!userId) return { kind: "link", state: "used" };

  const twoStep = needsTwoStep(roles);
  const session = await createSession(userId, { mfaVerified: !twoStep });
  if (!twoStep) await recordSuccess(userId);
  return { kind: "ok", session, next: twoStep ? "/account/security" : "/dashboard" };
}

export type AcceptExistingResult =
  | { kind: "ok" }
  | { kind: "link"; state: "expired" | "used" | "invalid" }
  | { kind: "wrongPassword" }
  | { kind: "locked" };

/**
 * Someone who already has an account accepts by entering their current password; the roles
 * are added and nothing else about the account changes (04.12).
 */
export async function acceptExisting(input: {
  token: string;
  password: string;
  ip: string;
}): Promise<AcceptExistingResult> {
  const open = await openInvitation(input.token);
  if (open.state !== "ok") return { kind: "link", state: open.state };
  if (!open.existingUser) return { kind: "link", state: "invalid" };
  const [user] = await db().select().from(u).where(eq(u.id, open.existingUser.id));
  if (!user) return { kind: "link", state: "invalid" };
  if (!(await addressAllowed(input.ip)) || isLocked(user)) return { kind: "locked" };
  if (!(await verifyPassword(input.password.slice(0, 201), user.passwordHash))) {
    const locked = await recordFailure(user.id, input.ip, "password");
    return locked ? { kind: "locked" } : { kind: "wrongPassword" };
  }
  const roles = open.invitation.roles;
  const ok = await db().transaction(async (tx) => {
    if (!(await spend(tx, open.invitation.id))) return false;
    await tx
      .insert(m)
      .values(roles.map((role) => ({ userId: user.id, organisationId: open.org.id, role })))
      .onConflictDoNothing();
    await audit(
      {
        userId: user.id,
        action: "invitation.accepted",
        detail: {
          invitationId: open.invitation.id,
          organisationId: open.org.id,
          roles,
          newAccount: false,
        },
        ip: input.ip,
      },
      tx,
    );
    return true;
  });
  return ok ? { kind: "ok" } : { kind: "link", state: "used" };
}

export type PendingInvitation = {
  id: string;
  email: string;
  roles: Role[];
  expiresAt: Date;
  expired: boolean;
  invitedBy: string | null;
};

/** An organisation's invitations not yet accepted or withdrawn, newest first. */
export async function pendingInvitations(
  orgId: string,
  now = new Date(),
): Promise<PendingInvitation[]> {
  const rows = await db()
    .select({
      id: inv.id,
      email: inv.email,
      roles: inv.roles,
      expiresAt: inv.expiresAt,
      invitedBy: u.name,
    })
    .from(inv)
    .leftJoin(u, eq(u.id, inv.invitedById))
    .where(and(eq(inv.organisationId, orgId), isNull(inv.acceptedAt), isNull(inv.revokedAt)))
    .orderBy(desc(inv.createdAt));
  return rows.map((r) => ({ ...r, expired: r.expiresAt.getTime() <= now.getTime() }));
}
