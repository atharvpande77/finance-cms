import { and, desc, eq, inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db, schema } from "@/server/db/client";
import { membershipsOf } from "@/server/auth/sessions";
import { release, releasePreview } from "@/server/publishing/release";
import { saveVersion } from "@/server/articles/service";
import { decideCopy } from "@/server/publishing/decide";
import { DEEMED_ACTOR, publishDue } from "@/server/publishing/deemed";
import { copiesFor, queueFor, waitingCopies } from "@/server/publishing/queue";
import { canonicalCopy } from "@/server/content/queries";
import { runScheduledJob } from "@/server/jobs";

const IP = "10.2.0.2";
const HOUR = 3_600_000;
const unique = () => Math.random().toString(36).slice(2, 8);
const BODY =
  "A systematic investment plan puts the same amount into a mutual fund every month, which spreads purchases over time and builds a habit.";

async function actor(handle: string) {
  const [user] = await db()
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, `${handle}@demo.abcfinance.test`));
  return { user: { id: user!.id }, memberships: await membershipsOf(user!.id) };
}

async function tenantId(slug: string) {
  const [row] = await db().select().from(schema.tenants).where(eq(schema.tenants.slug, slug));
  return row!.id;
}

/** An article whose master version is already in Editing (the steps before are M3a's). */
async function editingArticle(
  opts: {
    org?: string;
    type?: "institution" | "abcfinance";
    language?: "en" | "mr";
    section?: string;
    body?: string;
    /** Papers the institution's approver chose (institution articles; default: all). */
    chosen?: string[];
  } = {},
) {
  const orgs = await db().select().from(schema.organisations);
  const sections = await db().select().from(schema.sections);
  const [article] = await db()
    .insert(schema.articles)
    .values({
      slug: `pub-${unique()}`,
      type: opts.type ?? "abcfinance",
      masterLanguage: opts.language ?? "en",
      organisationId: orgs.find((o) => o.slug === (opts.org ?? "abcfinance"))!.id,
      sectionId: sections.find((s) => s.slug === (opts.section ?? "mutual-funds"))!.id,
      reviewBy: "2027-04-01",
    })
    .returning();
  const [version] = await db()
    .insert(schema.articleVersions)
    .values({
      articleId: article!.id,
      language: opts.language ?? "en",
      headline: "How a monthly SIP works",
      summary: "The basics.",
      body: opts.body ?? BODY,
      state: "editing",
    })
    .returning();
  if (article!.type === "institution") {
    const tenants = await db().select().from(schema.tenants);
    const chosen = tenants.filter((t) =>
      (opts.chosen ?? tenants.map((x) => x.slug)).includes(t.slug),
    );
    if (chosen.length) {
      await db()
        .insert(schema.articleTargets)
        .values(chosen.map((t) => ({ articleId: article!.id, tenantId: t.id })));
    }
  }
  return { articleId: article!.id, versionId: version!.id };
}

async function version(id: string) {
  const [row] = await db()
    .select()
    .from(schema.articleVersions)
    .where(eq(schema.articleVersions.id, id));
  return row!;
}

async function copyOn(articleId: string, tenantSlug: string, language: string) {
  const tid = await tenantId(tenantSlug);
  const [row] = await db()
    .select()
    .from(schema.articleVersions)
    .where(
      and(
        eq(schema.articleVersions.articleId, articleId),
        eq(schema.articleVersions.tenantId, tid),
        eq(schema.articleVersions.language, language),
      ),
    );
  return row;
}

async function releaseTo(
  versionId: string,
  papers: string[],
  note: string | null = null,
  who = "editor.abc",
) {
  const v = await version(versionId);
  return release(
    await actor(who),
    versionId,
    v.rev,
    await Promise.all(papers.map(tenantId)),
    note,
    IP,
  );
}

async function eventsOf(versionId: string) {
  return db()
    .select()
    .from(schema.workflowEvents)
    .where(eq(schema.workflowEvents.versionId, versionId))
    .orderBy(schema.workflowEvents.id);
}

