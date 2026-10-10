import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/server/db/client";
import { env } from "@/server/env";
import { keyedHash } from "@/server/crypto/hash";
import { hit as rateLimit } from "@/server/ratelimit";
import { clientIp } from "@/server/http/client-ip";
import { loadCalcContext } from "@/server/calc/rates";
import { tenantByHost, type Tenant } from "@/server/tenants";
import {
  ANALYTICS,
  isBot,
  isKnownCalculator,
  isMobile,
  parseHit,
  referrerType,
  type Hit,
  type PageKind,
} from "@/domain/analytics";
import { brandingFor, type BrandContext } from "@/domain/sponsor";
import { indianDate } from "@/domain/time";
import { normalizeHost } from "@/domain/urls";

/**
 * The tracking beacon (04.8, 05.1). Every outcome is silent: the route answers 204 whatever
 * this returns. The result says what happened, for tests and logs.
 */
export type HitOutcome =
  | "counted"
  | "repeat"
  | "unknown_host"
  | "bad_origin"
  | "bot"
  | "limited"
  | "malformed"
  | "refused";

export async function recordHit(input: {
  headers: Headers;
  body: string;
  now?: Date;
}): Promise<HitOutcome> {
  const { headers, body } = input;
  const now = input.now ?? new Date();
  const rawHost = headers.get("host");
  const tenant = await tenantByHost(rawHost);
  if (!tenant) return "unknown_host";
  const host = normalizeHost(rawHost)!;

  if (!sameOrigin(headers.get("origin"), host)) return "bad_origin";
  const ua = headers.get("user-agent");
  if (isBot(ua)) return "bot";

  // One visitor: keyed hash of address, browser, Indian day and paper. Never stored raw.
  const visitor = keyedHash("visitor", clientIp(headers), ua ?? "", indianDate(now), tenant.id);
  const limit = await rateLimit("an:visitor", visitor, ANALYTICS.eventsPerMinute, 60);
  if (!limit.allowed) return "limited";

  const parsed = parseHit(body);
  if (!parsed || !tenant.languages.includes(parsed.l)) return "malformed";

  switch (parsed.t) {
    case "v":
      return recordView(tenant, host, parsed, visitor, ua, now);
    case "e":
      return recordEngaged(tenant, parsed, now);
    case "c":
      return recordCalculatorUse(tenant, parsed, now);
  }
}

/** Only the paper's own pages may send hits; no Origin at all is refused too (04.8). */
function sameOrigin(origin: string | null, host: string): boolean {
  if (!origin || origin === "null") return false;
  try {
    return normalizeHost(new URL(origin).host) === host;
  } catch {
    return false;
  }
}

/**
 * The version the browser named, if it is a published copy of this paper in this language.
 * Anything else is not trusted: the page counts as an ordinary page (E2E-AN-19, 20).
 */
async function trustedVersion(tenant: Tenant, hit: Hit): Promise<string | null> {
  if (!hit.v) return null;
  const v = schema.articleVersions;
  const [row] = await db()
    .select({ id: v.id })
    .from(v)
    .where(
      and(
        eq(v.id, hit.v),
        eq(v.tenantId, tenant.id),
        eq(v.language, hit.l),
        eq(v.state, "published"),
      ),
    )
    .limit(1);
  return row?.id ?? null;
}

async function recordView(
  tenant: Tenant,
  host: string,
  hit: Hit,
  visitor: string,
  ua: string | null,
  now: Date,
): Promise<HitOutcome> {
  const versionId = await trustedVersion(tenant, hit);
  const kind: PageKind = hit.k === "article" && !versionId ? "other" : hit.k;
  const search = referrerType(hit.r, host) === "search" ? 1 : 0;
  const mobile = isMobile(ua) ? 1 : 0;
  const day = indianDate(now);

  // One statement: the view row is the de-duplication (a repeated id inserts nothing), and the
  // daily counter is added to only when it was inserted. Concurrent first views of a new page
  // meet on the unique (tenant, page, day) key and all count (E2E-AN-26).
  const rows = await db().execute<{ views: number }>(sql`
    WITH ins AS (
      INSERT INTO page_views (id, tenant_id, page_path, version_id, kind, language, viewed_at, visitor_hash)
      VALUES (${hit.pv}, ${tenant.id}, ${hit.p}, ${versionId}, ${kind}, ${hit.l}, ${now.toISOString()}, ${visitor})
      ON CONFLICT (id) DO NOTHING
      RETURNING 1
    )
    INSERT INTO page_stats (tenant_id, version_id, page_path, language, kind, date, views, search_views, mobile_views)
    SELECT ${tenant.id}::uuid, ${versionId}::uuid, ${hit.p}::text, ${hit.l}::text, ${kind}::text,
      ${day}::date, 1, ${search}::int, ${mobile}::int FROM ins
    ON CONFLICT (tenant_id, page_path, date) DO UPDATE SET
      views = page_stats.views + 1,
      search_views = page_stats.search_views + EXCLUDED.search_views,
      mobile_views = page_stats.mobile_views + EXCLUDED.mobile_views
    RETURNING views`);
  return rows.length > 0 ? "counted" : "repeat";
}

