import { sql } from "drizzle-orm";
import { percent } from "@/domain/csv";
import { indianDate } from "@/domain/time";
import {
  allPapers,
  ARTICLE_TYPE_LABELS,
  istDateTime,
  LANGUAGE_LABELS,
  query,
  type Month,
  type ReportResult,
} from "./types";

/** abcfinance's reports across every newspaper (04.9). Revenue reports come in M7 (D47). */

/** Under this many characters a summary is flagged (D51). */
export const SHORT_SUMMARY = 70;

async function topArticles(m: Month): Promise<ReportResult> {
  const rows = await query<{
    headline: string;
    org: string;
    type: string;
    papers: number;
    views: number;
    engaged: number;
  }>(sql`
    SELECT (array_agg(v.headline ORDER BY (v.language = a.master_language) DESC, v.created_at))[1] AS headline,
      o.name AS org, a.type::text AS type, COUNT(DISTINCT ps.tenant_id)::int AS papers,
      SUM(ps.views)::int AS views, SUM(ps.engaged_reads)::int AS engaged
    FROM page_stats ps
    JOIN article_versions v ON v.id = ps.version_id
    JOIN articles a ON a.id = v.article_id
    JOIN organisations o ON o.id = a.organisation_id
    WHERE ps.date BETWEEN ${m.first}::date AND ${m.last}::date
    GROUP BY a.id, o.name, a.type
    ORDER BY views DESC, headline
    LIMIT 25`);
  return {
    sections: [
      {
        columns: [
          { key: "headline", label: "Article", kind: "text" },
          { key: "from", label: "From", kind: "text" },
          { key: "papers", label: "Newspapers", kind: "number" },
          { key: "views", label: "Views", kind: "number" },
          { key: "engaged", label: "Engaged reads", kind: "number" },
          { key: "rate", label: "Engaged rate (%)", kind: "percent" },
        ],
        rows: rows.map((r) => ({
          headline: r.headline,
          from: r.type === "institution" ? r.org : ARTICLE_TYPE_LABELS[r.type]!,
          papers: r.papers,
          views: r.views,
          engaged: r.engaged,
          rate: percent(r.engaged, r.views),
        })),
        empty: "No article views this month.",
      },
    ],
  };
}

