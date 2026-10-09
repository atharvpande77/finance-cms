import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CircleCheck, ExternalLink } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArticleBody } from "@/components/reader/ArticleBody";
import { CopyInfo } from "@/components/panel/CopyInfo";
import { CopyDecisions } from "@/components/panel/PublishingForms";
import {
  ARTICLE_TYPE_LABELS,
  COPY_BADGE,
  COPY_DONE_MESSAGES,
  LANGUAGE_NAMES,
  localized,
} from "@/components/panel/articleLabels";
import { requireArea } from "@/server/auth/current";
import { copyForUser } from "@/server/publishing/queue";
import { COPY_STATUS_LABELS, copyStatus } from "@/domain/publishing";

export const metadata: Metadata = { title: "Article for your paper" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * One paper's copy, read-only, with the decision buttons. Newspaper people can't open the
 * writing area, so this is where they read the text before deciding.
 */
export default async function CopyPage({
  params,
  searchParams,
}: {
  params: Promise<{ copyId: string }>;
  searchParams: Promise<{ done?: string }>;
}) {
  const s = await requireArea("publisher");
  const { copyId } = await params;
  const { done } = await searchParams;
  if (!UUID.test(copyId)) notFound();
  const copy = await copyForUser(s, copyId);
  // Another paper's copy looks the same as no copy (as for articles, D25).
  if (!copy) notFound();
  const status = copyStatus(copy);

  return (
    <div className="grid gap-6">
      <div className="grid gap-3">
        <Link
          href={`/publisher?paper=${copy.tenantSlug}`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← {copy.tenantName} queue
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={COPY_BADGE[status]} data-copy-status={status}>
            {COPY_STATUS_LABELS[status]}
          </Badge>
          <Badge variant="outline">{LANGUAGE_NAMES[copy.language] ?? copy.language}</Badge>
          <Badge variant="secondary">{ARTICLE_TYPE_LABELS[copy.articleType]}</Badge>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-balance" data-headline>
          {copy.headline}
        </h1>
        <p className="text-sm text-muted-foreground">
          {copy.organisationName} · {localized(copy.sectionName)}
          {copy.authorName ? ` · by ${copy.authorName}` : ""} · for {copy.tenantName}
        </p>
      </div>

      {done && COPY_DONE_MESSAGES[done] ? (
        <Alert variant="success" data-done={done}>
          <CircleCheck strokeWidth={1.75} />
          <AlertDescription>{COPY_DONE_MESSAGES[done]}</AlertDescription>
        </Alert>
      ) : null}

      {/* Phones show the decision before the text. */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <Card className="gap-4 lg:col-start-2 lg:row-start-1">
          <CardHeader>
            <CardTitle className="text-base">Decision</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <CopyInfo copy={copy} />
            {copy.actions.length ? (
              <CopyDecisions
                copyId={copy.copyId}
                rev={copy.rev}
                actions={copy.actions}
                back="copy"
              />
            ) : status === "waiting" || status === "held" ? (
              <p className="text-sm text-muted-foreground" data-read-only>
                Only {copy.tenantName}&apos;s editors decide on this article.
              </p>
            ) : null}
            {status === "published" ? (
              <a
                href={copy.publicUrl}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
              >
                View on {copy.tenantName}
                <ExternalLink className="size-3.5" strokeWidth={1.75} aria-hidden />
              </a>
            ) : null}
          </CardContent>
        </Card>

        <Card className="lg:col-start-1 lg:row-start-1">
          <CardContent className="grid gap-4">
            {copy.summary ? (
              <p className="text-pretty text-muted-foreground">{copy.summary}</p>
            ) : null}
            <ArticleBody
              body={copy.body}
              articleType={copy.articleType}
              linkHosts={copy.tenantHosts}
              className="article-preview"
              renderCalculator={(calc) => (
                <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
                  {calc.name.en}
                </p>
              )}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
