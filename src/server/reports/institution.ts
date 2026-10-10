import { and, eq, gte, isNull, lte, or, sql } from "drizzle-orm";
import { db, schema } from "@/server/db/client";
import { CALCULATORS } from "@/domain/calc/catalog";
import { percent } from "@/domain/csv";
import { LEAD_STATUSES, qualityReport, type LeadStatus } from "@/domain/leads";
import {
  allPapers,
  inMonth,
  LANGUAGE_LABELS,
  query,
  sumOf,
  type Month,
  type ReportResult,
  type Row,
} from "./types";

/** An institution's own reports (04.9): its articles, its leads, its calculator uses. */

const READS = [
  { key: "views", label: "Views", kind: "number" },
  { key: "engaged", label: "Engaged reads", kind: "number" },
  { key: "rate", label: "Engaged rate (%)", kind: "percent" },
  { key: "leads", label: "Leads", kind: "number" },
] as const;

function withRate(row: Row): Row {
  return { ...row, rate: percent(Number(row.engaged), Number(row.views)) };
}

function totalsOf(rows: Row[], label: Row): Row {
  const views = sumOf(rows, "views");
  const engaged = sumOf(rows, "engaged");
  return { ...label, views, engaged, rate: percent(engaged, views), leads: sumOf(rows, "leads") };
}

const byViews = (a: Row, b: Row) =>
  Number(b.views) - Number(a.views) || String(a.name).localeCompare(String(b.name));

async function articles(orgId: string, m: Month): Promise<ReportResult> {
  const reads = await query<{ id: string; headline: string; views: number; engaged: number }>(sql`
    SELECT a.id,
      (array_agg(v.headline ORDER BY (v.language = a.master_language) DESC, v.created_at))[1] AS headline,
      COALESCE(SUM(ps.views), 0)::int AS views,
      COALESCE(SUM(ps.engaged_reads), 0)::int AS engaged
    FROM articles a
    JOIN article_versions v ON v.article_id = a.id AND v.tenant_id IS NOT NULL
    LEFT JOIN page_stats ps ON ps.version_id = v.id
      AND ps.date BETWEEN ${m.first}::date AND ${m.last}::date
    WHERE a.organisation_id = ${orgId}
    GROUP BY a.id`);
  const leads = await query<{ article_id: string; n: number }>(sql`
    SELECT v.article_id, count(*)::int AS n
    FROM leads l JOIN article_versions v ON v.id = l.source_version_id
    WHERE l.sponsor_org_id = ${orgId} AND ${inMonth(sql`l.created_at`, m)}
    GROUP BY v.article_id`);
  const leadsBy = new Map(leads.map((l) => [l.article_id, l.n]));
  const rows = reads
    .map((r) =>
      withRate({
        name: r.headline,
        views: r.views,
        engaged: r.engaged,
        leads: leadsBy.get(r.id) ?? 0,
      }),
    )
    .sort(byViews);
  return {
    sections: [
      {
        columns: [{ key: "name", label: "Article", kind: "text" }, ...READS],
        rows,
        totals: rows.length ? totalsOf(rows, { name: "Total" }) : undefined,
        empty: "None of your articles has been sent to a newspaper yet.",
      },
    ],
  };
}

