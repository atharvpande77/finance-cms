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
  const tenants = await db().select().from(schema.tenants);
  const authors = await db().select().from(schema.authors);
  return {
    sectionId: section!.id,
    tenantIds: tenants.map((t) => t.id),
    author: (slug: string) => authors.find((a) => a.slug === slug)!.id,
  };
}

async function newAmcArticle() {
  const writer = await actor("writer.amc");
  const { sectionId, tenantIds, author } = await ids();
  const created = await createArticle(
    writer,
    {
      sectionId,
      language: "en",
      authorId: author("anita-kulkarni"),
      tenantIds,
      headline: "Debt funds for steady savers",
      slug: `debt-funds-${unique()}`,
      summary: "What debt funds are for.",
      body: BODY,
    },
    IP,
  );
  if (!created.ok) throw new Error(created.error);
  const [version] = await db()
    .select()
    .from(schema.articleVersions)
    .where(eq(schema.articleVersions.articleId, created.articleId));
  return { writer, articleId: created.articleId, version: version! };
}

async function rev(versionId: string) {
  const [v] = await db()
    .select()
    .from(schema.articleVersions)
    .where(eq(schema.articleVersions.id, versionId));
  return v!;
}

describe("creating articles", () => {
  it("starts a draft with targets, a create event and a 6-month review date", async () => {
    const { articleId, version } = await newAmcArticle();
    expect(version.state).toBe("draft");
    expect(version.tenantId).toBeNull();
    const [article] = await db()
      .select()
      .from(schema.articles)
      .where(eq(schema.articles.id, articleId));
    expect(article!.type).toBe("institution");
    expect(article!.reviewBy).toBe(addMonthsToDay(indianDate(article!.createdAt), 6));
    const targets = await db()
      .select()
      .from(schema.articleTargets)
      .where(eq(schema.articleTargets.articleId, articleId));
    expect(targets).toHaveLength(3);
    const events = await db()
      .select()
      .from(schema.workflowEvents)
      .where(eq(schema.workflowEvents.versionId, version.id));
    expect(events.map((e) => [e.action, e.fromState, e.toState])).toEqual([
      ["create", null, "draft"],
    ]);
  });

  it("refuses another institution's author profile and a taken slug", async () => {
    const writer = await actor("writer.amc");
    const { sectionId, tenantIds, author } = await ids();
    const base = {
      sectionId,
      language: "en" as const,
      tenantIds,
      headline: "A headline",
      summary: "",
      body: BODY,
    };
    const other = await createArticle(
      writer,
      { ...base, authorId: author("rahul-deshmukh"), slug: `x-${unique()}` },
      IP,
    );
    expect(other).toMatchObject({ ok: false, error: "Choose an author." });
    const taken = await createArticle(
      writer,
      { ...base, authorId: author("anita-kulkarni"), slug: "sip-basics" },
      IP,
    );
    expect(taken).toMatchObject({ ok: false });
    expect(!taken.ok && taken.error).toContain("already uses this web address");
  });

  it("makes abcfinance staff articles abcfinance or independent by author", async () => {
    const editor = await actor("editor.abc");
    const { sectionId, tenantIds, author } = await ids();
    const make = async (slug: string) =>
      createArticle(
        editor,
        {
          sectionId,
          language: "mr",
          authorId: author(slug),
          tenantIds,
          headline: "शीर्षक",
          slug: `a-${unique()}`,
          summary: "",
          body: BODY,
        },
        IP,
      );
    const staff = await make("abcfinance-desk");
    const expert = await make("suresh-patil");
    if (!staff.ok || !expert.ok) throw new Error("create failed");
    const rows = await db()
      .select({ id: schema.articles.id, type: schema.articles.type })
      .from(schema.articles)
      .where(inArray(schema.articles.id, [staff.articleId, expert.articleId]));
    expect(new Map(rows.map((r) => [r.id, r.type]))).toEqual(
      new Map([
        [staff.articleId, "abcfinance"],
        [expert.articleId, "independent"],
      ]),
    );
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
