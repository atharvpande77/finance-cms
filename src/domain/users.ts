/**
 * User-management rules (04.12): which roles fit which organisation, who manages whose users,
 * one-time links, the last-administrator rule, and what an admin may do to a person. Pure; the
 * services in `src/server/users/` apply them.
 */
import { can, type Membership } from "./permissions";
import {
  ROLE_LABELS,
  organisationTypeOf,
  rolesFor,
  type OrganisationType,
  type Role,
} from "./roles";

export const ORG_TYPE_LABELS: Record<OrganisationType, string> = {
  institution: "an institution",
  publisher: "a newspaper",
  abcfinance: "abcfinance",
};

/** The roles each kind of organisation can give. */
export const ROLES_BY_KIND: Record<OrganisationType, Role[]> = {
  institution: rolesFor("institution"),
  publisher: rolesFor("publisher"),
  abcfinance: rolesFor("abcfinance"),
};

/** Problems with giving `roles` in an organisation of `type`, or an empty list. */
export function checkRoles(type: OrganisationType, roles: readonly Role[]): string[] {
  if (roles.length === 0) return ["Choose at least one role."];
  return roles
    .filter((r) => organisationTypeOf(r) !== type)
    .map((r) => `${ROLE_LABELS[r]} isn't a role in ${ORG_TYPE_LABELS[type]}.`);
}

/** May the person manage the users of this organisation (its account admin, or a super admin)? */
export function canManageUsers(
  ms: readonly Membership[],
  orgId: string,
  orgType: OrganisationType,
): boolean {
  if (can(ms, "user.deactivate")) return true; // the super admin: every organisation
  // An account admin manages only their own institution, never a newspaper or abcfinance.
  return orgType === "institution" && can(ms, "users.manage", orgId);
}

/** Kinds of organisation whose users the person may manage. */
export function manageableOrgTypes(ms: readonly Membership[]): OrganisationType[] {
  if (can(ms, "user.deactivate")) return ["institution", "publisher", "abcfinance"];
  return can(ms, "users.manage") ? ["institution"] : [];
}

export type LinkState = "ok" | "expired" | "used";

/** A one-time link (invitation or reset): used or revoked links never work, even before expiry. */
export function linkUsable(
  link: {
    expiresAt: Date;
    usedAt?: Date | null;
    acceptedAt?: Date | null;
    revokedAt?: Date | null;
  },
  now: Date,
): LinkState {
  if (link.usedAt || link.acceptedAt || link.revokedAt) return "used";
  return link.expiresAt.getTime() > now.getTime() ? "ok" : "expired";
}

/**
 * The role an organisation must always keep someone in (03.7): institutions their account
 * admin, abcfinance its super admin. Newspapers have no such rule.
 */
export const ADMIN_ROLE: Record<OrganisationType, Role | null> = {
  institution: "institution_account_admin",
  abcfinance: "abcfinance_super_admin",
  publisher: null,
};

export type OrgMember = { userId: string; role: Role; active: boolean };
export type MemberChange = { userId: string; roles: readonly Role[] } | { remove: string };

/** Does the organisation still have an active administrator after `change`? */
export function keepsAnAdmin(
  type: OrganisationType,
  members: readonly OrgMember[],
  change: MemberChange,
): boolean {
  const admin = ADMIN_ROLE[type];
  if (!admin) return true;
  const target = "remove" in change ? change.remove : change.userId;
  const others = members.filter((m) => m.userId !== target && m.role === admin && m.active);
  if (others.length > 0) return true;
  if ("remove" in change) return false;
  const targetActive = members.find((m) => m.userId === target)?.active ?? true;
  return change.roles.includes(admin) && targetActive;
}

export type PersonAction =
  "roles" | "remove" | "reset2fa" | "resetLink" | "deactivate" | "reactivate";

/**
 * What an admin may do to a person in an organisation (04.12): nothing to themselves; an
 * institution admin can't reset two-step or send a reset link for someone who also belongs
 * elsewhere; only the super admin deactivates. Two-step reset needs two-step to be set up.
 */
export function personActions(input: {
  actorMs: readonly Membership[];
  actorId: string;
  orgId: string;
  orgType: OrganisationType;
  target: { id: string; belongsElsewhere: boolean; totpEnabled: boolean; disabled: boolean };
  /** Reset links exist only once email does (PASSWORD_RESET, D58). */
  resetLinks: boolean;
}): PersonAction[] {
  const { actorMs, actorId, orgId, orgType, target } = input;
  if (target.id === actorId || !canManageUsers(actorMs, orgId, orgType)) return [];
  const superAdmin = can(actorMs, "user.deactivate");
  const actions: PersonAction[] = ["roles", "remove"];
  const crossOrgOk = superAdmin || !target.belongsElsewhere;
  if (crossOrgOk && target.totpEnabled) actions.push("reset2fa");
  if (input.resetLinks && crossOrgOk && !target.disabled) actions.push("resetLink");
  if (superAdmin) actions.push(target.disabled ? "reactivate" : "deactivate");
  return actions;
}

/** Roles from a form: known roles only, without repeats. */
export function parseRoles(values: readonly unknown[]): Role[] {
  const known = new Set<string>(Object.keys(ROLE_LABELS));
  return [...new Set(values.filter((v): v is Role => typeof v === "string" && known.has(v)))];
}