async function newspapers(orgId: string, m: Month): Promise<ReportResult> {
  const [papers, reads, leads, copies] = await Promise.all([
    allPapers(),
    query<{ tenant_id: string; views: number; engaged: number }>(sql`
      SELECT ps.tenant_id, SUM(ps.views)::int AS views, SUM(ps.engaged_reads)::int AS engaged
      FROM page_stats ps
      JOIN article_versions v ON v.id = ps.version_id
      JOIN articles a ON a.id = v.article_id
      WHERE a.organisation_id = ${orgId}
        AND ps.date BETWEEN ${m.first}::date AND ${m.last}::date
      GROUP BY ps.tenant_id`),
    query<{ tenant_id: string; n: number }>(sql`
      SELECT tenant_id, count(*)::int AS n FROM leads
      WHERE sponsor_org_id = ${orgId} AND ${inMonth(sql`created_at`, m)}
      GROUP BY tenant_id`),
    query<{ tenant_id: string }>(sql`
      SELECT DISTINCT v.tenant_id FROM article_versions v
      JOIN articles a ON a.id = v.article_id
      WHERE a.organisation_id = ${orgId} AND v.tenant_id IS NOT NULL`),
  ]);
  const readsBy = new Map(reads.map((r) => [r.tenant_id, r]));
  const leadsBy = new Map(leads.map((l) => [l.tenant_id, l.n]));
  const shown = new Set([...copies.map((c) => c.tenant_id), ...leadsBy.keys()]);
  const rows = papers
    .filter((p) => shown.has(p.id))
    .map((p) =>
      withRate({
        name: p.name,
        views: readsBy.get(p.id)?.views ?? 0,
        engaged: readsBy.get(p.id)?.engaged ?? 0,
        leads: leadsBy.get(p.id) ?? 0,
      }),
    )
    .sort(byViews);
  return {
    sections: [
      {
        columns: [{ key: "name", label: "Newspaper", kind: "text" }, ...READS],
        rows,
        totals: rows.length ? totalsOf(rows, { name: "Total" }) : undefined,
        empty: "Nothing on any newspaper yet.",
      },
    ],
  };
}

async function languages(orgId: string, m: Month): Promise<ReportResult> {
  const [reads, leads] = await Promise.all([
    query<{ language: string; views: number; engaged: number }>(sql`
      SELECT ps.language, SUM(ps.views)::int AS views, SUM(ps.engaged_reads)::int AS engaged
      FROM page_stats ps
      JOIN article_versions v ON v.id = ps.version_id
      JOIN articles a ON a.id = v.article_id
      WHERE a.organisation_id = ${orgId}
        AND ps.date BETWEEN ${m.first}::date AND ${m.last}::date
      GROUP BY ps.language`),
    query<{ language: string; n: number }>(sql`
      SELECT language, count(*)::int AS n FROM leads
      WHERE sponsor_org_id = ${orgId} AND ${inMonth(sql`created_at`, m)}
      GROUP BY language`),
  ]);
  const languages = [
    ...new Set([...reads.map((r) => r.language), ...leads.map((l) => l.language)]),
  ];
  const rows = languages
    .map((lang) => {
      const r = reads.find((x) => x.language === lang);
      return withRate({
        name: LANGUAGE_LABELS[lang] ?? lang,
        views: r?.views ?? 0,
        engaged: r?.engaged ?? 0,
        leads: leads.find((x) => x.language === lang)?.n ?? 0,
      });
    })
    .sort(byViews);
  return {
    sections: [
      {
        columns: [{ key: "name", label: "Language", kind: "text" }, ...READS],
        rows,
        totals: rows.length ? totalsOf(rows, { name: "Total" }) : undefined,
        empty: "No reads or leads this month.",
      },
    ],
  };
}

async function calculators(orgId: string, m: Month): Promise<ReportResult> {
  const [papers, uses] = await Promise.all([
    allPapers(),
    query<{ tenant_id: string; calculator_slug: string; uses: number }>(sql`
      SELECT tenant_id, calculator_slug, SUM(uses)::int AS uses FROM calculator_uses
      WHERE sponsor_org_id = ${orgId} AND date BETWEEN ${m.first}::date AND ${m.last}::date
      GROUP BY tenant_id, calculator_slug`),
  ]);
  const paperName = new Map(papers.map((p) => [p.id, p.name]));
  const calcName = new Map(CALCULATORS.map((c) => [c.slug, c.name.en]));
  const rows: Row[] = uses
    .map((u) => ({
      calculator: calcName.get(u.calculator_slug) ?? u.calculator_slug,
      paper: paperName.get(u.tenant_id) ?? "",
      uses: u.uses,
    }))
    .sort((a, b) => b.uses - a.uses || a.calculator.localeCompare(b.calculator));
  return {
    sections: [
      {
        columns: [
          { key: "calculator", label: "Calculator", kind: "text" },
          { key: "paper", label: "Newspaper", kind: "text" },
          { key: "uses", label: "Uses", kind: "number" },
        ],
        rows,
        totals: rows.length
          ? { calculator: "Total", paper: "", uses: sumOf(rows, "uses") }
          : undefined,
        empty: "No calculator uses credited to you this month.",
      },
    ],
  };
}