/**
 * Engaged read (04.8): once per view, for the same page, and only when the server received it
 * at least ENGAGED_MIN_SECONDS after the view. Counted on the view's day (D50).
 */
async function recordEngaged(tenant: Tenant, hit: Hit, now: Date): Promise<HitOutcome> {
  const earliest = new Date(now.getTime() - env().ENGAGED_MIN_SECONDS * 1000);
  const rows = await db().execute<{ engaged_reads: number }>(sql`
    WITH e AS (
      UPDATE page_views SET engaged_at = ${now.toISOString()}
      WHERE id = ${hit.pv} AND tenant_id = ${tenant.id} AND page_path = ${hit.p}
        AND engaged_at IS NULL AND viewed_at <= ${earliest.toISOString()}
      RETURNING viewed_at
    )
    UPDATE page_stats SET engaged_reads = page_stats.engaged_reads + 1
    FROM e
    WHERE page_stats.tenant_id = ${tenant.id} AND page_stats.page_path = ${hit.p}
      AND page_stats.date = (e.viewed_at AT TIME ZONE 'Asia/Kolkata')::date
    RETURNING page_stats.engaged_reads`);
  return rows.length > 0 ? "counted" : "refused";
}

/**
 * Calculator use (04.8): the first change of a value in a calculator on a page view, once per
 * calculator per view. Credited to the brand the reader saw (D49).
 */
async function recordCalculatorUse(tenant: Tenant, hit: Hit, now: Date): Promise<HitOutcome> {
  const slug = hit.calc!;
  if (!isKnownCalculator(slug)) return "refused";
  return db().transaction(async (tx) => {
    const [view] = await tx.execute<{
      version_id: string | null;
      kind: PageKind;
      page_path: string;
      language: string;
      viewed_at: Date | string;
    }>(sql`
      UPDATE page_views SET calculators_used = array_append(calculators_used, ${slug}::text)
      WHERE id = ${hit.pv} AND tenant_id = ${tenant.id} AND page_path = ${hit.p}
        AND NOT (${slug}::text = ANY(calculators_used))
      RETURNING version_id, kind, page_path, language, viewed_at`);
    if (!view) return "refused";

    const context = await brandContextFor(tenant, view);
    const sponsorOrgId = context ? await calcCredit(context, slug, now) : null;
    const day = indianDate(new Date(view.viewed_at));
    await tx.execute(sql`
      INSERT INTO calculator_uses (tenant_id, calculator_slug, sponsor_org_id, date, uses)
      VALUES (${tenant.id}, ${slug}, ${sponsorOrgId}, ${day}, 1)
      ON CONFLICT (tenant_id, calculator_slug, sponsor_org_id, date) DO UPDATE SET
        uses = calculator_uses.uses + 1`);
    return "counted";
  });
}

/** The page's place for branding, from what the server trusted when the view arrived. */
async function brandContextFor(
  tenant: Tenant,
  view: { version_id: string | null; kind: PageKind; page_path: string; language: string },
): Promise<BrandContext | null> {
  if (view.version_id) {
    const a = schema.articles;
    const [row] = await db()
      .select({ type: a.type, orgId: a.organisationId, sectionSlug: schema.sections.slug })
      .from(schema.articleVersions)
      .innerJoin(a, eq(a.id, schema.articleVersions.articleId))
      .innerJoin(schema.sections, eq(schema.sections.id, a.sectionId))
      .where(eq(schema.articleVersions.id, view.version_id))
      .limit(1);
    if (!row) return null;
    if (row.type === "institution") {
      return { kind: "institution_article", orgId: row.orgId, sectionSlug: row.sectionSlug };
    }
    if (row.type === "independent") return { kind: "independent_article" };
    return { kind: "abcfinance_article", sectionSlug: row.sectionSlug };
  }
  if (view.kind === "calculator") return { kind: "calculator_page" };
  if (view.kind === "section") {
    const slug = sitePathSegments(tenant, view.page_path, view.language)[0];
    const { sections } = await loadCalcContext();
    if (slug && sections.some((s) => s.slug === slug)) {
      return { kind: "section_page", sectionSlug: slug };
    }
  }
  return null;
}

/** Path segments without the language prefix (the default language has none, 04.4). */
function sitePathSegments(tenant: Tenant, path: string, lang: string): string[] {
  const segments = path.split("/").filter(Boolean);
  if (lang !== tenant.defaultLanguage && segments[0] === lang) segments.shift();
  return segments;
}

/** The organisation whose brand the calculator showed in this place, or null (D49). */
export async function calcCredit(
  context: BrandContext,
  calculatorSlug: string,
  now: Date,
): Promise<string | null> {
  const { sponsorships, sections } = await loadCalcContext();
  const branding = brandingFor({
    context,
    calculatorSlug,
    sponsorships,
    sections,
    today: indianDate(now),
  });
  return branding.brand?.orgId ?? null;
}
