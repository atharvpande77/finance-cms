import { and, desc, eq, inArray } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { db, schema } from "@/server/db/client";
import { pageText, siteOrigin, type HttpClient, type HttpResponse } from "../http-client";
import { demoEmail, signInFully, userByEmail } from "./auth-helpers";
import { createArticle, masterVersion, stateOf, step } from "./article-helpers";
import {
  RELEASE_BODY,
  copyOf,
  decide,
  eventsOf,
  freshInstitution,
  readyToRelease,
  releaseTo,
  windowEnded,
  type Ready,
} from "./publishing-helpers";

const HOUR = 3_600_000;
const NOT_ALLOWED = "You can't do that to this copy now.";
const readerUrl = (paper: string, a: Ready, prefix = "") =>
  `${siteOrigin(paper)}${prefix}/mutual-funds/${a.slug}`;

describe("release, the papers' decisions and deemed approval", () => {
  let editor: HttpClient;
  let editorTb: HttpClient;
  let adminTb: HttpClient;
  let editorB: HttpClient;

  /** An institution article (explicit approval on both papers). */
  let first: Ready;
  /** abcfinance articles (deemed approval). */
  let routine: Ready;
  let sweepable: Ready;

  beforeAll(async () => {
    [editor, editorTb, adminTb, editorB] = (await Promise.all(
      ["editor.abc", "editor.tb", "admin.tb", "editor.b"].map(signInFully),
    )) as [HttpClient, HttpClient, HttpClient, HttpClient];
    first = await readyToRelease({ institution: await freshInstitution() });
    routine = await readyToRelease();
    sweepable = await readyToRelease();
  });

  it("[E2E-WF-13] release needs at least one paper", async () => {
    const res = await releaseTo(editor, first.url, []);
    expect(res.status).toBe(200);
    expect(pageText(res.text)).toContain("Choose at least one newspaper.");
    expect((await masterVersion(first.articleId, "mr")).state).toBe("editing");
  });

  it("refuses a language a chosen paper doesn't publish, as a whole", async () => {
    const english = await readyToRelease({ language: "en" });
    const page = await editor.get(english.url);
    expect(page.text).toMatch(/data-paper="tarunbharat" data-paper-rule="unavailable"/);
    const res = await releaseTo(editor, english.url, ["tarunbharat", "paperb"], "", page);
    expect(pageText(res.text)).toContain("Tarun Bharat doesn't publish English");
    expect(await copyOf(english.articleId, "paperb", "en")).toBeUndefined();
    expect((await masterVersion(english.articleId, "en")).state).toBe("editing");
  });

  it("[E2E-WF-14] one-to-many release creates a copy per paper", async () => {
    const res = await releaseTo(
      editor,
      first.url,
      ["tarunbharat", "paperb"],
      "Please run this week.",
    );
    expect(res.status).toBe(303);
    expect(res.location).toBe(`${first.url}?done=release`);
    for (const paper of ["tarunbharat", "paperb"]) {
      const copy = await copyOf(first.articleId, paper);
      expect(copy, paper).toMatchObject({ state: "with_publisher", headline: first.headline });
    }
    expect(await copyOf(first.articleId, "paperc")).toBeUndefined();
  });

  it("[E2E-WF-15] master is marked released", async () => {
    expect((await masterVersion(first.articleId, "mr")).state).toBe("with_publisher");
    const page = await editor.get(first.url);
    expect(stateOf(page)).toBe("with_publisher");
    // Nobody edits after release: there is no save form and no second release of the same papers.
    expect(page.text).not.toContain('data-form="save"');
    expect(page.text).toContain('data-copy="tarunbharat"');
  });

  it("[E2E-WF-16] early articles from an institution need explicit approval", async () => {
    for (const paper of ["tarunbharat", "paperb"]) {
      const copy = (await copyOf(first.articleId, paper))!;
      expect(copy, paper).toMatchObject({
        requiresExplicit: true,
        explicitReasons: ["first_articles"],
        autoApproveAt: null,
      });
    }
  });

  it("[E2E-WF-17] releasing twice to the same paper is refused", async () => {
    // The page now offers to send it to more papers; choosing one that has it is refused.
    const page = await editor.get(first.url);
    expect(page.text).toContain("data-send-more");
    const res = await releaseTo(editor, first.url, ["paperb"], "", page);
    expect(pageText(res.text)).toContain("Paper B already has this version.");
    const copies = await db()
      .select()
      .from(schema.articleVersions)
      .where(eq(schema.articleVersions.articleId, first.articleId));
    expect(copies.filter((c) => c.tenantId !== null)).toHaveLength(2);
  });

  let tbPage: HttpResponse;

  it("[E2E-WF-18] another paper's editor cannot touch this copy", async () => {
    const copy = (await copyOf(first.articleId, "tarunbharat"))!;
    tbPage = await editorTb.get(`/publisher/${copy.id}`);
    expect(tbPage.status).toBe(200);
    expect(tbPage.text).toContain('data-form="approve-copy"');
    expect((await editorB.get(`/publisher/${copy.id}`)).status).toBe(404);
    const res = await decide(editorB, copy.id, "approve-copy", {}, tbPage);
    expect(pageText(res.text)).toContain("Copy not found.");
    expect(await copyOf(first.articleId, "tarunbharat")).toMatchObject({
      state: "with_publisher",
      rev: copy.rev,
    });
  });

  it("[E2E-WF-19] publisher admin cannot decide", async () => {
    const copy = (await copyOf(first.articleId, "tarunbharat"))!;
    const page = await adminTb.get(`/publisher/${copy.id}`);
    expect(page.status).toBe(200);
    expect(page.text).not.toContain('data-form="approve-copy"');
    for (const form of ["approve-copy", "hold-copy", "take-down-copy"] as const) {
      const res = await decide(adminTb, copy.id, form, { reason: "Admin says so" }, tbPage);
      expect(pageText(res.text), form).toContain(NOT_ALLOWED);
    }
    expect((await copyOf(first.articleId, "tarunbharat"))!.state).toBe("with_publisher");
  });

  it("[E2E-WF-20] hold needs a reason", async () => {
    expect((await releaseTo(editor, routine.url, ["tarunbharat"])).status).toBe(303);
    const copy = (await copyOf(routine.articleId, "tarunbharat"))!;
    const res = await decide(editorTb, copy.id, "hold-copy", { reason: "  " });
    expect(res.status).toBe(200);
    expect(pageText(res.text)).toContain("Give a reason.");
    expect((await copyOf(routine.articleId, "tarunbharat"))!.heldAt).toBeNull();
  });

  it("[E2E-WF-21] hold stops the clock and keeps it unpublished", async () => {
    const before = (await copyOf(routine.articleId, "tarunbharat"))!;
    expect(before.autoApproveAt).not.toBeNull();
    const res = await decide(editorTb, before.id, "hold-copy", { reason: "Waiting for new rates" });
    expect(res.status).toBe(303);
    expect(res.location).toBe(`/publisher/${before.id}?done=hold`);
    const held = (await copyOf(routine.articleId, "tarunbharat"))!;
    expect(held).toMatchObject({ state: "with_publisher", autoApproveAt: null });
    expect(held.heldAt).not.toBeNull();
    expect((await editorTb.get(readerUrl("tarunbharat", routine))).status).toBe(404);
    const page = pageText((await editorTb.get(`/publisher/${held.id}`)).text);
    expect(page).toContain("Waiting for new rates");
    // A held copy can't be held again.
    expect((await editorTb.get(`/publisher/${held.id}`)).text).not.toContain(
      'data-form="hold-copy"',
    );
  });

  it("[E2E-WF-22] explicit approval publishes and is recorded as explicit", async () => {
    const copy = (await copyOf(first.articleId, "tarunbharat"))!;
    const res = await decide(editorTb, copy.id, "approve-copy");
    expect(res.status).toBe(303);
    const live = (await copyOf(first.articleId, "tarunbharat"))!;
    expect(live).toMatchObject({ state: "published", approvalType: "explicit" });
    expect(live.publishedAt).not.toBeNull();
    const reader = await editorTb.get(readerUrl("tarunbharat", first));
    expect(reader.status).toBe(200);
    expect(pageText(reader.text)).toContain(first.headline);
  });

  it("[E2E-WF-23] the other paper's copy is unaffected", async () => {
    const pb = (await copyOf(first.articleId, "paperb"))!;
    expect(pb).toMatchObject({ state: "with_publisher", rev: 0, approvalType: null });
    expect((await editorB.get(readerUrl("paperb", first, "/mr"))).status).toBe(404);
  });

  it("[E2E-WF-24] takedown unpublishes", async () => {
    const copy = (await copyOf(first.articleId, "tarunbharat"))!;
    const noReason = await decide(editorTb, copy.id, "take-down-copy", { reason: "" });
    expect(pageText(noReason.text)).toContain("Give a reason.");
    const res = await decide(editorTb, copy.id, "take-down-copy", { reason: "Figures are stale" });
    expect(res.status).toBe(303);
    expect((await copyOf(first.articleId, "tarunbharat"))!.state).toBe("unpublished");
    expect((await editorTb.get(readerUrl("tarunbharat", first))).status).toBe(404);
  });

  let sweepCopyId: string;

  it("[E2E-WF-26] routine article gets a 24h veto window", async () => {
    const before = Date.now();
    expect((await releaseTo(editor, sweepable.url, ["tarunbharat"])).status).toBe(303);
    const copy = (await copyOf(sweepable.articleId, "tarunbharat"))!;
    sweepCopyId = copy.id;
    expect(copy).toMatchObject({ requiresExplicit: false, explicitReasons: [] });
    const window = copy.autoApproveAt!.getTime() - before;
    expect(window).toBeGreaterThan(24 * HOUR - 5000);
    expect(window).toBeLessThan(24 * HOUR + 60_000);
    const queue = await editorTb.get("/publisher");
    expect(queue.text).toContain(`data-queue-copy="${copy.id}"`);
    expect(pageText(queue.text)).toContain("Publishes automatically on");
  });

  it("[E2E-WF-27] sweep does nothing before the window ends", async () => {
    const res = await editorTb.submitForm("/publisher", "run-due");
    expect(res.status).toBe(303);
    expect(res.location).toMatch(/^\/publisher\?paper=tarunbharat&done=run_due&count=\d+$/);
    expect((await copyOf(sweepable.articleId, "tarunbharat"))!.state).toBe("with_publisher");
  });

  it("[E2E-WF-28] deemed approval publishes after the window", async () => {
    await windowEnded(sweepCopyId);
    const res = await editorTb.submitForm("/publisher", "run-due");
    expect(res.status).toBe(303);
    expect(Number(res.location!.match(/count=(\d+)/)![1])).toBeGreaterThanOrEqual(1);
    const live = (await copyOf(sweepable.articleId, "tarunbharat"))!;
    expect(live).toMatchObject({ state: "published", approvalType: "deemed" });
    const reader = await editorTb.get(readerUrl("tarunbharat", sweepable));
    expect(reader.status).toBe(200);
  });

  it("[E2E-WF-29] a held article is not auto-published", async () => {
    const held = (await copyOf(routine.articleId, "tarunbharat"))!;
    // Even with a deadline in the past, a hold wins.
    await windowEnded(held.id);
    expect((await editorTb.submitForm("/publisher", "run-due")).status).toBe(303);
    expect((await copyOf(routine.articleId, "tarunbharat"))!.state).toBe("with_publisher");
  });

  it("[E2E-WF-30] explicit-approval copies are never auto-published", async () => {
    const pb = (await copyOf(first.articleId, "paperb"))!;
    await windowEnded(pb.id);
    // Staff press the button for every paper (D28).
    const staff = await signInFully("super.abc");
    const res = await staff.submitForm("/publisher?paper=paperb", "run-due");
    expect(res.status).toBe(303);
    expect((await copyOf(first.articleId, "paperb"))!.state).toBe("with_publisher");
  });

  it("[E2E-WF-31] deemed approval is logged as a system action", async () => {
    const events = await eventsOf(sweepCopyId);
    const deemed = events.filter((e) => e.action === "deemed_approve");
    expect(deemed).toHaveLength(1);
    expect(deemed[0]).toMatchObject({
      userId: null,
      actorLabel: "deemed approval (system)",
      fromState: "with_publisher",
      toState: "published",
    });
    const audits = await db()
      .select()
      .from(schema.auditEvents)
      .where(eq(schema.auditEvents.action, "copy.deemed_approve"));
    const mine = audits.filter((a) => a.detail.versionId === sweepCopyId);
    expect(mine).toHaveLength(1);
    expect(mine[0]!.userId).toBeNull();
    expect(mine[0]!.detail.actor).toBe("deemed approval (system)");
    // The button press is recorded against the person who pressed it.
    expect(mine[0]!.detail.requestedBy).toBe((await userByEmail(demoEmail("editor.tb"))).id);
  });

  it("[E2E-WF-32] running the sweep twice is safe", async () => {
    const before = (await copyOf(sweepable.articleId, "tarunbharat"))!;
    const res = await editorTb.submitForm("/publisher", "run-due");
    expect(res.status).toBe(303);
    const after = (await copyOf(sweepable.articleId, "tarunbharat"))!;
    expect(after.rev).toBe(before.rev);
    expect(after.publishedAt).toEqual(before.publishedAt);
    expect((await eventsOf(sweepCopyId)).filter((e) => e.action === "deemed_approve")).toHaveLength(
      1,
    );
  });

  it("[E2E-WF-33] flagged content needs explicit approval", async () => {
    const flagged = await readyToRelease({
      body: `${RELEASE_BODY}\n\nThis plan gives assured returns every year.`,
    });
    const page = await editor.get(flagged.url);
    expect(page.text).toMatch(/data-paper="tarunbharat" data-paper-rule="explicit"/);
    expect(pageText(page.text)).toContain("The automated checks flagged it");
    expect((await releaseTo(editor, flagged.url, ["tarunbharat"], "", page)).status).toBe(303);
    const copy = (await copyOf(flagged.articleId, "tarunbharat"))!;
    expect(copy).toMatchObject({
      requiresExplicit: true,
      explicitReasons: ["flagged"],
      autoApproveAt: null,
    });
  });

  it("[E2E-WF-34] a new language on a released article starts as its own draft", async () => {
    const res = await step(editor, routine.url, "add-language", { to: "en" });
    expect(res.location).toBe(`/articles/${routine.articleId}/en?done=add_language`);
    expect((await masterVersion(routine.articleId, "en")).state).toBe("draft");
    // The released language and its copy are untouched.
    expect((await masterVersion(routine.articleId, "mr")).state).toBe("with_publisher");
    expect((await copyOf(routine.articleId, "tarunbharat"))!.state).toBe("with_publisher");
    expect(stateOf(await editor.get(`/articles/${routine.articleId}/en`))).toBe("draft");
  });

  it("[E2E-WF-39] every step is in the audit trail", async () => {
    const [writer, approver, compliance] = (await Promise.all(
      ["writer.amc", "approver.amc", "compliance.amc"].map(signInFully),
    )) as [HttpClient, HttpClient, HttpClient];
    const article = await createArticle(writer, { author: "anita-kulkarni" });
    expect((await step(writer, article.url, "submit")).status).toBe(303);
    expect((await step(approver, article.url, "approve")).status).toBe(303);
    expect((await step(compliance, article.url, "approve")).status).toBe(303);
    expect((await releaseTo(editor, article.url, ["paperb"], "For the weekend")).status).toBe(303);
    const copy = (await copyOf(article.articleId, "paperb", "en"))!;
    expect((await decide(editorB, copy.id, "hold-copy", { reason: "Check" })).status).toBe(303);
    expect((await decide(editorB, copy.id, "approve-copy")).status).toBe(303);
    expect((await decide(editorB, copy.id, "take-down-copy", { reason: "Withdrawn" })).status).toBe(
      303,
    );

    const master = await masterVersion(article.articleId);
    const handles = ["writer.amc", "approver.amc", "compliance.amc", "editor.abc", "editor.b"];
    const who = new Map(
      await Promise.all(
        handles.map(async (h) => [(await userByEmail(demoEmail(h))).id, h] as const),
      ),
    );
    const audits = await db()
      .select()
      .from(schema.auditEvents)
      .where(
        inArray(schema.auditEvents.action, [
          "article.create",
          "article.submit",
          "article.approve",
          "article.release",
          "copy.hold",
          "copy.approve",
          "copy.take_down",
        ]),
      )
      .orderBy(desc(schema.auditEvents.id))
      .limit(200);
    const trail = audits
      .filter((a) => a.detail.versionId === master.id || a.detail.versionId === copy.id)
      .reverse()
      .map((a) => `${a.action}:${who.get(a.userId!)}`);
    expect(trail).toEqual([
      "article.create:writer.amc",
      "article.submit:writer.amc",
      "article.approve:approver.amc",
      "article.approve:compliance.amc",
      "article.release:editor.abc",
      "copy.hold:editor.b",
      "copy.approve:editor.b",
      "copy.take_down:editor.b",
    ]);
    // The workflow history on the article page shows the papers' decisions too.
    const history = pageText((await editor.get(article.url)).text);
    expect(history).toContain("Bhavna Editor (Paper B) took it down on Paper B");
    expect(history).toContain("Withdrawn");
    const events = await db()
      .select()
      .from(schema.workflowEvents)
      .where(
        and(
          eq(schema.workflowEvents.versionId, copy.id),
          eq(schema.workflowEvents.action, "release"),
        ),
      );
    expect(events[0]!.comment).toBe("For the weekend");
  });
});
