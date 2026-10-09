import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { db, schema } from "@/server/db/client";
import { pageText, type HttpClient, type HttpResponse } from "../http-client";
import { demoEmail, signInFully, userByEmail } from "./auth-helpers";
import { BODY, createArticle, masterVersion, stateOf, step, type Created } from "./article-helpers";

const REFUSED = "You can't do that to this article now.";

describe("article workflow rules (up to Editing)", () => {
  let writer: HttpClient;
  let approver: HttpClient;
  let compliance: HttpClient;
  let editor: HttpClient;
  let otherApprover: HttpClient;
  let article: Created;
  let writersDraftPage: HttpResponse;

  beforeAll(async () => {
    const clients = await Promise.all(
      ["writer.amc", "approver.amc", "compliance.amc", "editor.abc", "approver.gi"].map(
        signInFully,
      ),
    );
    writer = clients[0]!;
    approver = clients[1]!;
    compliance = clients[2]!;
    editor = clients[3]!;
    otherApprover = clients[4]!;
  });

  it("[E2E-WF-01] new article starts as a draft", async () => {
    article = await createArticle(writer, { author: "anita-kulkarni" });
    writersDraftPage = await writer.get(article.url);
    expect(writersDraftPage.status).toBe(200);
    expect(stateOf(writersDraftPage)).toBe("draft");
    expect((await masterVersion(article.articleId)).state).toBe("draft");
  });

  it("[E2E-WF-02] writer cannot approve their own draft", async () => {
    // Replays the page's step form with action=approve, as a forged request would.
    const res = await step(writer, article.url, "submit", { action: "approve" }, writersDraftPage);
    expect(pageText(res.text)).toContain(REFUSED);
    expect((await masterVersion(article.articleId)).state).toBe("draft");
  });

  it("[E2E-WF-03] approver from another organisation cannot act", async () => {
    expect((await otherApprover.get(article.url)).status).toBe(404);
    const v = await masterVersion(article.articleId);
    const res = await step(
      otherApprover,
      article.url,
      "submit",
      {
        action: "approve",
        versionId: v.id,
        rev: String(v.rev),
      },
      writersDraftPage,
    );
    expect(pageText(res.text)).toContain("Article not found.");
    expect((await masterVersion(article.articleId)).state).toBe("draft");
  });

  it("[E2E-WF-04] submit moves draft to in approval", async () => {
    const res = await step(writer, article.url, "submit");
    expect(res.status).toBe(303);
    expect(res.location).toBe(`${article.url}?done=submit`);
    expect((await masterVersion(article.articleId)).state).toBe("in_approval");
  });

  it("[E2E-WF-05] writer cannot edit once submitted", async () => {
    const page = await writer.get(article.url);
    expect(page.text).not.toContain('data-form="save"');
    expect(page.text).toContain("data-locked");
    const res = await step(
      writer,
      article.url,
      "save",
      { headline: "Sneaky edit" },
      writersDraftPage,
    );
    expect(pageText(res.text)).toContain(REFUSED);
    expect((await masterVersion(article.articleId)).headline).not.toBe("Sneaky edit");
  });

  it("[E2E-WF-06] compliance cannot jump the approver", async () => {
    const v = await masterVersion(article.articleId);
    const page = await compliance.get(article.url);
    expect(page.text).not.toContain('data-form="approve"');
    const res = await step(
      compliance,
      article.url,
      "submit",
      {
        action: "approve",
        rev: String(v.rev),
      },
      writersDraftPage,
    );
    expect(pageText(res.text)).toContain(REFUSED);
    expect((await masterVersion(article.articleId)).state).toBe("in_approval");
  });

  it("[E2E-WF-07] return needs a comment", async () => {
    const res = await step(approver, article.url, "return", { comment: "" });
    expect(res.status).toBe(200);
    expect(pageText(res.text)).toContain("a comment is required");
    expect((await masterVersion(article.articleId)).state).toBe("in_approval");
  });

  it("[E2E-WF-08] return sends it back to draft", async () => {
    const res = await step(approver, article.url, "return", { comment: "Please add a source." });
    expect(res.location).toBe(`${article.url}?done=return`);
    expect((await masterVersion(article.articleId)).state).toBe("draft");
    expect(pageText((await writer.get(article.url)).text)).toContain("Please add a source.");
    expect((await step(writer, article.url, "submit")).status).toBe(303);
  });

  it("[E2E-WF-09] approver approval moves to compliance review", async () => {
    const res = await step(approver, article.url, "approve");
    expect(res.status).toBe(303);
    expect((await masterVersion(article.articleId)).state).toBe("compliance_review");
  });

  it("[E2E-WF-10] compliance approval moves to editing", async () => {
    const res = await step(compliance, article.url, "approve");
    expect(res.status).toBe(303);
    expect((await masterVersion(article.articleId)).state).toBe("editing");
  });

  it("[E2E-WF-11] institution writer cannot edit in editing", async () => {
    expect((await writer.get(article.url)).text).toContain("data-locked");
    const res = await step(
      writer,
      article.url,
      "save",
      { headline: "Writer edit" },
      writersDraftPage,
    );
    expect(pageText(res.text)).toContain(REFUSED);
  });

  it("[E2E-WF-12] abcfinance editor can edit", async () => {
    const res = await step(editor, article.url, "save", {
      headline: "SIP basics, edited by the desk",
      summary: "How a monthly SIP works.",
      body: BODY,
    });
    expect(res.status).toBe(303);
    expect((await masterVersion(article.articleId)).headline).toBe(
      "SIP basics, edited by the desk",
    );
  });

  it("[E2E-WF-25] abcfinance articles go straight to the editor", async () => {
    const abcWriter = await signInFully("writer.abc");
    const own = await createArticle(abcWriter, { author: "abcfinance-desk" });
    expect((await step(abcWriter, own.url, "submit")).status).toBe(303);
    expect((await masterVersion(own.articleId)).state).toBe("editing");
    const [row] = await db()
      .select()
      .from(schema.articles)
      .where(eq(schema.articles.id, own.articleId));
    expect(row!.type).toBe("abcfinance");
  });

  let marathiPage: HttpResponse;
  let withMarathi: Created;

  it("[E2E-WF-35] a Marathi version starts as its own draft", async () => {
    const fresh = await createArticle(writer, { author: "anita-kulkarni" });
    marathiPage = await writer.get(fresh.url);
    const res = await step(writer, fresh.url, "add-language", { to: "mr" }, marathiPage);
    expect(res.location).toBe(`/articles/${fresh.articleId}/mr?done=add_language`);
    const mr = await masterVersion(fresh.articleId, "mr");
    expect(mr.state).toBe("draft");
    expect(mr.id).not.toBe((await masterVersion(fresh.articleId, "en")).id);
    expect(stateOf(await writer.get(`/articles/${fresh.articleId}/mr`))).toBe("draft");
    withMarathi = fresh;
  });

  it("[E2E-WF-36] the same language cannot be added twice", async () => {
    const res = await step(writer, withMarathi.url, "add-language", { to: "mr" }, marathiPage);
    expect(pageText(res.text)).toContain("This article already has a Marathi version.");
    const versions = await db()
      .select()
      .from(schema.articleVersions)
      .where(eq(schema.articleVersions.articleId, withMarathi.articleId));
    expect(versions.filter((v) => v.language === "mr")).toHaveLength(1);
  });

  let raced: Created;

  it("[E2E-WF-37] two simultaneous submits: exactly one wins", async () => {
    raced = await createArticle(writer, { author: "anita-kulkarni" });
    const page = await writer.get(raced.url);
    const [a, b] = await Promise.all([
      step(writer, raced.url, "submit", {}, page),
      step(writer, raced.url, "submit", {}, page),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 303]);
    const loser = a.status === 200 ? a : b;
    expect(pageText(loser.text)).toContain("Someone else changed this article");
  });

  it("[E2E-WF-38] and the version moved only once", async () => {
    const v = await masterVersion(raced.articleId);
    expect(v.state).toBe("in_approval");
    const events = await db()
      .select()
      .from(schema.workflowEvents)
      .where(eq(schema.workflowEvents.versionId, v.id));
    expect(events.filter((e) => e.action === "submit")).toHaveLength(1);
  });

  it("[E2E-WF-40] events record who did it", async () => {
    // The first article in this suite went through every step up to Editing.
    const handles = ["writer.amc", "approver.amc", "compliance.amc"];
    const who = new Map(
      await Promise.all(
        handles.map(async (h) => [(await userByEmail(demoEmail(h))).id, h] as const),
      ),
    );
    const v = await masterVersion(article.articleId);
    const events = await db()
      .select()
      .from(schema.workflowEvents)
      .where(eq(schema.workflowEvents.versionId, v.id))
      .orderBy(schema.workflowEvents.id);
    expect(events.map((e) => `${e.action}:${who.get(e.userId!)}`)).toEqual([
      "create:writer.amc",
      "submit:writer.amc",
      "return:approver.amc",
      "submit:writer.amc",
      "approve:approver.amc",
      "approve:compliance.amc",
    ]);
    expect(events.find((e) => e.action === "return")!.comment).toBe("Please add a source.");
    const history = pageText((await editor.get(article.url)).text);
    expect(history).toContain("Wanda Writer (AMC) submitted it");
  });
});