describe("release", () => {
  it("creates one copy per paper with its own rule and clock, and records the note", async () => {
    const { articleId, versionId } = await editingArticle({ language: "mr" });
    const before = Date.now();
    const result = await releaseTo(versionId, ["tarunbharat", "paperb"], "Good for Diwali week.");
    expect(result).toMatchObject({ ok: true, created: ["paperb", "tarunbharat"], skipped: [] });

    const master = await version(versionId);
    expect(master.state).toBe("with_publisher");
    for (const paper of ["tarunbharat", "paperb"]) {
      const copy = (await copyOn(articleId, paper, "mr"))!;
      expect(copy.state).toBe("with_publisher");
      expect(copy.requiresExplicit).toBe(false);
      expect(copy.body).toBe(BODY);
      // The 24-hour window starts at release.
      const window = copy.autoApproveAt!.getTime() - before;
      expect(window).toBeGreaterThanOrEqual(24 * HOUR - 1000);
      expect(window).toBeLessThan(24 * HOUR + 60_000);
      const [created] = await eventsOf(copy.id);
      expect(created).toMatchObject({ action: "release", comment: "Good for Diwali week." });
    }
    const masterEvents = await eventsOf(versionId);
    expect(masterEvents.at(-1)).toMatchObject({
      action: "release",
      fromState: "editing",
      toState: "with_publisher",
    });
    const [audit] = await db()
      .select()
      .from(schema.auditEvents)
      .where(eq(schema.auditEvents.action, "article.release"))
      .orderBy(desc(schema.auditEvents.id))
      .limit(1);
    expect(audit!.detail).toMatchObject({ versionId, note: "Good for Diwali week." });
  });

  it("refuses an unsupported language as a whole, and an empty choice", async () => {
    const { articleId, versionId } = await editingArticle({ language: "en" });
    const refused = await releaseTo(versionId, ["tarunbharat", "paperb"]);
    expect(refused).toMatchObject({ ok: false });
    expect(!refused.ok && refused.error).toContain("Tarun Bharat doesn't publish English");
    expect(await copyOn(articleId, "paperb", "en")).toBeUndefined();
    expect((await version(versionId)).state).toBe("editing");

    expect(await releaseTo(versionId, [])).toMatchObject({
      ok: false,
      error: "Choose at least one newspaper.",
    });
  });

  it("skips papers that already have it, refuses when all do, and can add papers later", async () => {
    const { articleId, versionId } = await editingArticle({ language: "mr" });
    expect(await releaseTo(versionId, ["paperb"])).toMatchObject({ ok: true });
    expect(await releaseTo(versionId, ["paperb"])).toMatchObject({
      ok: false,
      error: "Paper B already has this version.",
    });
    // D29: sending to more papers keeps the master with the publisher.
    const more = await releaseTo(versionId, ["paperb", "tarunbharat"]);
    expect(more).toMatchObject({ ok: true, created: ["tarunbharat"], skipped: ["Paper B"] });
    expect((await version(versionId)).state).toBe("with_publisher");
    expect(await copyOn(articleId, "tarunbharat", "mr")).toBeDefined();
    const copies = await copiesFor(articleId);
    expect(copies.map((c) => c.tenantSlug)).toEqual(["paperb", "tarunbharat"]);
  });

  it("refuses a stale page, and anyone but abcfinance's editors", async () => {
    const { versionId } = await editingArticle({ language: "mr" });
    const editor = await actor("editor.abc");
    const tb = await tenantId("tarunbharat");
    const stale = await release(editor, versionId, 5, [tb], null, IP);
    expect(stale).toMatchObject({ ok: false, code: "conflict" });
    const writer = await release(await actor("writer.abc"), versionId, 0, [tb], null, IP);
    // A writer doesn't even see an article they didn't file (D45).
    expect(writer).toEqual({ ok: false, error: "Article not found." });
    expect((await version(versionId)).state).toBe("editing");
  });

  it("previews each paper's rule: first three, flags and held sections force explicit", async () => {
    const life = await editingArticle({
      org: "sample-life-insurer",
      type: "institution",
      language: "mr",
      section: "life-insurance",
    });
    const flagged = await editingArticle({
      language: "mr",
      body: `${BODY} These plans give assured returns every year.`,
    });
    const editor = await actor("editor.abc");
    const lifePlan = await releasePreview(editor, life.versionId);
    const tbPlan = lifePlan!.papers.find((p) => p.slug === "tarunbharat")!;
    expect(tbPlan).toMatchObject({ plan: { action: "create" }, reasons: ["first_articles"] });
    const flaggedPlan = await releasePreview(editor, flagged.versionId);
    expect(flaggedPlan!.flags.map((f) => f.code)).toContain("promise");
    expect(flaggedPlan!.papers.every((p) => p.reasons.includes("flagged"))).toBe(true);
    expect(await releasePreview(await actor("writer.abc"), flagged.versionId)).toBeNull();

    // A held section on Paper C.
    const pc = await tenantId("paperc");
    await db()
      .update(schema.tenants)
      .set({ heldSectionSlugs: ["life-insurance"] })
      .where(eq(schema.tenants.id, pc));
    try {
      const abcLife = await editingArticle({ language: "mr", section: "life-insurance" });
      expect(await releaseTo(abcLife.versionId, ["paperc", "tarunbharat"])).toMatchObject({
        ok: true,
      });
      const held = (await copyOn(abcLife.articleId, "paperc", "mr"))!;
      expect(held).toMatchObject({ requiresExplicit: true, explicitReasons: ["held_section"] });
      expect(held.autoApproveAt).toBeNull();
      const other = (await copyOn(abcLife.articleId, "tarunbharat", "mr"))!;
      expect(other).toMatchObject({ requiresExplicit: false, explicitReasons: [] });
    } finally {
      await db()
        .update(schema.tenants)
        .set({ heldSectionSlugs: [] })
        .where(eq(schema.tenants.id, pc));
    }
  });
});

