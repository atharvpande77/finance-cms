import type { CalculatorInfo } from "@/domain/calc/catalog";
import type { Site } from "@/app/sites/site";

/** A calculator's name and what it does, for lists that link to its page. */
export function CalculatorCard({ calculator, site }: { calculator: CalculatorInfo; site: Site }) {
  const name = calculator.name[site.lang as "en" | "mr"] ?? calculator.name.en;
  const description = calculator.description[site.lang as "en" | "mr"] ?? calculator.description.en;
  return (
    <div className="h-full rounded-xl bg-surface p-5 shadow-card">
      <p className="font-heading text-lg leading-snug font-bold text-balance">{name}</p>
      <p className="mt-1.5 text-[0.95rem] text-pretty text-muted">{description}</p>
    </div>
  );
}
