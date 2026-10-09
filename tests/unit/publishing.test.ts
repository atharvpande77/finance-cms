import { describe, expect, it } from "vitest";
import {
  autoApproveAt,
  copyActions,
  copyStatus,
  explicitReasons,
  isDue,
  needsReason,
  releasePlan,
  type CopyRef,
} from "@/domain/publishing";
import { allowedActions } from "@/domain/workflow";
import type { Membership } from "@/domain/permissions";
import { organisationTypeOf, ROLES, type Role } from "@/domain/roles";

const TB = "org-tb";
const PB = "org-pb";
const ABC = "org-abc";
const AMC = "org-amc";
const m = (role: Role, organisationId: string): Membership => ({
  role,
  organisationId,
  organisationType: organisationTypeOf(role),
});

const editorTb = [m("publisher_editor", TB)];
const copy = (state: CopyRef["state"], heldAt: Date | null = null): CopyRef => ({
  state,
  heldAt,
  publisherOrgId: TB,
});

describe("publisher side", () => {
  it("[U-WF-09] editor can approve, hold or take down a waiting copy", () => {
    expect(copyActions(editorTb, copy("with_publisher"))).toEqual(["approve", "hold", "take_down"]);
  });

  it("[U-WF-10] a held copy cannot be held again but can be approved", () => {
    const held = copyActions(editorTb, copy("with_publisher", new Date()));
    expect(held).not.toContain("hold");
    expect(held).toEqual(["approve", "take_down"]);
  });

  it("[U-WF-11] a live copy can only be taken down", () => {
    expect(copyActions(editorTb, copy("published"))).toEqual(["take_down"]);
    expect(copyActions(editorTb, copy("unpublished"))).toEqual([]);
  });

  it("[U-WF-12] only the owning paper's editor acts; admins and others cannot", () => {
    const waiting = copy("with_publisher");
    expect(copyActions([m("publisher_editor", PB)], waiting)).toEqual([]);
    expect(copyActions([m("publisher_admin", TB)], waiting)).toEqual([]);
    for (const role of ROLES.filter((r) => r !== "publisher_editor")) {
      const org = organisationTypeOf(role) === "abcfinance" ? ABC : AMC;
      expect(copyActions([m(role, org)], waiting), role).toEqual([]);
    }
    // An editor of two papers acts on both.
    const both = [m("publisher_editor", TB), m("publisher_editor", PB)];
    expect(copyActions(both, { ...waiting, publisherOrgId: PB })).toContain("approve");
  });

  it("[U-WF-13] nobody edits a paper copy", () => {
    for (const role of ROLES) {
      const org =
        organisationTypeOf(role) === "publisher" ? TB : role.startsWith("abc") ? ABC : AMC;
      for (const state of ["editing", "with_publisher", "published"] as const) {
        expect(
          allowedActions(
            [m(role, org)],
            { type: "abcfinance", organisationId: ABC },
            { state, tenantId: "tenant-tb" },
          ),
        ).toEqual([]);
      }
    }
    expect(copyActions(editorTb, copy("with_publisher"))).not.toContain("save");
  });

  it("hold and take-down need a reason; approve doesn't", () => {
    expect(needsReason("hold")).toBe(true);
    expect(needsReason("take_down")).toBe(true);
    expect(needsReason("approve")).toBe(false);
  });

  it("describes a copy's state in the papers' words", () => {
    expect(copyStatus(copy("with_publisher"))).toBe("waiting");
    expect(copyStatus(copy("with_publisher", new Date()))).toBe("held");
    expect(copyStatus(copy("published"))).toBe("published");
    expect(copyStatus(copy("unpublished"))).toBe("taken_down");
  });
});

const routine = {
  articleType: "institution" as const,
  publishedFromInstitution: 5,
  flagged: false,
  sectionSlug: "mutual-funds",
  heldSectionSlugs: [] as string[],
};

describe("explicit approval and deemed approval", () => {
  it("[U-WF-14] deemed approval applies to a routine article", () => {
    expect(explicitReasons(routine)).toEqual([]);
    expect(explicitReasons({ ...routine, articleType: "abcfinance" })).toEqual([]);
  });

  it("[U-WF-15] the first three articles from an institution need explicit approval", () => {
    for (const n of [0, 1, 2]) {
      expect(explicitReasons({ ...routine, publishedFromInstitution: n })).toEqual([
        "first_articles",
      ]);
    }
    expect(explicitReasons({ ...routine, publishedFromInstitution: 3 })).toEqual([]);
  });

  it("[U-WF-16] the rule is about institutions, not abcfinance articles", () => {
    for (const articleType of ["abcfinance", "independent"] as const) {
      expect(explicitReasons({ ...routine, articleType, publishedFromInstitution: 0 })).toEqual([]);
    }
  });

  it("[U-WF-17] held categories and flagged checks force explicit approval", () => {
    expect(explicitReasons({ ...routine, flagged: true })).toEqual(["flagged"]);
    expect(explicitReasons({ ...routine, heldSectionSlugs: ["mutual-funds", "ipo"] })).toEqual([
      "held_section",
    ]);
    expect(explicitReasons({ ...routine, heldSectionSlugs: ["ipo"] })).toEqual([]);
    expect(
      explicitReasons({
        ...routine,
        articleType: "abcfinance",
        flagged: true,
        heldSectionSlugs: ["mutual-funds"],
      }),
    ).toEqual(["flagged", "held_section"]);
  });

  it("[U-WF-18] the veto window starts now, and never for explicit articles", () => {
    const released = new Date("2026-10-09T06:00:00Z");
    expect(autoApproveAt(released, 24, false)).toEqual(new Date("2026-10-10T06:00:00Z"));
    expect(autoApproveAt(released, 6, false)).toEqual(new Date("2026-10-09T12:00:00Z"));
    expect(autoApproveAt(released, 24, true)).toBeNull();
  });

  it("[U-WF-19] due-ness requires the window to have ended, no hold, no explicit requirement", () => {
    const now = new Date("2026-10-10T06:00:00Z");
    const due = {
      state: "with_publisher" as const,
      heldAt: null,
      requiresExplicit: false,
      autoApproveAt: new Date("2026-10-10T06:00:00Z"),
    };
    expect(isDue(due, now)).toBe(true);
    expect(isDue({ ...due, autoApproveAt: new Date("2026-10-10T06:00:01Z") }, now)).toBe(false);
    expect(isDue({ ...due, heldAt: new Date("2026-10-09T08:00:00Z") }, now)).toBe(false);
    expect(isDue({ ...due, requiresExplicit: true }, now)).toBe(false);
    expect(isDue({ ...due, autoApproveAt: null }, now)).toBe(false);
    expect(isDue({ ...due, state: "published" }, now)).toBe(false);
  });
});

describe("release plan", () => {
  const tb = { name: "Tarun Bharat", languages: ["mr"] };
  const pb = { name: "Paper B", languages: ["en", "mr"] };

  it("refuses a language the paper doesn't publish", () => {
    expect(releasePlan(tb, "en", false)).toEqual({
      action: "refuse",
      reason: "Tarun Bharat doesn't publish English",
    });
  });

  it("skips a paper that already has the version, otherwise creates a copy", () => {
    expect(releasePlan(pb, "en", true)).toEqual({
      action: "skip",
      reason: "Already has this version",
    });
    expect(releasePlan(pb, "mr", false)).toEqual({ action: "create", reason: null });
    expect(releasePlan(tb, "mr", false)).toEqual({ action: "create", reason: null });
  });
});