describe("what the editor decides at release (D43, D44)", () => {
  it("refuses a placeholder web address until the editor sets one", async () => {
    const { articleId, versionId } = await editingArticle({ language: "mr" });
    await db()
      .update(schema.articles)
      .set({ slug: `draft-${unique()}` })
      .where(eq(schema.articles.id, articleId));
    expect(await releaseTo(versionId, ["tarunbharat"])).toEqual({
      ok: false,
      error: "Set the web address before sending it to the newspapers.",
    });
    const editor = await actor("editor.abc");
    const v = await version(versionId);
    const text = { headline: v.headline, summary: v.summary, body: v.body };
    expect(
      await saveVersion(editor, versionId, v.rev, { ...text, slug: `draft-${unique()}` }, IP),
    ).toEqual({ ok: false, error: "Choose a web address that doesn't start with draft-." });
    const slug = `sip-in-marathi-${unique()}`;
    expect(await saveVersion(editor, versionId, v.rev, { ...text, slug }, IP)).toEqual({
      ok: true,
    });
    expect(await releaseTo(versionId, ["tarunbharat"])).toMatchObject({ ok: true });
    // Fixed once released.
    const after = await version(versionId);
    expect(
      await saveVersion(editor, versionId, after.rev, { ...text, slug: `${slug}-2` }, IP),
    ).toMatchObject({ ok: false });
  });

  it("sends an institution article only to the papers its approver chose (D46)", async () => {
    const editor = await actor("editor.abc");
    const amc = await editingArticle({
      org: "sample-amc",
      type: "institution",
      language: "mr",
      chosen: ["tarunbharat"],
    });
    const preview = (await releasePreview(editor, amc.versionId))!;
    const bySlug = new Map(preview.papers.map((p) => [p.slug, p]));
    expect(bySlug.get("tarunbharat")).toMatchObject({ targeted: true, plan: { action: "create" } });
    expect(bySlug.get("paperb")!.plan).toEqual({
      action: "refuse",
      reason: "Not chosen by Sample AMC",
    });
    const refused = await releaseTo(amc.versionId, ["tarunbharat", "paperb"]);
    expect(refused).toMatchObject({ ok: false });
    expect(!refused.ok && refused.error).toContain("Sample AMC didn't choose");
    expect(await copyOn(amc.articleId, "paperb", "mr")).toBeUndefined();
    expect(await releaseTo(amc.versionId, ["tarunbharat"])).toMatchObject({ ok: true });
    // abcfinance's own articles: any paper, none pre-ticked.
    const own = await editingArticle({ language: "mr" });
    const ownPreview = (await releasePreview(editor, own.versionId))!;
    expect(ownPreview.papers.filter((p) => p.targeted)).toEqual([]);
    expect(ownPreview.papers.find((p) => p.slug === "paperb")!.plan.action).toBe("create");
  });
});

