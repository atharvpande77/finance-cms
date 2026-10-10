import { describe, expect, it } from "vitest";
import type { Membership } from "@/domain/permissions";
import { organisationTypeOf, type Role } from "@/domain/roles";
import {
  ADMIN_ROLE,
  canManageUsers,
  checkRoles,
  keepsAnAdmin,
  linkUsable,
  manageableOrgTypes,
  parseRoles,
  personActions,
  ROLES_BY_KIND,
  type OrgMember,
} from "@/domain/users";

const m = (role: Role, organisationId: string): Membership => ({
  role,
  organisationId,
  organisationType: organisationTypeOf(role),
});

describe("roles belong to one kind of organisation", () => {
  it("[U-USR-03] lists the roles of each kind", () => {
    expect(ROLES_BY_KIND.institution).toEqual([
      "institution_writer",
      "institution_approver",
      "institution_compliance",
      "institution_account_admin",
    ]);
    expect(ROLES_BY_KIND.publisher).toEqual(["publisher_editor", "publisher_admin"]);
    expect(ROLES_BY_KIND.abcfinance).toEqual([
      "abcfinance_writer",
      "abcfinance_editor",
      "abcfinance_desk_manager",
      "abcfinance_super_admin",
    ]);
  });

  it("[U-USR-04] accepts matching roles and explains mismatches", () => {
    expect(checkRoles("institution", ["institution_writer", "institution_approver"])).toEqual([]);
    expect(checkRoles("institution", ["publisher_editor"])).toEqual([
      "Newspaper editor isn't a role in an institution.",
    ]);
    expect(checkRoles("publisher", ["abcfinance_super_admin"])).toEqual([
      "Super admin isn't a role in a newspaper.",
    ]);
    expect(checkRoles("abcfinance", [])).toEqual(["Choose at least one role."]);
    expect(parseRoles(["institution_writer", "institution_writer", "boss", 3])).toEqual([
      "institution_writer",
    ]);
  });
});

describe("who may manage whose users", () => {
  it("[U-USR-05] an institution's account admin manages only that institution", () => {
    const admin = [m("institution_account_admin", "amc")];
    expect(canManageUsers(admin, "amc", "institution")).toBe(true);
    expect(canManageUsers(admin, "gi", "institution")).toBe(false);
    expect(manageableOrgTypes(admin)).toEqual(["institution"]);
  });

  it("[U-USR-06] a super admin manages every organisation", () => {
    const sup = [m("abcfinance_super_admin", "abc")];
    expect(canManageUsers(sup, "gi", "institution")).toBe(true);
    expect(canManageUsers(sup, "tb", "publisher")).toBe(true);
    expect(canManageUsers(sup, "abc", "abcfinance")).toBe(true);
    expect(manageableOrgTypes(sup)).toEqual(["institution", "publisher", "abcfinance"]);
  });

  it("[U-USR-07] writers, approvers, editors and desk managers manage nobody", () => {
    for (const [role, org] of [
      ["institution_writer", "amc"],
      ["institution_approver", "amc"],
      ["institution_compliance", "amc"],
      ["abcfinance_editor", "abc"],
      ["abcfinance_desk_manager", "abc"],
      ["publisher_admin", "tb"],
      ["publisher_editor", "tb"],
    ] as const) {
      const ms = [m(role, org)];
      expect(canManageUsers(ms, org, organisationTypeOf(role)), role).toBe(false);
      expect(manageableOrgTypes(ms), role).toEqual([]);
    }
  });
});

describe("links expire and are used once", () => {
  const now = new Date("2026-10-10T10:00:00Z");
  const later = new Date("2026-10-10T11:00:00Z");

  it("[U-USR-08] is valid until it expires", () => {
    expect(linkUsable({ expiresAt: later }, now)).toBe("ok");
    expect(linkUsable({ expiresAt: now }, now)).toBe("expired");
    expect(linkUsable({ expiresAt: later }, new Date("2026-10-10T12:00:00Z"))).toBe("expired");
  });

  it("[U-USR-09] used and revoked links never work again, even before they expire", () => {
    expect(linkUsable({ expiresAt: later, usedAt: now }, now)).toBe("used");
    expect(linkUsable({ expiresAt: later, acceptedAt: now }, now)).toBe("used");
    expect(linkUsable({ expiresAt: later, revokedAt: now }, now)).toBe("used");
  });
});

