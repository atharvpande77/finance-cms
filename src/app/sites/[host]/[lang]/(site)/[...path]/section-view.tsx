import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { pick, t } from "@/domain/i18n";
import { calculatorBySlug } from "@/domain/calc/catalog";
import { disclaimerText, listPublished, sectionBySlug } from "@/server/content/queries";
import { ArticleCard } from "@/components/reader/ArticleCard";
import { CalculatorBlock } from "@/components/reader/calculators/CalculatorBlock";
import { Disclaimer } from "@/components/reader/Disclaimer";
import { getSite, pageMetadata } from "@/app/sites/site";
import { Tracker } from "@/components/reader/Tracker";

export type SectionParams = { host: string; lang: string; section: string };

export async function sectionMetadata({
  host,
  lang,
  section: slug,
}: SectionParams): Promise<Metadata> {
  const [site, section] = await Promise.all([getSite(host, lang), sectionBySlug(slug)]);
  if (!section) return {};
  return pageMetadata(site, {
    path: `/${slug}`,
    title: pick(section.name, lang),
    description: pick(section.blurb, lang),
  });
}

/** A section: its articles, its calculators and its disclaimer (05 §5.1). */
export async function SectionView({ host, lang, section: slug }: SectionParams) {
  const [site, section] = await Promise.all([getSite(host, lang), sectionBySlug(slug)]);
  if (!section) notFound();
  const [articles, disclaimer] = await Promise.all([
    listPublished(site.tenant.id, lang, { sectionId: section.id }),
    disclaimerText(section.disclaimerKey),
  ]);
  const calculators = section.calculatorSlugs.map(calculatorBySlug).filter((c) => c !== undefined);

  return (
    <>
      <Tracker kind="section" lang={site.lang} />
      <header className="max-w-3xl">
        <h1 className="font-display text-4xl font-bold text-balance">{pick(section.name, lang)}</h1>
        <p className="mt-2 text-lg text-pretty text-muted">{pick(section.blurb, lang)}</p>
      </header>

      <div className="mt-8 grid gap-10 lg:grid-cols-[2fr_1fr]">
        <section aria-label={pick(section.name, lang)}>
          {articles.length ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {articles.map((c) => (
                <ArticleCard key={c.versionId} copy={c} site={site} />
              ))}
            </div>
          ) : (
            <p className="text-muted">{t(lang, "noArticlesYet")}</p>
          )}
        </section>

        <aside className="grid content-start gap-4">
          {calculators.map((c) => (
            <CalculatorBlock
              key={c.slug}
              site={site}
              slug={c.slug}
              context={{ kind: "section_page", sectionSlug: section.slug }}
              embedded
            />
          ))}
          <Disclaimer text={disclaimer} lang={lang} />
        </aside>
      </div>
    </>
  );
}
