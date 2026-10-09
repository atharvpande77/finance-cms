import { db, schema } from "@/server/db/client";
import { env } from "@/server/env";
import { normalizeHost } from "@/domain/urls";

export type Tenant = typeof schema.tenants.$inferSelect;

/**
 * The tenant list, held in memory for TENANT_CACHE_SECONDS (default 30, tests 0) because host
 * resolution runs on every request (02 §2.2). Concurrent misses share one query.
 */
let cached: { at: number; rows: Promise<Tenant[]> } | undefined;

export function allTenants(): Promise<Tenant[]> {
  const ttl = env().TENANT_CACHE_SECONDS * 1000;
  const now = Date.now();
  if (!cached || now - cached.at >= ttl) {
    const rows = db().select().from(schema.tenants);
    cached = { at: now, rows };
    rows.catch(() => {
      cached = undefined; // never cache a failure
    });
  }
  return cached.rows;
}

export async function tenantByHost(
  rawHost: string | null | undefined,
): Promise<Tenant | undefined> {
  const host = normalizeHost(rawHost);
  if (!host) return undefined;
  return (await allTenants()).find((t) => t.hosts.includes(host));
}

/** The abcfinance host (panels, sign-in, the scheduled job), plus loopback for the VPS cron. */
export function isPanelHost(rawHost: string | null | undefined): boolean {
  const host = normalizeHost(rawHost);
  if (!host) return false;
  if (host === "localhost" || host === "127.0.0.1") return true;
  const appUrl = env().APP_URL;
  return appUrl ? new URL(appUrl).hostname === host : false;
}

/** Primary public host of a tenant (the first in its list). */
export function primaryHost(tenant: Tenant): string {
  return tenant.hosts[0]!;
}
