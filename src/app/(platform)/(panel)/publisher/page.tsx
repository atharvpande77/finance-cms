import type { Metadata } from "next";
import Link from "next/link";
import { CircleCheck, Eye, Inbox } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/panel/PageHeader";
import { CopyInfo } from "@/components/panel/CopyInfo";
import { CopyDecisions, RunDueForm } from "@/components/panel/PublishingForms";
import {
  ARTICLE_TYPE_LABELS,
  COPY_BADGE,
  COPY_DONE_MESSAGES,
  LANGUAGE_NAMES,
  localized,
  panelTime,
} from "@/components/panel/articleLabels";
import { requireArea } from "@/server/auth/current";
import { queueFor, type QueueCopy } from "@/server/publishing/queue";
import { can } from "@/domain/permissions";
import { COPY_STATUS_LABELS, copyStatus } from "@/domain/publishing";

export const metadata: Metadata = { title: "Publisher queue" };

function doneMessage(done: string | undefined, count: string | undefined) {
  if (done === "run_due") {
    const n = Number(count) || 0;
    return n === 0
      ? "Nothing was past its window."
      : `Published ${n} ${n === 1 ? "article" : "articles"} past ${n === 1 ? "its" : "their"} window.`;
  }
  return done ? COPY_DONE_MESSAGES[done] : undefined;
}

function Meta({ copy }: { copy: QueueCopy }) {
  return (
    <p className="text-xs text-pretty text-muted-foreground">
      {copy.organisationName} · {localized(copy.sectionName)}
      {/* abcfinance's own articles would repeat the organisation name. */}
      {copy.articleType === "abcfinance" ? "" : ` · ${ARTICLE_TYPE_LABELS[copy.articleType]}`}
    </p>
  );
}

function WaitingCard({ copy }: { copy: QueueCopy }) {
  const status = copyStatus(copy);
  return (
    <li
      className="grid gap-3 rounded-xl bg-card p-4 shadow-[0_0_0_1px_oklch(0_0_0/0.08)] sm:p-5 dark:shadow-[0_0_0_1px_oklch(1_0_0/0.1)]"
      data-queue-copy={copy.copyId}
      data-copy-status={status}
      data-explicit={copy.requiresExplicit}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant={COPY_BADGE[status]}>{COPY_STATUS_LABELS[status]}</Badge>
        <Badge variant="outline">{LANGUAGE_NAMES[copy.language] ?? copy.language}</Badge>
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
          Sent {panelTime.format(copy.releasedAt)}
        </span>
      </div>
      <div className="grid gap-1">
        <h2 className="font-semibold text-pretty">
          <Link href={`/publisher/${copy.copyId}`} className="hover:underline">
            {copy.headline}
          </Link>
        </h2>
        <Meta copy={copy} />
      </div>
      <CopyInfo copy={copy} />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Link
          href={`/publisher/${copy.copyId}`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          <Eye className="size-4" strokeWidth={1.75} aria-hidden />
          Read it
        </Link>
      </div>
      {copy.actions.length ? (
        <CopyDecisions copyId={copy.copyId} rev={copy.rev} actions={copy.actions} back="queue" />
      ) : null}
    </li>
  );
}

export default async function PublisherPage({
  searchParams,
}: {
  searchParams: Promise<{ paper?: string; done?: string; count?: string }>;
}) {
  const s = await requireArea("publisher");
  const { paper: paperSlug, done, count } = await searchParams;
  const queue = await queueFor(s, paperSlug);
  if (!queue) {
    return (
      <PageHeader title="Publisher queue" description="You have no newspapers to look after." />
    );
  }
  const { papers, paper, waiting, live } = queue;
  const decides = can(s.memberships, "copy.decide", paper.publisherOrgId);
  const staff = can(s.memberships, "copy.oversee");
  const message = doneMessage(done, count);

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeader
          className="mb-0"
          title="Publisher queue"
          description={
            decides
              ? `Articles waiting for ${paper.name}. Approve, hold or take them down.`
              : `What's waiting for ${paper.name}. Only the paper's editors decide.`
          }
        />
        {queue.canRunDue ? (
          <RunDueForm
            paper={paper.slug}
            label={
              staff
                ? "Publish anything past its window now (all papers)"
                : "Publish anything past its window now"
            }
          />
        ) : null}
      </div>

      {papers.length > 1 ? (
        <nav
          aria-label="Newspapers"
          className="-mx-1 flex gap-1 overflow-x-auto px-1"
          data-paper-switcher
        >
          {papers.map((p) => (
            <Link
              key={p.id}
              href={`/publisher?paper=${p.slug}`}
              aria-current={p.id === paper.id ? "page" : undefined}
              className="shrink-0 rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors duration-150 hover:bg-accent aria-[current=page]:bg-accent aria-[current=page]:font-medium aria-[current=page]:text-foreground"
            >
              {p.name}
            </Link>
          ))}
        </nav>
      ) : null}

      {message ? (
        <Alert variant="success" data-done={done}>
          <CircleCheck strokeWidth={1.75} />
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      ) : null}

      {!decides ? (
        <p
          className="flex items-center gap-2 rounded-lg bg-muted/60 px-4 py-3 text-sm text-muted-foreground"
          data-read-only
        >
          <Eye className="size-4 shrink-0" strokeWidth={1.75} aria-hidden />
          You can see this queue, but only {paper.name}&apos;s editors approve, hold or take down.
        </p>
      ) : null}

      <section className="grid gap-3" aria-labelledby="waiting-heading">
        <h2 id="waiting-heading" className="flex items-baseline gap-2 font-semibold">
          Waiting for a decision
          <span className="text-sm font-normal text-muted-foreground tabular-nums">
            {waiting.length}
          </span>
        </h2>
        {waiting.length === 0 ? (
          <div className="flex items-center gap-3 rounded-lg bg-muted/60 px-4 py-5 text-sm text-muted-foreground">
            <Inbox className="size-4 shrink-0" strokeWidth={1.75} aria-hidden />
            Nothing is waiting for {paper.name}.
          </div>
        ) : (
          <ul className="grid gap-3" data-waiting-list>
            {waiting.map((c) => (
              <WaitingCard key={c.copyId} copy={c} />
            ))}
          </ul>
        )}
      </section>

      <section className="grid gap-3" aria-labelledby="live-heading">
        <h2 id="live-heading" className="font-semibold">
          Live on {paper.name}
        </h2>
        {live.length === 0 ? (
          <p className="text-sm text-muted-foreground">No articles are live yet.</p>
        ) : (
          <ul
            className="divide-y overflow-hidden rounded-xl bg-card shadow-[0_0_0_1px_oklch(0_0_0/0.08)] dark:shadow-[0_0_0_1px_oklch(1_0_0/0.1)]"
            data-live-list
          >
            {live.map((c) => (
              <li key={c.copyId} className="grid gap-1 px-4 py-3 sm:px-5" data-live-copy={c.copyId}>
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <Link
                    href={`/publisher/${c.copyId}`}
                    className="min-w-0 flex-1 basis-56 font-medium text-pretty hover:underline"
                  >
                    {c.headline}
                  </Link>
                  <Badge variant="outline">{LANGUAGE_NAMES[c.language] ?? c.language}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {c.approvalType === "deemed"
                    ? "Published automatically"
                    : "Approved by the editor"}{" "}
                  on <span className="tabular-nums">{panelTime.format(c.publishedAt!)}</span> ·{" "}
                  {c.organisationName}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
