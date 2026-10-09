import { describe, expect, it } from "vitest";
import { can, hasRole, twoStepRequired, type Membership } from "@/domain/permissions";
import { canOpenArea, panelMenu } from "@/domain/panel-menu";
import { organisationTypeOf, type Role } from "@/domain/roles";

const AMC = "org-amc";
const GI = "org-gi";
const TB = "org-tb";
const PB = "org-pb";
const ABC = "org-abc";

function m(role: Role, organisationId: string): Membership {
  return { role, organisationId, organisationType: organisationTypeOf(role) };
}

const areas = (ms: Membership[]) => panelMenu(ms).map((i) => i.area);

describe("roles", () => {
  it("[U-AUTH-10] checks per role per organisation", () => {
    const approverAmc = [m("institution_approver", AMC)];
    expect(hasRole(approverAmc, "institution_approver", AMC)).toBe(true);
    expect(hasRole(approverAmc, "institution_approver", GI)).toBe(false);
    expect(can(approverAmc, "article.approve", AMC)).toBe(true);
    expect(can(approverAmc, "article.approve", GI)).toBe(false);
    expect(can(approverAmc, "article.compliance", AMC)).toBe(false);

    const editorTb = [m("publisher_editor", TB)];
    expect(can(editorTb, "copy.decide", TB)).toBe(true);
    expect(can(editorTb, "copy.decide", PB)).toBe(false);
    expect(can([m("publisher_admin", TB)], "copy.decide", TB)).toBe(false);
    expect(can([m("publisher_admin", TB)], "copy.view", TB)).toBe(true);

    const adminAmc = [m("institution_account_admin", AMC)];
    expect(can(adminAmc, "leads.view", AMC)).toBe(true);
    expect(can(adminAmc, "leads.view", GI)).toBe(false);
    expect(can(adminAmc, "users.manage", GI)).toBe(false);
  });
});

describe("the 04.1 permission table", () => {
  it("lets institution writers and admins write their own institution's drafts only", () => {
    expect(can([m("institution_writer", AMC)], "article.write.institution", AMC)).toBe(true);
    expect(can([m("institution_account_admin", AMC)], "article.write.institution", AMC)).toBe(true);
    expect(can([m("institution_writer", AMC)], "article.write.institution", GI)).toBe(false);
    expect(can([m("institution_writer", AMC)], "article.write.abcfinance")).toBe(false);
  });

  it("lets abcfinance writers and editor roles write abcfinance articles; only editors release", () => {
    expect(can([m("abcfinance_writer", ABC)], "article.write.abcfinance")).toBe(true);
    expect(can([m("abcfinance_editor", ABC)], "article.write.abcfinance")).toBe(true);
    expect(can([m("abcfinance_writer", ABC)], "article.release")).toBe(false);
    for (const role of [
      "abcfinance_editor",
      "abcfinance_desk_manager",
      "abcfinance_super_admin",
    ] as const) {
      expect(can([m(role, ABC)], "article.release"), role).toBe(true);
    }
  });

  it("gives paper reports to that paper's admin and to abcfinance admins", () => {
    expect(can([m("publisher_admin", TB)], "reports.publisher", TB)).toBe(true);
    expect(can([m("publisher_admin", TB)], "reports.publisher", PB)).toBe(false);
    expect(can([m("publisher_editor", TB)], "reports.publisher", TB)).toBe(false);
    expect(can([m("abcfinance_desk_manager", ABC)], "reports.publisher", PB)).toBe(true);
    expect(can([m("abcfinance_editor", ABC)], "reports.publisher", PB)).toBe(false);
  });

  it("keeps finance, ad changes and deactivation for the super admin", () => {
    const desk = [m("abcfinance_desk_manager", ABC)];
    const sup = [m("abcfinance_super_admin", ABC)];
    expect(can(desk, "ads.view")).toBe(true);
    expect(can(desk, "ads.change")).toBe(false);
    expect(can(sup, "ads.change")).toBe(true);
    expect(can(desk, "widgets.manage")).toBe(true);
    expect(can(desk, "finance")).toBe(false);
    expect(can(sup, "finance")).toBe(true);
    expect(can(sup, "users.manage", GI)).toBe(true);
    expect(can(desk, "users.manage", GI)).toBe(false);
    expect(can(sup, "user.deactivate")).toBe(true);
    expect(can([m("institution_account_admin", AMC)], "user.deactivate")).toBe(false);
  });

  it("requires two-step for any role that needs it, or when switched on", () => {
    expect(twoStepRequired([m("institution_writer", AMC)], false)).toBe(false);
    expect(twoStepRequired([m("institution_writer", AMC)], true)).toBe(true);
    expect(
      twoStepRequired([m("institution_writer", AMC), m("institution_approver", AMC)], false),
    ).toBe(true);
  });
});

describe("panel menu", () => {
  it("shows each demo role the areas 05.2 gives it", () => {
    expect(areas([m("institution_writer", AMC)])).toEqual(["dashboard", "articles"]);
    expect(areas([m("institution_account_admin", AMC)])).toEqual([
      "dashboard",
      "articles",
      "leads",
      "calculators",
      "reports",
      "users",
    ]);
    expect(areas([m("publisher_editor", TB)])).toEqual(["dashboard", "publisher"]);
    expect(areas([m("publisher_admin", TB)])).toEqual(["dashboard", "publisher", "reports"]);
    expect(areas([m("abcfinance_writer", ABC)])).toEqual(["dashboard", "articles"]);
    expect(areas([m("abcfinance_desk_manager", ABC)])).toEqual([
      "dashboard",
      "articles",
      "reports",
      "widgets",
      "ads",
    ]);
    expect(areas([m("abcfinance_super_admin", ABC)])).toEqual([
      "dashboard",
      "articles",
      "calculators",
      "reports",
      "finance",
      "widgets",
      "ads",
      "users",
    ]);
  });

  it("refuses areas outside the menu", () => {
    expect(canOpenArea([m("institution_writer", AMC)], "leads")).toBe(false);
    expect(canOpenArea([m("publisher_editor", TB)], "articles")).toBe(false);
    expect(canOpenArea([], "dashboard")).toBe(true);
  });
});
