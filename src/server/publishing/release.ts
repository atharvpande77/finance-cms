import { and, asc, countDistinct, eq, inArray, isNotNull, ne } from "drizzle-orm";
import { db, schema, type Db, type Tx } from "@/server/db/client";
import { audit } from "@/server/audit";
import { CONFLICT, type Actor, type ServiceResult } from "@/server/articles/service";
import { can } from "@/domain/permissions";
import { runChecks, type CheckFlag } from "@/domain/checks";
import { canView, type ArticleType, type VersionState } from "@/domain/workflow";
import {
  autoApproveAt,
  explicitReasons,
  releasePlan,
  type ExplicitReason,
  type ReleasePlan,
} from "@/domain/publishing";

/**
 * Release (04.3): one language version sent to several newspapers at once, as one copy per paper
 * with its own explicit-approval decision and clock. An article already with the papers can be
 * sent to more of them; the master stays "With publisher" (D29).
 */

const v = schema.articleVersions;
const a = schema.articles;
const t = schema.tenants;

const NOT_ALLOWED = "You can't send this article to newspapers now.";
const MAX_NOTE = 1000;

/** Editors release from Editing, and send an article already with the papers to more of them. */
function mayRelease(actor: Actor, state: VersionState): boolean {
  return can(actor.memberships, "article.release") && ["editing", "with_publisher"].includes(state);
}

export function paperName(name: Record<string, string>, slug: string): string {
  return name.en ?? Object.values(name)[0] ?? slug;
}

async function loadMaster(conn: Db | Tx, versionId: string) {
  const [row] = await conn
    .select({
      version: v,
      type: a.type,
      organisationId: a.organisationId,
      sectionSlug: schema.sections.slug,
    })
    .from(v)
    .innerJoin(a, eq(a.id, v.articleId))
    .innerJoin(schema.sections, eq(schema.sections.id, a.sectionId))
    .where(eq(v.id, versionId));
  return row?.version.tenantId === null ? row : undefined;
}

type Paper = typeof t.$inferSelect;
export type PaperPlan = {
  id: string;
  slug: string;
  name: string;
  plan: ReleasePlan;
  reasons: ExplicitReason[];
  autoApproveHours: number;
};

/** Each paper's plan for this version: create, skip or refuse, and why it needs explicit approval. */
async function plansFor(
  conn: Db | Tx,
  master: NonNullable<Awaited<ReturnType<typeof loadMaster>>>,
  papers: Paper[],
  flagged: boolean,
): Promise<PaperPlan[]> {
  const { version } = master;
  const [existing, published] = await Promise.all([
    conn
      .select({ tenantId: v.tenantId })
      .from(v)
      .where(
        and(
          eq(v.articleId, version.articleId),
          eq(v.language, version.language),
          isNotNull(v.tenantId),
        ),
      ),
    // The institution's other articles live on each paper (first-three rule).
    master.type === "institution"
      ? conn
          .select({ tenantId: v.tenantId, n: countDistinct(v.articleId) })
          .from(v)
          .innerJoin(a, eq(a.id, v.articleId))
          .where(
            and(
              eq(a.organisationId, master.organisationId),
              ne(a.id, version.articleId),
              eq(v.state, "published"),
              isNotNull(v.tenantId),
            ),
          )
          .groupBy(v.tenantId)
      : Promise.resolve([]),
  ]);
  const has = new Set(existing.map((e) => e.tenantId));
  const count = new Map(published.map((p) => [p.tenantId, p.n]));
  return papers.map((p) => {
    const name = paperName(p.name, p.slug);
    return {
      id: p.id,
      slug: p.slug,
      name,
      plan: releasePlan({ name, languages: p.languages }, version.language, has.has(p.id)),
      reasons: explicitReasons({
        articleType: master.type as ArticleType,
        publishedFromInstitution: count.get(p.id) ?? 0,
        flagged,
        sectionSlug: master.sectionSlug,
        heldSectionSlugs: p.heldSectionSlugs,
      }),
      autoApproveHours: p.autoApproveHours,
    };
  });
}

export type ReleasePreview = {
  papers: Array<PaperPlan & { targeted: boolean }>;
  flags: CheckFlag[];
};

/** The release form: every paper, the author's targets first and pre-ticked, with its rule. */
export async function releasePreview(
  actor: Actor,
  versionId: string,
): Promise<ReleasePreview | null> {
  const master = await loadMaster(db(), versionId);
  if (!master || !canView(actor.memberships, master) || !mayRelease(actor, master.version.state)) {
    return null;
  }
  const [papers, targets] = await Promise.all([
    db().select().from(t).orderBy(asc(t.slug)),
    db()
      .select({ tenantId: schema.articleTargets.tenantId })
      .from(schema.articleTargets)
      .where(eq(schema.articleTargets.articleId, master.version.articleId)),
  ]);
  const { flags } = runChecks(master.version);
  const targeted = new Set(targets.map((x) => x.tenantId));
  const plans = await plansFor(db(), master, papers, flags.length > 0);
  return {
    papers: plans
      .map((p) => ({ ...p, targeted: targeted.has(p.id) }))
      .sort((x, y) => Number(y.targeted) - Number(x.targeted)),
    flags,
  };
}

