import { roleNeedsTwoStep, type OrganisationType, type Role } from "./roles";

/** One role a person holds in one organisation. Permissions are per role per organisation (04.1). */
export type Membership = {
  organisationId: string;
  organisationType: OrganisationType;
  role: Role;
};

/** Does the person hold `role` in organisation `organisationId`? A role elsewhere doesn't count. */
export function hasRole(ms: readonly Membership[], role: Role, organisationId: string): boolean {
  return ms.some((m) => m.role === role && m.organisationId === organisationId);
}

type Rule = {
  /** Roles that grant the action only in the organisation they belong to. */
  scoped?: readonly Role[];
  /** abcfinance roles that grant the action for every organisation. */
  global?: readonly Role[];
};

const EDITORS = ["abcfinance_editor", "abcfinance_desk_manager", "abcfinance_super_admin"] as const;
const STAFF_ADMINS = ["abcfinance_super_admin", "abcfinance_desk_manager"] as const;

/**
 * The 04.1 table. Where an action concerns an organisation (the article's institution, the
 * copy's publisher, the institution whose users are managed), pass that organisation's id.
 */
const RULES = {
  /** Create, edit or submit a draft of an institution article. */
  "article.write.institution": { scoped: ["institution_writer", "institution_account_admin"] },
  /** Create, edit or submit a draft of an abcfinance or independent-expert article. */
  "article.write.abcfinance": { global: ["abcfinance_writer", ...EDITORS] },
  /** Approve or return an article in approval. */
  "article.approve": { scoped: ["institution_approver"] },
  /** Approve or return an article in compliance review. */
  "article.compliance": { scoped: ["institution_compliance"] },
  /** Edit an article in Editing, return it, or send it to papers. */
  "article.release": { global: EDITORS },
  /** Approve, hold or take down a copy on that paper. */
  "copy.decide": { scoped: ["publisher_editor"] },
  /** See that paper's queue (publisher_admin sees but cannot decide). */
  "copy.view": { scoped: ["publisher_editor", "publisher_admin"] },
  "reports.publisher": { scoped: ["publisher_admin"], global: STAFF_ADMINS },
  "reports.institution": { scoped: ["institution_account_admin"] },
  "reports.abcfinance": { global: STAFF_ADMINS },
  "leads.view": { scoped: ["institution_account_admin"] },
  "rates.edit": { scoped: ["institution_account_admin"] },
  /** Default rates for unsponsored calculators. */
  "rates.edit.defaults": { global: ["abcfinance_super_admin"] },
  "widgets.manage": { global: STAFF_ADMINS },
  "ads.view": { global: STAFF_ADMINS },
  "ads.change": { global: ["abcfinance_super_admin"] },
  finance: { global: ["abcfinance_super_admin"] },
  /** Manage an organisation's users: its institution account admin, or a super admin for any. */
  "users.manage": { scoped: ["institution_account_admin"], global: ["abcfinance_super_admin"] },
  "user.deactivate": { global: ["abcfinance_super_admin"] },
} satisfies Record<string, Rule>;

export type Action = keyof typeof RULES;

/**
 * May the person do `action` in organisation `organisationId`? Without an organisation, the
 * question is whether they may do it anywhere (used for menus and area pages).
 */
export function can(ms: readonly Membership[], action: Action, organisationId?: string): boolean {
  const rule: Rule = RULES[action];
  if (ms.some((m) => rule.global?.includes(m.role) && m.organisationType === "abcfinance")) {
    return true;
  }
  return ms.some(
    (m) =>
      rule.scoped?.includes(m.role) &&
      (organisationId === undefined || m.organisationId === organisationId),
  );
}

/** Organisations in which the person may do `action` through a scoped role. */
export function organisationsFor(ms: readonly Membership[], action: Action): string[] {
  const rule: Rule = RULES[action];
  return [...new Set(ms.filter((m) => rule.scoped?.includes(m.role)).map((m) => m.organisationId))];
}

/** Two-step verification applies when any role needs it, or the person switched it on. */
export function twoStepRequired(ms: readonly Membership[], totpEnabled: boolean): boolean {
  return totpEnabled || ms.some((m) => roleNeedsTwoStep(m.role));
}
