import { and, eq, inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db, schema } from "@/server/db/client";
import { membershipsOf } from "@/server/auth/sessions";
import { addLanguage, createArticle, saveVersion, transition } from "@/server/articles/service";
import { getForUser, listForUser, waitingFor } from "@/server/articles/queries";
import { addMonthsToDay, indianDate } from "@/domain/time";

const IP = "10.2.0.1";
const unique = () => Math.random().toString(36).slice(2, 8);
const BODY = "A systematic investment plan puts a fixed amount into a fund every month.";

async function actor(handle: string) {
  const [user] = await db()
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, `${handle}@demo.abcfinance.test`));
  return { user: { id: user!.id }, memberships: await membershipsOf(user!.id) };
}

async function ids() {
  const [section] = await db()
    .select()
    .from(schema.sections)
    .where(eq(schema.sections.slug, "mutual-funds"));
  const authors = await db().select().from(schema.authors);
  return {
    sectionId: section!.id,
    author: (slug: string) => authors.find((a) => a.slug === slug)!.id,
  };
}

async function newAmcArticle(headline = `Debt funds for steady savers ${unique()}`) {
  const writer = await actor("writer.amc");
  const { sectionId } = await ids();
  const created = await createArticle(
    writer,
    { sectionId, language: "en", headline, summary: "What debt funds are for.", body: BODY },
    IP,
  );
  if (!created.ok) throw new Error(created.error);
  const [version] = await db()
    .select()
    .from(schema.articleVersions)
    .where(eq(schema.articleVersions.articleId, created.articleId));
  const [article] = await db()
    .select()
    .from(schema.articles)
    .where(eq(schema.articles.id, created.articleId));
  return { writer, articleId: created.articleId, version: version!, article: article! };
}

async function rev(versionId: string) {
  const [v] = await db()
    .select()
    .from(schema.articleVersions)
    .where(eq(schema.articleVersions.id, versionId));
  return v!;
}

