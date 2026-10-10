import type { Metadata } from "next";
import Link from "next/link";
import { forbidden } from "next/navigation";
import { Download, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/panel/PageHeader";
import { ReportTable } from "@/components/panel/ReportTable";
import { cn } from "@/components/ui/utils";
import { requireArea } from "@/server/auth/current";
import { reportScopes, runReport } from "@/server/reports";
import { REPORTS, SET_TITLES, type ReportSet } from "@/domain/reports";
import { recentMonths } from "@/domain/time";

export const metadata: Metadata = { title: "Reports" };

const monthLabel = new Intl.DateTimeFormat("en-IN", {
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const formatMonth = (month: string) => monthLabel.format(new Date(`${month}-01T00:00:00Z`));

const TAB =
  "shrink-0 rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors duration-150 hover:bg-accent aria-[current=page]:bg-accent aria-[current=page]:font-medium aria-[current=page]:text-foreground";

type Search = { report?: string; scope?: string; month?: string };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const s = await requireArea("reports");
  const params = await searchParams;
  const scopes = await reportScopes(s.memberships);
  const open = await runReport(
    s,
    { key: params.report, scope: params.scope, month: params.month },
    scopes,
  );
  if (!open) forbidden();
  const { def, month, scope, result } = open;

  // Institutions are named by id, papers by slug (as in the publisher queue).
  const current = scope ? (def.set === "pub" ? scope.slug : scope.id) : null;
  const href = (q: { report?: string; scope?: string | null; month?: string }) => {
    const sp = new URLSearchParams({ report: q.report ?? def.key });
    const sc = q.scope === undefined ? current : q.scope;
    if (sc) sp.set("scope", sc);
    sp.set("month", q.month ?? month.month);
    return `/reports?${sp}`;
  };
  const firstOf = (set: ReportSet) => REPORTS.find((r) => r.set === set)!.key;
  const scopeChoices =
    def.set === "inst"
      ? scopes.institutions.map((i) => ({ value: i.id, name: i.name }))
      : def.set === "pub"
        ? scopes.papers.map((p) => ({ value: p.slug, name: p.name }))
        : [];

  return (
    <div className="grid gap-6" data-report={def.key} data-month={month.month}>
      <PageHeader
        className="mb-0"
        title="Reports"
        description="Monthly tables, counted in India time. Download any of them as CSV."
      />

      {scopes.sets.length > 1 ? (
        <nav aria-label="Report sets" className="-mx-1 flex gap-1 overflow-x-auto px-1">
          {scopes.sets.map((set) => (
            <Link
              key={set}
              href={href({ report: firstOf(set), scope: null })}
              aria-current={set === def.set ? "page" : undefined}
              className={TAB}
              data-report-set={set}
            >
              {SET_TITLES[set]}
            </Link>
          ))}
        </nav>
      ) : null}

      {scopeChoices.length > 1 ? (
        <nav
          aria-label={def.set === "inst" ? "Institutions" : "Newspapers"}
          className="-mx-1 flex gap-1 overflow-x-auto px-1"
          data-scope-switcher
        >
          {scopeChoices.map((c) => (
            <Link
              key={c.value}
              href={href({ scope: c.value })}
              aria-current={c.value === current ? "page" : undefined}
              className={TAB}
            >
              {c.name}
            </Link>
          ))}
        </nav>
      ) : null}

      <div className="grid gap-4 rounded-xl bg-card p-4 shadow-[0_0_0_1px_oklch(0_0_0/0.08)] sm:p-5 dark:shadow-[0_0_0_1px_oklch(1_0_0/0.1)]">
        <nav
          aria-label="Reports"
          className="-mx-1 flex gap-1 overflow-x-auto px-1"
          data-report-tabs
        >
          {REPORTS.filter((r) => r.set === def.set).map((r) => (
            <Link
              key={r.key}
              href={href({ report: r.key })}
              aria-current={r.key === def.key ? "page" : undefined}
              className={TAB}
            >
              {r.title}
            </Link>
          ))}
        </nav>
        <nav aria-label="Month" className="-mx-1 flex gap-1 overflow-x-auto px-1" data-month-picker>
          {recentMonths(12, new Date()).map((m) => (
            <Link
              key={m}
              href={href({ month: m })}
              aria-current={m === month.month ? "page" : undefined}
              className={cn(TAB, "tabular-nums")}
              data-month={m}
            >
              {formatMonth(m)}
            </Link>
          ))}
        </nav>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-1">
          <h2 className="text-lg font-semibold text-balance" data-report-title>
            {def.title}
            <span className="font-normal text-muted-foreground">
              {" · "}
              {scope ? `${scope.name} · ` : ""}
              {formatMonth(month.month)}
            </span>
          </h2>
          <p className="text-sm text-pretty text-muted-foreground">{def.description}</p>
        </div>
        <form method="post" action="/reports/export" data-form="report-export">
          <input type="hidden" name="report" value={def.key} />
          {current ? <input type="hidden" name="scope" value={current} /> : null}
          <input type="hidden" name="month" value={month.month} />
          <Button type="submit" variant="outline" size="sm">
            <Download strokeWidth={1.75} />
            Download CSV
          </Button>
        </form>
      </div>

      {result.note ? (
        <p
          className="flex items-start gap-2 text-sm text-pretty text-muted-foreground"
          data-report-note
        >
          <Info className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} aria-hidden />
          {result.note}
        </p>
      ) : null}

      {result.sections.map((section, i) => (
        <ReportTable key={i} section={section} index={i} />
      ))}
    </div>
  );
}
