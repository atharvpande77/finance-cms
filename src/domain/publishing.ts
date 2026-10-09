import { can, type Membership } from "./permissions";
import type { ArticleType, VersionState } from "./workflow";

/**
 * Releasing to newspapers and the papers' decisions (04.3): when a copy needs an explicit
 * approval, when it publishes itself, and what each paper's editor may do to it.
 */

export type ExplicitReason = "first_articles" | "flagged" | "held_section";

/** The first this-many distinct articles from an institution on a paper need explicit approval. */
export const FIRST_ARTICLES = 3;

export const EXPLICIT_REASON_LABELS: Record<ExplicitReason, string> = {
  first_articles: `One of the first ${FIRST_ARTICLES} articles from this institution on this paper`,
  flagged: "The automated checks flagged it",
  held_section: "The paper approves every article in this section itself",
};

/**
 * Why this paper's copy needs an explicit approval; empty means deemed approval applies.
 * `publishedFromInstitution` counts the institution's *other* articles with at least one
 * published version on the paper: fewer than three means this one is among the first three.
 */
export function explicitReasons(input: {
  articleType: ArticleType;
  publishedFromInstitution: number;
  flagged: boolean;
  sectionSlug: string;
  heldSectionSlugs: readonly string[];
}): ExplicitReason[] {
  const reasons: ExplicitReason[] = [];
  if (input.articleType === "institution" && input.publishedFromInstitution < FIRST_ARTICLES) {
    reasons.push("first_articles");
  }
  if (input.flagged) reasons.push("flagged");
  if (input.heldSectionSlugs.includes(input.sectionSlug)) reasons.push("held_section");
  return reasons;
}

const LANGUAGE_NAMES: Record<string, string> = { en: "English", mr: "Marathi", hi: "Hindi" };

export type ReleasePlan =
  { action: "create"; reason: null } | { action: "skip" | "refuse"; reason: string };

/** What a release does for one paper: a new copy, nothing (it has one), or a refusal. */
export function releasePlan(
  paper: { name: string; languages: readonly string[] },
  language: string,
  alreadyHas: boolean,
): ReleasePlan {
  if (!paper.languages.includes(language)) {
    return {
      action: "refuse",
      reason: `${paper.name} doesn't publish ${LANGUAGE_NAMES[language] ?? language}`,
    };
  }
  if (alreadyHas) return { action: "skip", reason: "Already has this version" };
  return { action: "create", reason: null };
}

/** The end of the veto window, counted from release; none for a copy needing explicit approval. */
export function autoApproveAt(
  releasedAt: Date,
  hours: number,
  requiresExplicit: boolean,
): Date | null {
  return requiresExplicit ? null : new Date(releasedAt.getTime() + hours * 3_600_000);
}

export type CopyAction = "approve" | "hold" | "take_down";
export type CopyRef = {
  state: VersionState;
  heldAt: Date | null;
  /** The publisher organisation that owns the copy's paper. */
  publisherOrgId: string;
};

/**
 * What this person may do to a paper's copy. Only that paper's editors decide; its admins and
 * abcfinance staff only look. Nobody edits a copy's text.
 */
export function copyActions(ms: readonly Membership[], copy: CopyRef): CopyAction[] {
  if (!can(ms, "copy.decide", copy.publisherOrgId)) return [];
  switch (copy.state) {
    case "with_publisher":
      return copy.heldAt ? ["approve", "take_down"] : ["approve", "hold", "take_down"];
    case "published":
      return ["take_down"];
    default:
      return [];
  }
}

/** Who sees a paper's queue and copies: its editors and admins, and abcfinance staff (D28). */
export function canSeeQueue(ms: readonly Membership[], publisherOrgId: string): boolean {
  return can(ms, "copy.view", publisherOrgId) || can(ms, "copy.oversee");
}

/** Hold and take-down always need a reason. */
export function needsReason(action: CopyAction): boolean {
  return action !== "approve";
}

/** Is this copy due for deemed approval? */
export function isDue(
  copy: {
    state: VersionState;
    heldAt: Date | null;
    requiresExplicit: boolean;
    autoApproveAt: Date | null;
  },
  now: Date,
): boolean {
  return (
    copy.state === "with_publisher" &&
    copy.heldAt === null &&
    !copy.requiresExplicit &&
    copy.autoApproveAt !== null &&
    copy.autoApproveAt.getTime() <= now.getTime()
  );
}

/** A copy's state in the words the papers use. */
export function copyStatus(copy: {
  state: VersionState;
  heldAt: Date | null;
}): "waiting" | "held" | "published" | "taken_down" {
  if (copy.state === "published") return "published";
  if (copy.state === "unpublished") return "taken_down";
  return copy.heldAt ? "held" : "waiting";
}

export const COPY_STATUS_LABELS = {
  waiting: "Waiting",
  held: "Held",
  published: "Published",
  taken_down: "Taken down",
} as const;
