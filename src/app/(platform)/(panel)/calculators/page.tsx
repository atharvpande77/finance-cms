import type { Metadata } from "next";
import Link from "next/link";
import { ChevronDown, CircleCheck } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/panel/PageHeader";
import { RatesForm } from "@/components/panel/RatesForm";
import { requireArea } from "@/server/auth/current";
import { ratesPanel } from "@/server/calc/rates";
import { calculatorBySlug } from "@/domain/calc/catalog";
import { indianDate } from "@/domain/time";
import { formatDate } from "@/domain/i18n";

export const metadata: Metadata = { title: "Calculator rates" };

const DONE: Record<string, string> = {
  save: "Rates saved. Readers see them now.",
  reset: "Back to the standard defaults.",
};

export default async function CalculatorRatesPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string; calc?: string; done?: string }>;
}) {
  const s = await requireArea("calculators");
  const { org: orgParam, calc, done } = await searchParams;
  const orgs = await ratesPanel(s);
  const org = orgs.find((o) => o.id === orgParam) ?? orgs[0];
  const today = indianDate(new Date());

  return (
    <div className="grid gap-6">
      <PageHeader
        className="mb-0"
        title="Calculator rates"
        description={
          org?.type === "abcfinance"
            ? "Rates used by calculators that no institution sponsors, and the date they apply from."
            : "Your rates for each calculator, and the date they apply from. Readers see them where your brand appears."
        }
      />

      {orgs.length > 1 ? (
        <nav aria-label="Organisations" className="flex flex-wrap gap-1" data-org-switcher>
          {orgs.map((o) => (
            <Link
              key={o.id}
              href={`/calculators?org=${o.id}`}
              aria-current={o.id === org?.id ? "page" : undefined}
              className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors duration-150 hover:bg-accent aria-[current=page]:bg-accent aria-[current=page]:font-medium aria-[current=page]:text-foreground"
            >
              {o.name}
            </Link>
          ))}
        </nav>
      ) : null}

      {done && DONE[done] ? (
        <Alert variant="success" data-done={done}>
          <CircleCheck strokeWidth={1.75} />
          <AlertDescription>{DONE[done]}</AlertDescription>
        </Alert>
      ) : null}

      {org ? (
        <ul className="grid gap-3" data-rates-org={org.id}>
          {org.calculators.map((c) => {
            const info = calculatorBySlug(c.slug)!;
            return (
              <li key={c.slug}>
                <details
                  open={c.slug === calc}
                  className="group rounded-xl bg-card shadow-[0_0_0_1px_oklch(0_0_0/0.08)] dark:shadow-[0_0_0_1px_oklch(1_0_0/0.1)]"
                  data-rates-calc={c.slug}
                >
                  <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-4 py-4 sm:px-5 [&::-webkit-details-marker]:hidden">
                    <ChevronDown
                      className="size-4 shrink-0 text-muted-foreground transition-transform duration-150 group-open:rotate-180"
                      strokeWidth={1.75}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 basis-48 font-medium">{info.name.en}</span>
                    {c.asOf ? (
                      <Badge variant="success" data-rates-source="saved">
                        Your rates, as of {formatDate(new Date(`${c.asOf}T00:00:00+05:30`), "en")}
                      </Badge>
                    ) : (
                      <Badge variant="secondary" data-rates-source="standard">
                        Standard defaults
                      </Badge>
                    )}
                  </summary>
                  <div className="border-t px-4 py-5 sm:px-5">
                    <RatesForm
                      orgId={org.id}
                      slug={c.slug}
                      fields={c.fields}
                      values={c.values}
                      asOf={c.asOf}
                      today={today}
                    />
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">You have no organisation to set rates for.</p>
      )}
    </div>
  );
}