describe("the paper's decisions", () => {
  async function waitingCopy() {
    const { articleId, versionId } = await editingArticle({ language: "mr" });
    expect(await releaseTo(versionId, ["tarunbharat", "paperb"])).toMatchObject({ ok: true });
    return {
      articleId,
      tb: (await copyOn(articleId, "tarunbharat", "mr"))!,
      pb: (await copyOn(articleId, "paperb", "mr"))!,
    };
  }

  it("hold needs a reason, stops the clock, and can't be repeated; approve publishes it", async () => {
    const { tb, pb } = await waitingCopy();
    const editor = await actor("editor.tb");
    expect(await decideCopy(editor, tb.id, tb.rev, "hold", "  ", IP)).toMatchObject({
      ok: false,
      error: "Give a reason.",
    });
    expect(await decideCopy(editor, tb.id, tb.rev, "hold", "Check the figures", IP)).toMatchObject({
      ok: true,
      state: "with_publisher",
    });
    const held = await version(tb.id);
    expect(held.heldAt).not.toBeNull();
    expect(held.autoApproveAt).toBeNull();
    expect(await decideCopy(editor, tb.id, held.rev, "hold", "Again", IP)).toMatchObject({
      ok: false,
      code: "forbidden",
    });
    expect(await decideCopy(editor, tb.id, held.rev, "approve", null, IP)).toMatchObject({
      ok: true,
      state: "published",
    });
    const live = await version(tb.id);
    expect(live).toMatchObject({ state: "published", approvalType: "explicit", heldAt: null });
    expect(live.publishedAt).not.toBeNull();
    // The other paper's copy is untouched.
    expect(await version(pb.id)).toMatchObject({ state: "with_publisher", rev: pb.rev });
    expect((await eventsOf(tb.id)).map((e) => e.action)).toEqual(["release", "hold", "approve"]);
  });

  it("only the owning paper's editor decides", async () => {
    const { tb } = await waitingCopy();
    expect(await decideCopy(await actor("editor.b"), tb.id, tb.rev, "approve", null, IP)).toEqual({
      ok: false,
      error: "Copy not found.",
    });
    expect(
      await decideCopy(await actor("admin.tb"), tb.id, tb.rev, "approve", null, IP),
    ).toMatchObject({ ok: false, code: "forbidden" });
    expect(
      await decideCopy(await actor("super.abc"), tb.id, tb.rev, "take_down", "x", IP),
    ).toMatchObject({ ok: false, code: "forbidden" });
    expect((await version(tb.id)).state).toBe("with_publisher");
  });

  it("take-down unpublishes and moves the canonical to the next paper (D8)", async () => {
    const { articleId, tb, pb } = await waitingCopy();
    const editorTb = await actor("editor.tb");
    const editorB = await actor("editor.b");
    expect(await decideCopy(editorTb, tb.id, tb.rev, "approve", null, IP)).toMatchObject({
      ok: true,
    });
    expect(await decideCopy(editorB, pb.id, pb.rev, "approve", null, IP)).toMatchObject({
      ok: true,
    });
    expect((await canonicalCopy(articleId, "mr"))?.tenantId).toBe(tb.tenantId);
    const live = await version(tb.id);
    expect(await decideCopy(editorTb, tb.id, live.rev, "take_down", "", IP)).toMatchObject({
      ok: false,
      error: "Give a reason.",
    });
    expect(
      await decideCopy(editorTb, tb.id, live.rev, "take_down", "Out of date", IP),
    ).toMatchObject({ ok: true, state: "unpublished" });
    expect((await canonicalCopy(articleId, "mr"))?.tenantId).toBe(pb.tenantId);
    const audits = await db()
      .select()
      .from(schema.auditEvents)
      .where(inArray(schema.auditEvents.action, ["copy.approve", "copy.take_down"]));
    const mine = audits.filter((x) => x.detail.versionId === tb.id);
    expect(mine.map((x) => x.action)).toEqual(["copy.approve", "copy.take_down"]);
    expect(mine[1]!.detail).toMatchObject({ reason: "Out of date", tenant: "tarunbharat" });
  });

  it("the queue and the dashboard show waiting copies only to the paper's people", async () => {
    const { tb } = await waitingCopy();
    const tbQueue = await queueFor(await actor("editor.tb"));
    expect(tbQueue!.papers.map((p) => p.slug)).toEqual(["tarunbharat"]);
    const card = tbQueue!.waiting.find((c) => c.copyId === tb.id)!;
    expect(card.actions).toEqual(["approve", "hold", "take_down"]);
    const adminQueue = await queueFor(await actor("admin.tb"));
    expect(adminQueue!.waiting.find((c) => c.copyId === tb.id)!.actions).toEqual([]);
    expect(adminQueue!.canRunDue).toBe(false);
    const staff = await queueFor(await actor("desk.abc"), "paperb");
    expect(staff!.papers.map((p) => p.slug)).toEqual(["paperb", "paperc", "tarunbharat"]);
    expect(staff!.paper.slug).toBe("paperb");
    expect(staff!.canRunDue).toBe(true);
    expect(await queueFor(await actor("writer.amc"))).toBeNull();
    expect((await waitingCopies(await actor("editor.tb"))).some((c) => c.copyId === tb.id)).toBe(
      true,
    );
    expect(await waitingCopies(await actor("admin.tb"))).toEqual([]);
  });
});