describe("creating articles", () => {
  it("starts a draft with a create event and a 6-month review date, and no papers yet", async () => {
    const { articleId, version, article } = await newAmcArticle();
    expect(version.state).toBe("draft");
    expect(version.tenantId).toBeNull();
    expect(article.type).toBe("institution");
    expect(article.reviewBy).toBe(addMonthsToDay(indianDate(article.createdAt), 6));
    // The editor chooses the papers at release (D43).
    const targets = await db()
      .select()
      .from(schema.articleTargets)
      .where(eq(schema.articleTargets.articleId, articleId));
    expect(targets).toHaveLength(0);
    const events = await db()
      .select()
      .from(schema.workflowEvents)
      .where(eq(schema.workflowEvents.versionId, version.id));
    expect(events.map((e) => [e.action, e.fromState, e.toState])).toEqual([
      ["create", null, "draft"],
    ]);
  });

  it("bylines the writer's own profile: the seeded one, or a new one reused afterwards", async () => {
    const { author } = await ids();
    const { article } = await newAmcArticle();
    expect(article.authorId).toBe(author("anita-kulkarni"));
    const admin = await actor("admin.amc");
    const { sectionId } = await ids();
    const make = () =>
      createArticle(
        admin,
        { sectionId, language: "en", headline: `Tax saving ${unique()}`, summary: "", body: BODY },
        IP,
      );
    const first = await make();
    const second = await make();
    if (!first.ok || !second.ok) throw new Error("create failed");
    const rows = await db()
      .select({ authorId: schema.articles.authorId })
      .from(schema.articles)
      .where(inArray(schema.articles.id, [first.articleId, second.articleId]));
    expect(new Set(rows.map((r) => r.authorId)).size).toBe(1);
    const [profile] = await db()
      .select()
      .from(schema.authors)
      .where(eq(schema.authors.id, rows[0]!.authorId!));
    expect(profile).toMatchObject({
      name: "Aditya Admin (AMC)",
      contributorType: "institution",
      userId: admin.user.id,
    });
  });

  it("generates the web address: readable from English, a placeholder otherwise, unique", async () => {
    const headline = `Index funds explained ${unique()}`;
    const one = await newAmcArticle(headline);
    const two = await newAmcArticle(headline);
    expect(one.article.slug).toBe(headline.toLowerCase().replace(/\s+/g, "-"));
    expect(two.article.slug).toMatch(new RegExp(`^${one.article.slug}-[a-z0-9]{6}$`));
    const marathi = await newAmcArticle("इंडेक्स फंड म्हणजे काय?");
    expect(marathi.article.slug).toMatch(/^draft-[a-z0-9]{6}$/);
  });

  it("refuses an expert byline for an institution writer", async () => {
    const writer = await actor("writer.amc");
    const { sectionId, author } = await ids();
    const res = await createArticle(
      writer,
      {
        sectionId,
        language: "en",
        writtenAs: `expert:${author("suresh-patil")}`,
        headline: "A headline",
        summary: "",
        body: BODY,
      },
      IP,
    );
    expect(res).toMatchObject({ ok: false, error: "Choose who it's written by." });
  });

  it("makes abcfinance staff articles abcfinance or independent by 'Written by'", async () => {
    const editor = await actor("editor.abc");
    const { sectionId, author } = await ids();
    const make = async (writtenAs: string) =>
      createArticle(
        editor,
        { sectionId, language: "mr", writtenAs, headline: "शीर्षक", summary: "", body: BODY },
        IP,
      );
    const staff = await make("self:abcfinance");
    const expert = await make(`expert:${author("suresh-patil")}`);
    if (!staff.ok || !expert.ok) throw new Error("create failed");
    const rows = await db()
      .select({
        id: schema.articles.id,
        type: schema.articles.type,
        authorId: schema.articles.authorId,
      })
      .from(schema.articles)
      .where(inArray(schema.articles.id, [staff.articleId, expert.articleId]));
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get(staff.articleId)!.type).toBe("abcfinance");
    expect(byId.get(expert.articleId)).toMatchObject({
      type: "independent",
      authorId: author("suresh-patil"),
    });
    // Staff must say who it's written by.
    expect(await make("")).toMatchObject({ ok: false });
  });

  it("lets only abcfinance's editors set the web address, never to a placeholder", async () => {
    const { version, article } = await newAmcArticle();
    const writer = await actor("writer.amc");
    const text = { headline: version.headline, summary: "", body: BODY };
    expect(
      await saveVersion(writer, version.id, version.rev, { ...text, slug: `mine-${unique()}` }, IP),
    ).toEqual({ ok: false, error: "Only abcfinance's editors set the web address." });
    // Saving without changing it is fine.
    expect(
      await saveVersion(writer, version.id, version.rev, { ...text, slug: article.slug }, IP),
    ).toEqual({ ok: true });
  });
});

