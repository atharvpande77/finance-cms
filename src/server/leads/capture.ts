import { and, count, eq, gt, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/server/db/client";
import { seal } from "@/server/crypto/secret-box";
import { keyedHash } from "@/server/crypto/hash";
import { queueEmail } from "@/server/mail/outbox";
import { newLeadEmail } from "@/server/mail/templates";
import { env } from "@/server/env";
import { loadCalcContext } from "@/server/calc/rates";
import { primaryHost, type Tenant } from "@/server/tenants";
import { brandingFor, type BrandContext } from "@/domain/sponsor";
import {
  CONSENT_VERSION,
  consentText,
  interestsFor,
  LEAD_LIMITS,
  type ValidLead,
} from "@/domain/leads";
import { localePath, siteOrigin } from "@/domain/urls";
import { indianDate } from "@/domain/time";
import { asLang, pick, type Lang } from "@/domain/i18n";

/**
 * Lead capture (04.6). The sponsor is always worked out here from what the form points at, never
 * taken from the browser: a published institution article on this paper (its institution), or a
 * calculator whose branding in that place offers a call-to-action (its sponsor, D34).
 */

/** What the form points at: hidden fields, all checked here. */
export type LeadSource =
  | { kind: "article"; versionId: string }
  | {
      kind: "calculator";
      calculator: string;
      /** Where the calculator sits: its own page, a section page, or an abcfinance article. */
      place: "calculator_page" | "section_page" | "article";
      section?: string;
      versionId?: string;
    };

export type ResolvedSource = {
  sponsorOrgId: string;
  sponsorName: string;
  sectionSlug: string;
  language: Lang;
  /** Public path of the page the form was on, built here. */
  sourcePage: string;
  sourceVersionId: string | null;
  sourceCalculator: string | null;
};

const v = schema.articleVersions;
const a = schema.articles;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** A copy published on this paper, with its article. */
async function publishedCopy(tenant: Tenant, versionId: string) {
  if (!UUID.test(versionId)) return undefined;
  const [row] = await db()
    .select({
      versionId: v.id,
      language: v.language,
      slug: a.slug,
      type: a.type,
      organisationId: a.organisationId,
      sectionSlug: schema.sections.slug,
    })
    .from(v)
    .innerJoin(a, eq(a.id, v.articleId))
    .innerJoin(schema.sections, eq(schema.sections.id, a.sectionId))
    .where(and(eq(v.id, versionId), eq(v.tenantId, tenant.id), eq(v.state, "published")));
  return row;
}

async function orgName(orgId: string): Promise<string> {
  const [org] = await db()
    .select({ name: schema.organisations.name })
    .from(schema.organisations)
    .where(eq(schema.organisations.id, orgId));
  return org!.name;
}

/** The sponsor and page a lead form belongs to, or null when it may not take leads. */
export async function resolveSource(
  tenant: Tenant,
  pageLang: string,
  source: LeadSource,
): Promise<ResolvedSource | null> {
  if (!tenant.languages.includes(pageLang)) return null;
  if (source.kind === "article") {
    const copy = await publishedCopy(tenant, source.versionId);
    if (!copy || copy.type !== "institution") return null;
    return {
      sponsorOrgId: copy.organisationId,
      sponsorName: await orgName(copy.organisationId),
      sectionSlug: copy.sectionSlug,
      language: asLang(copy.language),
      sourcePage: localePath(tenant, copy.language, `/${copy.sectionSlug}/${copy.slug}`),
      sourceVersionId: copy.versionId,
      sourceCalculator: null,
    };
  }

  const ctx = await loadCalcContext();
  let context: BrandContext;
  let sourcePage: string;
  let sectionSlug: string | undefined;
  let sourceVersionId: string | null = null;
  if (source.place === "calculator_page") {
    context = { kind: "calculator_page" };
    sourcePage = localePath(tenant, pageLang, `/calculators/${source.calculator}`);
  } else if (source.place === "section_page") {
    const section = ctx.sections.find((s) => s.slug === source.section);
    if (!section?.calculatorSlugs.includes(source.calculator)) return null;
    context = { kind: "section_page", sectionSlug: section.slug };
    sourcePage = localePath(tenant, pageLang, `/${section.slug}`);
    sectionSlug = section.slug;
  } else {
    // An abcfinance article (institution articles use their own end-of-article form).
    const copy = source.versionId ? await publishedCopy(tenant, source.versionId) : undefined;
    if (!copy || copy.type !== "abcfinance" || copy.language !== pageLang) return null;
    context = { kind: "abcfinance_article", sectionSlug: copy.sectionSlug };
    sourcePage = localePath(tenant, copy.language, `/${copy.sectionSlug}/${copy.slug}`);
    sectionSlug = copy.sectionSlug;
    sourceVersionId = copy.versionId;
  }
  const branding = brandingFor({
    context,
    calculatorSlug: source.calculator,
    sponsorships: ctx.sponsorships,
    sections: ctx.sections,
    today: indianDate(new Date()),
  });
  if (!branding.brand || !branding.leadCta) return null;
  // Interests follow the section through which this sponsor sponsors the calculator.
  const listing = ctx.sections.filter((s) => s.calculatorSlugs.includes(source.calculator));
  const sponsored = ctx.sponsorships
    .filter((s) => s.sponsorOrgId === branding.brand!.orgId)
    .flatMap((s) => s.sectionSlugs);
  const section =
    sectionSlug ?? (listing.find((s) => sponsored.includes(s.slug)) ?? listing[0])?.slug;
  if (!section) return null;
  return {
    sponsorOrgId: branding.brand.orgId,
    sponsorName: ctx.orgNames.get(branding.brand.orgId) ?? (await orgName(branding.brand.orgId)),
    sectionSlug: section,
    language: asLang(pageLang),
    sourcePage,
    sourceVersionId,
    sourceCalculator: source.calculator,
  };
}

/** What the form shows for a source: the sponsor, the consent text and the interests. */
export function formTexts(resolved: ResolvedSource) {
  return {
    sponsorName: resolved.sponsorName,
    consent: consentText(resolved.sponsorName, resolved.language),
    interests: interestsFor(resolved.sectionSlug).map((i) => ({
      key: i.key,
      label: i.label[resolved.language],
    })),
  };
}

export type CaptureResult =
  { status: "stored"; leadId: string } | { status: "repeat" } | { status: "phone_limit" };

export function phoneHash(phone: string): string {
  return keyedHash("lead:phone", phone);
}

/**
 * Stores a validated lead and queues the sponsor's emails, in one transaction. A lock per phone
 * number makes the repeat and per-phone checks safe against simultaneous submissions (D38).
 */
export async function captureLead(input: {
  tenant: Tenant;
  source: ResolvedSource;
  lead: ValidLead;
  ip: string;
  now?: Date;
}): Promise<CaptureResult> {
  const { tenant, source, lead } = input;
  const now = input.now ?? new Date();
  const hash = phoneHash(lead.phone);
  const since = new Date(now.getTime() - LEAD_LIMITS.repeatWindowHours * 3_600_000);
  const l = schema.leads;

  return db().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${hash}))`);
    const [repeat] = await tx
      .select({ id: l.id })
      .from(l)
      .where(
        and(eq(l.phoneHash, hash), eq(l.sponsorOrgId, source.sponsorOrgId), gt(l.createdAt, since)),
      )
      .limit(1);
    if (repeat) return { status: "repeat" as const };
    const [recent] = await tx
      .select({ n: count() })
      .from(l)
      .where(and(eq(l.phoneHash, hash), gt(l.createdAt, since)));
    if ((recent?.n ?? 0) >= LEAD_LIMITS.perPhonePerDay) return { status: "phone_limit" as const };

    const [org] = await tx
      .select({ retention: schema.organisations.leadRetentionDays })
      .from(schema.organisations)
      .where(eq(schema.organisations.id, source.sponsorOrgId));
    const [row] = await tx
      .insert(l)
      .values({
        sponsorOrgId: source.sponsorOrgId,
        tenantId: tenant.id,
        language: source.language,
        nameEnc: seal(lead.name),
        phoneEnc: seal(lead.phone),
        cityEnc: seal(lead.city),
        phoneHash: hash,
        ipHash: keyedHash("lead:ip", input.ip, indianDate(now)),
        interestKey: lead.interestKey,
        interestLabel: lead.interestLabel,
        consentText: consentText(source.sponsorName, source.language),
        consentVersion: CONSENT_VERSION,
        consentAt: now,
        sourcePage: source.sourcePage,
        sourceVersionId: source.sourceVersionId,
        sourceCalculator: source.sourceCalculator,
        // Retention is the sponsor's (D37).
        deleteAfter: new Date(now.getTime() + org!.retention * 86_400_000),
        createdAt: now,
      })
      .returning({ id: l.id });

    // One email per active account admin of the sponsor, without personal details (D36).
    const admins = await tx
      .select({ email: schema.users.email })
      .from(schema.memberships)
      .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
      .where(
        and(
          eq(schema.memberships.organisationId, source.sponsorOrgId),
          eq(schema.memberships.role, "institution_account_admin"),
          isNull(schema.users.disabledAt),
        ),
      );
    const email = newLeadEmail({
      sponsor: source.sponsorName,
      paper: pick(tenant.name, "en"),
      interest: interestsFor(source.sectionSlug).find((i) => i.key === lead.interestKey)!.label.en,
      sourceUrl: `${siteOrigin(primaryHost(tenant), env().APP_URL)}${source.sourcePage}`,
      at: now,
    });
    for (const admin of admins) {
      await queueEmail({ to: admin.email, ...email, kind: "lead.new" }, tx);
    }
    return { status: "stored" as const, leadId: row!.id };
  });
}
