import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { parse } from "node-html-parser";
import { describe, expect, it } from "vitest";
import { db, schema } from "@/server/db/client";
import { indianDate } from "@/domain/time";
import { HttpClient, PANEL_ORIGIN } from "../http-client";
import { E2E_CRON_SECRET } from "./global-setup";
import { orgId, PAGES, versionOf } from "./lead-helpers";
import {
  backdateView,
  beacon,
  calcUses,
  freshPath,
  newPv,
  pageView,
  PHONE_UA,
  reader,
  statFor,
  tenantId,
} from "./analytics-helpers";

const view = (p: string, extra: Record<string, unknown> = {}) => ({
  t: "v",
  pv: newPv(),
  p,
  k: "other",
  l: "en",
  ...extra,
});

describe("the tracker on reader pages", () => {
  it("[E2E-AN-01] reader pages include the tracker for the article", async () => {
    const res = await reader().get(PAGES.amcArticle);
    expect(res.status).toBe(200);
    const tracker = parse(res.text).querySelector("[data-tracker]");
    expect(tracker?.getAttribute("data-kind")).toBe("article");
    expect(tracker?.getAttribute("data-version")).toBe(
      await versionOf("sip-basics", "paperb", "en"),
    );
    const section = parse(
      (await reader().get(`${new URL(PAGES.amcArticle).origin}/mutual-funds`)).text,
    );
    expect(section.querySelector("[data-tracker]")?.getAttribute("data-kind")).toBe("section");
  });
});

