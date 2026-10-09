/** Roles, the organisation type each belongs to, and who needs two-step verification (doc 04.1). */
export const ROLES = [
  "institution_writer",
  "institution_approver",
  "institution_compliance",
  "institution_account_admin",
  "abcfinance_writer",
  "abcfinance_editor",
  "abcfinance_desk_manager",
  "abcfinance_super_admin",
  "publisher_editor",
  "publisher_admin",
] as const;

export type Role = (typeof ROLES)[number];
export type OrganisationType = "institution" | "publisher" | "abcfinance";

export const ROLE_LABELS: Record<Role, string> = {
  institution_writer: "Institution writer",
  institution_approver: "Institution approver",
  institution_compliance: "Compliance",
  institution_account_admin: "Account admin",
  abcfinance_writer: "abcfinance writer",
  abcfinance_editor: "abcfinance editor",
  abcfinance_desk_manager: "Desk manager",
  abcfinance_super_admin: "Super admin",
  publisher_editor: "Newspaper editor",
  publisher_admin: "Newspaper admin",
};

export function organisationTypeOf(role: Role): OrganisationType {
  return role.split("_", 1)[0] as OrganisationType;
}

export function rolesFor(type: OrganisationType): Role[] {
  return ROLES.filter((r) => organisationTypeOf(r) === type);
}

/** Two-step verification is required for every role except the two writer roles (09.3 #10). */
export function roleNeedsTwoStep(role: Role): boolean {
  return role !== "institution_writer" && role !== "abcfinance_writer";
}

export function needsTwoStep(roles: readonly Role[]): boolean {
  return roles.some(roleNeedsTwoStep);
}

/** abcfinance roles that may edit in Editing, return, and release to papers. */
export const ABC_EDITOR_ROLES: readonly Role[] = [
  "abcfinance_editor",
  "abcfinance_desk_manager",
  "abcfinance_super_admin",
];

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}
