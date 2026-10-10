import type { Metadata } from "next";
import { pick, t } from "@/domain/i18n";
import { glossaryTerms } from "@/server/content/queries";
import { getSite, pageMetadata } from "@/app/sites/site";
import { Tracker } from "@/components/reader/Tracker";

type Props = { params: Promise<{ host: string; lang: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { host, lang } = await params;
  return pageMetadata(await getSite(host, lang), { path: "/glossary", title: t(lang, "glossary") });
}

export default async function GlossaryPage({ params }: Props) {
  const { host, lang } = await params;
  const site = await getSite(host, lang);
  const terms = (await glossaryTerms()).sort((a, b) =>
    pick(a.term, lang).localeCompare(pick(b.term, lang), lang === "mr" ? "mr" : "en"),
  );
  return (
    <div className="mx-auto max-w-[42rem]">
      <Tracker kind="other" lang={site.lang} />
      <h1 className="font-display text-4xl font-bold">{t(lang, "glossary")}</h1>
      <dl className="mt-8 divide-y divide-ink/10">
        {terms.map((term) => (
          <div key={term.slug} className="py-4">
            <dt>
              <a
                href={site.path(`/glossary/${term.slug}`)}
                className="font-heading text-lg font-bold text-primary hover:underline"
              >
                {pick(term.term, lang)}
              </a>
            </dt>
            <dd className="mt-1 text-pretty text-muted">{pick(term.definition, lang)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
