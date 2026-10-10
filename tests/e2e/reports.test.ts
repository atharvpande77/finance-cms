import { and, eq, isNotNull, sql } from "drizzle-orm";
import { parse } from "node-html-parser";
import { beforeAll, describe, expect, it } from "vitest";
import { db, schema } from "@/server/db/client";
import { addMonths, indianMonth, monthBounds } from "@/domain/time";
import type { HttpClient, HttpResponse } from "../http-client";
import { signInFully } from "./auth-helpers";
import { beacon, backdateView, newPv, reader } from "./analytics-helpers";
import { orgId, versionOf } from "./lead-helpers";

const thisMonth = indianMonth(new Date());

/** The rows of a report table as { column key: raw value }. */
function tableRows(res: HttpResponse, section = 0) {
  const table = parse(res.text).querySelector(`[data-report-section="${section}"]`);
  if (!table) return [];
  return table
    .querySelectorAll("tr[data-row]")
    .map((tr) =>
      Object.fromEntries(
        tr
          .querySelectorAll("td")
          .map((td) => [td.getAttribute("data-col")!, td.getAttribute("data-value")!]),
      ),
    );
}

/** A small CSV reader for the export (every cell is quoted). */
function readCsv(text: string): string[][] {
  const rows: string[][] = [];
  for (const line of text.replace(/^﻿/, "").split("\r\n")) {
    if (line === "") {
      rows.push([]);
      continue;
    }
    const cells: string[] = [];
    const re = /"((?:[^"]|"")*)"(?:,|$)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line))) cells.push(m[1]!.replace(/""/g, '"'));
    rows.push(cells);
  }
  return rows;
}

/** The headline the article table shows: the first copy in the article's own language. */
async function headlineOf(articleSlug: string) {
  const v = schema.articleVersions;
  const a = schema.articles;
  const [row] = await db()
    .select({ headline: v.headline })
    .from(v)
    .innerJoin(a, eq(a.id, v.articleId))
    .where(and(eq(a.slug, articleSlug), isNotNull(v.tenantId), eq(v.language, a.masterLanguage)))
    .orderBy(v.createdAt)
    .limit(1);
  return row!.headline;
}

/** This month's views and engaged reads of an article on every paper, from page_stats. */
async function articleTotals(articleSlug: string) {
  const { first, last } = monthBounds(thisMonth);
  const [row] = [
    ...(await db().execute<{ views: number; engaged: number }>(sql`
      SELECT COALESCE(SUM(ps.views), 0)::int AS views, COALESCE(SUM(ps.engaged_reads), 0)::int AS engaged
      FROM page_stats ps
      JOIN article_versions v ON v.id = ps.version_id
      JOIN articles a ON a.id = v.article_id
      WHERE a.slug = ${articleSlug} AND ps.date BETWEEN ${first}::date AND ${last}::date`)),
  ];
  return row!;
}

const status = async (client: HttpClient, url: string) => (await client.get(url)).status;

