import type { Metadata } from "next";
import Link from "next/link";
import { CircleCheck, Download, Inbox, Phone } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/panel/PageHeader";
import { LeadEraseForm, LeadStatusForm } from "@/components/panel/LeadForms";
import { panelTime } from "@/components/panel/articleLabels";
import { requireArea } from "@/server/auth/current";
import { leadOrgsFor, leadsFor, qualityFor } from "@/server/leads/inbox";
import { LEAD_STATUSES } from "@/domain/leads";

export const metadata: Metadata = { title: "Leads" };

const STATUS = {
  new: { label: "New", badge: "default" },
  contacted: { label: "Contacted", badge: "secondary" },
  qualified: { label: "Qualified", badge: "success" },
  junk: { label: "Junk", badge: "outline" },
} as const;

const DONE: Record<string, string> = {
  status: "Saved.",
  erase: "Their details are deleted. The consent record stays.",
};

const pct = (share: number) => `${Math.round(share * 100)}%`;

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string; status?: string; done?: string }>;
}) {
  const s = await requireArea("leads");
  const { org: orgParam, status, done } = await searchParams;
  const orgs = await leadOrgsFor(s);
  const org = orgs.find((o) => o.id === orgParam) ?? orgs[0]!;
  const filter = LEAD_STATUSES.find((x) => x === status);
  const [leads, quality] = await Promise.all([
    leadsFor(s, org.id, { status: filter }),
    qualityFor(s, org.id),
  ]);
  const href = (st?: string) => `/leads?org=${org.id}${st ? `&status=${st}` : ""}`;

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeader
          className="mb-0"
          title="Leads"
          description={`Readers who asked ${org.name} to contact them. Only ${org.name}'s account admins see these.`}
        />
        <form method="post" action="/leads/export" data-form="leads-export">
          <input type="hidden" name="org" value={org.id} />
          <Button type="submit" variant="outline" size="sm">
            <Download strokeWidth={1.75} />
            Download CSV
          </Button>
        </form>
      </div>

      {orgs.length > 1 ? (
        <nav aria-label="Organisations" className="flex flex-wrap gap-1">
          {orgs.map((o) => (
            <Link
              key={o.id}
              href={`/leads?org=${o.id}`}
              aria-current={o.id === org.id ? "page" : undefined}
              className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent aria-[current=page]:bg-accent aria-[current=page]:font-medium aria-[current=page]:text-foreground"
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

      <section aria-labelledby="quality" className="grid gap-3" data-quality>
        <h2 id="quality" className="font-semibold">
          Lead quality
        </h2>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Leads", String(quality!.total), "total"],
            ["Worked", pct(quality!.workedShare), "worked"],
            ["Qualified", pct(quality!.qualifiedShare), "qualified"],
            ["Junk", pct(quality!.junkShare), "junk"],
          ].map(([label, value, key]) => (
            <div
              key={key}
              className="rounded-xl bg-card px-4 py-3 shadow-[0_0_0_1px_oklch(0_0_0/0.08)] dark:shadow-[0_0_0_1px_oklch(1_0_0/0.1)]"
            >
              <dt className="text-sm text-muted-foreground">{label}</dt>
              <dd className="text-2xl font-semibold tabular-nums" data-quality-value={key}>
                {value}
              </dd>
            </div>
          ))}
        </dl>
        <p className="text-xs text-pretty text-muted-foreground">
          Worked: no longer new. Qualified: of the worked leads that aren&apos;t junk. Junk: of all
          leads.
        </p>
      </section>

      <nav aria-label="Filter by status" className="-mx-1 flex gap-1 overflow-x-auto px-1">
        {[undefined, ...LEAD_STATUSES].map((st) => (
          <Link
            key={st ?? "all"}
            href={href(st)}
            aria-current={st === filter ? "page" : undefined}
            className="shrink-0 rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent aria-[current=page]:bg-accent aria-[current=page]:font-medium aria-[current=page]:text-foreground"
          >
            {st ? STATUS[st].label : "All"}
          </Link>
        ))}
      </nav>

      {leads!.length === 0 ? (
        <div className="flex items-center gap-3 rounded-lg bg-muted/60 px-4 py-5 text-sm text-muted-foreground">
          <Inbox className="size-4 shrink-0" strokeWidth={1.75} aria-hidden />
          No leads {filter ? `marked ${STATUS[filter].label.toLowerCase()}` : "yet"}.
        </div>
      ) : (
        <ul className="grid gap-3" data-leads>
          {leads!.map((lead) => (
            <li
              key={lead.id}
              id={`lead-${lead.id}`}
              data-lead={lead.id}
              data-lead-status={lead.status}
              className="grid scroll-mt-24 gap-4 rounded-xl bg-card p-4 shadow-[0_0_0_1px_oklch(0_0_0/0.08)] sm:p-5 dark:shadow-[0_0_0_1px_oklch(1_0_0/0.1)]"
            >
              <div className="grid gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-lg font-semibold" data-lead-name>
                    {lead.erasedAt ? "Details deleted" : lead.name}
                  </span>
                  <Badge variant={STATUS[lead.status].badge}>{STATUS[lead.status].label}</Badge>
                  <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                    {panelTime.format(lead.createdAt)}
                  </span>
                </div>
                {lead.phone ? (
                  <a
                    href={`tel:+91${lead.phone}`}
                    className="inline-flex w-fit items-center gap-1.5 font-medium text-primary tabular-nums hover:underline"
                    data-lead-phone
                  >
                    <Phone className="size-4" strokeWidth={1.75} aria-hidden />
                    {lead.phone.replace(/^(\d{5})(\d{5})$/, "$1 $2")}
                  </a>
                ) : null}
                <p className="text-sm text-pretty text-muted-foreground">
                  {[lead.city, lead.interest, lead.paper].filter(Boolean).join(" · ")}
                  {lead.sourceCalculator ? " · from a calculator" : ""}
                </p>
                <p className="text-xs break-all text-muted-foreground">{lead.sourcePage}</p>
              </div>

              <LeadStatusForm
                ids={{ leadId: lead.id, org: org.id, filter }}
                status={lead.status}
                note={lead.note}
                erased={!!lead.erasedAt}
              />

              <div className="grid gap-2 border-t pt-3 text-sm">
                <details data-consent-record>
                  <summary className="cursor-pointer font-medium">Consent record</summary>
                  <div className="mt-2 grid gap-1 text-muted-foreground">
                    <p className="text-pretty">“{lead.consentText}”</p>
                    <p className="text-xs">
                      Version {lead.consentVersion} · agreed {panelTime.format(lead.consentAt)} ·{" "}
                      {lead.language === "mr" ? "Marathi" : "English"}
                    </p>
                  </div>
                </details>
                {lead.erasedAt ? null : (
                  <details>
                    <summary className="cursor-pointer font-medium text-destructive">
                      Delete their details
                    </summary>
                    <div className="mt-2">
                      <LeadEraseForm ids={{ leadId: lead.id, org: org.id, filter }} />
                    </div>
                  </details>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
