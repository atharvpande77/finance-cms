import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/server/db/client";
import { audit } from "@/server/audit";
import { contentChanged } from "@/server/content/events";
import { CONFLICT, type Actor, type ServiceResult } from "@/server/articles/service";
import { canSeeQueue, copyActions, needsReason, type CopyAction } from "@/domain/publishing";
import type { VersionState } from "@/domain/workflow";

/**
 * A paper's editor decides on their paper's copy (04.3): approve (publish now, explicitly), hold
 * (stop the clock) or take down. Each decision is one conditional update on the copy's `rev`, so
 * of two simultaneous decisions, or a decision and the deemed sweep, exactly one applies.
 */

const v = schema.articleVersions;
const MAX_REASON = 1000;
const NOT_ALLOWED = "You can't do that to this copy now.";

async function loadCopy(copyId: string) {
  const [row] = await db()
    .select({
      copy: v,
      tenantSlug: schema.tenants.slug,
      publisherOrgId: schema.tenants.publisherOrgId,
    })
    .from(v)
    .innerJoin(schema.tenants, eq(schema.tenants.id, v.tenantId))
    .where(eq(v.id, copyId));
  return row;
}

export async function decideCopy(
  actor: Actor,
  copyId: string,
  rev: number,
  action: CopyAction,
  rawReason: string | null,
  ip: string,
): Promise<ServiceResult<{ state: VersionState; tenantSlug: string }>> {
  const row = await loadCopy(copyId);
  if (!row || !canSeeQueue(actor.memberships, row.publisherOrgId)) {
    return { ok: false, error: "Copy not found." };
  }
  const { copy } = row;
  if (
    !copyActions(actor.memberships, { ...copy, publisherOrgId: row.publisherOrgId }).includes(
      action,
    )
  ) {
    // A stale page asking for a decision that someone already took is a conflict, not a refusal.
    return copy.rev !== rev
      ? { ok: false, error: CONFLICT, code: "conflict" }
      : { ok: false, error: NOT_ALLOWED, code: "forbidden" };
  }
  const reason = rawReason?.trim().slice(0, MAX_REASON) || null;
  if (needsReason(action) && !reason) {
    return { ok: false, error: "Give a reason.", code: "reason" };
  }

  const now = new Date();
  const change =
    action === "approve"
      ? {
          state: "published" as const,
          approvalType: "explicit" as const,
          publishedAt: now,
          lastReviewedAt: now,
          heldAt: null,
          autoApproveAt: null,
        }
      : action === "hold"
        ? // Holding stops the clock: no deemed approval until the editor decides.
          { state: "with_publisher" as const, heldAt: now, autoApproveAt: null }
        : { state: "unpublished" as const, autoApproveAt: null };

  const result = await db().transaction(async (tx) => {
    const moved = await tx
      .update(v)
      .set({ ...change, rev: sql`${v.rev} + 1`, updatedAt: now })
      .where(and(eq(v.id, copyId), eq(v.rev, rev), eq(v.state, copy.state)))
      .returning({ id: v.id });
    if (moved.length === 0) return { ok: false as const, error: CONFLICT, code: "conflict" };
    await tx.insert(schema.workflowEvents).values({
      versionId: copyId,
      fromState: copy.state,
      toState: change.state,
      userId: actor.user.id,
      action,
      comment: reason,
    });
    await audit(
      {
        userId: actor.user.id,
        action: `copy.${action}`,
        detail: {
          versionId: copyId,
          articleId: copy.articleId,
          tenant: row.tenantSlug,
          from: copy.state,
          to: change.state,
          reason,
        },
        ip,
      },
      tx,
    );
    return { ok: true as const, state: change.state, tenantSlug: row.tenantSlug };
  });
  if (result.ok) await contentChanged({ tenantIds: [copy.tenantId!], articleId: copy.articleId });
  return result;
}
