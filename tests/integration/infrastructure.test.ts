import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db, schema } from "@/server/db/client";
import { hit } from "@/server/ratelimit";
import { queueEmail, readOutbox, sendQueued } from "@/server/mail/outbox";
import { eraseExpiredLeads, prunePageViews } from "@/server/jobs";
import { seal } from "@/server/crypto/secret-box";
import { audit } from "@/server/audit";

const unique = () => Math.random().toString(36).slice(2);

describe("rate limiter", () => {
  it("allows up to the limit in a window, then refuses, per subject", async () => {
    const subject = unique();
    const results = [];
    for (let i = 0; i < 6; i++) results.push((await hit("test:ip", subject, 5, 3600)).allowed);
    expect(results).toEqual([true, true, true, true, true, false]);
    expect((await hit("test:ip", unique(), 5, 3600)).allowed).toBe(true);
  });

  it("counts concurrent hits without losing any", async () => {
    const subject = unique();
    const counts = await Promise.all(
      Array.from({ length: 10 }, () => hit("test:burst", subject, 100, 60)),
    );
    expect(counts.map((c) => c.count).sort((a, b) => a - b)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
  });

  it("stores only a keyed hash of the subject", async () => {
    await hit("test:privacy", "9876543210", 3, 60);
    const rows = await db().execute(
      sql`SELECT key FROM rate_limits WHERE key LIKE 'test:privacy:%'`,
    );
    expect(JSON.stringify(rows)).not.toContain("9876543210");
  });
});

describe("mail outbox", () => {
  it("encrypts bodies at rest, sends, and keeps failures for retry", async () => {
    const to = `${unique()}@example.test`;
    await queueEmail({
      to,
      subject: "Hello",
      body: "Reset link: https://x/reset/abc",
      kind: "test",
    });
    const [row] = await db().select().from(schema.emailOutbox).where(eq(schema.emailOutbox.to, to));
    expect(row!.bodyEnc).not.toContain("reset/abc");

    const failing = await sendQueued(100, async () => {
      throw new Error("SMTP down");
    });
    expect(failing.failed).toBeGreaterThan(0);
    const [failed] = await db()
      .select()
      .from(schema.emailOutbox)
      .where(eq(schema.emailOutbox.to, to));
    expect(failed).toMatchObject({ status: "failed", attempts: 1 });
    expect(failed!.lastError).toContain("SMTP down");

    const delivered: string[] = [];
    await sendQueued(100, async (msg) => {
      delivered.push(msg.text);
    });
    const [sent] = await readOutbox(1, [row!.id]);
    expect(sent).toMatchObject({ status: "sent", attempts: 2, lastError: null });
    expect(delivered).toContain("Reset link: https://x/reset/abc");
  });

  it("leaves mail queued when no SMTP is configured", async () => {
    expect(await sendQueued(10, null)).toEqual({ sent: 0, failed: 0 });
  });
});

describe("scheduled job steps", () => {
  it("erases leads past retention but keeps the consent record", async () => {
    const [sponsor] = await db()
      .select()
      .from(schema.organisations)
      .where(eq(schema.organisations.slug, "sample-amc"));
    const [tenant] = await db()
      .select()
      .from(schema.tenants)
      .where(eq(schema.tenants.slug, "tarunbharat"));
    const now = new Date();
    const [lead] = await db()
      .insert(schema.leads)
      .values({
        sponsorOrgId: sponsor!.id,
        tenantId: tenant!.id,
        language: "en",
        nameEnc: seal("Test Person"),
        phoneEnc: seal("9876543210"),
        cityEnc: seal("Pune"),
        phoneHash: "h",
        interestKey: "sip",
        interestLabel: "Start a SIP",
        consentText: "I agree...",
        consentVersion: "v1",
        consentAt: now,
        sourcePage: "/en/mutual-funds/sip-basics",
        deleteAfter: new Date(now.getTime() - 1000),
      })
      .returning();

    expect(await eraseExpiredLeads(now)).toBeGreaterThanOrEqual(1);
    const [erased] = await db().select().from(schema.leads).where(eq(schema.leads.id, lead!.id));
    expect(erased).toMatchObject({ nameEnc: null, phoneEnc: null, cityEnc: null, phoneHash: null });
    expect(erased!.erasedAt).not.toBeNull();
    expect(erased).toMatchObject({
      consentText: "I agree...",
      consentVersion: "v1",
      status: "new",
    });
    // Idempotent: nothing more to erase.
    expect(await eraseExpiredLeads(now)).toBe(0);
  });

  it("prunes per-view rows older than 30 days", async () => {
    const [tenant] = await db()
      .select()
      .from(schema.tenants)
      .where(eq(schema.tenants.slug, "tarunbharat"));
    const now = new Date();
    const old = unique();
    const fresh = unique();
    await db()
      .insert(schema.pageViews)
      .values([
        {
          id: old,
          tenantId: tenant!.id,
          pagePath: "/",
          kind: "home",
          language: "mr",
          visitorHash: "v",
          viewedAt: new Date(now.getTime() - 31 * 86_400_000),
        },
        {
          id: fresh,
          tenantId: tenant!.id,
          pagePath: "/",
          kind: "home",
          language: "mr",
          visitorHash: "v",
          viewedAt: now,
        },
      ]);
    await prunePageViews(now);
    const ids = (await db().select({ id: schema.pageViews.id }).from(schema.pageViews)).map(
      (r) => r.id,
    );
    expect(ids).toContain(fresh);
    expect(ids).not.toContain(old);
  });
});

describe("database invariants (doc 03.7)", () => {
  it("refuses a role from another organisation type", async () => {
    const [user] = await db()
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, "writer.amc@demo.abcfinance.test"));
    const [org] = await db()
      .select()
      .from(schema.organisations)
      .where(eq(schema.organisations.slug, "sample-amc"));
    await expect(
      db()
        .insert(schema.memberships)
        .values({ userId: user!.id, organisationId: org!.id, role: "publisher_editor" }),
    ).rejects.toThrow();
  });

  it("refuses a paper copy in a language the paper does not publish", async () => {
    const [paperC] = await db()
      .select()
      .from(schema.tenants)
      .where(eq(schema.tenants.slug, "paperc"));
    const [section] = await db().select().from(schema.sections).limit(1);
    const [org] = await db()
      .select()
      .from(schema.organisations)
      .where(eq(schema.organisations.slug, "abcfinance"));
    const [article] = await db()
      .insert(schema.articles)
      .values({
        slug: `t-${unique()}`,
        type: "abcfinance",
        masterLanguage: "en",
        organisationId: org!.id,
        sectionId: section!.id,
        reviewBy: "2027-04-01",
      })
      .returning();
    await expect(
      db()
        .insert(schema.articleVersions)
        .values({
          articleId: article!.id,
          tenantId: paperC!.id,
          language: "en",
          headline: "x",
          state: "with_publisher",
        }),
    ).rejects.toThrow();
  });

  it("allows only one master draft per article and language", async () => {
    const [section] = await db().select().from(schema.sections).limit(1);
    const [org] = await db()
      .select()
      .from(schema.organisations)
      .where(eq(schema.organisations.slug, "abcfinance"));
    const [article] = await db()
      .insert(schema.articles)
      .values({
        slug: `t-${unique()}`,
        type: "abcfinance",
        masterLanguage: "en",
        organisationId: org!.id,
        sectionId: section!.id,
        reviewBy: "2027-04-01",
      })
      .returning();
    const master = {
      articleId: article!.id,
      language: "en",
      headline: "x",
      state: "draft" as const,
    };
    await db().insert(schema.articleVersions).values(master);
    await expect(db().insert(schema.articleVersions).values(master)).rejects.toThrow();
    await db()
      .insert(schema.articleVersions)
      .values({ ...master, language: "mr" });
  });

  it("never lets an audit event be edited", async () => {
    await audit({ action: "test.event", detail: { a: 1 } });
    await expect(
      db().execute(sql`UPDATE audit_events SET action = 'changed' WHERE action = 'test.event'`),
    ).rejects.toThrow();
  });
});
