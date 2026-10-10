import { ABC_EDITOR_ROLES, type Role } from "./roles";
import type { Membership } from "./permissions";

/**
 * The article workflow (04.2) as one table: who may do what to a master version in each state.
 * Pages, the service and the "your turn" markers all read it, so the rules exist once.
 */

export type ArticleType = "institution" | "abcfinance" | "independent";
export type VersionState =
  | "draft"
  | "in_approval"
  | "compliance_review"
  | "editing"
  | "with_publisher"
  | "published"
  | "review_due"
  | "unpublished";
export type WorkflowAction = "save" | "submit" | "approve" | "return" | "release";

export type ArticleRef = { type: ArticleType; organisationId: string };
/** `tenantId` set means a paper copy, which nobody edits (04.2). */
export type VersionRef = { state: VersionState; tenantId: string | null };

export const STATE_LABELS: Record<VersionState, string> = {
  draft: "Draft",
  in_approval: "In approval",
  compliance_review: "Compliance review",
  editing: "Editing",
  with_publisher: "With publisher",
  published: "Published",
  review_due: "Review due",
  unpublished: "Unpublished",
};

export const MIN_SUBMIT_BODY = 20;

const INSTITUTION_AUTHORS: readonly Role[] = ["institution_writer", "institution_account_admin"];
const ABC_AUTHORS: readonly Role[] = ["abcfinance_writer", ...ABC_EDITOR_ROLES];

function holds(ms: readonly Membership[], roles: readonly Role[], organisationId?: string) {
  return ms.some(
    (m) =>
      roles.includes(m.role) &&
      (organisationId === undefined || m.organisationId === organisationId),
  );
}

function holdsAbc(ms: readonly Membership[], roles: readonly Role[]) {
  return ms.some((m) => m.organisationType === "abcfinance" && roles.includes(m.role));
}

/** The author side: who writes drafts of this article (and adds languages to it). */
export function isAuthorSide(ms: readonly Membership[], article: ArticleRef): boolean {
  return article.type === "institution"
    ? holds(ms, INSTITUTION_AUTHORS, article.organisationId)
    : holdsAbc(ms, ABC_AUTHORS);
}

/** Actions this person may take on this version right now. */
export function allowedActions(
  ms: readonly Membership[],
  article: ArticleRef,
  version: VersionRef,
): WorkflowAction[] {
  if (version.tenantId !== null) return [];
  const org = article.organisationId;
  const institution = article.type === "institution";
  switch (version.state) {
    case "draft":
      return isAuthorSide(ms, article) ? ["save", "submit"] : [];
    case "in_approval":
      return institution && holds(ms, ["institution_approver"], org) ? ["approve", "return"] : [];
    case "compliance_review":
      return institution && holds(ms, ["institution_compliance"], org) ? ["approve", "return"] : [];
    case "editing":
      return holdsAbc(ms, ABC_EDITOR_ROLES) ? ["save", "return", "release"] : [];
    default:
      return [];
  }
}

export function can(
  ms: readonly Membership[],
  article: ArticleRef,
  version: VersionRef,
  action: WorkflowAction,
): boolean {
  return allowedActions(ms, article, version).includes(action);
}

/** Where an action leads, or null when it doesn't apply in this state. */
export function nextState(
  type: ArticleType,
  state: VersionState,
  action: WorkflowAction,
): VersionState | null {
  if (action === "submit" && state === "draft") {
    // abcfinance and independent-expert articles skip the institution steps (04.2).
    return type === "institution" ? "in_approval" : "editing";
  }
  if (action === "approve") {
    if (state === "in_approval") return "compliance_review";
    if (state === "compliance_review") return "editing";
  }
  if (action === "return" && ["in_approval", "compliance_review", "editing"].includes(state)) {
    return "draft";
  }
  if (action === "release" && state === "editing") return "with_publisher";
  return null;
}

export type SubmitProblem = "headline_required" | "body_too_short";

/** A draft can be submitted with a headline and at least 20 characters of body. */
export function validateSubmit(version: { headline: string; body: string }): SubmitProblem[] {
  const problems: SubmitProblem[] = [];
  if (!version.headline.trim()) problems.push("headline_required");
  if (version.body.trim().length < MIN_SUBMIT_BODY) problems.push("body_too_short");
  return problems;
}

/** Returning an article always needs a comment saying why. */
export function returnCommentOk(comment: string | null | undefined): boolean {
  return (comment ?? "").trim().length > 0;
}

/** Is the next step this person's? (Drafts count for their authors.) */
export function isYourTurn(
  ms: readonly Membership[],
  article: ArticleRef,
  version: VersionRef,
): boolean {
  return allowedActions(ms, article, version).some(
    (a) => a !== "save" || version.state === "draft",
  );
}

/** Institution roles that see every article of their institution (they review or manage). */
const INSTITUTION_WIDE: readonly Role[] = [
  "institution_approver",
  "institution_compliance",
  "institution_account_admin",
];

/** An article as visibility needs it: whose it is, and who filed it. */
export type ViewRef = ArticleRef & { createdById: string | null };

/**
 * Who sees an article in the writing area (04.1, D45). abcfinance's editors see all; an
 * institution's approvers, compliance and account admins see their institution's; writers
 * (institution and abcfinance) see only the articles they filed. Publisher users see none here.
 */
export function canView(ms: readonly Membership[], article: ViewRef, userId: string): boolean {
  if (holdsAbc(ms, ABC_EDITOR_ROLES)) return true;
  if (article.type === "institution" && holds(ms, INSTITUTION_WIDE, article.organisationId)) {
    return true;
  }
  const writes =
    article.type === "institution"
      ? holds(ms, ["institution_writer"], article.organisationId)
      : holdsAbc(ms, ["abcfinance_writer"]);
  return writes && article.createdById === userId;
}

/** Who may start new articles: institution authors, and abcfinance writers and editors. */
export function canCreate(ms: readonly Membership[]): boolean {
  return holds(ms, INSTITUTION_AUTHORS) || holdsAbc(ms, ABC_AUTHORS);
}

export function canAddLanguage(ms: readonly Membership[], article: ArticleRef): boolean {
  return isAuthorSide(ms, article);
}

/** Before the first release the slug may still change (D23, D44). */
export function isBeforeRelease(masterStates: readonly VersionState[]): boolean {
  return masterStates.every((s) =>
    ["draft", "in_approval", "compliance_review", "editing"].includes(s),
  );
}

/** Only abcfinance's editors set the web address, and only before the first release (D44). */
export function canSetSlug(
  ms: readonly Membership[],
  masterStates: readonly VersionState[],
): boolean {
  return holdsAbc(ms, ABC_EDITOR_ROLES) && isBeforeRelease(masterStates);
}

/**
 * What a person may file a new article as (D42): themselves for each institution they write for,
 * and, for abcfinance staff, themselves (an abcfinance article) or an independent expert.
 */
export type AuthorChoice =
  | { kind: "self"; type: "institution"; organisationId: string }
  | { kind: "self"; type: "abcfinance" }
  | { kind: "expert" };

export function authorChoices(ms: readonly Membership[]): AuthorChoice[] {
  const orgs = [
    ...new Set(
      ms
        .filter((m) => m.organisationType === "institution" && INSTITUTION_AUTHORS.includes(m.role))
        .map((m) => m.organisationId),
    ),
  ];
  const choices: AuthorChoice[] = orgs.map((organisationId) => ({
    kind: "self",
    type: "institution",
    organisationId,
  }));
  if (holdsAbc(ms, ABC_AUTHORS))
    choices.push({ kind: "self", type: "abcfinance" }, { kind: "expert" });
  return choices;
}
