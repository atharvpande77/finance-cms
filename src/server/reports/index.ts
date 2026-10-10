import { asc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/server/db/client";
import { audit } from "@/server/audit";
import type { Actor } from "@/server/articles/service";
import { can, organisationsFor, type Membership } from "@/domain/permissions";
import {
  canOpenReport,
  REPORTS,
  reportByKey,
  reportSetsFor,
  type ReportDef,
  type ReportSet,
} from "@/domain/reports";
import { toCsv } from "@/domain/csv";
import { indianMonth, monthBounds, parseMonthOr } from "@/domain/time";
import { INSTITUTION_REPORTS } from "./institution";
import { PUBLISHER_REPORTS } from "./publisher";
import { ABCFINANCE_REPORTS } from "./abcfinance";
import { allPapers, type Month, type PaperInfo, type ReportResult } from "./types";

export type { ReportResult, ReportSection, Column, Cell } from "./types";

/** The reports a person may open (04.9), and where. */
export type ReportScopes = {
  sets: ReportSet[];
  institutions: { id: string; name: string; slug: string }[];
  papers: PaperInfo[];
};

const NO_ID = "00000000-0000-0000-0000-000000000000";

export async function reportScopes(ms: readonly Membership[]): Promise<ReportScopes> {
  const sets = reportSetsFor(ms);
  const o = schema.organisations;
  let institutions: ReportScopes["institutions"] = [];
  if (sets.includes("inst")) {
    // abcfinance staff read any institution's reports (D49); an account admin only their own.
    const staff = can(ms, "reports.abcfinance");
    const ids = organisationsFor(ms, "reports.institution");
    institutions = await db()
      .select({ id: o.id, name: o.name, slug: o.slug })
      .from(o)
      .where(staff ? eq(o.type, "institution") : inArray(o.id, ids.length ? ids : [NO_ID]))
      .orderBy(asc(o.name));
  }
  const papers = sets.includes("pub")
    ? (await allPapers()).filter((p) => can(ms, "reports.publisher", p.publisherOrgId))
    : [];
  return {
    sets: sets.filter((s) => s !== "inst" || institutions.length > 0),
    institutions,
    papers,
  };
}

/** The month to show: "YYYY-MM", the current Indian month when missing, invalid or future. */
export function reportMonth(value: string | null | undefined, now = new Date()): Month {
  let month = parseMonthOr(value, now);
  if (month > indianMonth(now)) month = indianMonth(now);
  return { month, ...monthBounds(month) };
}

export type ReportRequest = {
  key: string | null | undefined;
  /** Institution id (inst) or paper slug (pub); the first allowed when missing. */
  scope: string | null | undefined;
  month: string | null | undefined;
};

export type OpenReport = {
  def: ReportDef;
  month: Month;
  /** The institution or paper the report is about, or null for abcfinance's. */
  scope: { id: string; name: string; slug: string } | null;
  result: ReportResult;
};

/**
 * Runs one report for a person. Null when they may not open it there: another institution's
 * or paper's, or a set they have no role for (E2E-AN-30, 31, 35, 39). A missing key opens the
 * first report they may see.
 */
export async function runReport(
  actor: Pick<Actor, "memberships">,
  req: ReportRequest,
  scopes?: ReportScopes,
): Promise<OpenReport | null> {
  const s = scopes ?? (await reportScopes(actor.memberships));
  const def = req.key ? reportByKey(req.key) : REPORTS.find((r) => s.sets.includes(r.set));
  if (!def || !s.sets.includes(def.set)) return null;
  const month = reportMonth(req.month);

  if (def.set === "inst") {
    const org = req.scope ? s.institutions.find((i) => i.id === req.scope) : s.institutions[0];
    if (!org || !canOpenReport(actor.memberships, "inst", org.id)) return null;
    const run = INSTITUTION_REPORTS[def.key as keyof typeof INSTITUTION_REPORTS];
    return { def, month, scope: org, result: await run(org.id, month) };
  }
  if (def.set === "pub") {
    const paper = req.scope ? s.papers.find((p) => p.slug === req.scope) : s.papers[0];
    if (!paper || !canOpenReport(actor.memberships, "pub", paper.publisherOrgId)) return null;
    const run = PUBLISHER_REPORTS[def.key as keyof typeof PUBLISHER_REPORTS];
    return {
      def,
      month,
      scope: { id: paper.id, name: paper.name, slug: paper.slug },
      result: await run(paper.id, month),
    };
  }
  if (!canOpenReport(actor.memberships, "abc")) return null;
  const run = ABCFINANCE_REPORTS[def.key as keyof typeof ABCFINANCE_REPORTS];
  return { def, month, scope: null, result: await run("", month) };
}

/** The report's tables as CSV (05.2): a title row before each titled table, a blank row between. */
export function reportCsv(result: ReportResult): string {
  const rows: (string | number | null)[][] = [];
  result.sections.forEach((section, i) => {
    if (i > 0) rows.push([]);
    if (section.title) rows.push([section.title]);
    rows.push(section.columns.map((c) => c.label));
    for (const row of section.rows) rows.push(section.columns.map((c) => row[c.key] ?? ""));
    if (section.totals) rows.push(section.columns.map((c) => section.totals![c.key] ?? ""));
  });
  return toCsv(rows);
}

/** The CSV download, audited (05.2). Null when the person may not open the report. */
export async function exportReport(
  actor: Actor,
  req: ReportRequest,
  ip: string,
): Promise<{ csv: string; filename: string } | null> {
  if (!req.key) return null;
  const open = await runReport(actor, req);
  if (!open) return null;
  await audit({
    userId: actor.user.id,
    action: "report.export",
    detail: { report: open.def.key, month: open.month.month, scope: open.scope?.id ?? null },
    ip,
  });
  const scope = open.scope ? `-${open.scope.slug}` : "";
  return {
    csv: reportCsv(open.result),
    filename: `${open.def.key}${scope}-${open.month.month}.csv`,
  };
}
