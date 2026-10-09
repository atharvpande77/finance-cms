/** Submitting reader lead forms and reading what was stored (04.6). */
import { randomInt } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/server/db/client";
import { keyedHash } from "@/server/crypto/hash";
import { siteOrigin, type HttpClient, type HttpResponse } from "../http-client";

export const pb = siteOrigin("paperb");
export const tb = siteOrigin("tarunbharat");

export const PAGES = {
  amcArticle: `${pb}/mutual-funds/sip-basics`,
  amcArticleMr: `${tb}/mutual-funds/sip-basics`,
  giArticle: `${pb}/health-insurance/health-cover-for-parents`,
  abcArticle: `${pb}/home-loan/home-loan-checklist`,
  sipCalculator: `${pb}/calculators/sip`,
  motorCalculator: `${pb}/calculators/motor-premium`,
  emiCalculator: `${pb}/calculators/emi`,
};

/** A random valid Indian mobile, so tests never collide. */
export function freshPhone(): string {
  return `9${String(randomInt(0, 1e9)).padStart(9, "0")}`;
}

export const phoneHash = (phone: string) => keyedHash("lead:phone", phone);

export function details(phone = freshPhone(), interest = "sip") {
  return { name: "Asha Patil", phone, city: "Kolhapur", interest, consent: "on" };
}

/** Posts the page's lead form (or one replayed from `page`) with `fields`. */
export function submitLead(
  client: HttpClient,
  url: string,
  fields: Record<string, string>,
  page?: HttpResponse,
) {
  return client.submitForm(url, "lead", fields, { page });
}

export const doneOf = (res: HttpResponse) => res.text.match(/data-lead-done="(\w+)"/)?.[1];

export async function leadsByPhone(phone: string) {
  return db()
    .select()
    .from(schema.leads)
    .where(eq(schema.leads.phoneHash, phoneHash(phone)));
}

export async function orgId(slug: string) {
  const [org] = await db()
    .select()
    .from(schema.organisations)
    .where(eq(schema.organisations.slug, slug));
  return org!.id;
}

/** The id of a seeded article's version on a paper (or its master when `tenant` is null). */
export async function versionOf(articleSlug: string, tenant: string | null, language: string) {
  const rows = await db()
    .select({ id: schema.articleVersions.id, tenantId: schema.articleVersions.tenantId })
    .from(schema.articleVersions)
    .innerJoin(schema.articles, eq(schema.articles.id, schema.articleVersions.articleId))
    .where(
      and(eq(schema.articles.slug, articleSlug), eq(schema.articleVersions.language, language)),
    );
  const tenants = await db().select().from(schema.tenants);
  const tid = tenant ? tenants.find((t) => t.slug === tenant)!.id : null;
  return rows.find((r) => r.tenantId === tid)!.id;
}
