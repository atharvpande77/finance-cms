import { describe, expect, it } from "vitest";
import {
  allowedActions,
  authorChoices,
  canSetSlug,
  canAddLanguage,
  canCreate,
  canView,
  isYourTurn,
  nextState,
  returnCommentOk,
  validateSubmit,
  type ArticleRef,
  type VersionState,
} from "@/domain/workflow";
import type { Membership } from "@/domain/permissions";
import { organisationTypeOf, type Role } from "@/domain/roles";

const AMC = "org-amc";
const GI = "org-gi";
const ABC = "org-abc";
const TB = "org-tb";
const m = (role: Role, organisationId: string): Membership => ({
  role,
  organisationId,
  organisationType: organisationTypeOf(role),
});

const amcArticle: ArticleRef = { type: "institution", organisationId: AMC };
const abcArticle: ArticleRef = { type: "abcfinance", organisationId: ABC };
const expertArticle: ArticleRef = { type: "independent", organisationId: ABC };
const master = (state: VersionState) => ({ state, tenantId: null });

const writer = [m("institution_writer", AMC)];
const admin = [m("institution_account_admin", AMC)];
const approver = [m("institution_approver", AMC)];
const compliance = [m("institution_compliance", AMC)];
const approverGi = [m("institution_approver", GI)];
const editor = [m("abcfinance_editor", ABC)];
const abcWriter = [m("abcfinance_writer", ABC)];

describe("institution side", () => {
  it("[U-WF-01] writer submits a draft, then it is locked", () => {
    expect(allowedActions(writer, amcArticle, master("draft"))).toEqual(["save", "submit"]);
    expect(nextState("institution", "draft", "submit")).toBe("in_approval");
    for (const state of ["in_approval", "compliance_review", "editing"] as const) {
      expect(allowedActions(writer, amcArticle, master(state)), state).toEqual([]);
    }
    expect(validateSubmit({ headline: "", body: "short" })).toEqual([
      "headline_required",
      "body_too_short",
    ]);
    expect(validateSubmit({ headline: "A headline", body: "x".repeat(20) })).toEqual([]);
  });

  it("[U-WF-02] approver approves or returns, only for their own organisation", () => {
    expect(allowedActions(approver, amcArticle, master("in_approval"))).toEqual([
      "approve",
      "return",
    ]);
    expect(allowedActions(approverGi, amcArticle, master("in_approval"))).toEqual([]);
    expect(nextState("institution", "in_approval", "approve")).toBe("compliance_review");
    expect(nextState("institution", "in_approval", "return")).toBe("draft");
  });

  it("[U-WF-03] compliance signs off after the approver, not before", () => {
    expect(allowedActions(compliance, amcArticle, master("in_approval"))).toEqual([]);
    expect(allowedActions(compliance, amcArticle, master("compliance_review"))).toEqual([
      "approve",
      "return",
    ]);
    expect(nextState("institution", "compliance_review", "approve")).toBe("editing");
    expect(allowedActions(approver, amcArticle, master("compliance_review"))).toEqual([]);
  });

  it("[U-WF-04] returns need a comment", () => {
    expect(returnCommentOk("")).toBe(false);
    expect(returnCommentOk("   ")).toBe(false);
    expect(returnCommentOk(null)).toBe(false);
    expect(returnCommentOk("Please cite the source")).toBe(true);
  });

  it("[U-WF-05] account admin can submit; approver cannot edit or submit", () => {
    expect(allowedActions(admin, amcArticle, master("draft"))).toEqual(["save", "submit"]);
    expect(allowedActions(approver, amcArticle, master("draft"))).toEqual([]);
  });
});

