import { and, asc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/server/db/client";
import { env } from "@/server/env";
import { audit } from "@/server/audit";
import { queueEmail } from "@/server/mail/outbox";
import { twoStepResetEmail } from "@/server/mail/templates";
import { endAllSessions } from "@/server/auth/sessions";
import { can, organisationsFor } from "@/domain/permissions";
import type { Role } from "@/domain/roles";
import {
  ADMIN_ROLE,
  checkRoles,
  keepsAnAdmin,
  personActions,
  type OrgMember,
  type PersonAction,
} from "@/domain/users";
import {
  loadTarget,
  NOT_FOUND,
  otherActiveSuperAdmins,
  type Admin,
  type Org,
  type Result,
} from "./common";
import { pendingInvitations, type PendingInvitation } from "./invitations";

/** The Users page (04.12, 05.2): who is in an organisation, and what an admin may do to them. */

const m = schema.memberships;
const u = schema.users;
const o = schema.organisations;

const TYPE_ORDER = { institution: 0, publisher: 1, abcfinance: 2 } as const;

/** Organisations whose users the admin manages: their institutions, or all for a super admin. */
export async function managedOrgs(admin: Pick<Admin, "memberships">): Promise<Org[]> {
  const all = await db()
    .select({ id: o.id, name: o.name, slug: o.slug, type: o.type })
    .from(o)
    .orderBy(asc(o.name));
  if (can(admin.memberships, "user.deactivate")) {
    return all.sort(
      (a, b) => TYPE_ORDER[a.type] - TYPE_ORDER[b.type] || a.name.localeCompare(b.name),
    );
  }
  const ids = new Set(organisationsFor(admin.memberships, "users.manage"));
  return all.filter((org) => ids.has(org.id) && org.type === "institution");
}

export type Person = {
  id: string;
  name: string;
  email: string;
  roles: Role[];
  totpEnabled: boolean;
  lastSignInAt: Date | null;
  disabled: boolean;
  /** Other organisations' names for the super admin; for others only whether there are any (D54). */
  elsewhere: string[] | boolean;
  actions: PersonAction[];
};

export type UsersPage = {
  orgs: Org[];
  org: Org;
  people: Person[];
  invitations: PendingInvitation[];
};

export async function usersPage(admin: Admin, orgId?: string): Promise<UsersPage | null> {
  const orgs = await managedOrgs(admin);
  const org = orgs.find((x) => x.id === orgId) ?? (orgId ? undefined : orgs[0]);
  if (!org) return null;
  const rows = await db()
    .select({
      id: u.id,
      name: u.name,
      email: u.email,
      totpEnabled: u.totpEnabled,
      lastSignInAt: u.lastSignInAt,
      disabledAt: u.disabledAt,
      role: m.role,
    })
    .from(m)
    .innerJoin(u, eq(u.id, m.userId))
    .where(eq(m.organisationId, org.id))
    .orderBy(asc(u.name), asc(m.role));
  const ids = [...new Set(rows.map((r) => r.id))];
  const other = ids.length
    ? await db()
        .select({ userId: m.userId, orgName: o.name, orgId: o.id })
        .from(m)
        .innerJoin(o, eq(o.id, m.organisationId))
        .where(inArray(m.userId, ids))
    : [];
  const superAdmin = can(admin.memberships, "user.deactivate");
  const people = new Map<string, Person>();
  for (const r of rows) {
    let p = people.get(r.id);
    if (!p) {
      const names = [
        ...new Set(
          other.filter((x) => x.userId === r.id && x.orgId !== org.id).map((x) => x.orgName),
        ),
      ];
      p = {
        id: r.id,
        name: r.name,
        email: r.email,
        roles: [],
        totpEnabled: r.totpEnabled,
        lastSignInAt: r.lastSignInAt,
        disabled: r.disabledAt !== null,
        elsewhere: superAdmin ? names : names.length > 0,
        actions: personActions({
          actorMs: admin.memberships,
          actorId: admin.user.id,
          orgId: org.id,
          orgType: org.type,
          target: {
            id: r.id,
            belongsElsewhere: names.length > 0,
            totpEnabled: r.totpEnabled,
            disabled: r.disabledAt !== null,
          },
          resetLinks: env().PASSWORD_RESET,
        }),
      };
      people.set(r.id, p);
    }
    p.roles.push(r.role);
  }
  return { orgs, org, people: [...people.values()], invitations: await pendingInvitations(org.id) };
}

/** One person, as the manage page shows them. */
export async function personFor(admin: Admin, orgId: string, userId: string) {
  const target = await loadTarget(admin, orgId, userId);
  if (!target) return null;
  const superAdmin = can(admin.memberships, "user.deactivate");
  return {
    ...target,
    elsewhere: superAdmin ? target.elsewhere : target.elsewhere.length > 0,
  };
}

async function orgMembers(orgId: string): Promise<OrgMember[]> {
  const rows = await db()
    .select({ userId: m.userId, role: m.role, disabledAt: u.disabledAt })
    .from(m)
    .innerJoin(u, eq(u.id, m.userId))
    .where(eq(m.organisationId, orgId));
  return rows.map((r) => ({ userId: r.userId, role: r.role, active: r.disabledAt === null }));
}

function noAdminLeft(org: Org) {
  const role = ADMIN_ROLE[org.type] === "abcfinance_super_admin" ? "super admin" : "account admin";
  return `${org.name} must keep at least one active ${role}. Give someone else that role first.`;
}

/** Replaces a person's roles in one organisation (04.12; never one's own, D53). */
export async function setRoles(
  admin: Admin,
  orgId: string,
  userId: string,
  roles: Role[],
  ip: string,
): Promise<Result> {
  const target = await loadTarget(admin, orgId, userId);
  if (!target) return { ok: false, error: NOT_FOUND };
  if (!target.actions.includes("roles")) {
    return { ok: false, error: "You can't change your own roles. Ask another administrator." };
  }
  const problems = checkRoles(target.org.type, roles);
  if (problems.length) return { ok: false, error: problems.join(" ") };
  if (!keepsAnAdmin(target.org.type, await orgMembers(orgId), { userId, roles })) {
    return { ok: false, error: noAdminLeft(target.org) };
  }
  const before = target.rolesHere;
  await db().transaction(async (tx) => {
    await tx.delete(m).where(and(eq(m.userId, userId), eq(m.organisationId, orgId)));
    await tx.insert(m).values(roles.map((role) => ({ userId, organisationId: orgId, role })));
    await audit(
      {
        userId: admin.user.id,
        action: "user.roles_changed",
        detail: { targetUserId: userId, organisationId: orgId, before, after: roles },
        ip,
      },
      tx,
    );
  });
  return { ok: true };
}

/** Takes a person out of an organisation; their account stays (D52). */
export async function removeFromOrg(
  admin: Admin,
  orgId: string,
  userId: string,
  ip: string,
): Promise<Result> {
  const target = await loadTarget(admin, orgId, userId);
  if (!target) return { ok: false, error: NOT_FOUND };
  if (!target.actions.includes("remove")) {
    return { ok: false, error: "You can't remove yourself. Ask another administrator." };
  }
  if (!keepsAnAdmin(target.org.type, await orgMembers(orgId), { remove: userId })) {
    return { ok: false, error: noAdminLeft(target.org) };
  }
  await db().transaction(async (tx) => {
    await tx.delete(m).where(and(eq(m.userId, userId), eq(m.organisationId, orgId)));
    await audit(
      {
        userId: admin.user.id,
        action: "user.removed",
        detail: { targetUserId: userId, organisationId: orgId, roles: target.rolesHere },
        ip,
      },
      tx,
    );
  });
  return { ok: true };
}

/**
 * Two-step reset for someone who lost their phone (04.12): clears the secret, ends their
 * sessions and emails them. Never one's own; never, for an institution admin, someone who also
 * belongs elsewhere.
 */
export async function resetTwoStep(
  admin: Admin,
  orgId: string,
  userId: string,
  ip: string,
): Promise<Result> {
  const target = await loadTarget(admin, orgId, userId);
  if (!target) return { ok: false, error: NOT_FOUND };
  if (userId === admin.user.id) {
    return { ok: false, error: "You can't reset your own two-step verification." };
  }
  if (!target.user.totpEnabled) {
    return {
      ok: false,
      error: `${target.user.name} hasn't set up two-step verification, so there is nothing to reset.`,
    };
  }
  if (!target.actions.includes("reset2fa")) {
    return {
      ok: false,
      error: "This person also belongs to another organisation. Ask abcfinance to reset it.",
    };
  }
  const now = new Date();
  await db().transaction(async (tx) => {
    await tx
      .update(u)
      .set({ totpSecretEnc: null, totpEnabled: false, totpLastStep: null })
      .where(eq(u.id, userId));
    const ended = await endAllSessions(userId, tx);
    await queueEmail(
      {
        to: target.user.email,
        kind: "two_step_reset",
        createdById: admin.user.id,
        ...twoStepResetEmail(target.user, admin.user.name, now),
      },
      tx,
    );
    await audit(
      {
        userId: admin.user.id,
        action: "user.2fa_reset",
        detail: { targetUserId: userId, organisationId: orgId, endedSessions: ended },
        ip,
      },
      tx,
    );
  });
  return { ok: true };
}

/**
 * Deactivate or reactivate an account (04.12): super admin only, never oneself, and never the
 * last active super admin. Deactivating signs the person out everywhere at once.
 */
export async function setActive(
  admin: Admin,
  orgId: string,
  userId: string,
  active: boolean,
  ip: string,
): Promise<Result> {
  if (!can(admin.memberships, "user.deactivate")) {
    return { ok: false, error: "Only abcfinance's super admin can deactivate accounts." };
  }
  const target = await loadTarget(admin, orgId, userId);
  if (!target) return { ok: false, error: NOT_FOUND };
  if (!target.actions.includes(active ? "reactivate" : "deactivate")) {
    return {
      ok: false,
      error: userId === admin.user.id ? "You can't deactivate yourself." : "Nothing to change.",
    };
  }
  if (!active) {
    const isSuper = await db()
      .select({ id: m.id })
      .from(m)
      .where(and(eq(m.userId, userId), eq(m.role, "abcfinance_super_admin")));
    if (isSuper.length && (await otherActiveSuperAdmins(userId)) === 0) {
      return { ok: false, error: "abcfinance must keep at least one active super admin." };
    }
  }
  await db().transaction(async (tx) => {
    await tx
      .update(u)
      .set({ disabledAt: active ? null : new Date() })
      .where(eq(u.id, userId));
    const ended = active ? 0 : await endAllSessions(userId, tx);
    await audit(
      {
        userId: admin.user.id,
        action: active ? "user.reactivated" : "user.deactivated",
        detail: { targetUserId: userId, endedSessions: ended },
        ip,
      },
      tx,
    );
  });
  return { ok: true };
}
