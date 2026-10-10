/** Creating and moving articles through the panel's real forms. */
import { eq } from "drizzle-orm";
import { expect } from "vitest";
import { db, schema } from "@/server/db/client";
import type { HttpClient, HttpResponse } from "../http-client";

let counter = 0;
export const uniqueSlug = (base: string) => `${base}-${Date.now().toString(36)}-${++counter}`;

export const BODY = `A systematic investment plan puts a fixed amount into a mutual fund every month, which spreads purchases over time.

## Why it helps

- It builds a habit.
- It averages the purchase price.`;

export async function formIds() {
  const sections = await db().select().from(schema.sections);
  const tenants = await db().select().from(schema.tenants);
  const authors = await db().select().from(schema.authors);
  return {
    section: (slug: string) => sections.find((s) => s.slug === slug)!.id,
    tenant: (slug: string) => tenants.find((t) => t.slug === slug)!.id,
    author: (slug: string) => authors.find((a) => a.slug === slug)!.id,
  };
}

export type Created = { articleId: string; url: string; slug: string };

/**
 * Fills in the new-article form and returns the article's page URL. Institution writers are the
 * author (D42); abcfinance staff say who it's written by (`self:abcfinance` or `expert:<id>`).
 */
export async function createArticle(
  client: HttpClient,
  opts: { writtenAs?: string; headline?: string; language?: "en" | "mr"; section?: string } = {},
): Promise<Created> {
  const ids = await formIds();
  const res = await client.submitForm("/articles/new", "create", {
    sectionId: ids.section(opts.section ?? "mutual-funds"),
    language: opts.language ?? "en",
    ...(opts.writtenAs ? { writtenAs: opts.writtenAs } : {}),
    // A unique headline gives a unique web address (D44).
    headline: opts.headline ?? `SIP basics for first-time investors ${uniqueSlug("t")}`,
    summary: "How a monthly SIP works.",
    body: BODY,
  });
  expect(res.status, res.text.slice(0, 300)).toBe(303);
  const match = res.location!.match(/^\/articles\/([0-9a-f-]{36})\/(en|mr)\?done=create$/);
  expect(match, res.location!).not.toBeNull();
  const [row] = await db()
    .select({ slug: schema.articles.slug })
    .from(schema.articles)
    .where(eq(schema.articles.id, match![1]!));
  return { articleId: match![1]!, url: `/articles/${match![1]}/${match![2]}`, slug: row!.slug };
}

/** Posts a workflow step from the article page; returns the response. */
export function step(
  client: HttpClient,
  url: string,
  form: "submit" | "approve" | "return" | "save" | "add-language",
  fields: Record<string, string> = {},
  page?: HttpResponse,
) {
  return client.submitForm(url, form, fields, { page });
}

export async function masterVersion(articleId: string, language = "en") {
  const rows = await db()
    .select()
    .from(schema.articleVersions)
    .where(eq(schema.articleVersions.articleId, articleId));
  return rows.find((r) => r.language === language && r.tenantId === null)!;
}

export const stateOf = (res: HttpResponse) => res.text.match(/data-version-state="([a-z_]+)"/)?.[1];
