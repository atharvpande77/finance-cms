import { and, asc, eq, gte, isNull, lte, or } from "drizzle-orm";
import { db, schema, type Db, type Tx } from "@/server/db/client";
import { indianDate } from "@/domain/time";

/**
 * Which newspapers an institution article may go to (D46): the institution's approver chooses
 * from the papers on its active plans when approving, and abcfinance's editor releases to all or
 * some of those.
 */

export type PaperOption = { id: string; slug: string; name: string };

const paperName = (name: Record<string, string>, slug: string) =>
  name.en ?? Object.values(name)[0] ?? slug;

/** The papers on an organisation's active plans (started, not ended, India dates). */
export async function planPapers(
  organisationId: string,
  conn: Db | Tx = db(),
): Promise<PaperOption[]> {
  const today = indianDate(new Date());
  const rows = await conn
    .selectDistinct({ id: schema.tenants.id, slug: schema.tenants.slug, name: schema.tenants.name })
    .from(schema.planTenants)
    .innerJoin(schema.plans, eq(schema.plans.id, schema.planTenants.planId))
    .innerJoin(schema.tenants, eq(schema.tenants.id, schema.planTenants.tenantId))
    .where(
      and(
        eq(schema.plans.sponsorOrgId, organisationId),
        lte(schema.plans.startsOn, today),
        or(isNull(schema.plans.endsOn), gte(schema.plans.endsOn, today)),
      ),
    )
    .orderBy(asc(schema.tenants.slug));
  return rows.map((r) => ({ id: r.id, slug: r.slug, name: paperName(r.name, r.slug) }));
}

/** The papers the institution chose for an article (empty until its approver approves). */
export async function chosenPapers(articleId: string, conn: Db | Tx = db()): Promise<string[]> {
  const rows = await conn
    .select({ tenantId: schema.articleTargets.tenantId })
    .from(schema.articleTargets)
    .where(eq(schema.articleTargets.articleId, articleId));
  return rows.map((r) => r.tenantId);
}
