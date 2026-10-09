import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db, schema } from "@/server/db/client";
import {
  canonicalCopy,
  getPublishedArticle,
  listPublished,
  publishedLanguages,
} from "@/server/content/queries";
import { tenantByHost } from "@/server/tenants";

async function tenant(slug: string) {
  const [row] = await db().select().from(schema.tenants).where(eq(schema.tenants.slug, slug));
  return row!;
}

describe("reader content queries", () => {
  it("resolves tenants by any of their hosts, ignoring case and port", async () => {
    expect((await tenantByHost("TarunBharat.localhost:3000"))?.slug).toBe("tarunbharat");
    expect(await tenantByHost("unknown.localhost")).toBeUndefined();
  });

  it("lists only this paper's published copies in this language, newest first", async () => {
    const pb = await tenant("paperb");
    const en = await listPublished(pb.id, "en");
    expect(en.length).toBeGreaterThan(0);
    expect(en.every((c) => c.language === "en")).toBe(true);
    const times = en.map((c) => c.publishedAt.getTime());
    expect([...times].sort((a, b) => b - a)).toEqual(times);
    // Paper B publishes emergency-fund-first in both languages, sip-basics only in English.
    const mr = (await listPublished(pb.id, "mr")).map((c) => c.slug);
    expect(mr).toContain("emergency-fund-first");
    expect(mr).not.toContain("sip-basics");
    // Tarun Bharat is Marathi-only.
    const tb = await tenant("tarunbharat");
    expect(await listPublished(tb.id, "en")).toEqual([]);
  });

  it("finds an article only in its own section, language and paper", async () => {
    const tb = await tenant("tarunbharat");
    const paperC = await tenant("paperc");
    expect(await getPublishedArticle(tb.id, "mr", "mutual-funds", "sip-basics")).toBeDefined();
    expect(await getPublishedArticle(tb.id, "mr", "home-loan", "sip-basics")).toBeUndefined();
    expect(await getPublishedArticle(tb.id, "en", "mutual-funds", "sip-basics")).toBeUndefined();
    expect(
      await getPublishedArticle(paperC.id, "mr", "mutual-funds", "sip-basics"),
    ).toBeUndefined();
  });

  it("excludes the current article from related reads", async () => {
    const tb = await tenant("tarunbharat");
    const sip = (await getPublishedArticle(tb.id, "mr", "mutual-funds", "sip-basics"))!;
    const related = await listPublished(tb.id, "mr", {
      sectionId: sip.sectionId,
      excludeArticleId: sip.articleId,
      limit: 3,
    });
    expect(related.map((c) => c.slug)).not.toContain("sip-basics");
    expect(related.length).toBeGreaterThan(0);
  });

  it("reports the languages an article is published in on a paper", async () => {
    const pb = await tenant("paperb");
    const sip = (await getPublishedArticle(pb.id, "en", "mutual-funds", "sip-basics"))!;
    const fund = (await getPublishedArticle(pb.id, "en", "mutual-funds", "emergency-fund-first"))!;
    expect(await publishedLanguages(pb.id, sip.articleId)).toEqual(["en"]);
    expect((await publishedLanguages(pb.id, fund.articleId)).sort()).toEqual(["en", "mr"]);
  });

  it("points the canonical at the earliest published copy, and moves it after a takedown", async () => {
    const tb = await tenant("tarunbharat");
    const paperC = await tenant("paperc");
    const checklist = (await getPublishedArticle(tb.id, "mr", "home-loan", "home-loan-checklist"))!;
    expect((await canonicalCopy(checklist.articleId, "mr"))?.tenantId).toBe(tb.id);

    const v = schema.articleVersions;
    const tbCopy = and(
      eq(v.articleId, checklist.articleId),
      eq(v.tenantId, tb.id),
      eq(v.language, "mr"),
    );
    await db().update(v).set({ state: "unpublished" }).where(tbCopy);
    try {
      expect((await canonicalCopy(checklist.articleId, "mr"))?.tenantId).toBe(paperC.id);
    } finally {
      await db().update(v).set({ state: "published" }).where(tbCopy);
    }
  });
});
