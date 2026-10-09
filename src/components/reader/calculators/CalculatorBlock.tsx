import { calculatorBySlug } from "@/domain/calc/catalog";
import { asLang, formatDate, t } from "@/domain/i18n";
import type { BrandContext } from "@/domain/sponsor";
import { calculatorView } from "@/server/calc/rates";
import type { Site } from "@/app/sites/site";
import type { LeadSource } from "@/server/leads/capture";
import { LeadBlock } from "@/components/reader/LeadBlock";
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
  versionId,
}: {
  site: Site;
  slug: string;
  context: BrandContext;
  embedded?: boolean;
  /** The article the calculator is embedded in, for a lead from an abcfinance article. */
  versionId?: string;
}) {
  const calc = calculatorBySlug(slug);
  if (!calc) return null;
  const lang = asLang(site.lang);
  const view = await calculatorView(context, slug);
  const talk = view.brandName ? t(lang, "talkTo", { name: view.brandName }) : "";
  let cta: React.ReactNode = null;
  if (view.leadCta && view.brandName) {
    if (context.kind === "institution_article") {
      // The article has its own form for the same institution, at its end.
      cta = (
        <a
          href="#lead-form"
          data-lead-cta
          className="inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-4 font-semibold text-white"
        >
          {talk}
        </a>
      );
    } else {
      const source: LeadSource = {
        kind: "calculator",
        calculator: slug,
        place:
          context.kind === "section_page"
            ? "section_page"
            : context.kind === "abcfinance_article"
              ? "article"
              : "calculator_page",
        section: context.kind === "section_page" ? context.sectionSlug : undefined,
        versionId: context.kind === "abcfinance_article" ? versionId : undefined,
      };
      cta = (
        <details data-lead-cta className="group">
          <summary className="inline-flex min-h-11 cursor-pointer list-none items-center justify-center rounded-lg bg-primary px-4 font-semibold text-white [&::-webkit-details-marker]:hidden">
            {talk}
          </summary>
          <div className="mt-4">
            <LeadBlock site={site} source={source} />
          </div>
        </details>
      );
    }
  }
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
    >
      {cta}
    </Calculator>
  );
}
