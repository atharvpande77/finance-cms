/**
 * The monthly reports (04.9, 05.2): which exist, which set each belongs to, and who may open
 * them. The money reports come with revenue sharing (M7) and the widget reports with the
 * widgets (M8), D47.
 */
import { can, type Membership } from "./permissions";

/** inst: one institution's own data; pub: one newspaper's; abc: abcfinance's, all papers. */
export type ReportSet = "inst" | "pub" | "abc";

export type ReportKey =
  | "inst-articles"
  | "inst-newspapers"
  | "inst-languages"
  | "inst-calculators"
  | "inst-leads"
  | "inst-plan"
  | "pub-summary"
  | "pub-traffic"
  | "pub-top-pages"
  | "pub-approvals"
  | "abc-articles"
  | "abc-seo";

export type ReportDef = { key: ReportKey; set: ReportSet; title: string; description: string };

export const REPORTS: readonly ReportDef[] = [
  {
    key: "inst-articles",
    set: "inst",
    title: "Articles",
    description: "Reads per article on every newspaper, and the leads each brought in.",
  },
  {
    key: "inst-newspapers",
    set: "inst",
    title: "Newspapers",
    description: "Reads of your articles, and your leads, by newspaper.",
  },
  {
    key: "inst-languages",
    set: "inst",
    title: "Languages",
    description: "Reads of your articles, and your leads, by language.",
  },
  {
    key: "inst-calculators",
    set: "inst",
    title: "Calculators",
    description: "Calculator uses credited to you: on your articles, and where your brand showed.",
  },
  {
    key: "inst-leads",
    set: "inst",
    title: "Leads",
    description: "Leads received this month by status, and their quality.",
  },
  {
    key: "inst-plan",
    set: "inst",
    title: "Plan usage",
    description:
      "Newspapers on your plan and articles published this month, against what the plan allows.",
  },
  {
    key: "pub-summary",
    set: "pub",
    title: "Summary",
    description: "The month at a glance.",
  },
  {
    key: "pub-traffic",
    set: "pub",
    title: "Traffic by page type",
    description: "Views and engaged reads by the kind of page.",
  },
  {
    key: "pub-top-pages",
    set: "pub",
    title: "Top pages",
    description: "The 25 most viewed pages this month.",
  },
  {
    key: "pub-approvals",
    set: "pub",
    title: "Approvals",
    description:
      "Everything published this month: approved by your editor, or published automatically after the review window.",
  },
  {
    key: "abc-articles",
    set: "abc",
    title: "Top articles",
    description: "The 25 most read articles across every newspaper.",
  },
  {
    key: "abc-seo",
    set: "abc",
    title: "SEO health",
    description: "Visibility and search traffic per newspaper, and the pages that need attention.",
  },
];

export const SET_TITLES: Record<ReportSet, string> = {
  inst: "Institution",
  pub: "Newspaper",
  abc: "abcfinance",
};

export function reportByKey(key: string | null | undefined): ReportDef | undefined {
  return REPORTS.find((r) => r.key === key);
}

/**
 * The report sets a person may open somewhere (04.9): an institution's account admin its own
 * institution's; a paper's admin that paper's; super admin and desk manager every paper's and
 * abcfinance's, plus any institution's, read-only (D49). Writers, approvers and editors: none.
 */
export function reportSetsFor(ms: readonly Membership[]): ReportSet[] {
  const sets: ReportSet[] = [];
  if (can(ms, "reports.institution")) sets.push("inst");
  if (can(ms, "reports.publisher")) sets.push("pub");
  if (can(ms, "reports.abcfinance")) sets.push("abc");
  return sets;
}

/**
 * May the person open a report of `set` for this scope? `scopeOrgId` is the institution (inst)
 * or the paper's publisher organisation (pub); abcfinance reports have none.
 */
export function canOpenReport(
  ms: readonly Membership[],
  set: ReportSet,
  scopeOrgId?: string,
): boolean {
  switch (set) {
    case "inst":
      return scopeOrgId !== undefined && can(ms, "reports.institution", scopeOrgId);
    case "pub":
      return scopeOrgId !== undefined && can(ms, "reports.publisher", scopeOrgId);
    case "abc":
      return can(ms, "reports.abcfinance");
  }
}
