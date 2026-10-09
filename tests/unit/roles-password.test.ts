import { describe, expect, it } from "vitest";
import {
  needsTwoStep,
  organisationTypeOf,
  roleNeedsTwoStep,
  rolesFor,
  ROLES,
} from "@/domain/roles";
import { hashPassword, verifyPassword } from "@/server/auth/password";

describe("roles", () => {
  it("every role belongs to exactly one organisation type", () => {
    expect(rolesFor("institution")).toHaveLength(4);
    expect(rolesFor("abcfinance")).toHaveLength(4);
    expect(rolesFor("publisher")).toHaveLength(2);
    expect(ROLES.map(organisationTypeOf)).not.toContain(undefined);
  });

  it("[U-AUTH-11] two-step verification for everyone except the writer roles", () => {
    expect(roleNeedsTwoStep("institution_writer")).toBe(false);
    expect(roleNeedsTwoStep("abcfinance_writer")).toBe(false);
    expect(roleNeedsTwoStep("institution_approver")).toBe(true);
    expect(roleNeedsTwoStep("abcfinance_editor")).toBe(true);
    expect(roleNeedsTwoStep("publisher_admin")).toBe(true);
    expect(needsTwoStep(["institution_writer", "institution_compliance"])).toBe(true);
  });
});

describe("password hashing", () => {
  it("[U-AUTH-01][U-AUTH-02] verifies the right password, rejects others, and salts every hash", async () => {
    const a = await hashPassword("Demo-Pass-2026");
    const b = await hashPassword("Demo-Pass-2026");
    expect(a).not.toBe(b);
    expect(a.startsWith("scrypt$16384$8$1$")).toBe(true);
    expect(await verifyPassword("Demo-Pass-2026", a)).toBe(true);
    expect(await verifyPassword("demo-pass-2026", a)).toBe(false);
    expect(await verifyPassword("x".repeat(201), a)).toBe(false);
    expect(await verifyPassword("Demo-Pass-2026", "garbage")).toBe(false);
  });
});
