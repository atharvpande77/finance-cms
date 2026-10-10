import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { formatDate, pick, t } from "@/domain/i18n";
import { allTenants, primaryHost } from "@/server/tenants";
import { localePath, siteOrigin } from "@/domain/urls";
import { env } from "@/server/env";
import {
  canonicalCopy,
  disclaimerText,
  getPublishedArticle,
  listPublished,
  publishedLanguages,
  type PublishedCopy,
} from "@/server/content/queries";
import { ArticleBody } from "@/components/reader/ArticleBody";
import { CalculatorBlock } from "@/components/reader/calculators/CalculatorBlock";
import { LeadBlock } from "@/components/reader/LeadBlock";
import type { BrandContext } from "@/domain/sponsor";
import { ArticleCard } from "@/components/reader/ArticleCard";
import { ArticleLabel } from "@/components/reader/Labels";
import { Disclaimer } from "@/components/reader/Disclaimer";
import { JsonLd } from "@/components/reader/JsonLd";
import { approvalLine, getSite, pageMetadata, type Site } from "@/app/sites/site";
import { Tracker } from "@/components/reader/Tracker";

/** Where an embedded calculator sits, for its branding (04.7). */
function brandContext(copy: PublishedCopy): BrandContext {
  if (copy.type === "institution") {
    return { kind: "institution_article", orgId: copy.orgId, sectionSlug: copy.sectionSlug };
  }
  if (copy.type === "independent") return { kind: "independent_article" };
  return { kind: "abcfinance_article", sectionSlug: copy.sectionSlug };
}

export type ArticleParams = { host: string; lang: string; section: string; slug: string };

async function load({ host, lang, section, slug }: ArticleParams) {
  const site = await getSite(host, lang);
  const copy = await getPublishedArticle(site.tenant.id, lang, section, slug);
  return { site, copy };
}

/**
 * Canonical URL (04.4, D8): the earliest currently published copy of this article in this
 * language, which may be on another paper.
 */
async function canonicalUrl(site: Site, copy: PublishedCopy): Promise<string> {
  const first = await canonicalCopy(copy.articleId, copy.language);
  const path = `/${copy.sectionSlug}/${copy.slug}`;
  if (!first || first.tenantId === site.tenant.id) return site.url(path);
  const tenant = (await allTenants()).find((x) => x.id === first.tenantId);
  if (!tenant) return site.url(path);
  return `${siteOrigin(primaryHost(tenant), env().APP_URL)}${localePath(tenant, copy.language, path)}`;
}

export async function articleMetadata(params: ArticleParams): Promise<Metadata> {
  const { site, copy } = await load(params);
  if (!copy) return {};
  const [languages, canonical] = await Promise.all([
    publishedLanguages(site.tenant.id, copy.articleId),
    canonicalUrl(site, copy),
  ]);
  return pageMetadata(site, {
    path: `/${copy.sectionSlug}/${copy.slug}`,
    title: copy.headline,
    description: copy.summary,
    languages,
    canonical,
    type: "article",
    publishedTime: copy.publishedAt,
  });
}

