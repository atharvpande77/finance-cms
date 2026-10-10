import { beforeAll, describe, expect, it } from "vitest";
import { parse } from "node-html-parser";
import { pageText, siteOrigin, type HttpClient } from "../http-client";
import { menuLinks, person, signInFully } from "./auth-helpers";
import { BODY, createArticle, stateOf, step, type Created } from "./article-helpers";

describe("article workflow through the real pages (up to Editing)", () => {
  let writer: HttpClient;
  let approver: HttpClient;
  let compliance: HttpClient;
  let article: Created;

  beforeAll(async () => {
    const clients = await Promise.all(
      ["writer.amc", "approver.amc", "compliance.amc"].map(signInFully),
    );
    writer = clients[0]!;
    approver = clients[1]!;
    compliance = clients[2]!;
  });

  it("[E2E-UI-01] writer sees the Articles area and a New article button", async () => {
    expect(menuLinks(await writer.get("/dashboard"))).toContain("/articles");
    const list = await writer.get("/articles");
    expect(list.status).toBe(200);
    expect(list.text).toContain("data-new-article");
    expect(pageText(list.text)).toContain("New article");
  });

  it("[E2E-UI-02] new-article form loads with sections and papers", async () => {
    // D42–D44: the writer is the author; abcfinance's editor picks the papers and web address
    // at release, so the writer's form has sections but no author, paper or address fields.
    const res = await writer.get("/articles/new");
    expect(res.status).toBe(200);
    const text = pageText(res.text);
    for (const label of ["Mutual funds", "Health insurance", "Credit cards"])
      expect(text).toContain(label);
    expect(res.text).toContain('data-form="create"');
    for (const field of ['name="tenantIds"', 'name="authorId"', 'name="slug"', 'id="writtenAs"']) {
      expect(res.text, field).not.toContain(field);
    }
    expect(text).toContain("abcfinance's editor chooses the newspapers and the web address");
  });

  it("[E2E-UI-03] creating redirects to the new article", async () => {
    article = await createArticle(writer, {
      headline: `SIP basics from the AMC desk ${Date.now()}`,
    });
    expect(article.url).toMatch(/^\/articles\/[0-9a-f-]{36}\/en$/);
  });

  it("bylines the writer, and hides the web address from them (D42, D44)", async () => {
    const res = await writer.get(article.url);
    expect(pageText(res.text)).toContain("by Anita Kulkarni");
    expect(res.text).not.toContain('name="slug"');
    expect(res.text).toContain("data-papers-later");
  });

  it("shows writers only their own articles, with where each is live (D45)", async () => {
    const list = await writer.get("/articles");
    const sip = list.text.match(/data-article="sip-basics"[\s\S]*?<\/li>/)?.[0] ?? "";
    expect(sip).toContain('data-paper-status="published"');
    expect(parse(sip).textContent).toContain("Live on Paper B");
    expect(parse(sip).textContent).toContain("Live on Tarun Bharat");
    // An article by a colleague at the same institution stays out of sight.
    const admin = await signInFully("admin.amc");
    const theirs = await createArticle(admin, { headline: `Colleague's piece ${Date.now()}` });
    expect((await writer.get(theirs.url)).status).toBe(404);
    expect((await writer.get("/articles")).text).not.toContain(`data-article="${theirs.slug}"`);
    expect((await admin.get(article.url)).status).toBe(200);
  });

  it("[E2E-UI-04] draft page shows the editor and Submit button", async () => {
    const res = await writer.get(article.url);
    expect(res.status).toBe(200);
    expect(res.text).toContain('data-form="save"');
    expect(res.text).toContain('data-form="submit"');
    expect(pageText(res.text)).toContain("Submit for approval");
    expect(res.text).toContain("data-preview");
  });

  it("[E2E-UI-05] saving shows the new headline", async () => {
    const res = await step(writer, article.url, "save", {
      headline: "SIP basics: start small, stay steady",
      summary: "How a monthly SIP works.",
      body: BODY,
    });
    expect(res.status).toBe(303);
    const page = await writer.get(res.location!);
    expect(page.text).toMatch(/data-headline[^>]*>SIP basics: start small, stay steady</);
    expect(pageText(page.text)).toContain("Saved.");
  });

  it("[E2E-UI-06] a draft is not visible to readers", async () => {
    const reader = person();
    for (const paper of ["paperb", "tarunbharat"]) {
      const res = await reader.get(`${siteOrigin(paper)}/mutual-funds/${article.slug}`);
      expect(res.status, paper).toBe(404);
    }
    const section = await reader.get(`${siteOrigin("paperb")}/mutual-funds`);
    expect(section.text).not.toContain("start small, stay steady");
  });

  it("[E2E-UI-07] another organisation's writer cannot open the article", async () => {
    const other = await signInFully("admin.gi");
    expect((await other.get(article.url)).status).toBe(404);
    expect(pageText((await other.get("/articles")).text)).not.toContain("start small, stay steady");
  });

  it("[E2E-UI-08] submit moves it to In approval and locks editing", async () => {
    const res = await step(writer, article.url, "submit");
    expect(res.status).toBe(303);
    const page = await writer.get(article.url);
    expect(stateOf(page)).toBe("in_approval");
    expect(page.text).not.toContain('data-form="save"');
    expect(page.text).toContain("data-locked");
  });

  it("[E2E-UI-09] approver sees 'Your turn' on it", async () => {
    const list = await approver.get("/articles");
    const item =
      list.text.match(new RegExp(`data-article="${article.slug}"[\\s\\S]*?</li>`))?.[0] ?? "";
    expect(item).toContain("data-your-turn");
    expect(item).toContain("Your turn");
    expect(pageText((await approver.get("/dashboard")).text)).toContain("start small, stay steady");
  });

  it("[E2E-UI-10] returning without a comment shows an error", async () => {
    const res = await step(approver, article.url, "return", { comment: "" });
    expect(res.status).toBe(200);
    expect(pageText(res.text)).toContain("Say why you're returning it: a comment is required.");
  });

  it("[E2E-UI-11] approver approval moves to Compliance review", async () => {
    const res = await step(approver, article.url, "approve");
    expect(res.status).toBe(303);
    expect(stateOf(await approver.get(article.url))).toBe("compliance_review");
  });

  it("[E2E-UI-12] compliance sees the approve button", async () => {
    const page = await compliance.get(article.url);
    expect(page.text).toContain('data-form="approve"');
    expect(pageText(page.text)).toContain("Approve this language version");
  });

  it("[E2E-UI-13] compliance approval moves to Editing", async () => {
    const res = await step(compliance, article.url, "approve");
    expect(res.status).toBe(303);
    expect(stateOf(await compliance.get(article.url))).toBe("editing");
  });

  it("[E2E-UI-18] publisher cannot open the writing area", async () => {
    const editorTb = await signInFully("editor.tb");
    expect((await editorTb.get("/articles")).status).toBe(403);
    expect((await editorTb.get("/articles/new")).status).toBe(403);
    expect((await editorTb.get(article.url)).status).toBe(403);
  });

  it("[E2E-UI-27] an institution writer cannot open the publisher queue", async () => {
    expect((await writer.get("/publisher")).status).toBe(403);
  });
});
