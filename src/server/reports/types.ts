import { sql, type SQL } from "drizzle-orm";
import { db } from "@/server/db/client";
import { paperName } from "@/server/publishing/release";
import { schema } from "@/server/db/client";

/** A report is one or more tables; every table renders in the panel and exports as CSV. */
export type ColumnKind = "text" | "number" | "percent";
export type Column = { key: string; label: string; kind: ColumnKind };
export type Cell = string | number | null;
export type Row = Record<string, Cell>;

export type ReportSection = {
  title?: string;
  columns: Column[];
  rows: Row[];
  totals?: Row;
  /** Shown instead of an empty table. */
  empty: string;
};

export type ReportResult = { sections: ReportSection[]; note?: string };

/** The month, as Indian calendar days (04.8). */
export type Month = { month: string; first: string; last: string };

export async function query<T extends Record<string, unknown>>(q: SQL): Promise<T[]> {
  return [...(await db().execute(q))] as unknown as T[];
}

/** A timestamp column's Indian day, for month filters. */
export const istDay = (column: SQL) => sql`((${column}) AT TIME ZONE 'Asia/Kolkata')::date`;

export const inMonth = (column: SQL, m: Month) =>
  sql`${istDay(column)} BETWEEN ${m.first}::date AND ${m.last}::date`;

/** "YYYY-MM-DD HH:MM", Indian time. */
export function istDateTime(at: Date | string | null): string {
  if (!at) return "";
  const d = new Date(new Date(at).getTime() + 330 * 60_000);
  return d.toISOString().slice(0, 16).replace("T", " ");
}

export const LANGUAGE_LABELS: Record<string, string> = {
  en: "English",
  mr: "Marathi",
  hi: "Hindi",
};

export const ARTICLE_TYPE_LABELS: Record<string, string> = {
  institution: "Institution article",
  abcfinance: "abcfinance article",
  independent: "Independent expert article",
};

export type PaperInfo = {
  id: string;
  slug: string;
  name: string;
  publisherOrgId: string;
  status: "staging" | "live";
};

export async function allPapers(): Promise<PaperInfo[]> {
  const t = schema.tenants;
  const rows = await db()
    .select({
      id: t.id,
      slug: t.slug,
      name: t.name,
      publisherOrgId: t.publisherOrgId,
      status: t.status,
    })
    .from(t)
    .orderBy(t.slug);
  return rows.map((p) => ({ ...p, name: paperName(p.name, p.slug) }));
}

export const sumOf = (rows: Row[], key: string) =>
  rows.reduce((total, r) => total + (typeof r[key] === "number" ? (r[key] as number) : 0), 0);