export async function ArticleView(params: ArticleParams) {
  const { site, copy } = await load(params);
  if (!copy) notFound();
  const { lang } = site;
  const [disclaimer, related, canonical] = await Promise.all([
    disclaimerText(copy.disclaimerKey),
    listPublished(site.tenant.id, lang, {
      sectionId: copy.sectionId,
      excludeArticleId: copy.articleId,
      limit: 3,
    }),
    canonicalUrl(site, copy),
  ]);
  const approval = approvalLine(site, copy.approvalType);
  const credentials = pick(copy.authorCredentials, lang);

  return (
    <>
      <Tracker kind="article" versionId={copy.versionId} lang={site.lang} />
      <article className="mx-auto max-w-[42rem]">
        <nav aria-label={t(lang, "sections")} className="text-sm">
          <a
            href={site.path(`/${copy.sectionSlug}`)}
            className="font-semibold text-primary hover:underline"
          >
            {pick(copy.sectionName, lang)}
          </a>
        </nav>

        <header className="mt-3">
          <ArticleLabel type={copy.type} lang={lang} />
          <h1 className="mt-3 font-heading text-3xl leading-tight font-bold text-balance sm:text-4xl">
            {copy.headline}
          </h1>
          {copy.summary && <p className="mt-3 text-lg text-pretty text-muted">{copy.summary}</p>}

          <div className="mt-5 border-y border-ink/10 py-3 text-sm">
            {copy.authorSlug && (
              <p>
                {t(lang, "by")}{" "}
                <a
                  href={site.path(`/experts/${copy.authorSlug}`)}
                  className="font-semibold text-ink underline-offset-4 hover:underline"
                >
                  {copy.authorName}
                </a>
                {credentials && <span className="text-muted">, {credentials}</span>}
              </p>
            )}
            {copy.type === "independent" &&
              copy.authorAffiliations &&
              copy.authorAffiliations.length > 0 && (
                <p className="mt-1 text-muted">
                  {t(lang, "disclosedAffiliations")}: {copy.authorAffiliations.join("; ")}
                </p>
              )}
            <p className="mt-1 text-muted">
              {t(lang, "published")}{" "}
              <time dateTime={copy.publishedAt.toISOString()}>
                {formatDate(copy.publishedAt, lang)}
              </time>
              {copy.lastReviewedAt &&
                copy.lastReviewedAt.getTime() !== copy.publishedAt.getTime() && (
                  <>
                    {" · "}
                    {t(lang, "lastReviewed")}{" "}
                    <time dateTime={copy.lastReviewedAt.toISOString()}>
                      {formatDate(copy.lastReviewedAt, lang)}
                    </time>
                  </>
                )}
            </p>
          </div>
        </header>

        <div className="mt-8">
          <ArticleBody
            body={copy.body}
            articleType={copy.type}
            linkHosts={site.tenant.hosts}
            renderCalculator={(calc) => (
              <CalculatorBlock
                site={site}
                slug={calc.slug}
                context={brandContext(copy)}
                versionId={copy.versionId}
                embedded
              />
            )}
          />
        </div>

        {/* Every institution article ends with a lead form for that institution (04.6). */}
        {copy.type === "institution" ? (
          <div className="mt-10">
            <LeadBlock
              site={site}
              source={{ kind: "article", versionId: copy.versionId }}
              id="lead-form"
            />
          </div>
        ) : null}

        <div className="mt-10">
          <Disclaimer text={disclaimer} lang={lang} />
        </div>

        {approval && <p className="mt-6 text-sm font-semibold text-muted">{approval}</p>}
      </article>

      {related.length > 0 && (
        <section aria-labelledby="related" className="mx-auto mt-14 max-w-6xl">
          <h2 id="related" className="font-display text-2xl font-bold">
            {t(lang, "relatedReads")}
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {related.map((c) => (
              <ArticleCard key={c.versionId} copy={c} site={site} />
            ))}
          </div>
        </section>
      )}

      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Article",
          headline: copy.headline,
          description: copy.summary,
          inLanguage: lang,
          datePublished: copy.publishedAt.toISOString(),
          dateModified: (copy.lastReviewedAt ?? copy.publishedAt).toISOString(),
          mainEntityOfPage: canonical,
          author: copy.authorName
            ? {
                "@type": copy.authorType === "staff" ? "Organization" : "Person",
                name: copy.authorName,
                ...(credentials ? { jobTitle: credentials } : {}),
                url: site.url(`/experts/${copy.authorSlug}`),
              }
            : undefined,
          publisher: {
            "@type": "Organization",
            name: site.paperName,
            url: site.tenant.mainSiteUrl,
          },
        }}
      />
    </>
  );
}
