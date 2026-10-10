import { describe, expect, it } from "vitest";
import type { Membership } from "@/domain/permissions";
import { organisationTypeOf, type Role } from "@/domain/roles";
import { canOpenReport, REPORTS, reportByKey, reportSetsFor } from "@/domain/reports";

const m = (role: Role, organisationId: string): Membership => ({
  role,
  organisationId,
  organisationType: organisationTypeOf(role),
});

describe("who opens which reports (04.9)", () => {
  it("gives an institution's account admin its own institution's reports only", () => {
    const admin = [m("institution_account_admin", "amc")];
    expect(reportSetsFor(admin)).toEqual(["inst"]);
    expect(canOpenReport(admin, "inst", "amc")).toBe(true);
    expect(canOpenReport(admin, "inst", "gi")).toBe(false);
    expect(canOpenReport(admin, "pub", "tb")).toBe(false);
    expect(canOpenReport(admin, "abc")).toBe(false);
  });

  it("gives a paper's admin that paper's reports only", () => {
    const admin = [m("publisher_admin", "tb")];
    expect(reportSetsFor(admin)).toEqual(["pub"]);
    expect(canOpenReport(admin, "pub", "tb")).toBe(true);
    expect(canOpenReport(admin, "pub", "pb")).toBe(false);
    expect(canOpenReport(admin, "inst", "amc")).toBe(false);
  });

  it("gives super admin and desk manager every set, institutions read-only (D49)", () => {
    for (const role of ["abcfinance_super_admin", "abcfinance_desk_manager"] as const) {
      const staff = [m(role, "abc")];
      expect(reportSetsFor(staff), role).toEqual(["inst", "pub", "abc"]);
      expect(canOpenReport(staff, "inst", "gi")).toBe(true);
      expect(canOpenReport(staff, "pub", "pc")).toBe(true);
      expect(canOpenReport(staff, "abc")).toBe(true);
    }
  });

  it("gives writers, approvers, compliance, editors and paper editors none", () => {
    for (const [role, org] of [
      ["institution_writer", "amc"],
      ["institution_approver", "amc"],
      ["institution_compliance", "amc"],
      ["abcfinance_writer", "abc"],
      ["abcfinance_editor", "abc"],
      ["publisher_editor", "tb"],
    ] as const) {
      expect(reportSetsFor([m(role, org)]), role).toEqual([]);
      expect(canOpenReport([m(role, org)], "inst", org)).toBe(false);
    }
  });

  it("lists the M5a reports and no money or widget reports (D47)", () => {
    expect(REPORTS.map((r) => r.key)).toEqual([
      "inst-articles",
      "inst-newspapers",
      "inst-languages",
      "inst-calculators",
      "inst-leads",
      "inst-plan",
      "pub-summary",
      "pub-traffic",
      "pub-top-pages",
      "pub-approvals",
      "abc-articles",
      "abc-seo",
    ]);
    expect(reportByKey("pub-pool")).toBeUndefined();
    expect(reportByKey(null)).toBeUndefined();
  });
});
