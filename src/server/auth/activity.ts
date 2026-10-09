import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/server/db/client";

/** The person's own latest audit events, for the dashboard's "recent activity". */
export async function recentActivity(userId: string, limit = 8) {
  const a = schema.auditEvents;
  return db()
    .select({ id: a.id, action: a.action, createdAt: a.createdAt })
    .from(a)
    .where(eq(a.userId, userId))
    .orderBy(desc(a.id))
    .limit(limit);
}
