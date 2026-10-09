import { calculatorBySlug } from "@/domain/calc/catalog";
import { asLang, formatDate } from "@/domain/i18n";
import type { BrandContext } from "@/domain/sponsor";
import { calculatorView } from "@/server/calc/rates";
import type { Site } from "@/app/sites/site";
import { Calculator } from "./Calculator";

/**
 * A calculator as it appears in one place: branded for that place (04.7), with the matching
 * rates and "as of" date resolved on the server.
 */
export async function CalculatorBlock({
  site,
  slug,
  context,
  embedded = false,
}: {
  site: Site;
  slug: string;
  context: BrandContext;
  embedded?: boolean;
}) {
  const calc = calculatorBySlug(slug);
  if (!calc) return null;
  const lang = asLang(site.lang);
  const view = await calculatorView(context, slug);
  return (
    <Calculator
      slug={slug}
      lang={lang}
      name={calc.name[lang]}
      rates={view.rates}
      asOf={view.asOf}
      asOfLabel={formatDate(new Date(`${view.asOf}T00:00:00+05:30`), lang)}
      brand={
        view.brand && view.brandName ? { name: view.brandName, label: view.brand.label } : null
      }
      embedded={embedded}
      pageHref={site.path(`/calculators/${slug}`)}
    />
  );
}
