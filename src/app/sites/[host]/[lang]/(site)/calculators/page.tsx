import type { Metadata } from "next";
import { t } from "@/domain/i18n";
import { CALCULATORS } from "@/domain/calc/catalog";
import { CalculatorCard } from "@/components/reader/CalculatorCard";
import { getSite, pageMetadata } from "@/app/sites/site";

type Props = { params: Promise<{ host: string; lang: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { host, lang } = await params;
  return pageMetadata(await getSite(host, lang), {
    path: "/calculators",
    title: t(lang, "calculators"),
  });
}

export default async function CalculatorsPage({ params }: Props) {
  const { host, lang } = await params;
  const site = await getSite(host, lang);
  return (
    <>
      <h1 className="font-display text-4xl font-bold">{t(lang, "calculators")}</h1>
      <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CALCULATORS.map((c) => (
          <li key={c.slug}>
            <a
              href={site.path(`/calculators/${c.slug}`)}
              className="block h-full rounded-xl transition-shadow duration-150 hover:shadow-card-hover"
            >
              <CalculatorCard calculator={c} site={site} />
            </a>
          </li>
        ))}
      </ul>
    </>
  );
}
