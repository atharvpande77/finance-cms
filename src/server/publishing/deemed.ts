import { and, eq, inArray, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { db, schema } from "@/server/db/client";
import { audit } from "@/server/audit";
import { contentChanged } from "@/server/content/events";

/**
 * Deemed approval (04.3): every copy waiting past its window, not held and not needing an
 * explicit approval, is published as "deemed" by the system. Run by the scheduled job and by
 * the "publish anything past its window now" button.
 *
 * Copies another transaction has locked (a person's decision in progress) are skipped, so the
 * person wins (D30). Running it twice publishes nothing the second time.
 */

const v = schema.articleVersions;
export const DEEMED_ACTOR = "deemed approval (system)";

export type DeemedCopy = { copyId: string; tenantId: string; articleId: string };

/**
 * `tenantIds` limits the sweep to those papers (a newspaper editor's button); `requestedBy` is
 * the person who pressed the button, recorded in the audit trail.
 */
export async function publishDue(
  now: Date,
  opts: { tenantIds?: readonly string[]; requestedBy?: string } = {},
): Promise<DeemedCopy[]> {
  const { tenantIds, requestedBy } = opts;
  if (tenantIds?.length === 0) return [];
  const published = await db().transaction(async (tx) => {
    const due = await tx
      .select({ copyId: v.id, tenantId: v.tenantId, articleId: v.articleId })
      .from(v)
      .where(
        and(
          eq(v.state, "with_publisher"),
          isNotNull(v.tenantId),
          isNull(v.heldAt),
          eq(v.requiresExplicit, false),
          lte(v.autoApproveAt, now),
          tenantIds ? inArray(v.tenantId, [...tenantIds]) : undefined,
        ),
      )
      .for("update", { skipLocked: true });
    if (due.length === 0) return [];
    const ids = due.map((d) => d.copyId);
    await tx
      .update(v)
      .set({
        state: "published",
        approvalType: "deemed",
        publishedAt: now,
        rev: sql`${v.rev} + 1`,
        updatedAt: now,
      })
      .where(inArray(v.id, ids));
    await tx.insert(schema.workflowEvents).values(
      ids.map((versionId) => ({
        versionId,
        fromState: "with_publisher" as const,
        toState: "published" as const,
        userId: null,
        actorLabel: DEEMED_ACTOR,
        action: "deemed_approve",
      })),
    );
    for (const d of due) {
      await audit(
        {
          userId: null,
          action: "copy.deemed_approve",
          detail: {
            versionId: d.copyId,
            articleId: d.articleId,
            tenantId: d.tenantId,
            actor: DEEMED_ACTOR,
            // Who pressed "publish anything past its window now", when it wasn't the schedule.
            requestedBy,
          },
        },
        tx,
      );
    }
    return due as DeemedCopy[];
  });
  for (const d of published) {
    await contentChanged({ tenantIds: [d.tenantId], articleId: d.articleId });
  }
  return published;
}
