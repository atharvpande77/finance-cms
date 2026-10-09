import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { pick, t } from "@/domain/i18n";
import { listPublished, partnerBySlug } from "@/server/content/queries";
import { ArticleCard } from "@/components/reader/ArticleCard";
import { PartnerLabel } from "@/components/reader/Labels";
import { getSite, pageMetadata } from "@/app/sites/site";

type Props = { params: Promise<{ host: string; lang: string; slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { host, lang, slug } = await params;
  const org = await partnerBySlug(slug);
  if (!org) return {};
  return pageMetadata(await getSite(host, lang), {
    path: `/partners/${slug}`,
    title: org.name,
    description: pick(org.blurb, lang),
  });
}

/** An institution's profile and its articles on this paper (05 §5.1). */
export default async function PartnerPage({ params }: Props) {
  const { host, lang, slug } = await params;
  const [site, org] = await Promise.all([getSite(host, lang), partnerBySlug(slug)]);
  if (!org) notFound();
  const articles = await listPublished(site.tenant.id, lang, { organisationId: org.id });
  return (
    <>
      <header className="max-w-3xl">
        <PartnerLabel lang={lang} />
        <h1 className="mt-3 font-display text-4xl font-bold">{org.name}</h1>
        <p className="mt-3 text-lg text-pretty text-muted">{pick(org.blurb, lang)}</p>
      </header>
      <section aria-labelledby="articles" className="mt-12">
        <h2 id="articles" className="font-display text-2xl font-bold">
          {t(lang, "articlesFrom", { name: org.name })}
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
    </>
  );
}
