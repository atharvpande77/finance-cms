import { sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { keyedHash } from "@/server/crypto/hash";

export type RateLimitResult = { allowed: boolean; count: number };

/**
 * Fixed-window counter shared by every app instance (Postgres-backed, doc 06.5).
 * `scope` names the limit (e.g. "lead:ip"); `subject` is hashed so raw addresses and
 * phone numbers are never stored.
 */
export async function hit(
  scope: string,
  subject: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const key = `${scope}:${keyedHash(scope, subject)}`;
  const rows = await db().execute<{ count: number }>(sql`
    INSERT INTO rate_limits (key, window_start, count) VALUES (${key}, now(), 1)
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN rate_limits.window_start <= now() - make_interval(secs => ${windowSeconds})
                   THEN 1 ELSE rate_limits.count + 1 END,
      window_start = CASE WHEN rate_limits.window_start <= now() - make_interval(secs => ${windowSeconds})
                   THEN now() ELSE rate_limits.window_start END
    RETURNING count`);
  const count = Number(rows[0]?.count ?? 0);
  return { allowed: count <= limit, count };
}

/** Drops windows older than a day (cron). */
export async function pruneRateLimits(): Promise<number> {
  const rows = await db().execute(
    sql`DELETE FROM rate_limits WHERE window_start < now() - interval '1 day' RETURNING key`,
  );
  return rows.length;
}
