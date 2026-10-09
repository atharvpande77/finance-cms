import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { pick, t } from "@/domain/i18n";
import { calculatorBySlug } from "@/domain/calc/catalog";
import { CalculatorBlock } from "@/components/reader/calculators/CalculatorBlock";
import { getSite, pageMetadata } from "@/app/sites/site";

type Props = { params: Promise<{ host: string; lang: string; slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { host, lang, slug } = await params;
  const calc = calculatorBySlug(slug);
  if (!calc) return {};
  return pageMetadata(await getSite(host, lang), {
    path: `/calculators/${slug}`,
    title: pick(calc.name, lang),
    description: pick(calc.description, lang),
  });
}

export default async function CalculatorPage({ params }: Props) {
  const { host, lang, slug } = await params;
  const calc = calculatorBySlug(slug);
  if (!calc) notFound();
  const site = await getSite(host, lang);
  return (
    <div className="mx-auto max-w-[60rem]">
      <a
        href={site.path("/calculators")}
        className="text-sm font-semibold text-primary hover:underline"
      >
        ← {t(lang, "allCalculators")}
      </a>
      <h1 className="mt-3 font-display text-4xl font-bold text-balance">{pick(calc.name, lang)}</h1>
      <p className="mt-2 text-lg text-pretty text-muted">{pick(calc.description, lang)}</p>
      <div className="mt-8">
        <CalculatorBlock site={site} slug={slug} context={{ kind: "calculator_page" }} />
      </div>
    </div>
  );
}