describe("optimistic concurrency (D22)", () => {
  it("lets one of two saves from the same page through", async () => {
    const { writer, version } = await newAmcArticle();
    const first = await saveVersion(
      writer,
      version.id,
      version.rev,
      { headline: "First", summary: "", body: BODY },
      IP,
    );
    const second = await saveVersion(
      writer,
      version.id,
      version.rev,
      { headline: "Second", summary: "", body: BODY },
      IP,
    );
    expect(first.ok).toBe(true);
    expect(second).toMatchObject({ ok: false, code: "conflict" });
    expect((await rev(version.id)).headline).toBe("First");
  });

  it("lets exactly one of two simultaneous submits win, and moves the version once", async () => {
    const { writer, version } = await newAmcArticle();
    const results = await Promise.all([
      transition(writer, version.id, version.rev, "submit", null, IP),
      transition(writer, version.id, version.rev, "submit", null, IP),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toMatchObject({ code: "conflict" });
    const after = await rev(version.id);
    expect(after.state).toBe("in_approval");
    expect(after.rev).toBe(version.rev + 1);
    const events = await db()
      .select()
      .from(schema.workflowEvents)
      .where(
        and(
          eq(schema.workflowEvents.versionId, version.id),
          eq(schema.workflowEvents.action, "submit"),
        ),
      );
    expect(events).toHaveLength(1);
  });
});

describe("the approval chain", () => {
  it("walks institution → editing with an event and an audit row per step", async () => {
    const { writer, version } = await newAmcArticle();
    const approver = await actor("approver.amc");
    const compliance = await actor("compliance.amc");
    const editor = await actor("editor.abc");

    expect((await transition(writer, version.id, version.rev, "submit", null, IP)).ok).toBe(true);
    let v = await rev(version.id);
    expect(await transition(approver, v.id, v.rev, "return", " ", IP)).toMatchObject({
      ok: false,
      code: "comment",
    });
    expect((await transition(approver, v.id, v.rev, "approve", null, IP)).ok).toBe(true);
    v = await rev(version.id);
    expect((await transition(compliance, v.id, v.rev, "approve", "Fine for English", IP)).ok).toBe(
      true,
    );
    v = await rev(version.id);
    expect(v.state).toBe("editing");
    expect(
      (await saveVersion(writer, v.id, v.rev, { headline: "Nope", summary: "", body: BODY }, IP))
        .ok,
    ).toBe(false);
    expect(
      (await saveVersion(editor, v.id, v.rev, { headline: "Edited", summary: "", body: BODY }, IP))
        .ok,
    ).toBe(true);
    v = await rev(version.id);
    expect((await transition(editor, v.id, v.rev, "return", "Needs a source", IP)).ok).toBe(true);
    expect((await rev(version.id)).state).toBe("draft");

    const events = await db()
      .select()
      .from(schema.workflowEvents)
      .where(eq(schema.workflowEvents.versionId, version.id))
      .orderBy(schema.workflowEvents.id);
    expect(events.map((e) => `${e.action}:${e.toState}`)).toEqual([
      "create:draft",
      "submit:in_approval",
      "approve:compliance_review",
      "approve:editing",
      "return:draft",
    ]);
    expect(events.every((e) => e.userId)).toBe(true);
    expect(events.at(-1)!.comment).toBe("Needs a source");
    const audits = await db()
      .select({ action: schema.auditEvents.action })
      .from(schema.auditEvents)
      .where(
        inArray(schema.auditEvents.action, [
          "article.submit",
          "article.approve",
          "article.return",
          "article.save",
        ]),
      );
    expect(audits.length).toBeGreaterThanOrEqual(5);
  });
});

describe("languages", () => {
  it("adds a Marathi draft once, as a copy of the source", async () => {
    const { writer, articleId } = await newAmcArticle();
    const first = await addLanguage(writer, articleId, "en", "mr", IP);
    expect(first).toEqual({ ok: true, language: "mr" });
    const again = await addLanguage(writer, articleId, "en", "mr", IP);
    expect(again).toMatchObject({
      ok: false,
      error: "This article already has a Marathi version.",
    });
    const masters = await db()
      .select()
      .from(schema.articleVersions)
      .where(eq(schema.articleVersions.articleId, articleId));
    const mr = masters.find((m) => m.language === "mr")!;
    expect(mr.state).toBe("draft");
    expect(mr.body).toBe(BODY);
  });
});

describe("visibility", () => {
  it("hides one institution's articles from another and from newspapers", async () => {
    const { articleId } = await newAmcArticle();
    expect(await getForUser(await actor("writer.gi"), articleId, "en")).toBeNull();
    expect(await getForUser(await actor("editor.tb"), articleId, "en")).toBeNull();
    expect(await getForUser(await actor("approver.amc"), articleId, "en")).not.toBeNull();
    expect(await getForUser(await actor("desk.abc"), articleId, "en")).not.toBeNull();
    const giList = await listForUser(await actor("writer.gi"));
    expect(giList.find((i) => i.articleId === articleId)).toBeUndefined();
  });

  it("lists the approver's turn once the writer submits", async () => {
    const { writer, articleId, version } = await newAmcArticle();
    const approver = await actor("approver.amc");
    expect((await waitingFor(approver)).find((w) => w.articleId === articleId)).toBeUndefined();
    await transition(writer, version.id, version.rev, "submit", null, IP);
    expect((await waitingFor(approver)).find((w) => w.articleId === articleId)).toMatchObject({
      state: "in_approval",
      yourTurn: true,
    });
  });
});