describe("an organisation can never be left without an administrator", () => {
  const admin = (userId: string, active = true): OrgMember => ({
    userId,
    role: "institution_account_admin",
    active,
  });
  const writer = (userId: string): OrgMember => ({
    userId,
    role: "institution_writer",
    active: true,
  });

  it("[U-USR-10] knows which role each kind of organisation must keep", () => {
    expect(ADMIN_ROLE).toEqual({
      institution: "institution_account_admin",
      abcfinance: "abcfinance_super_admin",
      publisher: null,
    });
  });

  it("[U-USR-11] refuses to remove the only admin's admin role, or the only admin", () => {
    const members = [admin("a"), writer("w")];
    expect(
      keepsAnAdmin("institution", members, { userId: "a", roles: ["institution_writer"] }),
    ).toBe(false);
    expect(keepsAnAdmin("institution", members, { remove: "a" })).toBe(false);
    // A deactivated second admin doesn't count.
    expect(keepsAnAdmin("institution", [admin("a"), admin("b", false)], { remove: "a" })).toBe(
      false,
    );
  });

  it("[U-USR-12] allows changes that keep an admin", () => {
    const members = [admin("a"), admin("b"), writer("w")];
    expect(keepsAnAdmin("institution", members, { remove: "a" })).toBe(true);
    expect(
      keepsAnAdmin("institution", members, { userId: "w", roles: ["institution_approver"] }),
    ).toBe(true);
    expect(keepsAnAdmin("institution", [admin("a"), writer("w")], { remove: "w" })).toBe(true);
    expect(
      keepsAnAdmin("institution", [admin("a")], {
        userId: "a",
        roles: ["institution_account_admin", "institution_writer"],
      }),
    ).toBe(true);
  });

  it("[U-USR-13] applies to abcfinance's super admins too, but not to newspapers", () => {
    const sup: OrgMember = { userId: "s", role: "abcfinance_super_admin", active: true };
    expect(keepsAnAdmin("abcfinance", [sup], { remove: "s" })).toBe(false);
    expect(keepsAnAdmin("abcfinance", [sup], { userId: "s", roles: ["abcfinance_editor"] })).toBe(
      false,
    );
    const pubAdmin: OrgMember = { userId: "p", role: "publisher_admin", active: true };
    expect(keepsAnAdmin("publisher", [pubAdmin], { remove: "p" })).toBe(true);
  });
});

describe("what an admin may do to a person", () => {
  const target = { id: "t", belongsElsewhere: false, totpEnabled: true, disabled: false };
  const admin = [m("institution_account_admin", "amc")];
  const sup = [m("abcfinance_super_admin", "abc")];

  it("gives nothing on oneself, or outside one's organisation", () => {
    expect(
      personActions({
        resetLinks: true,
        actorMs: admin,
        actorId: "t",
        orgId: "amc",
        orgType: "institution",
        target,
      }),
    ).toEqual([]);
    expect(
      personActions({
        resetLinks: true,
        actorMs: admin,
        actorId: "x",
        orgId: "gi",
        orgType: "institution",
        target,
      }),
    ).toEqual([]);
  });

  it("keeps cross-organisation actions and deactivation from an institution admin", () => {
    expect(
      personActions({
        resetLinks: true,
        actorMs: admin,
        actorId: "x",
        orgId: "amc",
        orgType: "institution",
        target,
      }),
    ).toEqual(["roles", "remove", "reset2fa", "resetLink"]);
    expect(
      personActions({
        resetLinks: true,
        actorMs: admin,
        actorId: "x",
        orgId: "amc",
        orgType: "institution",
        target: { ...target, belongsElsewhere: true },
      }),
    ).toEqual(["roles", "remove"]);
    expect(
      personActions({
        resetLinks: true,
        actorMs: sup,
        actorId: "x",
        orgId: "amc",
        orgType: "institution",
        target: { ...target, belongsElsewhere: true, totpEnabled: false, disabled: true },
      }),
    ).toEqual(["roles", "remove", "reactivate"]);
  });

  it("offers no reset link while password reset is off (D58)", () => {
    expect(
      personActions({
        resetLinks: false,
        actorMs: sup,
        actorId: "x",
        orgId: "amc",
        orgType: "institution",
        target,
      }),
    ).toEqual(["roles", "remove", "reset2fa", "deactivate"]);
  });
});
