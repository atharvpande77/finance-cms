/**
 * Read-only queries for the reader site. Every article query returns only *published* paper
 * copies of the given tenant (02 §2.3): drafts, copies waiting for the paper, taken-down copies
 * and other papers' copies are never visible.
 */
import { cache } from "react";
import { and, asc, desc, eq, isNotNull, ne } from "drizzle-orm";
import { db, schema } from "@/server/db/client";

const v = schema.articleVersions;
const a = schema.articles;
const s = schema.sections;
const au = schema.authors;
const o = schema.organisations;

const copyColumns = {
  versionId: v.id,
  articleId: a.id,
  slug: a.slug,
  type: a.type,
  language: v.language,
  headline: v.headline,
  summary: v.summary,
  body: v.body,
  approvalType: v.approvalType,
  publishedAt: v.publishedAt,
  lastReviewedAt: v.lastReviewedAt,
  sectionId: s.id,
  sectionSlug: s.slug,
  sectionName: s.name,
  disclaimerKey: s.disclaimerKey,
  authorSlug: au.slug,
  authorName: au.name,
  authorCredentials: au.credentials,
  authorAffiliations: au.disclosedAffiliations,
  authorType: au.contributorType,
  orgSlug: o.slug,
  orgName: o.name,
  orgType: o.type,
};

export type PublishedCopy = {
  versionId: string;
  articleId: string;
  slug: string;
  type: "institution" | "abcfinance" | "independent";
  language: string;
  headline: string;
  summary: string;
  body: string;
  approvalType: "explicit" | "deemed" | null;
  publishedAt: Date;
  lastReviewedAt: Date | null;
  sectionId: string;
  sectionSlug: string;
  sectionName: Record<string, string>;
  disclaimerKey: string;
  authorSlug: string | null;
  authorName: string | null;
  authorCredentials: Record<string, string> | null;
  authorAffiliations: string[] | null;
  authorType: "staff" | "institution" | "independent" | null;
  orgSlug: string;
  orgName: string;
  orgType: "institution" | "publisher" | "abcfinance";
};

function publishedOn(tenantId: string, lang: string) {
  return and(
    eq(v.tenantId, tenantId),
    eq(v.language, lang),
    eq(v.state, "published"),
    isNotNull(v.publishedAt),
  );
}

function baseQuery() {
  return db()
    .select(copyColumns)
    .from(v)
    .innerJoin(a, eq(v.articleId, a.id))
    .innerJoin(s, eq(a.sectionId, s.id))
    .innerJoin(o, eq(a.organisationId, o.id))
    .leftJoin(au, eq(a.authorId, au.id));
}

export type ListOptions = {
  sectionId?: string;
  authorId?: string;
  organisationId?: string;
  excludeArticleId?: string;
  limit?: number;
};

/** Published copies on a paper in a language, newest first. */
export async function listPublished(
  tenantId: string,
  lang: string,
  opts: ListOptions = {},
): Promise<PublishedCopy[]> {
  const rows = await baseQuery()
    .where(
      and(
        publishedOn(tenantId, lang),
        opts.sectionId ? eq(a.sectionId, opts.sectionId) : undefined,
        opts.authorId ? eq(a.authorId, opts.authorId) : undefined,
        opts.organisationId ? eq(a.organisationId, opts.organisationId) : undefined,
        opts.excludeArticleId ? ne(a.id, opts.excludeArticleId) : undefined,
      ),
    )
    .orderBy(desc(v.publishedAt))
    .limit(opts.limit ?? 50);
  return rows as PublishedCopy[];
}

export const getPublishedArticle = cache(
  async (
    tenantId: string,
    lang: string,
    sectionSlug: string,
    slug: string,
  ): Promise<PublishedCopy | undefined> => {
    const [row] = await baseQuery()
      .where(and(publishedOn(tenantId, lang), eq(s.slug, sectionSlug), eq(a.slug, slug)))
      .limit(1);
    return row as PublishedCopy | undefined;
  },
);

/** Languages in which an article is published on this paper (hreflang, language switcher). */
export const publishedLanguages = cache(
  async (tenantId: string, articleId: string): Promise<string[]> => {
    const rows = await db()
      .select({ language: v.language })
      .from(v)
      .where(and(eq(v.articleId, articleId), eq(v.tenantId, tenantId), eq(v.state, "published")));
    return rows.map((r) => r.language);
  },
);

/**
 * Canonical copy (04.4, decision D8): the earliest currently published copy of the article in
 * this language, on any paper.
 */
export const canonicalCopy = cache(
  async (
    articleId: string,
    lang: string,
  ): Promise<{ tenantId: string; publishedAt: Date } | undefined> => {
    const [row] = await db()
      .select({ tenantId: v.tenantId, publishedAt: v.publishedAt })
      .from(v)
      .where(
        and(
          eq(v.articleId, articleId),
          eq(v.language, lang),
          eq(v.state, "published"),
          isNotNull(v.tenantId),
        ),
      )
      .orderBy(asc(v.publishedAt), asc(v.id))
      .limit(1);
    return row ? { tenantId: row.tenantId!, publishedAt: row.publishedAt! } : undefined;
  },
);

export const allSections = cache(async () => db().select().from(s).orderBy(asc(s.sortOrder)));

export const sectionBySlug = cache(async (slug: string) => {
  const [row] = await db().select().from(s).where(eq(s.slug, slug)).limit(1);
  return row;
});

export const disclaimerText = cache(async (key: string) => {
  const [row] = await db()
    .select()
    .from(schema.disclaimerTemplates)
    .where(eq(schema.disclaimerTemplates.key, key))
    .limit(1);
  return row?.text;
});

export const glossaryTerms = cache(async () => db().select().from(schema.glossaryTerms));

export const glossaryTerm = cache(async (slug: string) => {
  const [row] = await db()
    .select()
    .from(schema.glossaryTerms)
    .where(eq(schema.glossaryTerms.slug, slug))
    .limit(1);
  return row;
});

export const authorBySlug = cache(async (slug: string) => {
  const [row] = await db()
    .select({ author: au, organisation: o })
    .from(au)
    .leftJoin(o, eq(au.organisationId, o.id))
    .where(eq(au.slug, slug))
    .limit(1);
  return row;
});

/** An institution's public profile; partner pages exist only for institutions. */
export const partnerBySlug = cache(async (slug: string) => {
  const [row] = await db()
    .select()
    .from(o)
    .where(and(eq(o.slug, slug), eq(o.type, "institution")))
    .limit(1);
  return row;
});

/** Everything the sitemap needs for one paper: published copies grouped by article. */
export async function sitemapEntries(tenantId: string) {
  const rows = await db()
    .select({
      articleId: a.id,
      slug: a.slug,
      sectionSlug: s.slug,
      language: v.language,
      publishedAt: v.publishedAt,
      authorSlug: au.slug,
      orgSlug: o.slug,
      orgType: o.type,
    })
    .from(v)
    .innerJoin(a, eq(v.articleId, a.id))
    .innerJoin(s, eq(a.sectionId, s.id))
    .innerJoin(o, eq(a.organisationId, o.id))
    .leftJoin(au, eq(a.authorId, au.id))
    .where(and(eq(v.tenantId, tenantId), eq(v.state, "published")))
    .orderBy(desc(v.publishedAt));
  return rows;
}
