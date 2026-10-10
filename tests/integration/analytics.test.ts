import { randomBytes } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { db, schema } from "@/server/db/client";
import { recordHit } from "@/server/analytics/track";
import { prunePageViews } from "@/server/jobs";
import { indianDate } from "@/domain/time";

// Each test's visitor is its own X-Real-IP, as behind nginx.
vi.hoisted(() => {
  process.env.TRUST_PROXY = "1";
});

const HOST = "paperb.localhost";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

/** A fresh address per test, so the visitor limit never carries over (even across runs). */
const freshIp = () => `10.${[...randomBytes(3)].join(".")}`;
const pv = () => randomBytes(12).toString("base64url");
const path = () => `/int-${randomBytes(5).toString("hex")}`;

function headers(ip: string, extra: Record<string, string> = {}) {
  return new Headers({
    host: HOST,
    origin: `http://${HOST}:3000`,
    "user-agent": UA,
    "x-real-ip": ip,
    ...extra,
  });
}

const send = (ip: string, body: object, now?: Date, extra?: Record<string, string>) =>
  recordHit({ headers: headers(ip, extra), body: JSON.stringify(body), now });

async function tenantId(slug: string) {
  const [row] = await db().select().from(schema.tenants).where(eq(schema.tenants.slug, slug));
  return row!.id;
}

async function stat(p: string) {
  const [row] = await db()
    .select()
    .from(schema.pageStats)
    .where(
      and(
        eq(schema.pageStats.tenantId, await tenantId("paperb")),
        eq(schema.pageStats.pagePath, p),
      ),
    );
  return row;
}

async function copyOn(articleSlug: string, tenantSlug: string, language: string) {
  const [row] = await db()
    .select({ id: schema.articleVersions.id })
    .from(schema.articleVersions)
    .innerJoin(schema.articles, eq(schema.articles.id, schema.articleVersions.articleId))
    .where(
      and(
        eq(schema.articles.slug, articleSlug),
        eq(schema.articleVersions.tenantId, await tenantId(tenantSlug)),
        eq(schema.articleVersions.language, language),
        eq(schema.articleVersions.state, "published"),
      ),
    );
  return row!.id;
}

async function orgId(slug: string) {
  const [row] = await db()
    .select()
    .from(schema.organisations)
    .where(eq(schema.organisations.slug, slug));
  return row!.id;
}

/** Calculator uses credited on Paper B today to `sponsor` (null = nobody). */
async function uses(calc: string, sponsor: string | null, day = indianDate(new Date())) {
  const [row] = await db()
    .select({ uses: schema.calculatorUses.uses })
    .from(schema.calculatorUses)
    .where(
      and(
        eq(schema.calculatorUses.tenantId, await tenantId("paperb")),
        eq(schema.calculatorUses.calculatorSlug, calc),
        sponsor === null
          ? isNull(schema.calculatorUses.sponsorOrgId)
          : eq(schema.calculatorUses.sponsorOrgId, sponsor),
        eq(schema.calculatorUses.date, day),
      ),
    );
  return row?.uses ?? 0;
}

