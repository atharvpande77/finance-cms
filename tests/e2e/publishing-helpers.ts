/** Articles ready to release, and the release and decision forms (04.3). */
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/server/db/client";
import type { HttpClient, HttpResponse } from "../http-client";
import { formIds, uniqueSlug } from "./article-helpers";

export const RELEASE_BODY = `A systematic investment plan puts the same amount into a mutual fund every month, which spreads purchases over time.

## Why it helps

- It builds a habit.
- It averages the purchase price.`;

/**
 * A new institution with one author and nothing published yet, so its first three articles on
 * every paper need an explicit approval whatever other suites have published.
 */
export async function freshInstitution(): Promise<{ orgSlug: string; authorSlug: string }> {
  const slug = uniqueSlug("inst");
  const [org] = await db()
    .insert(schema.organisations)
    .values({ slug, type: "institution", name: `Test Bank ${slug}` })
    .returning();
  await db()
    .insert(schema.authors)
    .values({
      slug: `${slug}-author`,
      name: "Test Author",
      organisationId: org!.id,
      contributorType: "institution",
    });
  return { orgSlug: slug, authorSlug: `${slug}-author` };
}

export type Ready = {
  articleId: string;
  slug: string;
  headline: string;
  /** The article page of the master version in `language`. */
  url: string;
};

/**
 * An article whose master version is in Editing, ready for abcfinance's editor to release (the
 * steps up to Editing are M3a's and have their own tests).
 */
export async function readyToRelease(
  opts: {
    institution?: { orgSlug: string; authorSlug: string };
    language?: "en" | "mr";
    section?: string;
    body?: string;
    targets?: string[];
  } = {},
): Promise<Ready> {
  const ids = await formIds();
  const [org] = await db()
    .select()
    .from(schema.organisations)
    .where(eq(schema.organisations.slug, opts.institution?.orgSlug ?? "abcfinance"));
  const slug = uniqueSlug("rel");
  const language = opts.language ?? "mr";
  const headline = `Release test ${slug}`;
  const [article] = await db()
    .insert(schema.articles)
    .values({
      slug,
      type: opts.institution ? "institution" : "abcfinance",
      masterLanguage: language,
      organisationId: org!.id,
      authorId: ids.author(opts.institution?.authorSlug ?? "abcfinance-desk"),
      sectionId: ids.section(opts.section ?? "mutual-funds"),
      reviewBy: "2027-04-01",
    })
    .returning();
  await db()
    .insert(schema.articleTargets)
    .values(
      (opts.targets ?? ["tarunbharat", "paperb"]).map((t) => ({
        articleId: article!.id,
        tenantId: ids.tenant(t),
      })),
    );
  await db()
    .insert(schema.articleVersions)
    .values({
      articleId: article!.id,
      language,
      headline,
      summary: "How a monthly SIP works.",
      body: opts.body ?? RELEASE_BODY,
      state: "editing",
    });
  return { articleId: article!.id, slug, headline, url: `/articles/${article!.id}/${language}` };
}

/** Ticks `papers` on the article page's release form and sends it. */
export async function releaseTo(
  client: HttpClient,
  url: string,
  papers: string[],
  note = "",
  page?: HttpResponse,
) {
  const ids = await formIds();
  return client.submitForm(url, "release", { tenantIds: papers.map(ids.tenant), note }, { page });
}

export async function copyOf(articleId: string, tenantSlug: string, language = "mr") {
  const ids = await formIds();
  const [row] = await db()
    .select()
    .from(schema.articleVersions)
    .where(
      and(
        eq(schema.articleVersions.articleId, articleId),
        eq(schema.articleVersions.tenantId, ids.tenant(tenantSlug)),
        eq(schema.articleVersions.language, language),
      ),
    );
  return row;
}

export type Decision = "approve-copy" | "hold-copy" | "take-down-copy";

/** Posts a decision from the copy's own page (or from `page`, a copy page loaded earlier). */
export function decide(
  client: HttpClient,
  copyId: string,
  form: Decision,
  fields: Record<string, string> = {},
  page?: HttpResponse,
) {
  return client.submitForm(`/publisher/${copyId}`, form, fields, { page });
}

export async function eventsOf(versionId: string) {
  return db()
    .select()
    .from(schema.workflowEvents)
    .where(eq(schema.workflowEvents.versionId, versionId))
    .orderBy(schema.workflowEvents.id);
}

/** Moves a waiting copy's window into the past, as if a day had gone by. */
export async function windowEnded(copyId: string) {
  await db()
    .update(schema.articleVersions)
    .set({ autoApproveAt: new Date(Date.now() - 60_000) })
    .where(eq(schema.articleVersions.id, copyId));
}
