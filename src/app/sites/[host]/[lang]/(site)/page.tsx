import type { Metadata } from "next";
import { pick, t } from "@/domain/i18n";
import { CALCULATORS } from "@/domain/calc/catalog";
import { allSections, listPublished } from "@/server/content/queries";
import { ArticleCard } from "@/components/reader/ArticleCard";
import { getSite, pageMetadata } from "@/app/sites/site";
import { Tracker } from "@/components/reader/Tracker";

type Props = { params: Promise<{ host: string; lang: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { host, lang } = await params;
  const site = await getSite(host, lang);
  return pageMetadata(site, { path: "/", description: pick(site.tenant.name, lang) });
}

/** Home: latest articles, the sections and the calculators (05 §5.1). */
export default async function HomePage({ params }: Props) {
  const { host, lang } = await params;
  const site = await getSite(host, lang);
  const [latest, sections] = await Promise.all([
    listPublished(site.tenant.id, lang, { limit: 7 }),
    allSections(),
  ]);
  const [lead, ...rest] = latest;

  return (
    <>
      <Tracker kind="home" lang={site.lang} />
      <h1 className="sr-only">
        {site.sectionLabel} · {site.paperName}
      </h1>

      <section aria-labelledby="latest">
        <h2 id="latest" className="font-display text-2xl font-bold">
          {t(lang, "latest")}
        </h2>
        {lead ? (
          <>
            <div className="mt-4 border-b border-ink/10 pb-8">
              <div className="max-w-4xl">
                <ArticleCard copy={lead} site={site} lead />
              </div>
            </div>
            {rest.length > 0 && (
              <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {rest.map((c) => (
                  <ArticleCard key={c.versionId} copy={c} site={site} />
                ))}
              </div>
            )}
          </>
        ) : (
          <p className="mt-4 text-muted">{t(lang, "noArticlesYet")}</p>
        )}
      </section>

      <section aria-labelledby="sections" className="mt-14">
        <h2 id="sections" className="font-display text-2xl font-bold">
          {t(lang, "sections")}
        </h2>
        <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {sections.map((s) => (
            <li key={s.slug}>
              <a
                href={site.path(`/${s.slug}`)}
                className="block h-full rounded-xl bg-surface p-5 shadow-card transition-shadow duration-150 hover:shadow-card-hover"
              >
                <span className="font-heading text-lg font-bold text-primary">
                  {pick(s.name, lang)}
                </span>
                <span className="mt-1 block text-sm text-pretty text-muted">
                  {pick(s.blurb, lang)}
                </span>
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="calculators" className="mt-14">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="calculators" className="font-display text-2xl font-bold">
            {t(lang, "calculators")}
          </h2>
          <a
            href={site.path("/calculators")}
            className="text-sm font-semibold text-primary hover:underline"
          >
            {t(lang, "allCalculators")} →
          </a>
        </div>
        <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {CALCULATORS.map((c) => (
            <li key={c.slug}>
              <a
                href={site.path(`/calculators/${c.slug}`)}
                className="block h-full rounded-xl bg-surface p-5 shadow-card transition-shadow duration-150 hover:shadow-card-hover"
              >
                <span className="font-heading font-bold">{pick(c.name, lang)}</span>
                <span className="mt-1 block text-sm text-pretty text-muted">
                  {pick(c.description, lang)}
                </span>
              </a>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