describe("deemed approval", () => {
  async function released(papers = ["tarunbharat"]) {
    const { articleId, versionId } = await editingArticle({ language: "mr" });
    expect(await releaseTo(versionId, papers)).toMatchObject({ ok: true });
    return { articleId, copy: (await copyOn(articleId, papers[0]!, "mr"))! };
  }

  it("publishes after the window as deemed, by the system, once", async () => {
    const { copy } = await released();
    const before = await publishDue(new Date(copy.autoApproveAt!.getTime() - 1000));
    expect(before.map((d) => d.copyId)).not.toContain(copy.id);
    expect((await version(copy.id)).state).toBe("with_publisher");

    const at = new Date(copy.autoApproveAt!.getTime() + 1000);
    const first = await publishDue(at);
    expect(first.map((d) => d.copyId)).toContain(copy.id);
    const live = await version(copy.id);
    expect(live).toMatchObject({ state: "published", approvalType: "deemed" });
    expect(live.publishedAt).toEqual(at);
    const event = (await eventsOf(copy.id)).at(-1)!;
    expect(event).toMatchObject({
      action: "deemed_approve",
      userId: null,
      actorLabel: DEEMED_ACTOR,
    });
    const audits = await db()
      .select()
      .from(schema.auditEvents)
      .where(eq(schema.auditEvents.action, "copy.deemed_approve"));
    const mine = audits.filter((x) => x.detail.versionId === copy.id);
    expect(mine).toHaveLength(1);
    expect(mine[0]!.userId).toBeNull();

    // Idempotent.
    expect((await publishDue(at)).map((d) => d.copyId)).not.toContain(copy.id);
    expect((await eventsOf(copy.id)).filter((e) => e.action === "deemed_approve")).toHaveLength(1);
  });

  it("never publishes held or explicit-only copies", async () => {
    const { copy: held } = await released();
    expect(
      await decideCopy(await actor("editor.tb"), held.id, held.rev, "hold", "Wait", IP),
    ).toMatchObject({ ok: true });
    const life = await editingArticle({
      org: "sample-life-insurer",
      type: "institution",
      language: "mr",
      section: "life-insurance",
    });
    expect(await releaseTo(life.versionId, ["tarunbharat"])).toMatchObject({ ok: true });
    const explicit = (await copyOn(life.articleId, "tarunbharat", "mr"))!;
    expect(explicit.requiresExplicit).toBe(true);

    const farFuture = new Date(Date.now() + 365 * 24 * HOUR);
    const swept = (await publishDue(farFuture, { tenantIds: [held.tenantId!] })).map(
      (d) => d.copyId,
    );
    expect(swept).not.toContain(held.id);
    expect(swept).not.toContain(explicit.id);
    expect((await version(held.id)).state).toBe("with_publisher");
    expect((await version(explicit.id)).state).toBe("with_publisher");
  });

  it("limits the button to the person's papers", async () => {
    const { articleId, copy } = await released(["tarunbharat", "paperb"]);
    const pbCopy = (await copyOn(articleId, "paperb", "mr"))!;
    const at = new Date(copy.autoApproveAt!.getTime() + 1000);
    const swept = (await publishDue(at, { tenantIds: [pbCopy.tenantId!] })).map((d) => d.copyId);
    expect(swept).toContain(pbCopy.id);
    expect(swept).not.toContain(copy.id);
    expect((await version(copy.id)).state).toBe("with_publisher");
  });

  it("skips a copy a person is deciding on right now (SKIP LOCKED), and the person wins", async () => {
    const { copy } = await released();
    const at = new Date(copy.autoApproveAt!.getTime() + 1000);
    let swept: string[] = [];
    await db().transaction(async (tx) => {
      // A person's decision in progress holds the row lock.
      await tx
        .select()
        .from(schema.articleVersions)
        .where(eq(schema.articleVersions.id, copy.id))
        .for("update");
      swept = (await publishDue(at)).map((d) => d.copyId);
      await tx
        .update(schema.articleVersions)
        .set({ heldAt: new Date(), autoApproveAt: null, rev: copy.rev + 1 })
        .where(eq(schema.articleVersions.id, copy.id));
    });
    expect(swept).not.toContain(copy.id);
    expect((await version(copy.id)).state).toBe("with_publisher");
  });

  it("a decision racing the sweep: exactly one of them applies", async () => {
    const { copy } = await released();
    const at = new Date(copy.autoApproveAt!.getTime() + 1000);
    const [hold, swept] = await Promise.all([
      decideCopy(await actor("editor.tb"), copy.id, copy.rev, "hold", "Wait", IP),
      publishDue(at),
    ]);
    const published = swept.some((d) => d.copyId === copy.id);
    expect(hold.ok).toBe(!published);
    const after = await version(copy.id);
    expect(after.state).toBe(published ? "published" : "with_publisher");
    expect(after.rev).toBe(copy.rev + 1);
  });

  it("runs as part of the scheduled job", async () => {
    const { copy } = await released();
    const result = await runScheduledJob(new Date(copy.autoApproveAt!.getTime() + 1000));
    expect(result.published).toBeGreaterThanOrEqual(1);
    expect((await version(copy.id)).approvalType).toBe("deemed");
  });
});