describe("institution reports", () => {
  let adminAmc: HttpClient;
  let sipHeadline: string;
  let giHeadline: string;

  beforeAll(async () => {
    adminAmc = await signInFully("admin.amc");
    sipHeadline = await headlineOf("sip-basics");
    giHeadline = await headlineOf("health-cover-for-parents");
    // A view and an engaged read of the AMC's article this month.
    const client = reader();
    const pv = newPv();
    const hit = {
      pv,
      p: "/mutual-funds/sip-basics",
      k: "article",
      l: "en",
      v: await versionOf("sip-basics", "paperb", "en"),
    };
    await beacon(client, { t: "v", ...hit });
    await backdateView(pv, 30);
    await beacon(client, { t: "e", ...hit });
  });

  it("[E2E-AN-29] an institution admin sees their own reports", async () => {
    const res = await adminAmc.get("/reports");
    expect(res.status).toBe(200);
    const page = parse(res.text);
    expect(page.querySelector("[data-report]")!.getAttribute("data-report")).toBe("inst-articles");
    expect(page.querySelector("[data-report-title]")!.textContent).toContain("Sample AMC");
    for (const key of [
      "inst-articles",
      "inst-newspapers",
      "inst-languages",
      "inst-calculators",
      "inst-leads",
      "inst-plan",
    ]) {
      const r = await adminAmc.get(`/reports?report=${key}`);
      expect(r.status, key).toBe(200);
      expect(parse(r.text).querySelector("[data-report]")!.getAttribute("data-report")).toBe(key);
    }
  });

  it("[E2E-AN-30] and none of the publisher or abcfinance reports", async () => {
    const res = await adminAmc.get("/reports");
    expect(parse(res.text).querySelector("[data-report-set]")).toBeNull();
    for (const key of ["pub-summary", "pub-top-pages", "abc-articles", "abc-seo"]) {
      expect(await status(adminAmc, `/reports?report=${key}`), key).toBe(403);
    }
  });

  it("[E2E-AN-31] and none of another sponsor's articles", async () => {
    const res = await adminAmc.get("/reports?report=inst-articles");
    const names = tableRows(res).map((r) => r.name);
    expect(names).toContain(sipHeadline);
    expect(names).not.toContain(giHeadline);
    const gi = await orgId("sample-general-insurer");
    expect(await status(adminAmc, `/reports?report=inst-articles&scope=${gi}`)).toBe(403);
  });

  it("[E2E-AN-32] the article table shows the same numbers as the database", async () => {
    // Other suites may count views at the same time: retry until the database is still.
    for (let attempt = 0; ; attempt++) {
      const before = await articleTotals("sip-basics");
      const res = await adminAmc.get("/reports?report=inst-articles");
      const after = await articleTotals("sip-basics");
      if (before.views !== after.views && attempt < 3) continue;
      const row = tableRows(res).find((r) => r.name === sipHeadline)!;
      expect(Number(row.views)).toBe(after.views);
      expect(Number(row.engaged)).toBe(after.engaged);
      expect(after.views).toBeGreaterThan(0);
      expect(after.engaged).toBeGreaterThan(0);
      break;
    }
  });

  it("[E2E-AN-33] the CSV export matches", async () => {
    for (let attempt = 0; ; attempt++) {
      const page = await adminAmc.get("/reports?report=inst-articles");
      const res = await adminAmc.submitForm("/reports", "report-export", {}, { page });
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("text/csv; charset=utf-8");
      expect(res.headers.get("content-disposition")).toBe(
        `attachment; filename="inst-articles-sample-amc-${thisMonth}.csv"`,
      );
      const csv = readCsv(res.text);
      expect(csv[0]).toEqual(["Article", "Views", "Engaged reads", "Engaged rate (%)", "Leads"]);
      const fromTable = tableRows(page).map((r) => [r.name, r.views, r.engaged, r.rate, r.leads]);
      const fromCsv = csv.slice(1, 1 + fromTable.length);
      if (JSON.stringify(fromCsv) !== JSON.stringify(fromTable) && attempt < 3) continue;
      expect(fromCsv).toEqual(fromTable);
      expect(csv[1 + fromTable.length]![0]).toBe("Total");
      break;
    }
    const [audit] = await db()
      .select()
      .from(schema.auditEvents)
      .where(eq(schema.auditEvents.action, "report.export"))
      .orderBy(sql`${schema.auditEvents.id} DESC`)
      .limit(1);
    expect(audit!.detail).toMatchObject({ report: "inst-articles", month: thisMonth });
  });

  it("[E2E-AN-34] the CSV holds only this institution's articles, and starts with a byte-order mark for Excel", async () => {
    const res = await adminAmc.submitForm("/reports?report=inst-articles", "report-export");
    expect(res.text.charCodeAt(0)).toBe(0xfeff);
    expect(res.text).toContain(sipHeadline);
    expect(res.text).not.toContain(giHeadline);
  });

  it("[E2E-AN-35] an institution cannot download publisher or abcfinance reports", async () => {
    const page = await adminAmc.get("/reports");
    for (const report of ["pub-summary", "abc-seo"]) {
      const res = await adminAmc.submitForm(
        "/reports",
        "report-export",
        { report, scope: "tarunbharat" },
        { page },
      );
      expect(res.status, report).toBe(403);
      expect(res.headers.get("content-type") ?? "").not.toContain("text/csv");
    }
    // Nor another institution's.
    const gi = await orgId("sample-general-insurer");
    const res = await adminAmc.submitForm("/reports", "report-export", { scope: gi }, { page });
    expect(res.status).toBe(403);
  });

  it("[E2E-AN-36] the month picker works", async () => {
    const last = addMonths(thisMonth, -1);
    const res = await adminAmc.get(`/reports?report=inst-articles&month=${last}`);
    const page = parse(res.text);
    expect(page.querySelector("[data-report]")!.getAttribute("data-month")).toBe(last);
    const picker = page.querySelector("[data-month-picker]")!;
    expect(picker.querySelectorAll("a")).toHaveLength(12);
    expect(picker.querySelector('[aria-current="page"]')!.getAttribute("data-month")).toBe(last);
    // An unknown or future month falls back to this month.
    for (const bad of ["2026-13", "soon", addMonths(thisMonth, 2)]) {
      const r = parse((await adminAmc.get(`/reports?month=${bad}`)).text);
      expect(r.querySelector("[data-report]")!.getAttribute("data-month"), bad).toBe(thisMonth);
    }
  });

  it("[E2E-AN-37] a writer has no reports", async () => {
    const writer = await signInFully("writer.amc");
    expect(await status(writer, "/reports")).toBe(403);
    expect(await status(writer, "/reports?report=inst-articles")).toBe(403);
    const page = await adminAmc.get("/reports");
    expect((await writer.submitForm("/reports", "report-export", {}, { page })).status).toBe(403);
  });
});

