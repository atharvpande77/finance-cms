import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { pick, t } from "@/domain/i18n";
import { glossaryTerm } from "@/server/content/queries";
import { JsonLd } from "@/components/reader/JsonLd";
import { getSite, pageMetadata } from "@/app/sites/site";

type Props = { params: Promise<{ host: string; lang: string; slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { host, lang, slug } = await params;
  const term = await glossaryTerm(slug);
  if (!term) return {};
  return pageMetadata(await getSite(host, lang), {
    path: `/glossary/${slug}`,
    title: pick(term.term, lang),
    description: pick(term.definition, lang),
  });
}

export default async function GlossaryTermPage({ params }: Props) {
  const { host, lang, slug } = await params;
  const [site, term] = await Promise.all([getSite(host, lang), glossaryTerm(slug)]);
  if (!term) notFound();
  return (
    <div className="mx-auto max-w-[42rem]">
      <a
        href={site.path("/glossary")}
        className="text-sm font-semibold text-primary hover:underline"
      >
        ← {t(lang, "allTerms")}
      </a>
      <h1 className="mt-3 font-display text-4xl font-bold text-balance">{pick(term.term, lang)}</h1>
      <p className="mt-4 text-lg leading-relaxed text-pretty">{pick(term.definition, lang)}</p>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "DefinedTerm",
          name: pick(term.term, lang),
          description: pick(term.definition, lang),
          inLanguage: lang,
          url: site.url(`/glossary/${slug}`),
        }}
      />
    </div>
  );
}