const STATUS_LABELS: Record<LeadStatus, string> = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  junk: "Junk",
};

async function leads(orgId: string, m: Month): Promise<ReportResult> {
  const counts = await query<{ status: LeadStatus; n: number }>(sql`
    SELECT status, count(*)::int AS n FROM leads
    WHERE sponsor_org_id = ${orgId} AND ${inMonth(sql`created_at`, m)}
    GROUP BY status`);
  const by = Object.fromEntries(counts.map((c) => [c.status, c.n])) as Partial<
    Record<LeadStatus, number>
  >;
  const q = qualityReport(by);
  const share = (x: number) => Math.round(x * 1000) / 10;
  return {
    sections: [
      {
        title: "By status",
        columns: [
          { key: "status", label: "Status", kind: "text" },
          { key: "leads", label: "Leads", kind: "number" },
        ],
        rows: LEAD_STATUSES.map((s) => ({ status: STATUS_LABELS[s], leads: by[s] ?? 0 })),
        totals: { status: "Total", leads: q.total },
        empty: "",
      },
      {
        title: "Quality",
        columns: [
          { key: "measure", label: "Measure", kind: "text" },
          { key: "share", label: "Share (%)", kind: "percent" },
        ],
        rows: [
          { measure: "Worked (no longer new)", share: share(q.workedShare) },
          {
            measure: "Qualified (of worked leads that aren't junk)",
            share: share(q.qualifiedShare),
          },
          { measure: "Junk (of all leads)", share: share(q.junkShare) },
        ],
        empty: "",
      },
    ],
  };
}

async function plan(orgId: string, m: Month): Promise<ReportResult> {
  const p = schema.plans;
  const plans = await db()
    .select()
    .from(p)
    .where(
      and(
        eq(p.sponsorOrgId, orgId),
        lte(p.startsOn, m.last),
        or(isNull(p.endsOn), gte(p.endsOn, m.first)),
      ),
    )
    .orderBy(p.startsOn);
  const [published] = await query<{ n: number }>(sql`
    SELECT count(*)::int AS n FROM (
      SELECT a.id, MIN(v.published_at) AS first_published
      FROM articles a JOIN article_versions v ON v.article_id = a.id
      WHERE a.organisation_id = ${orgId} AND v.tenant_id IS NOT NULL AND v.published_at IS NOT NULL
      GROUP BY a.id
    ) firsts
    WHERE ${inMonth(sql`first_published`, m)}`);
  const rows: Row[] = [];
  for (const plan of plans) {
    const [papers] = await query<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM plan_tenants WHERE plan_id = ${plan.id}`,
    );
    rows.push({
      plan: plan.name,
      billing: plan.billing === "monthly" ? "Monthly" : "Annual, prepaid",
      papers: papers!.n,
      papersAllowed: plan.newspapersAllowed,
      articles: published!.n,
      articlesAllowed: plan.articlesPerMonth,
    });
  }
  return {
    sections: [
      {
        columns: [
          { key: "plan", label: "Plan", kind: "text" },
          { key: "billing", label: "Billing", kind: "text" },
          { key: "papers", label: "Newspapers on plan", kind: "number" },
          { key: "papersAllowed", label: "Newspapers allowed", kind: "number" },
          { key: "articles", label: "Articles first published this month", kind: "number" },
          { key: "articlesAllowed", label: "Articles allowed per month", kind: "number" },
        ],
        rows,
        empty: "No plan was active this month.",
      },
    ],
    note: "The monthly article allowance is reported, not enforced, in phase 1.",
  };
}

export const INSTITUTION_REPORTS = {
  "inst-articles": articles,
  "inst-newspapers": newspapers,
  "inst-languages": languages,
  "inst-calculators": calculators,
  "inst-leads": leads,
  "inst-plan": plan,
} as const;
