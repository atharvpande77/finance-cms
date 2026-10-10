import { sql } from "drizzle-orm";
import { percent } from "@/domain/csv";
import {
  ARTICLE_TYPE_LABELS,
  inMonth,
  istDateTime,
  LANGUAGE_LABELS,
  query,
  sumOf,
  type Month,
  type ReportResult,
  type Row,
} from "./types";

/** A newspaper's reports (04.9). Earnings, the pool and payouts come in M7; widgets in M8 (D47). */

async function summary(tenantId: string, m: Month): Promise<ReportResult> {
  const [[reads], copies] = await Promise.all([
    query<{ views: number; engaged: number; search: number; mobile: number }>(sql`
      SELECT COALESCE(SUM(views), 0)::int AS views, COALESCE(SUM(engaged_reads), 0)::int AS engaged,
        COALESCE(SUM(search_views), 0)::int AS search, COALESCE(SUM(mobile_views), 0)::int AS mobile
      FROM page_stats
      WHERE tenant_id = ${tenantId} AND date BETWEEN ${m.first}::date AND ${m.last}::date`),
    query<{ approval_type: "explicit" | "deemed" | null; n: number }>(sql`
      SELECT approval_type, count(*)::int AS n FROM article_versions
      WHERE tenant_id = ${tenantId} AND published_at IS NOT NULL AND ${inMonth(sql`published_at`, m)}
      GROUP BY approval_type`),
  ]);
  const r = reads!;
  const explicit = copies.find((c) => c.approval_type === "explicit")?.n ?? 0;
  const deemed = copies.find((c) => c.approval_type === "deemed")?.n ?? 0;
  const published = sumOf(copies as unknown as Row[], "n");
  return {
    sections: [
      {
        columns: [
          { key: "measure", label: "Measure", kind: "text" },
          { key: "count", label: "Count", kind: "number" },
          { key: "share", label: "Share (%)", kind: "percent" },
        ],
        rows: [
          { measure: "Views", count: r.views, share: null },
          { measure: "Engaged reads", count: r.engaged, share: percent(r.engaged, r.views) },
          {
            measure: "Views from search engines",
            count: r.search,
            share: percent(r.search, r.views),
          },
          { measure: "Views on phones", count: r.mobile, share: percent(r.mobile, r.views) },
          { measure: "Articles published", count: published, share: null },
          {
            measure: "Approved by your editor",
            count: explicit,
            share: percent(explicit, published),
          },
          { measure: "Published automatically", count: deemed, share: percent(deemed, published) },
        ],
        empty: "",
      },
    ],
    note: "Earnings appear here once monthly statements start.",
  };
}

const PAGE_TYPES = [
  ["institution", "Institution articles"],
  ["abcfinance", "abcfinance articles"],
  ["independent", "Independent expert articles"],
  ["calculator", "Calculators"],
  ["home_section", "Home and sections"],
  ["other", "Other pages"],
] as const;

async function traffic(tenantId: string, m: Month): Promise<ReportResult> {
  const rows = await query<{ type: string; views: number; engaged: number }>(sql`
    SELECT CASE
        WHEN a.type IS NOT NULL THEN a.type::text
        WHEN ps.kind IN ('home', 'section') THEN 'home_section'
        WHEN ps.kind = 'calculator' THEN 'calculator'
        ELSE 'other' END AS type,
      SUM(ps.views)::int AS views, SUM(ps.engaged_reads)::int AS engaged
    FROM page_stats ps
    LEFT JOIN article_versions v ON v.id = ps.version_id
    LEFT JOIN articles a ON a.id = v.article_id
    WHERE ps.tenant_id = ${tenantId} AND ps.date BETWEEN ${m.first}::date AND ${m.last}::date
    GROUP BY 1`);
  const total = sumOf(rows as unknown as Row[], "views");
  const table: Row[] = PAGE_TYPES.map(([key, label]) => {
    const r = rows.find((x) => x.type === key);
    const views = r?.views ?? 0;
    const engaged = r?.engaged ?? 0;
    return {
      type: label,
      views,
      engaged,
      rate: percent(engaged, views),
      share: percent(views, total),
    };
  });
  const engaged = sumOf(table, "engaged");
  return {
    sections: [
      {
        columns: [
          { key: "type", label: "Page type", kind: "text" },
          { key: "views", label: "Views", kind: "number" },
          { key: "engaged", label: "Engaged reads", kind: "number" },
          { key: "rate", label: "Engaged rate (%)", kind: "percent" },
          { key: "share", label: "Share of views (%)", kind: "percent" },
        ],
        rows: table,
        totals: {
          type: "Total",
          views: total,
          engaged,
          rate: percent(engaged, total),
          share: total ? 100 : 0,
        },
        empty: "",
      },
    ],
  };
}

