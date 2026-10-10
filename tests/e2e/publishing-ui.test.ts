import { beforeAll, describe, expect, it } from "vitest";
import { parse } from "node-html-parser";
import { eq } from "drizzle-orm";
import { db, schema } from "@/server/db/client";
import { pageText, siteOrigin, type HttpClient } from "../http-client";
import { signInFully } from "./auth-helpers";
import {
  copyOf,
  decide,
  freshInstitution,
  readyToRelease,
  releaseTo,
  type Ready,
} from "./publishing-helpers";

/** The paper's rule for each paper on the release form: explicit, deemed or unavailable. */
function paperRules(html: string): Record<string, string> {
  const form = parse(html).querySelector('form[data-form="release"]');
  return Object.fromEntries(
    (form?.querySelectorAll("[data-paper]") ?? []).map((el) => [
      el.getAttribute("data-paper")!,
      el.getAttribute("data-paper-rule")!,
    ]),
  );
}

/** Papers ticked on the release form when it opens. */
function tickedPapers(html: string): string[] {
  const form = parse(html).querySelector('form[data-form="release"]');
  return (form?.querySelectorAll('input[name="tenantIds"]') ?? [])
    .filter((i) => i.hasAttribute("checked"))
    .map((i) => i.closest("[data-paper]")!.getAttribute("data-paper")!)
    .sort();
}