describe("abcfinance side", () => {
  it("[U-WF-06] abcfinance articles skip the institution steps", () => {
    expect(nextState("abcfinance", "draft", "submit")).toBe("editing");
    expect(nextState("independent", "draft", "submit")).toBe("editing");
    expect(allowedActions(abcWriter, abcArticle, master("draft"))).toEqual(["save", "submit"]);
    expect(allowedActions(editor, expertArticle, master("draft"))).toEqual(["save", "submit"]);
    expect(allowedActions(approver, abcArticle, master("in_approval"))).toEqual([]);
  });

  it("[U-WF-07] institution writers cannot touch abcfinance articles", () => {
    expect(allowedActions(writer, abcArticle, master("draft"))).toEqual([]);
    expect(allowedActions(admin, abcArticle, master("editing"))).toEqual([]);
    expect(canAddLanguage(writer, abcArticle)).toBe(false);
    expect(canView(writer, abcArticle)).toBe(false);
  });

  it("[U-WF-08] editor edits and releases only in the editing state", () => {
    expect(allowedActions(editor, amcArticle, master("editing"))).toEqual([
      "save",
      "return",
      "release",
    ]);
    for (const state of ["draft", "in_approval", "compliance_review", "with_publisher"] as const) {
      expect(allowedActions(editor, amcArticle, master(state)), state).toEqual([]);
    }
    expect(allowedActions(abcWriter, abcArticle, master("editing"))).toEqual([]);
    expect(nextState("abcfinance", "editing", "release")).toBe("with_publisher");
    expect(nextState("abcfinance", "draft", "release")).toBeNull();
  });
});

describe("visibility and turns", () => {
  it("shows staff everything, institutions their own, publishers nothing", () => {
    expect(canView(editor, amcArticle)).toBe(true);
    expect(canView(abcWriter, amcArticle)).toBe(true);
    expect(canView(approver, amcArticle)).toBe(true);
    expect(canView(approverGi, amcArticle)).toBe(false);
    expect(canView([m("publisher_editor", TB)], amcArticle)).toBe(false);
  });

  it("marks the person whose step is next", () => {
    expect(isYourTurn(writer, amcArticle, master("draft"))).toBe(true);
    expect(isYourTurn(writer, amcArticle, master("in_approval"))).toBe(false);
    expect(isYourTurn(approver, amcArticle, master("in_approval"))).toBe(true);
    expect(isYourTurn(editor, amcArticle, master("editing"))).toBe(true);
  });

  it("nobody edits a paper copy", () => {
    expect(allowedActions(editor, amcArticle, { state: "editing", tenantId: TB })).toEqual([]);
    expect(allowedActions(writer, amcArticle, { state: "draft", tenantId: TB })).toEqual([]);
  });

  it("lets authors and abcfinance writers create, nobody else", () => {
    expect(canCreate(writer)).toBe(true);
    expect(canCreate(admin)).toBe(true);
    expect(canCreate(abcWriter)).toBe(true);
    expect(canCreate(approver)).toBe(false);
    expect(canCreate([m("publisher_editor", TB)])).toBe(false);
  });
});

describe("who writes and who sets the web address (D42, D44)", () => {
  it("files institution writers as themselves for their institution", () => {
    expect(authorChoices(writer)).toEqual([
      { kind: "self", type: "institution", organisationId: AMC },
    ]);
    expect(authorChoices(admin)).toEqual([
      { kind: "self", type: "institution", organisationId: AMC },
    ]);
    expect(authorChoices([...writer, m("institution_writer", GI)])).toHaveLength(2);
    expect(authorChoices(approver)).toEqual([]);
    expect(authorChoices([m("publisher_editor", TB)])).toEqual([]);
  });

  it("lets abcfinance staff file as themselves or for an expert", () => {
    for (const ms of [abcWriter, editor]) {
      expect(authorChoices(ms)).toEqual([{ kind: "self", type: "abcfinance" }, { kind: "expert" }]);
    }
  });

  it("lets only abcfinance's editors set the web address, before release", () => {
    expect(canSetSlug(editor, ["editing"])).toBe(true);
    expect(canSetSlug(editor, ["draft", "editing"])).toBe(true);
    expect(canSetSlug(editor, ["with_publisher"])).toBe(false);
    expect(canSetSlug(abcWriter, ["editing"])).toBe(false);
    expect(canSetSlug(writer, ["draft"])).toBe(false);
  });
});
