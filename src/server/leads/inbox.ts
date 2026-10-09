import { and, asc, count, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/server/db/client";
import { audit } from "@/server/audit";
import { openOrNull } from "@/server/crypto/secret-box";
import type { Actor, ServiceResult } from "@/server/articles/service";
import { can, organisationsFor } from "@/domain/permissions";
import { LEAD_STATUSES, qualityReport, type LeadStatus } from "@/domain/leads";
import { toCsv } from "@/domain/csv";
import { pick } from "@/domain/i18n";

/**
 * The sponsor's Leads inbox (04.6): only that institution's account admins see its leads,
 * decrypted; abcfinance staff never see individuals (09.3 #2).
 */

const l = schema.leads;
const MAX_NOTE = 2000;
const NOT_FOUND = "Lead not found.";

/** The institutions whose leads this person may see. */
export async function leadOrgsFor(actor: Pick<Actor, "memberships">) {
  const ids = organisationsFor(actor.memberships, "leads.view");
  if (ids.length === 0) return [];
  return db()
    .select({ id: schema.organisations.id, name: schema.organisations.name })
    .from(schema.organisations)
    .where(inArray(schema.organisations.id, ids))
    .orderBy(asc(schema.organisations.name));
}

export type InboxLead = {
  id: string;
  name: string | null;
  phone: string | null;
  city: string | null;
  interest: string;
  language: string;
  paper: string;
  sourcePage: string;
  sourceCalculator: string | null;
  status: LeadStatus;
  note: string | null;
  contactedAt: Date | null;
  consentText: string;
  consentVersion: string;
  consentAt: Date;
  createdAt: Date;
  erasedAt: Date | null;
};

async function rowsFor(orgId: string, status?: LeadStatus) {
  const rows = await db()
    .select({ lead: l, paper: schema.tenants.name })
    .from(l)
    .innerJoin(schema.tenants, eq(schema.tenants.id, l.tenantId))
    .where(and(eq(l.sponsorOrgId, orgId), status ? eq(l.status, status) : undefined))
    .orderBy(desc(l.createdAt));
  return rows.map(({ lead, paper }): InboxLead => ({
    id: lead.id,
    name: openOrNull(lead.nameEnc),
    phone: openOrNull(lead.phoneEnc),
    city: openOrNull(lead.cityEnc),
    interest: lead.interestLabel,
    language: lead.language,
    paper: pick(paper, "en"),
    sourcePage: lead.sourcePage,
    sourceCalculator: lead.sourceCalculator,
    status: lead.status,
    note: lead.note,
    contactedAt: lead.contactedAt,
    consentText: lead.consentText,
    consentVersion: lead.consentVersion,
    consentAt: lead.consentAt,
    createdAt: lead.createdAt,
    erasedAt: lead.erasedAt,
  }));
}

/** One sponsor's leads, newest first; null when this person may not see them. */
export async function leadsFor(
  actor: Pick<Actor, "memberships">,
  orgId: string,
  filter: { status?: string } = {},
): Promise<InboxLead[] | null> {
  if (!can(actor.memberships, "leads.view", orgId)) return null;
  const status = LEAD_STATUSES.find((s) => s === filter.status);
  return rowsFor(orgId, status);
}

/** The quality report over all of a sponsor's leads. */
export async function qualityFor(actor: Pick<Actor, "memberships">, orgId: string) {
  if (!can(actor.memberships, "leads.view", orgId)) return null;
  const rows = await db()
    .select({ status: l.status, n: count() })
    .from(l)
    .where(eq(l.sponsorOrgId, orgId))
    .groupBy(l.status);
  return qualityReport(Object.fromEntries(rows.map((r) => [r.status, r.n])));
}

async function ownLead(actor: Actor, leadId: string) {
  if (!/^[0-9a-f-]{36}$/.test(leadId)) return undefined;
  const [lead] = await db().select().from(l).where(eq(l.id, leadId));
  return lead && can(actor.memberships, "leads.view", lead.sponsorOrgId) ? lead : undefined;
}

/** Marks a lead contacted, qualified or junk (or back to new), with a note. */
export async function setStatus(
  actor: Actor,
  leadId: string,
  status: string,
  rawNote: string,
  ip: string,
): Promise<ServiceResult> {
  const lead = await ownLead(actor, leadId);
  if (!lead) return { ok: false, error: NOT_FOUND };
  const next = LEAD_STATUSES.find((s) => s === status);
  if (!next) return { ok: false, error: "Choose a status." };
  const note = rawNote.trim().slice(0, MAX_NOTE) || null;
  const now = new Date();
  await db().transaction(async (tx) => {
    await tx
      .update(l)
      .set({
        status: next,
        note: lead.erasedAt ? null : note,
        // The first time it moves off "new" is when it was contacted.
        contactedAt: lead.contactedAt ?? (next !== "new" ? now : null),
      })
      .where(eq(l.id, leadId));
    await audit(
      {
        userId: actor.user.id,
        action: "lead.status",
        detail: { leadId, from: lead.status, to: next, noted: note !== null },
        ip,
      },
      tx,
    );
  });
  return { ok: true };
}

/**
 * Deletes a person's details on request: name, phone, city, the hashes and the note go; the
 * consent record and status stay so reports still add up (04.6, D38).
 */
export async function eraseLead(actor: Actor, leadId: string, ip: string): Promise<ServiceResult> {
  const lead = await ownLead(actor, leadId);
  if (!lead) return { ok: false, error: NOT_FOUND };
  await db().transaction(async (tx) => {
    await tx
      .update(l)
      .set({
        nameEnc: null,
        phoneEnc: null,
        cityEnc: null,
        phoneHash: null,
        ipHash: null,
        note: null,
        erasedAt: lead.erasedAt ?? new Date(),
      })
      .where(eq(l.id, leadId));
    await audit({ userId: actor.user.id, action: "lead.erase", detail: { leadId }, ip }, tx);
  });
  return { ok: true };
}

const CSV_HEADER = [
  "Received",
  "Name",
  "Mobile",
  "City",
  "Interest",
  "Newspaper",
  "Language",
  "Source page",
  "Calculator",
  "Status",
  "Note",
  "Contacted",
  "Consent text",
  "Consent version",
  "Consent time",
  "Details deleted",
];

/** All of a sponsor's leads as CSV, with the consent record; audited. Null when not allowed. */
export async function exportCsv(
  actor: Actor,
  orgId: string,
  ip: string,
): Promise<{ csv: string; count: number } | null> {
  const leads = await leadsFor(actor, orgId);
  if (!leads) return null;
  const iso = (d: Date | null) => d?.toISOString() ?? "";
  const csv = toCsv([
    CSV_HEADER,
    ...leads.map((x) => [
      iso(x.createdAt),
      x.name,
      x.phone,
      x.city,
      x.interest,
      x.paper,
      x.language,
      x.sourcePage,
      x.sourceCalculator,
      x.status,
      x.note,
      iso(x.contactedAt),
      x.consentText,
      x.consentVersion,
      iso(x.consentAt),
      iso(x.erasedAt),
    ]),
  ]);
  await audit({
    userId: actor.user.id,
    action: "leads.export",
    detail: { organisationId: orgId, count: leads.length },
    ip,
  });
  return { csv, count: leads.length };
}
