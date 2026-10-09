import { and, desc, eq, inArray } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { parse } from "node-html-parser";
import { db, schema } from "@/server/db/client";
import { membershipsOf } from "@/server/auth/sessions";
import { leadsFor } from "@/server/leads/inbox";
import { pageText, type HttpClient } from "../http-client";
import { demoEmail, person, signInFully, userByEmail } from "./auth-helpers";
import { E2E_CRON_SECRET } from "./global-setup";
import {
  PAGES,
  details,
  freshPhone,
  leadsByPhone,
  orgId,
  phoneHash,
  submitLead,
} from "./lead-helpers";

/** The sponsor's Leads inbox (04.6). */
describe("the sponsor's leads inbox", () => {
  let adminAmc: HttpClient;
  let adminGi: HttpClient;
  const amcPhone = freshPhone();
  const formulaPhone = freshPhone();
  const giPhone = freshPhone();
  let amcLeadId: string;
  let giLeadId: string;

  beforeAll(async () => {
    const reader = person();
    const amcPage = await reader.get(PAGES.amcArticle);
    await submitLead(person(), PAGES.amcArticle, details(amcPhone), amcPage);
    await submitLead(
      person(),
      PAGES.amcArticle,
      { ...details(formulaPhone), name: "=HYPERLINK(evil)" },
      amcPage,
    );
    const giPage = await reader.get(PAGES.giArticle);
    await submitLead(person(), PAGES.giArticle, details(giPhone, "myself"), giPage);
    amcLeadId = (await leadsByPhone(amcPhone))[0]!.id;
    giLeadId = (await leadsByPhone(giPhone))[0]!.id;
    [adminAmc, adminGi] = (await Promise.all(["admin.amc", "admin.gi"].map(signInFully))) as [
      HttpClient,
      HttpClient,
    ];
  });

  const card = (html: string, id: string) => parse(html).querySelector(`[data-lead="${id}"]`);

  it("[E2E-LEAD-34] an account admin sees their leads, decrypted", async () => {
    const res = await adminAmc.get("/leads");
    expect(res.status).toBe(200);
    const lead = card(res.text, amcLeadId)!;
    expect(lead.querySelector("[data-lead-name]")!.textContent).toBe("Asha Patil");
    expect(lead.querySelector("[data-lead-phone]")!.getAttribute("href")).toBe(
      `tel:+91${amcPhone}`,
    );
    expect(lead.textContent).toContain("Kolhapur");
    expect(lead.textContent).toContain("Start a SIP");
    expect(lead.textContent).toContain("Paper B");
  });

  it("[E2E-LEAD-35] the quality report is shown", async () => {
    const res = await adminAmc.get("/leads");
    const quality = parse(res.text).querySelector("[data-quality]")!;
    expect(quality.textContent).toContain("Lead quality");
    for (const key of ["total", "worked", "qualified", "junk"]) {
      expect(quality.querySelector(`[data-quality-value="${key}"]`), key).not.toBeNull();
    }
    expect(
      Number(quality.querySelector('[data-quality-value="total"]')!.textContent),
    ).toBeGreaterThanOrEqual(2);
  });

  it("[E2E-LEAD-36] the consent record is available per lead", async () => {
    const lead = card((await adminAmc.get("/leads")).text, amcLeadId)!;
    const record = lead.querySelector("[data-consent-record]")!.textContent;
    expect(record).toContain("I agree that Sample AMC may contact me by phone");
    expect(record).toContain("Version v1");
  });

  it("[E2E-LEAD-37] another sponsor's leads are not shown", async () => {
    const res = await adminAmc.get("/leads");
    expect(card(res.text, giLeadId)).toBeNull();
    expect(pageText(res.text)).not.toContain(giPhone);
  });

  it("[E2E-LEAD-38] the other sponsor sees only their own leads", async () => {
    const res = await adminGi.get("/leads");
    expect(card(res.text, giLeadId)).not.toBeNull();
    expect(card(res.text, amcLeadId)).toBeNull();
    // Asking for the AMC's inbox by id still shows the General Insurer's own.
    const forged = await adminGi.get(`/leads?org=${await orgId("sample-amc")}`);
    expect(card(forged.text, amcLeadId)).toBeNull();
  });

  it("[E2E-LEAD-39] a writer cannot open the leads area", async () => {
    const writer = await signInFully("writer.amc");
    expect((await writer.get("/leads")).status).toBe(403);
  });

  it("[E2E-LEAD-40] abcfinance staff cannot export a sponsor's leads", async () => {
    const amcInbox = await adminAmc.get("/leads");
    for (const handle of ["super.abc", "desk.abc"]) {
      const staff = await signInFully(handle);
      expect((await staff.get("/leads")).status, handle).toBe(403);
      const res = await staff.submitForm("/leads", "leads-export", {}, { page: amcInbox });
      expect(res.status, handle).toBe(403);
      expect(res.text).not.toContain(amcPhone);
    }
  });

  it("[E2E-LEAD-41] signed-out visitors cannot export", async () => {
    const amcInbox = await adminAmc.get("/leads");
    const res = await person().submitForm("/leads", "leads-export", {}, { page: amcInbox });
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.location ?? "").toMatch(/\/login$/);
    expect(res.text).not.toContain(amcPhone);
  });

  it("[E2E-LEAD-42] marking a lead qualified saves the status, note and contact time", async () => {
    const res = await adminAmc.submitForm("/leads", `lead-status-${amcLeadId}`, {
      status: "qualified",
      note: "Wants a ₹10,000 SIP",
    });
    expect(res.status).toBe(303);
    expect(res.location).toContain("done=status");
    const [lead] = await db().select().from(schema.leads).where(eq(schema.leads.id, amcLeadId));
    expect(lead).toMatchObject({ status: "qualified", note: "Wants a ₹10,000 SIP" });
    expect(lead!.contactedAt).not.toBeNull();
  });

  it("[E2E-LEAD-43] the status filter works", async () => {
    const qualified = await adminAmc.get("/leads?status=qualified");
    expect(card(qualified.text, amcLeadId)).not.toBeNull();
    const fresh = (await leadsByPhone(formulaPhone))[0]!.id;
    expect(card(qualified.text, fresh)).toBeNull();
    const news = await adminAmc.get("/leads?status=new");
    expect(card(news.text, fresh)).not.toBeNull();
    expect(card(news.text, amcLeadId)).toBeNull();
  });

  it("[E2E-LEAD-44] an admin cannot change another sponsor's lead", async () => {
    const amcInbox = await adminAmc.get("/leads");
    const res = await adminGi.submitForm(
      "/leads",
      `lead-status-${amcLeadId}`,
      { status: "junk", note: "" },
      { page: amcInbox },
    );
    expect(pageText(res.text)).toContain("Lead not found.");
    const [lead] = await db().select().from(schema.leads).where(eq(schema.leads.id, amcLeadId));
    expect(lead!.status).toBe("qualified");
  });

  let csv = "";

  it("[E2E-LEAD-45] the CSV export downloads with the consent record", async () => {
    const res = await adminAmc.submitForm("/leads", "leads-export");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("content-disposition")).toMatch(/^attachment; filename="leads-/);
    expect(res.headers.get("cache-control")).toBe("no-store");
    csv = res.text;
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain('"Consent text","Consent version","Consent time"');
    expect(csv).toContain(amcPhone);
    expect(csv).toContain("I agree that Sample AMC may contact me by phone");
  });

  it("[E2E-LEAD-46] spreadsheet formulas in names are neutralised", () => {
    expect(csv).toContain(`"'=HYPERLINK(evil)"`);
    expect(csv).not.toMatch(/(^|,)"=HYPERLINK/m);
  });

  it("[E2E-LEAD-47] only the sponsor's own leads are in the export", () => {
    expect(csv).not.toContain(giPhone);
    expect(csv).not.toContain("Sample General Insurer");
  });

  it("[E2E-LEAD-48] the export is recorded in the audit trail", async () => {
    const [row] = await db()
      .select()
      .from(schema.auditEvents)
      .where(eq(schema.auditEvents.action, "leads.export"))
      .orderBy(desc(schema.auditEvents.id))
      .limit(1);
    expect(row!.userId).toBe((await userByEmail(demoEmail("admin.amc"))).id);
    expect(row!.detail).toMatchObject({ organisationId: await orgId("sample-amc") });
    expect(row!.detail.count).toBeGreaterThanOrEqual(2);
  });

  it("[E2E-LEAD-49] deleting a person's details removes them but keeps the consent record", async () => {
    const res = await adminAmc.submitForm("/leads", `lead-erase-${amcLeadId}`);
    expect(res.status).toBe(303);
    const [lead] = await db().select().from(schema.leads).where(eq(schema.leads.id, amcLeadId));
    expect(lead).toMatchObject({
      nameEnc: null,
      phoneEnc: null,
      cityEnc: null,
      phoneHash: null,
      note: null,
      status: "qualified",
    });
    expect(lead!.consentText).toContain("Sample AMC");
    const shown = card((await adminAmc.get("/leads")).text, amcLeadId)!;
    expect(shown.querySelector("[data-lead-name]")!.textContent).toBe("Details deleted");
    expect(shown.querySelector("[data-consent-record]")).not.toBeNull();
  });

  it("[E2E-LEAD-50] an erased lead no longer matches its phone number", async () => {
    expect(await leadsByPhone(amcPhone)).toHaveLength(0);
    // So the same person can ask again, and it isn't treated as a repeat.
    const page = await person().get(PAGES.amcArticle);
    const again = await submitLead(person(), PAGES.amcArticle, details(amcPhone), page);
    expect(again.text).toContain('data-lead-done="thanks"');
  });

  it("[E2E-LEAD-51] deletion is recorded in the audit trail", async () => {
    const rows = await db()
      .select()
      .from(schema.auditEvents)
      .where(inArray(schema.auditEvents.action, ["lead.erase"]));
    const mine = rows.filter((r) => r.detail.leadId === amcLeadId);
    expect(mine).toHaveLength(1);
    expect(mine[0]!.userId).toBe((await userByEmail(demoEmail("admin.amc"))).id);
  });

  it("[E2E-LEAD-52] leads past their retention date are erased by the purge", async () => {
    await db()
      .update(schema.leads)
      .set({ deleteAfter: new Date(Date.now() - 60_000) })
      .where(eq(schema.leads.id, giLeadId));
    const res = await person().post("/api/cron/deemed", undefined, {
      authorization: `Bearer ${E2E_CRON_SECRET}`,
    });
    expect(res.status).toBe(200);
    expect(res.json<{ purgedLeads: number }>().purgedLeads).toBeGreaterThanOrEqual(1);
    const [lead] = await db().select().from(schema.leads).where(eq(schema.leads.id, giLeadId));
    expect(lead).toMatchObject({ nameEnc: null, phoneEnc: null, phoneHash: null, ipHash: null });
    expect(lead!.erasedAt).not.toBeNull();
    expect(lead!.consentText).toContain("Sample General Insurer");
  });

  it("[E2E-LEAD-53] the service never returns another sponsor's leads", async () => {
    const [gi] = await db()
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, demoEmail("admin.gi")));
    const actor = { memberships: await membershipsOf(gi!.id) };
    expect(await leadsFor(actor, await orgId("sample-amc"))).toBeNull();
    const own = (await leadsFor(actor, await orgId("sample-general-insurer")))!;
    const amcOrg = await orgId("sample-amc");
    const rows = await db()
      .select({ id: schema.leads.id, sponsor: schema.leads.sponsorOrgId })
      .from(schema.leads)
      .where(and(eq(schema.leads.sponsorOrgId, amcOrg)));
    const amcIds = new Set(rows.map((r) => r.id));
    expect(own.some((l) => amcIds.has(l.id))).toBe(false);
    expect(own.every((l) => l.phone === null || phoneHash(l.phone) !== phoneHash(amcPhone))).toBe(
      true,
    );
  });
});
