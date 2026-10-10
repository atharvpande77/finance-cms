import type { Cell, Column, ReportSection } from "@/server/reports";
import { cn } from "@/components/ui/utils";

const numbers = new Intl.NumberFormat("en-IN");

function display(value: Cell, column: Column): string {
  if (value === null || value === "") return column.kind === "text" ? "" : "–";
  if (typeof value === "number") {
    return column.kind === "percent" ? `${value.toFixed(1)}%` : numbers.format(value);
  }
  return value;
}

/** One report table: numbers right-aligned in tabular figures; scrolls sideways on phones. */
export function ReportTable({ section, index }: { section: ReportSection; index: number }) {
  const headingId = `report-section-${index}`;
  return (
    <section className="grid gap-3" aria-labelledby={section.title ? headingId : undefined}>
      {section.title ? (
        <h2 id={headingId} className="font-semibold">
          {section.title}
        </h2>
      ) : null}
      {section.rows.length === 0 ? (
        <p className="rounded-xl border border-dashed px-4 py-6 text-sm text-pretty text-muted-foreground">
          {section.empty}
        </p>
      ) : (
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <table
            className="w-full min-w-max border-separate border-spacing-0 rounded-xl bg-card text-sm shadow-[0_0_0_1px_oklch(0_0_0/0.08)] dark:shadow-[0_0_0_1px_oklch(1_0_0/0.1)]"
            data-report-section={index}
          >
            <thead>
              <tr>
                {section.columns.map((c) => (
                  <th
                    key={c.key}
                    scope="col"
                    className={cn(
                      "border-b px-3 py-2.5 text-xs font-medium whitespace-nowrap text-muted-foreground first:pl-4 last:pr-4",
                      c.kind === "text" ? "text-left" : "text-right",
                    )}
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {section.rows.map((row, i) => (
                <tr key={i} data-row className="[&:last-child>td]:border-b-0">
                  {section.columns.map((c) => (
                    <Td key={c.key} column={c} value={row[c.key] ?? null} />
                  ))}
                </tr>
              ))}
            </tbody>
            {section.totals ? (
              <tfoot>
                <tr data-totals className="font-medium">
                  {section.columns.map((c) => (
                    <Td key={c.key} column={c} value={section.totals![c.key] ?? null} total />
                  ))}
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      )}
    </section>
  );
}

function Td({ column, value, total }: { column: Column; value: Cell; total?: boolean }) {
  return (
    <td
      data-col={column.key}
      data-value={value ?? ""}
      className={cn(
        "border-b px-3 py-2.5 align-top first:pl-4 last:pr-4",
        total && "border-t border-b-0",
        column.kind === "text"
          ? "max-w-[28rem] text-pretty"
          : "text-right whitespace-nowrap tabular-nums",
      )}
    >
      {display(value, column)}
    </td>
  );
}
