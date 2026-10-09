import { and, isNull, lt, lte } from "drizzle-orm";
import { db, schema } from "@/server/db/client";
import { sendQueued } from "@/server/mail/outbox";
import { pruneRateLimits } from "@/server/ratelimit";

/** Per-view tracking rows are kept 30 days (doc 06.4). */
const PAGE_VIEW_RETENTION_DAYS = 30;

export type JobResult = {
  published: number;
  purgedLeads: number;
  prunedViews: number;
  mail: { sent: number; failed: number };
};

/**
 * The scheduled job (doc 07.2), safe to run repeatedly. Steps run in the documented order:
 * deemed approvals, lead retention, tracking prune, mail.
 */
export async function runScheduledJob(now = new Date()): Promise<JobResult> {
  const published = await publishDeemed(now);
  const purgedLeads = await eraseExpiredLeads(now);
  const prunedViews = await prunePageViews(now);
  await pruneRateLimits();
  const mail = await sendQueued();
  return { published, purgedLeads, prunedViews, mail };
}

/** Deemed approval is implemented with the article workflow (milestone M3). */
async function publishDeemed(_now: Date): Promise<number> {
  return 0;
}

/** Blanks personal fields of leads past retention; the consent record and status stay (04.6). */
export async function eraseExpiredLeads(now: Date): Promise<number> {
  const t = schema.leads;
  const rows = await db()
    .update(t)
    .set({ nameEnc: null, phoneEnc: null, cityEnc: null, phoneHash: null, erasedAt: now })
    .where(and(lte(t.deleteAfter, now), isNull(t.erasedAt)))
    .returning({ id: t.id });
  return rows.length;
}

export async function prunePageViews(now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - PAGE_VIEW_RETENTION_DAYS * 86_400_000);
  const rows = await db()
    .delete(schema.pageViews)
    .where(lt(schema.pageViews.viewedAt, cutoff))
    .returning({ id: schema.pageViews.id });
  return rows.length;
}
