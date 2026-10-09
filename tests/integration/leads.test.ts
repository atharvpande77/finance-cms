import { and, eq, gte } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db, schema } from "@/server/db/client";
import { membershipsOf } from "@/server/auth/sessions";
import { open } from "@/server/crypto/secret-box";
import { tenantByHost, type Tenant } from "@/server/tenants";
import { captureLead, phoneHash, resolveSource, type ResolvedSource } from "@/server/leads/capture";
import { eraseLead, exportCsv, leadsFor, qualityFor, setStatus } from "@/server/leads/inbox";
import { eraseExpiredLeads } from "@/server/jobs";
import { readOutbox } from "@/server/mail/outbox";

const IP = "10.2.0.4";
let phoneCounter = 0;
/** A fresh valid mobile for each test, so leads never collide across tests. */
const freshPhone = () => `7${String(Date.now() % 1e8).padStart(8, "0")}${++phoneCounter % 10}`;
const lead = (phone = freshPhone()) => ({
  name: "Asha Patil",
  phone,
  city: "Kolhapur",
  interestKey: "sip",
  interestLabel: "Start a SIP",
});

async function actor(handle: string) {
  const [user] = await db()
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, `${handle}@demo.abcfinance.test`));
  return { user: { id: user!.id }, memberships: await membershipsOf(user!.id) };
}

async function tenant(slug: string): Promise<Tenant> {
  return (await tenantByHost(`${slug}.localhost`))!;
}

async function org(slug: string) {
  const [row] = await db()
    .select()
    .from(schema.organisations)
    .where(eq(schema.organisations.slug, slug));
  return row!;
}

/** The published copy of a seeded article on a paper. */
async function copyId(articleSlug: string, tenantSlug: string, language: string) {
  const t = await tenant(tenantSlug);
  const [row] = await db()
    .select({ id: schema.articleVersions.id })
    .from(schema.articleVersions)
    .innerJoin(schema.articles, eq(schema.articles.id, schema.articleVersions.articleId))
    .where(
      and(
        eq(schema.articles.slug, articleSlug),
        eq(schema.articleVersions.tenantId, t.id),
        eq(schema.articleVersions.language, language),
      ),
    );
  return row!.id;
}

async function amcSource(): Promise<{ t: Tenant; source: ResolvedSource }> {
  const t = await tenant("tarunbharat");
  const source = await resolveSource(t, "mr", {
    kind: "article",
    versionId: await copyId("sip-basics", "tarunbharat", "mr"),
  });
  return { t, source: source! };
}

describe("where a lead form may point", () => {
  it("resolves an institution article on this paper to its institution", async () => {
    const { source } = await amcSource();
    expect(source).toMatchObject({
      sponsorName: "Sample AMC",
      sectionSlug: "mutual-funds",
      language: "mr",
      sourcePage: "/mutual-funds/sip-basics",
      sourceCalculator: null,
    });
  });

  it("refuses abcfinance articles, drafts, other papers' copies and unsponsored calculators", async () => {
    const tb = await tenant("tarunbharat");
    const pb = await tenant("paperb");
    const abcArticle = await copyId("home-loan-checklist", "tarunbharat", "mr");
    expect(await resolveSource(tb, "mr", { kind: "article", versionId: abcArticle })).toBeNull();
    const pbCopy = await copyId("sip-basics", "paperb", "en");
    expect(await resolveSource(tb, "mr", { kind: "article", versionId: pbCopy })).toBeNull();
    expect(await resolveSource(pb, "en", { kind: "article", versionId: pbCopy })).not.toBeNull();
    const [master] = await db()
      .select()
      .from(schema.articleVersions)
      .innerJoin(schema.articles, eq(schema.articles.id, schema.articleVersions.articleId))
      .where(eq(schema.articles.slug, "debt-funds-vs-equity-funds"));
    expect(
      await resolveSource(pb, "en", { kind: "article", versionId: master!.article_versions.id }),
    ).toBeNull();
    expect(await resolveSource(tb, "mr", { kind: "article", versionId: "not-a-uuid" })).toBeNull();
    for (const calculator of ["emi", "gold-loan", "home-loan-eligibility"]) {
      expect(
        await resolveSource(tb, "mr", { kind: "calculator", calculator, place: "calculator_page" }),
      ).toBeNull();
    }
    // An exclusive category suppresses another sponsor's calculator (D34).
    expect(
      await resolveSource(tb, "mr", {
        kind: "calculator",
        calculator: "health-cover",
        place: "section_page",
        section: "life-insurance",
      }),
    ).toBeNull();
    // English isn't a Tarun Bharat language.
    expect(
      await resolveSource(tb, "en", {
        kind: "calculator",
        calculator: "sip",
        place: "calculator_page",
      }),
    ).toBeNull();
  });

  it("resolves a sponsored calculator to its sponsor and section", async () => {
    const pb = await tenant("paperb");
    expect(
      await resolveSource(pb, "en", {
        kind: "calculator",
        calculator: "motor-premium",
        place: "calculator_page",
      }),
    ).toMatchObject({
      sponsorName: "Sample General Insurer",
      sectionSlug: "motor-insurance",
      sourcePage: "/calculators/motor-premium",
      sourceCalculator: "motor-premium",
    });
    const article = await copyId("how-much-term-cover", "paperb", "en");
    expect(
      await resolveSource(pb, "en", {
        kind: "calculator",
        calculator: "term-cover",
        place: "article",
        versionId: article,
      }),
    ).toMatchObject({ sponsorName: "Sample Life Insurer", sourceVersionId: article });
  });
});

