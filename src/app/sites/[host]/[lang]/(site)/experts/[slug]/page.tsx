import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { pick, t } from "@/domain/i18n";
import { authorBySlug, listPublished } from "@/server/content/queries";
import { ArticleCard } from "@/components/reader/ArticleCard";
import { ExpertTag } from "@/components/reader/Labels";
import { JsonLd } from "@/components/reader/JsonLd";
import { getSite, pageMetadata } from "@/app/sites/site";
import { Tracker } from "@/components/reader/Tracker";

type Props = { params: Promise<{ host: string; lang: string; slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { host, lang, slug } = await params;
  const row = await authorBySlug(slug);
  if (!row) return {};
  return pageMetadata(await getSite(host, lang), {
    path: `/experts/${slug}`,
    title: row.author.name,
    description: pick(row.author.credentials, lang),
  });
}

/** An author: credentials, bio, disclosed affiliations and their articles on this paper (05 §5.1). */
export default async function ExpertPage({ params }: Props) {
  const { host, lang, slug } = await params;
  const [site, row] = await Promise.all([getSite(host, lang), authorBySlug(slug)]);
  if (!row) notFound();
  const { author, organisation } = row;
  const articles = await listPublished(site.tenant.id, lang, { authorId: author.id });
  const credentials = pick(author.credentials, lang);

  return (
    <>
      <Tracker kind="other" lang={site.lang} />
      <header className="max-w-3xl">
        {author.contributorType === "independent" && <ExpertTag lang={lang} />}
        <h1 className="mt-3 font-display text-4xl font-bold">{author.name}</h1>
        {credentials && <p className="mt-1 text-lg text-muted">{credentials}</p>}
        {organisation?.type === "institution" && (
          <p className="mt-1">
            <a
              href={site.path(`/partners/${organisation.slug}`)}
              className="font-semibold text-primary hover:underline"
            >
              {organisation.name}
            </a>
          </p>
        )}
        <p className="mt-4 text-pretty">{pick(author.bio, lang)}</p>

        <dl className="mt-4 grid gap-1 text-sm">
          {author.licenceType && (
            <div className="flex gap-2">
              <dt className="text-muted">{t(lang, "licence")}:</dt>
              <dd>
                {author.licenceType}
                {author.licenceNumber ? ` · ${author.licenceNumber}` : ""}
              </dd>
            </div>
          )}
          {author.disclosedAffiliations.length > 0 && (
            <div>
              <dt className="text-muted">{t(lang, "disclosedAffiliations")}:</dt>
              <dd>
                <ul className="mt-1 list-disc pl-5">
                  {author.disclosedAffiliations.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              </dd>
            </div>
          )}
        </dl>
      </header>

      <section aria-labelledby="articles" className="mt-12">
        <h2 id="articles" className="font-display text-2xl font-bold">
          {t(lang, "articlesBy", { name: author.name })}
        </h2>
        {articles.length ? (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {articles.map((c) => (
              <ArticleCard key={c.versionId} copy={c} site={site} />
            ))}
          </div>
        ) : (
          <p className="mt-4 text-muted">{t(lang, "noArticlesYet")}</p>
        )}
      </section>

      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": author.contributorType === "staff" ? "Organization" : "Person",
          name: author.name,
          ...(credentials ? { jobTitle: credentials } : {}),
          description: pick(author.bio, lang),
          url: site.url(`/experts/${slug}`),
          ...(organisation?.type === "institution"
            ? { worksFor: { "@type": "Organization", name: organisation.name } }
            : {}),
        }}
      />
    </>
  );
}
