import { and, eq, isNull, ne } from "drizzle-orm";
import { db, schema, type Db, type Tx } from "@/server/db/client";
import type { SessionInfo } from "@/server/auth/sessions";
import type { OrganisationType, Role } from "@/domain/roles";
import { canManageUsers, personActions, type PersonAction } from "@/domain/users";

/** The person acting on the Users page; their name goes into emails they cause. */
export type Admin = Pick<SessionInfo, "memberships"> & { user: { id: string; name: string } };

export type Org = { id: string; name: string; slug: string; type: OrganisationType };

export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export const NOT_FOUND = "Person not found.";

export async function loadOrg(orgId: string, conn: Db | Tx = db()): Promise<Org | undefined> {
  if (!/^[0-9a-f-]{36}$/i.test(orgId)) return undefined;
  const o = schema.organisations;
  const [row] = await conn
    .select({ id: o.id, name: o.name, slug: o.slug, type: o.type })
    .from(o)
    .where(eq(o.id, orgId));
  return row;
}

/** An organisation whose users the admin may manage, or undefined. */
export async function managedOrg(admin: Admin, orgId: string): Promise<Org | undefined> {
  const org = await loadOrg(orgId);
  return org && canManageUsers(admin.memberships, org.id, org.type) ? org : undefined;
}

export type Target = {
  org: Org;
  user: typeof schema.users.$inferSelect;
  rolesHere: Role[];
  /** Other organisations the person has roles in. */
  elsewhere: string[];
  actions: PersonAction[];
};

/**
 * A person the admin manages through `orgId`: the admin must manage that organisation and the
 * person must have a role in it. Anything else, including a forged id from another
 * organisation, is null (E2E-USR-50).
 */
export async function loadTarget(
  admin: Admin,
  orgId: string,
  userId: string,
  conn: Db | Tx = db(),
): Promise<Target | null> {
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return null;
  const org = await managedOrg(admin, orgId);
  if (!org) return null;
  const [user] = await conn.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!user) return null;
  const m = schema.memberships;
  const rows = await conn
    .select({ organisationId: m.organisationId, role: m.role, orgName: schema.organisations.name })
    .from(m)
    .innerJoin(schema.organisations, eq(schema.organisations.id, m.organisationId))
    .where(eq(m.userId, userId));
  const rolesHere = rows.filter((r) => r.organisationId === org.id).map((r) => r.role);
  if (rolesHere.length === 0) return null;
  const elsewhere = [
    ...new Set(rows.filter((r) => r.organisationId !== org.id).map((r) => r.orgName)),
  ];
  return {
    org,
    user,
    rolesHere,
    elsewhere,
    actions: personActions({
      actorMs: admin.memberships,
      actorId: admin.user.id,
      orgId: org.id,
      orgType: org.type,
      target: {
        id: user.id,
        belongsElsewhere: elsewhere.length > 0,
        totpEnabled: user.totpEnabled,
        disabled: user.disabledAt !== null,
      },
    }),
  };
}

/** Active super admins other than `userId` (the last one can't be demoted or deactivated). */
export async function otherActiveSuperAdmins(
  userId: string,
  conn: Db | Tx = db(),
): Promise<number> {
  const m = schema.memberships;
  const u = schema.users;
  const rows = await conn
    .selectDistinct({ id: u.id })
    .from(m)
    .innerJoin(u, eq(u.id, m.userId))
    .where(and(eq(m.role, "abcfinance_super_admin"), ne(u.id, userId), isNull(u.disabledAt)));
  return rows.length;
}