describe("release and the publisher queue through the real pages", () => {
  let editor: HttpClient;
  let editorTb: HttpClient;
  let adminTb: HttpClient;
  let editorB: HttpClient;
  let article: Ready;
  const reader = (paper: string, prefix = "") =>
    `${siteOrigin(paper)}${prefix}/mutual-funds/${article.slug}`;

  beforeAll(async () => {
    [editor, editorTb, adminTb, editorB] = (await Promise.all(
      ["editor.abc", "editor.tb", "admin.tb", "editor.b"].map(signInFully),
    )) as [HttpClient, HttpClient, HttpClient, HttpClient];
    article = await readyToRelease({ institution: await freshInstitution() });
  });

  it("[E2E-UI-14] editor sees the release form with a per-paper preview", async () => {
    const res = await editor.get(article.url);
    expect(res.status).toBe(200);
    expect(res.text).toContain('data-form="release"');
    expect(Object.keys(paperRules(res.text)).sort()).toEqual(["paperb", "paperc", "tarunbharat"]);
    // The papers on the institution's plan are ticked (D43); this test institution has none.
    expect(tickedPapers(res.text)).toEqual([]);
    expect(pageText(res.text)).toContain("Send to selected papers");
    const amc = await readyToRelease({
      institution: { orgSlug: "sample-amc", authorSlug: "anita-kulkarni" },
    });
    expect(tickedPapers((await editor.get(amc.url)).text)).toEqual(["paperb", "tarunbharat"]);
  });

  it("[E2E-UI-15] release form explains each paper's rule", async () => {
    const res = await editor.get(article.url);
    expect(paperRules(res.text)).toEqual({
      tarunbharat: "explicit",
      paperb: "explicit",
      paperc: "explicit",
    });
    expect(pageText(res.text)).toContain(
      "One of the first 3 articles from this institution on this paper",
    );
    // A routine abcfinance article publishes itself; an English one can't go to Tarun Bharat.
    const routine = await readyToRelease({ language: "en" });
    const page = await editor.get(routine.url);
    expect(paperRules(page.text)).toMatchObject({ tarunbharat: "unavailable", paperb: "deemed" });
    const text = pageText(page.text);
    expect(text).toContain("Tarun Bharat doesn't publish English.");
    expect(text).toContain(
      "Publishes automatically 24 hours after release unless the editor holds it.",
    );
  });

  it("[E2E-UI-16] after release the paper table shows both papers waiting", async () => {
    const res = await releaseTo(editor, article.url, ["tarunbharat", "paperb"], "Good for Sunday.");
    expect(res.status).toBe(303);
    const page = await editor.get(res.location!);
    expect(page.text).toContain('data-done="release"');
    for (const paper of ["tarunbharat", "paperb"]) {
      expect(page.text).toMatch(new RegExp(`data-copy="${paper}" data-copy-status="waiting"`));
    }
    expect(page.text).not.toContain('data-copy="paperc"');
  });

  it("[E2E-UI-17] publisher queue lists the article as needing explicit approval", async () => {
    const copy = (await copyOf(article.articleId, "tarunbharat"))!;
    const queue = await editorTb.get("/publisher");
    expect(queue.status).toBe(200);
    const card = parse(queue.text).querySelector(`[data-queue-copy="${copy.id}"]`);
    expect(card).not.toBeNull();
    expect(card!.getAttribute("data-explicit")).toBe("true");
    const text = card!.textContent;
    expect(text).toContain(article.headline);
    expect(text).toContain("Needs an explicit approval");
    expect(text).toContain("One of the first 3 articles from this institution on this paper");
    expect(text).toContain("Good for Sunday.");
    expect(card!.querySelector('form[data-form="approve-copy"]')).not.toBeNull();
    // The dashboard lists it under "Waiting for you".
    expect((await editorTb.get("/dashboard")).text).toContain(`data-waiting-copy="${copy.id}"`);
  });

  it("[E2E-UI-19] approving publishes it on Tarun Bharat", async () => {
    expect((await editorTb.get(reader("tarunbharat"))).status).toBe(404);
    const copy = (await copyOf(article.articleId, "tarunbharat"))!;
    const preview = await editorTb.get(`/publisher/${copy.id}`);
    expect(pageText(preview.text)).toContain("A systematic investment plan");
    const res = await decide(editorTb, copy.id, "approve-copy", {}, preview);
    expect(res.status).toBe(303);
    expect((await editorTb.get(res.location!)).text).toContain('data-done="approve"');
    const live = await editorTb.get(reader("tarunbharat"));
    expect(live.status).toBe(200);
    const text = pageText(live.text);
    expect(text).toContain(article.headline);
    // "Approved by the Tarun Bharat editor", in Marathi.
    expect(text).toContain("संपादकांनी मंजूर केलेले");
    expect(text).toContain("भागीदार मजकूर");
    const table = await editor.get(article.url);
    expect(table.text).toMatch(/data-copy="tarunbharat" data-copy-status="published"/);
  });

  it("[E2E-UI-24] the other paper does not show it until its editor decides", async () => {
    expect((await editorB.get(reader("paperb", "/mr"))).status).toBe(404);
    const copy = (await copyOf(article.articleId, "paperb"))!;
    expect((await decide(editorB, copy.id, "approve-copy")).status).toBe(303);
    expect((await editorB.get(reader("paperb", "/mr"))).status).toBe(200);
  });

  it("[E2E-UI-26] takedown removes it from the reader site", async () => {
    const sitemap = async () =>
      (await editorTb.get(`${siteOrigin("tarunbharat")}/sitemap.xml`)).text;
    expect(await sitemap()).toContain(article.slug);
    const copy = (await copyOf(article.articleId, "tarunbharat"))!;
    const res = await decide(editorTb, copy.id, "take-down-copy", { reason: "Rates changed" });
    expect(res.status).toBe(303);
    expect((await editorTb.get(reader("tarunbharat"))).status).toBe(404);
    expect(await sitemap()).not.toContain(article.slug);
    // D8: Paper B's copy is now the canonical one.
    const pb = await editorB.get(reader("paperb", "/mr"));
    expect(pb.status).toBe(200);
    expect(pb.text).toContain(`rel="canonical" href="${reader("paperb", "/mr")}"`);
  });

  it("[E2E-UI-28] publisher admin sees the queue but no decision buttons", async () => {
    const waiting = await readyToRelease({ institution: await freshInstitution() });
    expect((await releaseTo(editor, waiting.url, ["tarunbharat"])).status).toBe(303);
    const copy = (await copyOf(waiting.articleId, "tarunbharat"))!;
    const queue = await adminTb.get("/publisher");
    expect(queue.status).toBe(200);
    expect(queue.text).toContain(`data-queue-copy="${copy.id}"`);
    expect(queue.text).toContain("data-read-only");
    for (const form of ["approve-copy", "hold-copy", "take-down-copy", "run-due"]) {
      expect(queue.text, form).not.toContain(`data-form="${form}"`);
    }
    const preview = await adminTb.get(`/publisher/${copy.id}`);
    expect(preview.status).toBe(200);
    expect(preview.text).not.toContain('data-form="approve-copy"');
  });

  it("staff oversee every paper's queue read-only", async () => {
    const desk = await signInFully("desk.abc");
    const queue = await desk.get("/publisher?paper=paperb");
    expect(queue.status).toBe(200);
    expect(queue.text).toContain("data-paper-switcher");
    expect(queue.text).toContain('data-form="run-due"');
    expect(queue.text).not.toContain('data-form="approve-copy"');
    expect(queue.text).toContain("data-read-only");
  });

  it("needs a real web address from the editor before release (D44)", async () => {
    const marathi = await readyToRelease();
    await db()
      .update(schema.articles)
      .set({ slug: `draft-${marathi.slug.slice(-6)}` })
      .where(eq(schema.articles.id, marathi.articleId));
    let page = await editor.get(marathi.url);
    expect(page.text).toContain("data-needs-slug");
    expect(page.text).not.toContain('data-form="release"');
    const v = (
      await db()
        .select()
        .from(schema.articleVersions)
        .where(eq(schema.articleVersions.articleId, marathi.articleId))
    )[0]!;
    const res = await editor.submitForm(marathi.url, "save", {
      headline: v.headline,
      summary: v.summary,
      body: v.body,
      slug: marathi.slug,
    });
    expect(res.status).toBe(303);
    page = await editor.get(marathi.url);
    expect(page.text).not.toContain("data-needs-slug");
    expect(page.text).toContain('data-form="release"');
    expect((await releaseTo(editor, marathi.url, ["tarunbharat"])).status).toBe(303);
  });
});
