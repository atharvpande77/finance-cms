import type { CalculatorInfo } from "@/domain/calc/catalog";
import { t } from "@/domain/i18n";
import type { Site } from "@/app/sites/site";

/**
 * Stands in for a calculator until the calculators arrive (M4): name, what it does, and a link
 * to its page. The interactive version renders its first result on the server, so swapping it
 * in will not shift the layout.
 */
export function CalculatorPlaceholder({
  calculator,
  site,
  embedded = false,
}: {
  calculator: CalculatorInfo;
  site: Site;
  embedded?: boolean;
}) {
  const name = calculator.name[site.lang as "en" | "mr"] ?? calculator.name.en;
  const description = calculator.description[site.lang as "en" | "mr"] ?? calculator.description.en;
  return (
    <aside
      aria-label={name}
      className={`not-prose rounded-xl bg-surface p-5 shadow-card ${embedded ? "my-8 border-l-4 border-primary" : ""}`}
    >
      <p className="font-heading text-lg leading-snug font-bold text-balance">{name}</p>
      <p className="mt-1.5 text-[0.95rem] text-pretty text-muted">{description}</p>
      <p className="mt-3 text-sm text-muted italic">{t(site.lang, "calculatorComingSoon")}</p>
      {embedded && (
        <a
          href={site.path(`/calculators/${calculator.slug}`)}
          className="mt-3 inline-flex min-h-10 items-center font-semibold text-primary underline-offset-4 hover:underline"
        >
          {t(site.lang, "openCalculator")} <span aria-hidden="true">&nbsp;→</span>
        </a>
      )}
    </aside>
  );
}