describe("recordHit", () => {
  it("counts a view once, with search and mobile counters", async () => {
    const ip = freshIp();
    const p = path();
    const id = pv();
    const view = { t: "v", pv: id, p, k: "other", l: "en", r: "www.google.co.in" };
    expect(await send(ip, view)).toBe("counted");
    expect(await send(ip, view)).toBe("repeat");
    const phone =
      "Mozilla/5.0 (Linux; Android 14; SM-A156E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36";
    expect(
      await send(ip, { ...view, pv: pv(), r: "news.example.org" }, undefined, {
        "user-agent": phone,
      }),
    ).toBe("counted");
    const row = await stat(p);
    expect(row).toMatchObject({ views: 2, searchViews: 1, mobileViews: 1, kind: "other" });
    expect(row!.date).toBe(indianDate(new Date()));
    const [stored] = await db().select().from(schema.pageViews).where(eq(schema.pageViews.id, id));
    expect(stored!.visitorHash).not.toContain(ip);
  });

  it("drops other origins, bots, other languages and malformed bodies", async () => {
    const ip = freshIp();
    const p = path();
    const view = { t: "v", pv: pv(), p, k: "other", l: "en" };
    expect(await send(ip, view, undefined, { origin: "https://evil.example" })).toBe("bad_origin");
    expect(
      await send(ip, view, undefined, { "user-agent": "curl/8.5.0 (x86_64-pc-linux-gnu)" }),
    ).toBe("bot");
    expect(await send(ip, { ...view, l: "hi" })).toBe("malformed");
    expect(await recordHit({ headers: headers(ip), body: "{not json" })).toBe("malformed");
    const noOrigin = headers(ip);
    noOrigin.delete("origin");
    expect(await recordHit({ headers: noOrigin, body: JSON.stringify(view) })).toBe("bad_origin");
    expect(await stat(p)).toBeUndefined();
  });

  it("accepts an engaged read only after the minimum time, once, for the same page", async () => {
    const ip = freshIp();
    const p = path();
    const id = pv();
    const at = new Date();
    await send(ip, { t: "v", pv: id, p, k: "other", l: "en" }, at);
    const engaged = { t: "e", pv: id, p, k: "other", l: "en" };
    expect(await send(ip, engaged, new Date(at.getTime() + 5_000))).toBe("refused");
    expect(
      await send(ip, { ...engaged, p: "/somewhere-else" }, new Date(at.getTime() + 16_000)),
    ).toBe("refused");
    expect(await send(ip, { ...engaged, pv: pv() }, new Date(at.getTime() + 16_000))).toBe(
      "refused",
    );
    expect(await send(ip, engaged, new Date(at.getTime() + 16_000))).toBe("counted");
    expect(await send(ip, engaged, new Date(at.getTime() + 30_000))).toBe("refused");
    expect((await stat(p))!.engagedReads).toBe(1);
  });

  it("counts an engaged read on the day of its view (D50)", async () => {
    const ip = freshIp();
    const p = path();
    const id = pv();
    // 23:59:50 India time yesterday; the engaged beacon arrives after midnight.
    const today = indianDate(new Date());
    const midnight = new Date(`${today}T00:00:00+05:30`);
    const before = new Date(midnight.getTime() - 10_000);
    await send(ip, { t: "v", pv: id, p, k: "other", l: "en" }, before);
    expect(
      await send(
        ip,
        { t: "e", pv: id, p, k: "other", l: "en" },
        new Date(midnight.getTime() + 20_000),
      ),
    ).toBe("counted");
    const rows = await db().select().from(schema.pageStats).where(eq(schema.pageStats.pagePath, p));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ date: indianDate(before), views: 1, engagedReads: 1 });
  });

  it("trusts an article id only when it is a published copy of this paper", async () => {
    const ip = freshIp();
    const real = await copyOn("sip-basics", "paperb", "en");
    const elsewhere = await copyOn("sip-basics", "tarunbharat", "mr");
    const p1 = path();
    const p2 = path();
    await send(ip, { t: "v", pv: pv(), p: p1, k: "article", l: "en", v: real });
    await send(ip, { t: "v", pv: pv(), p: p2, k: "article", l: "en", v: elsewhere });
    expect(await stat(p1)).toMatchObject({ kind: "article", versionId: real });
    expect(await stat(p2)).toMatchObject({ kind: "other", versionId: null });
  });

  it("credits calculator use to the brand the reader saw (D49), once per view", async () => {
    const ip = freshIp();
    const amc = await orgId("sample-amc");
    const gi = await orgId("sample-general-insurer");
    const life = await orgId("sample-life-insurer");

    const cases: Array<[string | null, string, string | null, string]> = [
      // [article slug or null for the calculator page, calculator, credited org, kind]
      ["sip-basics", "sip", amc, "article"],
      ["health-cover-for-parents", "health-cover", gi, "article"],
      ["emergency-fund-first", "sip", null, "article"], // independent expert: no brand
      ["how-much-term-cover", "term-cover", life, "article"], // abcfinance article, exclusive sponsor
      ["home-loan-checklist", "emi", null, "article"], // nobody sponsors home loans
      [null, "sip", amc, "calculator"],
    ];
    for (const [article, calc, credited, kind] of cases) {
      const before = await uses(calc, credited);
      const id = pv();
      const p = path();
      const v = article ? await copyOn(article, "paperb", "en") : undefined;
      await send(ip, { t: "v", pv: id, p, k: kind, l: "en", v });
      const use = { t: "c", pv: id, p, k: kind, l: "en", calc };
      expect(await send(ip, use)).toBe("counted");
      expect(await send(ip, use)).toBe("refused");
      expect(await uses(calc, credited), `${article ?? "page"} ${calc}`).toBe(before + 1);
    }
    const id = pv();
    const p = path();
    await send(ip, { t: "v", pv: id, p, k: "other", l: "en" });
    expect(await send(ip, { t: "c", pv: id, p, k: "other", l: "en", calc: "crypto" })).toBe(
      "refused",
    );
  });

  it("cuts off a visitor sending more than 120 events a minute", async () => {
    const ip = freshIp();
    const p = path();
    const outcomes = [];
    for (let i = 0; i < 125; i++) {
      outcomes.push(await send(ip, { t: "v", pv: pv(), p, k: "other", l: "en" }));
    }
    expect(outcomes.filter((o) => o === "counted")).toHaveLength(120);
    expect(outcomes.slice(120).every((o) => o === "limited")).toBe(true);
    expect((await stat(p))!.views).toBe(120);
  });

  it("prunes per-view rows after 30 days and keeps recent ones", async () => {
    const ip = freshIp();
    const oldId = pv();
    const recentId = pv();
    const now = new Date();
    await send(
      ip,
      { t: "v", pv: oldId, p: path(), k: "other", l: "en" },
      new Date(now.getTime() - 31 * 86_400_000),
    );
    await send(
      ip,
      { t: "v", pv: recentId, p: path(), k: "other", l: "en" },
      new Date(now.getTime() - 29 * 86_400_000),
    );
    await prunePageViews(now);
    const left = await db()
      .select({ id: schema.pageViews.id })
      .from(schema.pageViews)
      .where(sql`${schema.pageViews.id} IN (${oldId}, ${recentId})`);
    expect(left.map((r) => r.id)).toEqual([recentId]);
  });
});
