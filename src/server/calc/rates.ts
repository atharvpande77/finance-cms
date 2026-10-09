import { cache } from "react";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/server/db/client";
import { audit } from "@/server/audit";
import { ratesChanged } from "@/server/content/events";
import type { Actor, ServiceResult } from "@/server/articles/service";
import { can, organisationsFor } from "@/domain/permissions";
import { indianDate } from "@/domain/time";
import { BUILTIN_RATES_AS_OF, DEFINITIONS, definitionFor } from "@/domain/calc/fields";
import { mergeRates, validateRates } from "@/domain/calc/rates";
import { brandingFor, type BrandContext, type Branding } from "@/domain/sponsor";

/**
 * Calculator rates and sponsors (04.7). Precedence: the brand's saved rates, else abcfinance's,
 * else the built-in defaults (D33). Reader pages render per request, so a saved rate shows at
 * once; `ratesChanged()` is where a later page cache would be purged (D26).
 */

const r = schema.calculatorRates;

/** Everything a page needs to brand and price calculators, loaded once per request. */
export const loadCalcContext = cache(async () => {
  const [sponsorships, sections, rates, orgs] = await Promise.all([
    db().select().from(schema.sponsorships),
    db()
      .select({ slug: schema.sections.slug, calculatorSlugs: schema.sections.calculatorSlugs })
      .from(schema.sections),
    db().select().from(r),
    db()
      .select({
        id: schema.organisations.id,
        name: schema.organisations.name,
        type: schema.organisations.type,
      })
      .from(schema.organisations)
      .where(inArray(schema.organisations.type, ["institution", "abcfinance"])),
  ]);
  return {
    sponsorships,
    sections,
    rates,
    orgNames: new Map(orgs.map((o) => [o.id, o.name])),
    abcfinanceId: orgs.find((o) => o.type === "abcfinance")!.id,
  };
});

type CalcContext = Awaited<ReturnType<typeof loadCalcContext>>;

export type ResolvedRates = {
  rates: Record<string, number>;
  asOf: string;
  source: "sponsor" | "abcfinance" | "builtin";
};

export function resolveRates(
  ctx: CalcContext,
  slug: string,
  ratesOrgId: string | null,
): ResolvedRates {
  for (const orgId of [ratesOrgId, ctx.abcfinanceId]) {
    const row = orgId
      ? ctx.rates.find((x) => x.organisationId === orgId && x.calculatorSlug === slug)
      : undefined;
    if (row) {
      return {
        rates: mergeRates(slug, row.rates),
        asOf: row.ratesAsOf,
        source: orgId === ctx.abcfinanceId ? "abcfinance" : "sponsor",
      };
    }
  }
  return { rates: mergeRates(slug, null), asOf: BUILTIN_RATES_AS_OF, source: "builtin" };
}

export type CalculatorView = Branding & ResolvedRates & { slug: string; brandName: string | null };

/** How one calculator appears in a given place: its brand, call-to-action and rates. */
export async function calculatorView(context: BrandContext, slug: string): Promise<CalculatorView> {
  const ctx = await loadCalcContext();
  const branding = brandingFor({
    context,
    calculatorSlug: slug,
    sponsorships: ctx.sponsorships,
    sections: ctx.sections,
    today: indianDate(new Date()),
  });
  return {
    slug,
    ...branding,
    brandName: branding.brand ? (ctx.orgNames.get(branding.brand.orgId) ?? null) : null,
    ...resolveRates(ctx, slug, branding.ratesOrgId),
  };
}

const NOT_ALLOWED = "You can't change these rates.";

/** Who may edit an organisation's rates: its account admins; abcfinance's, the super admin. */
async function mayEdit(actor: Actor, orgId: string) {
  const [org] = await db()
    .select({ id: schema.organisations.id, type: schema.organisations.type })
    .from(schema.organisations)
    .where(eq(schema.organisations.id, orgId));
  if (!org) return false;
  return org.type === "abcfinance"
    ? can(actor.memberships, "rates.edit.defaults")
    : can(actor.memberships, "rates.edit", orgId);
}