describe("views", () => {
  it("[E2E-AN-03] a view is accepted quietly (204)", async () => {
    const res = await beacon(reader(), view(freshPath()));
    expect(res.status).toBe(204);
    expect(res.text).toBe("");
    expect(res.headers.getSetCookie()).toEqual([]);
  });

  it("[E2E-AN-04] it counts one view, from search, on today's Indian date", async () => {
    const p = freshPath();
    await beacon(reader(), view(p, { r: "www.google.co.in" }));
    expect(await statFor(p)).toMatchObject({
      views: 1,
      searchViews: 1,
      mobileViews: 0,
      date: indianDate(new Date()),
    });
  });

  it("[E2E-AN-05] the page view is recorded for later validation", async () => {
    const p = freshPath();
    const hit = view(p);
    await beacon(reader(), hit);
    expect(await pageView(hit.pv)).toMatchObject({
      tenantId: await tenantId("paperb"),
      pagePath: p,
      kind: "other",
      language: "en",
      engagedAt: null,
      calculatorsUsed: [],
    });
  });

  it("[E2E-AN-06] no IP address is stored", async () => {
    const ip = "10.77.66.55";
    const client = new HttpClient({ "x-real-ip": ip });
    const hit = view(freshPath());
    await beacon(client, hit);
    const row = await pageView(hit.pv);
    expect(row).toBeDefined();
    expect(JSON.stringify(row)).not.toContain(ip);
    expect(Object.keys(row!)).not.toEqual(expect.arrayContaining(["ip"]));
    expect(row!.visitorHash).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("[E2E-AN-07] sending the same view twice counts once", async () => {
    const client = reader();
    const p = freshPath();
    const hit = view(p);
    await beacon(client, hit);
    expect((await beacon(client, hit)).status).toBe(204);
    expect((await statFor(p))!.views).toBe(1);
  });

  it("[E2E-AN-08] a phone view adds to the mobile count", async () => {
    const p = freshPath();
    await beacon(reader(), view(p));
    await beacon(reader(), view(p), { ua: PHONE_UA });
    expect(await statFor(p)).toMatchObject({ views: 2, mobileViews: 1 });
  });

  it("[E2E-AN-09] bots and headless browsers are not counted", async () => {
    const p = freshPath();
    for (const ua of [
      "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/141.0.0.0 Safari/537.36",
      "curl/8.5.0 (x86_64-pc-linux-gnu)",
      "short",
    ]) {
      expect((await beacon(reader(), view(p), { ua })).status).toBe(204);
    }
    expect(await statFor(p)).toBeUndefined();
  });

  it("[E2E-AN-10] hits from another site, or with no origin, are ignored", async () => {
    const p = freshPath();
    expect((await beacon(reader(), view(p), { origin: "https://evil.example" })).status).toBe(204);
    expect(
      (await beacon(reader(), view(p), { origin: "http://tarunbharat.localhost:3100" })).status,
    ).toBe(204);
    expect((await beacon(reader(), view(p), { origin: null })).status).toBe(204);
    expect(await statFor(p)).toBeUndefined();
  });

  it("[E2E-AN-11] the beacon does not exist on the non-newspaper host", async () => {
    const res = await reader().request("POST", `${PANEL_ORIGIN}/_a/h`, {
      body: JSON.stringify(view(freshPath())),
      headers: { "content-type": "text/plain", origin: PANEL_ORIGIN },
    });
    expect(res.status).toBe(404);
  });

  it("[E2E-AN-12] a malformed hit gets a quiet 204 and is not counted", async () => {
    const p = freshPath();
    for (const bad of [
      "",
      "not json",
      "[1,2]",
      JSON.stringify({ ...view(p), t: "x" }),
      JSON.stringify({ ...view(p), pv: "short" }),
      JSON.stringify({ ...view(p), k: "page" }),
      JSON.stringify({ ...view(p), l: "fr" }),
      JSON.stringify({ ...view(p), l: "hi" }), // Paper B doesn't publish Hindi
      JSON.stringify({ ...view(p), v: "not-a-uuid" }),
      JSON.stringify({ ...view(p), pad: "x".repeat(3000) }), // over 2 KB
    ]) {
      const res = await beacon(reader(), bad);
      expect(res.status, bad.slice(0, 30)).toBe(204);
    }
    expect(await statFor(p)).toBeUndefined();
  });
});

describe("engaged reads", () => {
  async function viewed() {
    const client = reader();
    const p = freshPath();
    const hit = view(p);
    await beacon(client, hit);
    return { client, p, hit, engaged: { ...hit, t: "e" } };
  }

  it("[E2E-AN-13] an engaged read straight after the view is refused (too fast to be a real read)", async () => {
    const { client, p, hit, engaged } = await viewed();
    expect((await beacon(client, engaged)).status).toBe(204);
    expect((await statFor(p))!.engagedReads).toBe(0);
    expect((await pageView(hit.pv))!.engagedAt).toBeNull();
  });

  it("[E2E-AN-14] an engaged read for a different page is refused", async () => {
    const { client, p, hit, engaged } = await viewed();
    await backdateView(hit.pv, 30);
    await beacon(client, { ...engaged, p: "/some-other-page" });
    expect((await statFor(p))!.engagedReads).toBe(0);
  });

  it("[E2E-AN-15] after enough time it counts as an engaged read", async () => {
    const { client, p, hit, engaged } = await viewed();
    await backdateView(hit.pv, 16);
    await beacon(client, engaged);
    expect((await statFor(p))!.engagedReads).toBe(1);
    expect((await pageView(hit.pv))!.engagedAt).not.toBeNull();
  });

  it("[E2E-AN-16] the same view cannot be engaged twice", async () => {
    const { client, p, hit, engaged } = await viewed();
    await backdateView(hit.pv, 30);
    await beacon(client, engaged);
    await beacon(client, engaged);
    expect((await statFor(p))!.engagedReads).toBe(1);
  });

  it("[E2E-AN-17] an engaged read with no matching view is refused", async () => {
    const p = freshPath();
    await beacon(reader(), view(p));
    await beacon(reader(), { ...view(p), t: "e" });
    expect((await statFor(p))!.engagedReads).toBe(0);
  });
});

describe("which article a view belongs to", () => {
  const ARTICLE_PATH = "/mutual-funds/sip-basics";

  it("[E2E-AN-18] an article view is tied to the real published version", async () => {
    const v = await versionOf("sip-basics", "paperb", "en");
    const hit = view(ARTICLE_PATH, { k: "article", v });
    await beacon(reader(), hit);
    expect(await pageView(hit.pv)).toMatchObject({ versionId: v, kind: "article" });
  });

  it("[E2E-AN-19] a made-up article id is not trusted (counted as an ordinary page)", async () => {
    const p = freshPath();
    const hit = view(p, { k: "article", v: randomUUID() });
    await beacon(reader(), hit);
    expect(await pageView(hit.pv)).toMatchObject({ versionId: null, kind: "other" });
    expect(await statFor(p)).toMatchObject({ views: 1, versionId: null, kind: "other" });
  });

  it("[E2E-AN-20] an unpublished version is not trusted either", async () => {
    // The master draft, and another paper's copy, are not published versions of Paper B.
    const master = await versionOf("sip-basics", null, "en");
    const otherPaper = await versionOf("sip-basics", "tarunbharat", "mr");
    for (const v of [master, otherPaper]) {
      const hit = view(freshPath(), { k: "article", v });
      await beacon(reader(), hit);
      expect(await pageView(hit.pv)).toMatchObject({ versionId: null, kind: "other" });
    }
  });
});

describe("calculator use", () => {
  async function useOn(article: string | null, calc: string, kind = "article") {
    const client = reader();
    const v = article ? await versionOf(article, "paperb", "en") : undefined;
    const hit = view(freshPath(), { k: kind, v });
    await beacon(client, hit);
    const use = { ...hit, t: "c", calc };
    await beacon(client, use);
    return { client, use, hit };
  }

  it("[E2E-AN-21] using a calculator in an institution's article is credited to that institution", async () => {
    const amc = await orgId("sample-amc");
    const before = await calcUses("sip", amc);
    const { hit } = await useOn("sip-basics", "sip");
    expect(await calcUses("sip", amc)).toBe(before + 1);
    expect((await pageView(hit.pv))!.calculatorsUsed).toEqual(["sip"]);
  });

  it("[E2E-AN-22] the same calculator on the same page view counts once", async () => {
    const amc = await orgId("sample-amc");
    const before = await calcUses("sip", amc);
    const { client, use } = await useOn("sip-basics", "sip");
    await beacon(client, use);
    await beacon(client, use);
    expect(await calcUses("sip", amc)).toBe(before + 1);
  });

  it("[E2E-AN-23] an unknown calculator is ignored", async () => {
    const { hit } = await useOn("sip-basics", "crypto-returns");
    expect((await pageView(hit.pv))!.calculatorsUsed).toEqual([]);
    const rows = await db()
      .select()
      .from(schema.calculatorUses)
      .where(eq(schema.calculatorUses.calculatorSlug, "crypto-returns"));
    expect(rows).toEqual([]);
  });

  it("[E2E-AN-24] a different institution's article credits its own sponsor", async () => {
    const gi = await orgId("sample-general-insurer");
    const amc = await orgId("sample-amc");
    const [giBefore, amcBefore] = [
      await calcUses("health-cover", gi),
      await calcUses("health-cover", amc),
    ];
    await useOn("health-cover-for-parents", "health-cover");
    expect(await calcUses("health-cover", gi)).toBe(giBefore + 1);
    expect(await calcUses("health-cover", amc)).toBe(amcBefore);
  });

  it("[E2E-AN-25] a standalone sponsored calculator credits whoever sponsors it", async () => {
    const amc = await orgId("sample-amc");
    const before = await calcUses("sip", amc);
    await useOn(null, "sip", "calculator");
    expect(await calcUses("sip", amc)).toBe(before + 1);
    // Unsponsored: credited to nobody (D49).
    const nobody = await calcUses("emi", null);
    await useOn(null, "emi", "calculator");
    expect(await calcUses("emi", null)).toBe(nobody + 1);
  });
});

describe("load", () => {
  it("[E2E-AN-26] ten simultaneous first views of a new page all count (no lost updates)", async () => {
    const p = freshPath();
    const responses = await Promise.all(
      Array.from({ length: 10 }, () => beacon(reader(), view(p))),
    );
    expect(responses.every((r) => r.status === 204)).toBe(true);
    expect((await statFor(p))!.views).toBe(10);
  });

  it("[E2E-AN-27] a visitor flooding the endpoint is cut off", async () => {
    const client = reader();
    const p = freshPath();
    for (let i = 0; i < 130; i++) {
      expect((await beacon(client, view(p))).status).toBe(204);
    }
    expect((await statFor(p))!.views).toBe(120);
    // Another visitor is unaffected.
    await beacon(reader(), view(p));
    expect((await statFor(p))!.views).toBe(121);
  });

  it("[E2E-AN-28] per-view rows older than 30 days are pruned, recent ones kept", async () => {
    const tenant = await tenantId("paperb");
    const day = 86_400_000;
    const row = (id: string, ageDays: number) => ({
      id,
      tenantId: tenant,
      pagePath: freshPath(),
      kind: "other",
      language: "en",
      viewedAt: new Date(Date.now() - ageDays * day),
      visitorHash: "e2e",
    });
    const old = newPv();
    const recent = newPv();
    await db()
      .insert(schema.pageViews)
      .values([row(old, 31), row(recent, 29)]);
    const res = await new HttpClient().post("/api/cron/deemed", undefined, {
      authorization: `Bearer ${E2E_CRON_SECRET}`,
    });
    expect(res.status).toBe(200);
    expect(res.json<{ prunedViews: number }>().prunedViews).toBeGreaterThanOrEqual(1);
    const left = await db()
      .select({ id: schema.pageViews.id })
      .from(schema.pageViews)
      .where(and(inArray(schema.pageViews.id, [old, recent]), isNull(schema.pageViews.engagedAt)));
    expect(left.map((r) => r.id)).toEqual([recent]);
  });
});