const KIND_LABELS: Record<string, string> = {
  calculator: "Calculator",
  home: "Home",
  section: "Section",
  other: "Other page",
};

async function topPages(tenantId: string, m: Month): Promise<ReportResult> {
  const rows = await query<{
    page_path: string;
    headline: string | null;
    type: string | null;
    kind: string;
    views: number;
    engaged: number;
  }>(sql`
    SELECT ps.page_path, MAX(v.headline) AS headline, MAX(a.type::text) AS type, MAX(ps.kind) AS kind,
      SUM(ps.views)::int AS views, SUM(ps.engaged_reads)::int AS engaged
    FROM page_stats ps
    LEFT JOIN article_versions v ON v.id = ps.version_id
    LEFT JOIN articles a ON a.id = v.article_id
    WHERE ps.tenant_id = ${tenantId} AND ps.date BETWEEN ${m.first}::date AND ${m.last}::date
    GROUP BY ps.page_path
    ORDER BY views DESC, ps.page_path
    LIMIT 25`);
  return {
    sections: [
      {
        columns: [
          { key: "path", label: "Page", kind: "text" },
          { key: "title", label: "Headline", kind: "text" },
          { key: "type", label: "Type", kind: "text" },
          { key: "views", label: "Views", kind: "number" },
          { key: "engaged", label: "Engaged reads", kind: "number" },
          { key: "rate", label: "Engaged rate (%)", kind: "percent" },
        ],
        rows: rows.map((r) => ({
          path: r.page_path,
          title: r.headline ?? "",
          type: r.type ? ARTICLE_TYPE_LABELS[r.type]! : (KIND_LABELS[r.kind] ?? r.kind),
          views: r.views,
          engaged: r.engaged,
          rate: percent(r.engaged, r.views),
        })),
        empty: "No views this month.",
      },
    ],
  };
}

const STATE_LABELS: Record<string, string> = {
  published: "Live",
  unpublished: "Taken down",
};

async function approvals(tenantId: string, m: Month): Promise<ReportResult> {
  const rows = await query<{
    headline: string;
    language: string;
    org: string;
    type: string;
    approval_type: "explicit" | "deemed" | null;
    published_at: string;
    state: string;
    decided_by: string | null;
  }>(sql`
    SELECT v.headline, v.language, o.name AS org, a.type::text AS type, v.approval_type,
      v.published_at, v.state::text AS state,
      (SELECT COALESCE(u.name, e.actor_label) FROM workflow_events e
        LEFT JOIN users u ON u.id = e.user_id
        WHERE e.version_id = v.id AND e.action IN ('approve', 'deemed_approve')
        ORDER BY e.created_at DESC LIMIT 1) AS decided_by
    FROM article_versions v
    JOIN articles a ON a.id = v.article_id
    JOIN organisations o ON o.id = a.organisation_id
    WHERE v.tenant_id = ${tenantId} AND v.published_at IS NOT NULL AND ${inMonth(sql`v.published_at`, m)}
    ORDER BY v.published_at, v.headline`);
  const how = (t: string | null) =>
    t === "explicit" ? "Approved by your editor" : "Published automatically";
  const table: Row[] = rows.map((r) => ({
    published: istDateTime(r.published_at),
    headline: r.headline,
    language: LANGUAGE_LABELS[r.language] ?? r.language,
    from: r.type === "institution" ? r.org : ARTICLE_TYPE_LABELS[r.type]!,
    how: how(r.approval_type),
    by: r.decided_by ?? (r.approval_type === "deemed" ? "deemed approval (system)" : ""),
    now: STATE_LABELS[r.state] ?? r.state,
  }));
  const explicit = rows.filter((r) => r.approval_type === "explicit").length;
  return {
    sections: [
      {
        title: "Totals",
        columns: [
          { key: "how", label: "How it was published", kind: "text" },
          { key: "n", label: "Articles", kind: "number" },
        ],
        rows: [
          { how: "Approved by your editor", n: explicit },
          { how: "Published automatically after the review window", n: rows.length - explicit },
        ],
        totals: { how: "Total", n: rows.length },
        empty: "",
      },
      {
        title: "Every article",
        columns: [
          { key: "published", label: "Published (India time)", kind: "text" },
          { key: "headline", label: "Headline", kind: "text" },
          { key: "language", label: "Language", kind: "text" },
          { key: "from", label: "From", kind: "text" },
          { key: "how", label: "How", kind: "text" },
          { key: "by", label: "Decided by", kind: "text" },
          { key: "now", label: "Now", kind: "text" },
        ],
        rows: table,
        empty: "Nothing was published this month.",
      },
    ],
  };
}

export const PUBLISHER_REPORTS = {
  "pub-summary": summary,
  "pub-traffic": traffic,
  "pub-top-pages": topPages,
  "pub-approvals": approvals,
} as const;