describe("capturing a lead", () => {
  it("stores the details encrypted with the consent record, retention and emails", async () => {
    const { t, source } = await amcSource();
    const l = lead();
    const before = Date.now();
    const result = await captureLead({ tenant: t, source, lead: l, ip: IP });
    expect(result.status).toBe("stored");
    const [row] = await db()
      .select()
      .from(schema.leads)
      .where(eq(schema.leads.id, (result as { leadId: string }).leadId));
    expect(row!.nameEnc).not.toContain("Asha");
    expect(open(row!.nameEnc!)).toBe("Asha Patil");
    expect(open(row!.phoneEnc!)).toBe(l.phone);
    expect(row!.phoneHash).toBe(phoneHash(l.phone));
    expect(JSON.stringify(row)).not.toContain(l.phone);
    expect(row!.consentText).toContain("Sample AMC");
    expect(row!.consentVersion).toBe("v1");
    const days = (row!.deleteAfter.getTime() - before) / 86_400_000;
    expect(Math.round(days)).toBe(365);

    const ids = await db()
      .select({ id: schema.emailOutbox.id })
      .from(schema.emailOutbox)
      .where(
        and(
          eq(schema.emailOutbox.kind, "lead.new"),
          gte(schema.emailOutbox.createdAt, new Date(before - 1000)),
        ),
      );
    const mine = await readOutbox(
      50,
      ids.map((x) => x.id),
    );
    expect(mine.map((m) => m.to)).toEqual(["admin.amc@demo.abcfinance.test"]);
    expect(mine[0]!.body).not.toContain("Asha");
    expect(mine[0]!.body).not.toContain(l.phone);
    expect(mine[0]!.body).toContain("http://localhost:3000/leads");
  });

  it("uses the sponsor's own retention period", async () => {
    const pb = await tenant("paperb");
    const source = await resolveSource(pb, "en", {
      kind: "calculator",
      calculator: "health-cover",
      place: "calculator_page",
    });
    const result = await captureLead({
      tenant: pb,
      source: source!,
      lead: { ...lead(), interestKey: "myself", interestLabel: "For myself" },
      ip: IP,
    });
    const [row] = await db()
      .select()
      .from(schema.leads)
      .where(eq(schema.leads.id, (result as { leadId: string }).leadId));
    expect(Math.round((row!.deleteAfter.getTime() - row!.createdAt.getTime()) / 86_400_000)).toBe(
      180,
    );
  });

  it("doesn't store a repeat to the same sponsor, even when sent at the same moment", async () => {
    const { t, source } = await amcSource();
    const l = lead();
    const results = await Promise.all([
      captureLead({ tenant: t, source, lead: l, ip: IP }),
      captureLead({ tenant: t, source, lead: l, ip: IP }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual(["repeat", "stored"]);
    expect((await captureLead({ tenant: t, source, lead: l, ip: IP })).status).toBe("repeat");
    expect(await db().$count(schema.leads, eq(schema.leads.phoneHash, phoneHash(l.phone)))).toBe(1);
  });

  it("stores at most three leads a day for one phone across sponsors", async () => {
    const { t, source } = await amcSource();
    const phone = freshPhone();
    const sponsors = await Promise.all(
      ["sample-amc", "sample-general-insurer", "sample-life-insurer", "abcfinance"].map(org),
    );
    const statuses = [];
    for (const s of sponsors) {
      const result = await captureLead({
        tenant: t,
        source: { ...source, sponsorOrgId: s.id, sponsorName: s.name },
        lead: lead(phone),
        ip: IP,
      });
      statuses.push(result.status);
    }
    expect(statuses).toEqual(["stored", "stored", "stored", "phone_limit"]);
  });
});

describe("the sponsor's inbox", () => {
  it("shows a sponsor only its own leads, decrypted, with the quality report", async () => {
    const { t, source } = await amcSource();
    const l = lead();
    await captureLead({ tenant: t, source, lead: l, ip: IP });
    const amc = await org("sample-amc");
    const leads = (await leadsFor(await actor("admin.amc"), amc.id))!;
    expect(leads.find((x) => x.phone === l.phone)).toMatchObject({
      name: "Asha Patil",
      city: "Kolhapur",
      paper: "Tarun Bharat",
      status: "new",
    });
    expect(await leadsFor(await actor("admin.gi"), amc.id)).toBeNull();
    expect(await leadsFor(await actor("super.abc"), amc.id)).toBeNull();
    expect((await qualityFor(await actor("admin.amc"), amc.id))!.total).toBeGreaterThan(0);
  });

  it("sets status and note, erases details but keeps consent, and audits all of it", async () => {
    const { t, source } = await amcSource();
    const l = lead();
    const { leadId } = (await captureLead({ tenant: t, source, lead: l, ip: IP })) as {
      leadId: string;
    };
    const admin = await actor("admin.amc");
    expect(await setStatus(await actor("admin.gi"), leadId, "junk", "", IP)).toEqual({
      ok: false,
      error: "Lead not found.",
    });
    expect(await setStatus(admin, leadId, "qualified", "Wants a SIP of 10k", IP)).toEqual({
      ok: true,
    });
    let [row] = await db().select().from(schema.leads).where(eq(schema.leads.id, leadId));
    expect(row).toMatchObject({ status: "qualified", note: "Wants a SIP of 10k" });
    expect(row!.contactedAt).not.toBeNull();

    expect(await eraseLead(admin, leadId, IP)).toEqual({ ok: true });
    [row] = await db().select().from(schema.leads).where(eq(schema.leads.id, leadId));
    expect(row).toMatchObject({
      nameEnc: null,
      phoneEnc: null,
      cityEnc: null,
      phoneHash: null,
      ipHash: null,
      note: null,
      status: "qualified",
    });
    expect(row!.consentText).toContain("Sample AMC");
    expect(row!.erasedAt).not.toBeNull();
    const actions = (await db().select().from(schema.auditEvents))
      .filter((a) => a.detail.leadId === leadId)
      .map((a) => a.action);
    expect(actions).toEqual(["lead.status", "lead.erase"]);
  });

  it("exports CSV with formulas neutralised, and only for the sponsor", async () => {
    const { t, source } = await amcSource();
    await captureLead({
      tenant: t,
      source,
      lead: { ...lead(), name: "=HYPERLINK(evil)" },
      ip: IP,
    });
    const amc = await org("sample-amc");
    const out = (await exportCsv(await actor("admin.amc"), amc.id, IP))!;
    expect(out.csv.startsWith("﻿")).toBe(true);
    expect(out.csv).toContain(`"'=HYPERLINK(evil)"`);
    expect(out.csv).toContain("Consent text");
    expect(await exportCsv(await actor("admin.gi"), amc.id, IP)).toBeNull();
  });

  it("the retention purge blanks personal fields, hashes and the note", async () => {
    const { t, source } = await amcSource();
    const { leadId } = (await captureLead({ tenant: t, source, lead: lead(), ip: IP })) as {
      leadId: string;
    };
    await db()
      .update(schema.leads)
      .set({ note: "Call after 6", deleteAfter: new Date(Date.now() - 1000) })
      .where(eq(schema.leads.id, leadId));
    expect(await eraseExpiredLeads(new Date())).toBeGreaterThanOrEqual(1);
    const [row] = await db().select().from(schema.leads).where(eq(schema.leads.id, leadId));
    expect(row).toMatchObject({ nameEnc: null, phoneHash: null, ipHash: null, note: null });
    expect(row!.consentText).not.toBe("");
  });
});