export async function saveRates(
  actor: Actor,
  orgId: string,
  slug: string,
  form: Record<string, string | undefined>,
  asOf: string,
  ip: string,
): Promise<ServiceResult | { ok: false; error: string; errors: Record<string, string> }> {
  if (!definitionFor(slug)) return { ok: false, error: "Unknown calculator." };
  if (!(await mayEdit(actor, orgId))) return { ok: false, error: NOT_ALLOWED, code: "forbidden" };
  const checked = validateRates(slug, form, asOf, indianDate(new Date()));
  if (!checked.ok) {
    return { ok: false, error: "Some rates need fixing.", errors: checked.errors };
  }
  await db().transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(r)
      .where(and(eq(r.organisationId, orgId), eq(r.calculatorSlug, slug)));
    await tx
      .insert(r)
      .values({
        organisationId: orgId,
        calculatorSlug: slug,
        rates: checked.rates,
        ratesAsOf: checked.asOf,
        updatedById: actor.user.id,
      })
      .onConflictDoUpdate({
        target: [r.organisationId, r.calculatorSlug],
        set: {
          rates: checked.rates,
          ratesAsOf: checked.asOf,
          updatedById: actor.user.id,
          updatedAt: new Date(),
        },
      });
    await audit(
      {
        userId: actor.user.id,
        action: "rates.save",
        detail: {
          organisationId: orgId,
          calculator: slug,
          before: before ? { rates: before.rates, asOf: before.ratesAsOf } : null,
          after: { rates: checked.rates, asOf: checked.asOf },
        },
        ip,
      },
      tx,
    );
  });
  await ratesChanged({ organisationId: orgId, calculatorSlug: slug });
  return { ok: true };
}

/** Back to the standard defaults: the organisation's saved row goes (D33). */
export async function resetRates(
  actor: Actor,
  orgId: string,
  slug: string,
  ip: string,
): Promise<ServiceResult> {
  if (!definitionFor(slug)) return { ok: false, error: "Unknown calculator." };
  if (!(await mayEdit(actor, orgId))) return { ok: false, error: NOT_ALLOWED, code: "forbidden" };
  await db().transaction(async (tx) => {
    const removed = await tx
      .delete(r)
      .where(and(eq(r.organisationId, orgId), eq(r.calculatorSlug, slug)))
      .returning();
    await audit(
      {
        userId: actor.user.id,
        action: "rates.reset",
        detail: {
          organisationId: orgId,
          calculator: slug,
          before: removed[0] ? { rates: removed[0].rates, asOf: removed[0].ratesAsOf } : null,
        },
        ip,
      },
      tx,
    );
  });
  await ratesChanged({ organisationId: orgId, calculatorSlug: slug });
  return { ok: true };
}

/** The rates panel: the organisations this person edits, and every calculator's saved rates. */
export async function ratesPanel(actor: Actor) {
  const orgIds = organisationsFor(actor.memberships, "rates.edit");
  const defaults = can(actor.memberships, "rates.edit.defaults");
  const orgs = await db()
    .select({
      id: schema.organisations.id,
      name: schema.organisations.name,
      type: schema.organisations.type,
    })
    .from(schema.organisations)
    .orderBy(asc(schema.organisations.name));
  const editable = orgs.filter((o) =>
    o.type === "abcfinance" ? defaults : o.type === "institution" && orgIds.includes(o.id),
  );
  const saved = editable.length
    ? await db()
        .select()
        .from(r)
        .where(
          inArray(
            r.organisationId,
            editable.map((o) => o.id),
          ),
        )
    : [];
  return editable.map((org) => ({
    ...org,
    calculators: DEFINITIONS.map((def) => {
      const row = saved.find((x) => x.organisationId === org.id && x.calculatorSlug === def.slug);
      return {
        slug: def.slug,
        fields: def.rates,
        values: mergeRates(def.slug, row?.rates ?? null),
        asOf: row?.ratesAsOf ?? null,
        updatedAt: row?.updatedAt ?? null,
      };
    }),
  }));
}