async function seo(m: Month, now = new Date()): Promise<ReportResult> {
  const today = indianDate(now);
  const [papers, traffic, single, overdue, short, unseen] = await Promise.all([
    allPapers(),
    query<{ tenant_id: string; views: number; search: number; engaged: number }>(sql`
      SELECT tenant_id, SUM(views)::int AS views, SUM(search_views)::int AS search,
        SUM(engaged_reads)::int AS engaged
      FROM page_stats WHERE date BETWEEN ${m.first}::date AND ${m.last}::date
      GROUP BY tenant_id`),
    query<{ headline: string; org: string; type: string; language: string; papers: number }>(sql`
      SELECT MAX(v.headline) AS headline, o.name AS org, a.type::text AS type,
        MAX(v.language) AS language, COUNT(DISTINCT v.tenant_id)::int AS papers
      FROM articles a
      JOIN article_versions v ON v.article_id = a.id AND v.tenant_id IS NOT NULL AND v.state = 'published'
      JOIN organisations o ON o.id = a.organisation_id
      GROUP BY a.id, o.name, a.type
      HAVING COUNT(DISTINCT v.language) = 1
      ORDER BY headline`),
    query<{ headline: string; org: string; type: string; review_by: string }>(sql`
      SELECT MAX(v.headline) AS headline, o.name AS org, a.type::text AS type, a.review_by::text AS review_by
      FROM articles a
      JOIN article_versions v ON v.article_id = a.id AND v.tenant_id IS NOT NULL AND v.state = 'published'
      JOIN organisations o ON o.id = a.organisation_id
      WHERE a.review_by < ${today}::date
      GROUP BY a.id, o.name, a.type
      ORDER BY a.review_by, headline`),
    query<{ headline: string; tenant_id: string; language: string; length: number }>(sql`
      SELECT v.headline, v.tenant_id, v.language, char_length(v.summary)::int AS length
      FROM article_versions v
      WHERE v.tenant_id IS NOT NULL AND v.state = 'published' AND char_length(v.summary) < ${SHORT_SUMMARY}
      ORDER BY length, v.headline`),
    query<{ headline: string; tenant_id: string; language: string; published_at: string }>(sql`
      SELECT v.headline, v.tenant_id, v.language, v.published_at
      FROM article_versions v
      WHERE v.tenant_id IS NOT NULL AND v.state = 'published'
        AND NOT EXISTS (
          SELECT 1 FROM page_stats ps WHERE ps.version_id = v.id
            AND ps.date BETWEEN ${m.first}::date AND ${m.last}::date AND ps.views > 0)
      ORDER BY v.published_at, v.headline`),
  ]);
  const paperName = new Map(papers.map((p) => [p.id, p.name]));
  const from = (r: { org: string; type: string }) =>
    r.type === "institution" ? r.org : ARTICLE_TYPE_LABELS[r.type]!;
  const lang = (l: string) => LANGUAGE_LABELS[l] ?? l;
  return {
    sections: [
      {
        title: "Newspapers",
        columns: [
          { key: "paper", label: "Newspaper", kind: "text" },
          { key: "visibility", label: "Visibility", kind: "text" },
          { key: "views", label: "Views", kind: "number" },
          { key: "search", label: "From search (%)", kind: "percent" },
          { key: "rate", label: "Engaged rate (%)", kind: "percent" },
        ],
        rows: papers.map((p) => {
          const t = traffic.find((x) => x.tenant_id === p.id);
          return {
            paper: p.name,
            visibility: p.status === "live" ? "Live: indexed" : "Staging: noindex",
            views: t?.views ?? 0,
            search: percent(t?.search ?? 0, t?.views ?? 0),
            rate: percent(t?.engaged ?? 0, t?.views ?? 0),
          };
        }),
        empty: "",
      },
      {
        title: "Articles in only one language",
        columns: [
          { key: "headline", label: "Article", kind: "text" },
          { key: "from", label: "From", kind: "text" },
          { key: "language", label: "Language", kind: "text" },
          { key: "papers", label: "Newspapers", kind: "number" },
        ],
        rows: single.map((r) => ({
          headline: r.headline,
          from: from(r),
          language: lang(r.language),
          papers: r.papers,
        })),
        empty: "Every live article is in more than one language.",
      },
      {
        title: "Overdue reviews",
        columns: [
          { key: "headline", label: "Article", kind: "text" },
          { key: "from", label: "From", kind: "text" },
          { key: "reviewBy", label: "Review by", kind: "text" },
        ],
        rows: overdue.map((r) => ({ headline: r.headline, from: from(r), reviewBy: r.review_by })),
        empty: "No live article is past its review date.",
      },
      {
        title: `Short summaries (under ${SHORT_SUMMARY} characters)`,
        columns: [
          { key: "headline", label: "Article", kind: "text" },
          { key: "paper", label: "Newspaper", kind: "text" },
          { key: "language", label: "Language", kind: "text" },
          { key: "length", label: "Characters", kind: "number" },
        ],
        rows: short.map((r) => ({
          headline: r.headline,
          paper: paperName.get(r.tenant_id) ?? "",
          language: lang(r.language),
          length: r.length,
        })),
        empty: "Every live article has a full summary.",
      },
      {
        title: "Live pages with no views this month",
        columns: [
          { key: "headline", label: "Article", kind: "text" },
          { key: "paper", label: "Newspaper", kind: "text" },
          { key: "language", label: "Language", kind: "text" },
          { key: "published", label: "Published (India time)", kind: "text" },
        ],
        rows: unseen.map((r) => ({
          headline: r.headline,
          paper: paperName.get(r.tenant_id) ?? "",
          language: lang(r.language),
          published: istDateTime(r.published_at),
        })),
        empty: "Every live page was viewed this month.",
      },
    ],
  };
}

export const ABCFINANCE_REPORTS = {
  "abc-articles": (_scope: string, m: Month) => topArticles(m),
  "abc-seo": (_scope: string, m: Month) => seo(m),
} as const;