describe("newspaper reports", () => {
  let adminTb: HttpClient;
  beforeAll(async () => {
    adminTb = await signInFully("admin.tb");
  });

  it("[E2E-AN-38] a publisher admin sees the publisher reports for their paper", async () => {
    const res = await adminTb.get("/reports");
    expect(res.status).toBe(200);
    const page = parse(res.text);
    expect(page.querySelector("[data-report]")!.getAttribute("data-report")).toBe("pub-summary");
    expect(page.querySelector("[data-report-title]")!.textContent).toContain("Tarun Bharat");
    expect(page.querySelector("[data-report-note]")!.textContent).toContain("Earnings appear here");
    for (const key of ["pub-summary", "pub-traffic", "pub-top-pages", "pub-approvals"]) {
      expect(await status(adminTb, `/reports?report=${key}`), key).toBe(200);
    }
  });

  it("[E2E-AN-39] and only their own paper, not other papers or abcfinance reports", async () => {
    expect(await status(adminTb, "/reports?report=pub-summary&scope=paperb")).toBe(403);
    expect(await status(adminTb, "/reports?report=abc-seo")).toBe(403);
    expect(await status(adminTb, "/reports?report=inst-articles")).toBe(403);
    expect(
      parse((await adminTb.get("/reports")).text).querySelector("[data-scope-switcher]"),
    ).toBeNull();
  });
});

describe("abcfinance reports", () => {
  // One sign-in: a second within the same 30 s would wait for a fresh two-step code.
  let superAdmin: HttpClient;
  beforeAll(async () => {
    superAdmin = await signInFully("super.abc");
  });

  it("[E2E-AN-43] a super admin sees the abcfinance and publisher reports for every paper", async () => {
    const sets = parse((await superAdmin.get("/reports")).text)
      .querySelectorAll("[data-report-set]")
      .map((a) => a.getAttribute("data-report-set"));
    expect(sets).toEqual(["inst", "pub", "abc"]);
    for (const paper of ["tarunbharat", "paperb", "paperc"]) {
      const res = await superAdmin.get(`/reports?report=pub-summary&scope=${paper}`);
      expect(res.status, paper).toBe(200);
    }
    for (const key of ["abc-articles", "abc-seo"]) {
      expect(await status(superAdmin, `/reports?report=${key}`), key).toBe(200);
    }
    // Staff can read an institution's reports too (D49).
    const gi = await orgId("sample-general-insurer");
    expect(await status(superAdmin, `/reports?report=inst-articles&scope=${gi}`)).toBe(200);
  });

  it("[E2E-AN-45] SEO health marks staging papers as noindex", async () => {
    const rows = tableRows(await superAdmin.get("/reports?report=abc-seo"));
    const visibility = Object.fromEntries(rows.map((r) => [r.paper, r.visibility]));
    expect(visibility["Tarun Bharat"]).toBe("Live: indexed");
    expect(visibility["Paper B"]).toBe("Staging: noindex");
    // Paper C publishes only Marathi, so it has only a Marathi name.
    expect(visibility["पेपर सी"]).toBe("Staging: noindex");
  });

  it("[E2E-AN-46] a desk manager sees abcfinance reports but not the finance page", async () => {
    const desk = await signInFully("desk.abc");
    expect(await status(desk, "/reports?report=abc-seo")).toBe(200);
    expect(await status(desk, "/reports?report=pub-summary&scope=paperc")).toBe(200);
    expect(await status(desk, "/finance")).toBe(403);
  });

  it("[E2E-AN-47] an abcfinance editor has no reports", async () => {
    const editor = await signInFully("editor.abc");
    expect(await status(editor, "/reports")).toBe(403);
    expect(await status(editor, "/reports?report=abc-seo")).toBe(403);
  });
});
