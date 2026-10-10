/** Sending tracking beacons the way a reader's browser does, and reading the counters (04.8). */
import { randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/server/db/client";
import { indianDate } from "@/domain/time";
import { HttpClient, siteOrigin, type HttpResponse } from "../http-client";

export const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
export const PHONE_UA =
  "Mozilla/5.0 (Linux; Android 14; SM-A156E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36";

/** A reader with their own random address, so visitor limits never carry across tests. */
export function reader(): HttpClient {
  return new HttpClient({ "x-real-ip": `10.${[...randomBytes(3)].join(".")}` });
}

export const newPv = () => randomBytes(12).toString("base64url");
/** A page path nobody else counts, so each test reads its own counters. */
export const freshPath = () => `/e2e-${randomBytes(5).toString("hex")}`;

export type HitBody = Record<string, unknown>;

/** Posts a beacon to a paper (default Paper B) as a same-origin `text/plain` request. */
export function beacon(
  client: HttpClient,
  body: HitBody | string,
  opts: { tenant?: string; origin?: string | null; ua?: string } = {},
): Promise<HttpResponse> {
  const origin = siteOrigin(opts.tenant ?? "paperb");
  const headers: Record<string, string> = {
    "content-type": "text/plain;charset=UTF-8",
    "user-agent": opts.ua ?? BROWSER_UA,
  };
  if (opts.origin !== null) headers.origin = opts.origin ?? origin;
  return client.request("POST", `${origin}/_a/h`, {
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers,
  });
}

export async function tenantId(slug: string): Promise<string> {
  const [row] = await db().select().from(schema.tenants).where(eq(schema.tenants.slug, slug));
  return row!.id;
}

/** Today's counter row for a page on a paper. */
export async function statFor(path: string, tenant = "paperb", day = indianDate(new Date())) {
  const [row] = await db()
    .select()
    .from(schema.pageStats)
    .where(
      and(
        eq(schema.pageStats.tenantId, await tenantId(tenant)),
        eq(schema.pageStats.pagePath, path),
        eq(schema.pageStats.date, day),
      ),
    );
  return row;
}

export async function pageView(pv: string) {
  const [row] = await db().select().from(schema.pageViews).where(eq(schema.pageViews.id, pv));
  return row;
}

/** Moves a view back in time, as if the reader had been on the page that long. */
export async function backdateView(pv: string, seconds: number) {
  const row = await pageView(pv);
  await db()
    .update(schema.pageViews)
    .set({ viewedAt: new Date(row!.viewedAt.getTime() - seconds * 1000) })
    .where(eq(schema.pageViews.id, pv));
}

/** Today's uses of a calculator on a paper credited to `sponsorOrgId` (null: nobody). */
export async function calcUses(calc: string, sponsorOrgId: string | null, tenant = "paperb") {
  const [row] = await db()
    .select({ uses: schema.calculatorUses.uses })
    .from(schema.calculatorUses)
    .where(
      and(
        eq(schema.calculatorUses.tenantId, await tenantId(tenant)),
        eq(schema.calculatorUses.calculatorSlug, calc),
        sponsorOrgId === null
          ? isNull(schema.calculatorUses.sponsorOrgId)
          : eq(schema.calculatorUses.sponsorOrgId, sponsorOrgId),
        eq(schema.calculatorUses.date, indianDate(new Date())),
      ),
    );
  return row?.uses ?? 0;
}