/** Sends the version to the chosen papers. Refuses as a whole; skips papers that have it. */
export async function release(
  actor: Actor,
  versionId: string,
  rev: number,
  tenantIds: readonly string[],
  rawNote: string | null,
  ip: string,
): Promise<ServiceResult<{ created: string[]; skipped: string[] }>> {
  const master = await loadMaster(db(), versionId);
  if (!master || !canView(actor.memberships, master)) {
    return { ok: false, error: "Article not found." };
  }
  if (!mayRelease(actor, master.version.state)) {
    return master.version.rev !== rev
      ? { ok: false, error: CONFLICT, code: "conflict" }
      : { ok: false, error: NOT_ALLOWED, code: "forbidden" };
  }
  const chosen = [...new Set(tenantIds)];
  if (chosen.length === 0) return { ok: false, error: "Choose at least one newspaper." };
  const note = rawNote?.trim().slice(0, MAX_NOTE) || null;

  return db().transaction(async (tx) => {
    // Lock the master: a second release (or a stale page) waits here, then sees the new rev.
    const [locked] = await tx
      .select({ id: v.id, state: v.state })
      .from(v)
      .where(and(eq(v.id, versionId), eq(v.rev, rev), eq(v.state, master.version.state)))
      .for("update");
    if (!locked) return { ok: false as const, error: CONFLICT, code: "conflict" };

    const papers = await tx.select().from(t).where(inArray(t.id, chosen)).orderBy(asc(t.slug));
    if (papers.length !== chosen.length) {
      return { ok: false as const, error: "Choose newspapers from the list." };
    }
    const flagged = !runChecks(master.version).ok;
    const plans = await plansFor(tx, master, papers, flagged);
    const refused = plans.find((p) => p.plan.action === "refuse");
    if (refused) {
      return {
        ok: false as const,
        error: `${refused.plan.reason}. Untick it to send to the others.`,
      };
    }
    const toCreate = plans.filter((p) => p.plan.action === "create");
    const skipped = plans.filter((p) => p.plan.action === "skip").map((p) => p.name);
    if (toCreate.length === 0) {
      return {
        ok: false as const,
        error:
          chosen.length === 1
            ? `${skipped[0]} already has this version.`
            : "Every newspaper you chose already has this version.",
      };
    }

    const now = new Date();
    const from = master.version.state;
    await tx
      .update(v)
      .set({ state: "with_publisher", rev: rev + 1, updatedAt: now })
      .where(eq(v.id, versionId));
    await tx.insert(schema.workflowEvents).values({
      versionId,
      fromState: from,
      toState: "with_publisher",
      userId: actor.user.id,
      action: "release",
      comment: note,
    });
    const paperById = new Map(papers.map((p) => [p.id, p]));
    for (const p of toCreate) {
      const requiresExplicit = p.reasons.length > 0;
      const [copy] = await tx
        .insert(v)
        .values({
          articleId: master.version.articleId,
          tenantId: p.id,
          language: master.version.language,
          headline: master.version.headline,
          summary: master.version.summary,
          body: master.version.body,
          state: "with_publisher",
          requiresExplicit,
          explicitReasons: p.reasons,
          autoApproveAt: autoApproveAt(
            now,
            paperById.get(p.id)!.autoApproveHours,
            requiresExplicit,
          ),
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: v.id });
      // The copy's first event carries the release note: the paper's editor reads it from here.
      await tx.insert(schema.workflowEvents).values({
        versionId: copy!.id,
        fromState: null,
        toState: "with_publisher",
        userId: actor.user.id,
        action: "release",
        comment: note,
      });
    }
    await tx
      .insert(schema.articleTargets)
      .values(toCreate.map((p) => ({ articleId: master.version.articleId, tenantId: p.id })))
      .onConflictDoNothing();
    await audit(
      {
        userId: actor.user.id,
        action: "article.release",
        detail: {
          versionId,
          from,
          to: "with_publisher",
          papers: toCreate.map((p) => ({ slug: p.slug, explicitReasons: p.reasons })),
          skipped,
          note,
        },
        ip,
      },
      tx,
    );
    return { ok: true as const, created: toCreate.map((p) => p.slug), skipped };
  });
}
