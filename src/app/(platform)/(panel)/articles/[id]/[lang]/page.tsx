import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CircleCheck, Lock } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArticleBody } from "@/components/reader/ArticleBody";
import { ArticleEditor } from "@/components/panel/ArticleEditor";
import { AddLanguageForm, ReturnForm, StepForm } from "@/components/panel/WorkflowActions";
import { ReleaseForm, type ReleasePaper } from "@/components/panel/PublishingForms";
import {
  COPY_BADGE,
  DONE_MESSAGES,
  LANGUAGE_NAMES,
  STATE_BADGE,
  localized,
  panelTime,
} from "@/components/panel/articleLabels";
import { requireArea } from "@/server/auth/current";
import { getForUser } from "@/server/articles/queries";
import { releasePreview, type ReleasePreview } from "@/server/publishing/release";
import { copiesFor } from "@/server/publishing/queue";
import { isBeforeRelease, STATE_LABELS, type VersionState } from "@/domain/workflow";
import { COPY_STATUS_LABELS, EXPLICIT_REASON_LABELS, copyStatus } from "@/domain/publishing";
import { saveArticleAction } from "@/app/(platform)/_actions/articles";

export const metadata: Metadata = { title: "Article" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const ACTION_TEXT: Record<string, string> = {
  create: "created the draft",
  add_language: "started this language version",
  submit: "submitted it",
  approve: "approved it",
  return: "returned it",
  release: "sent it to the newspapers",
  hold: "held it",
  take_down: "took it down",
  deemed_approve: "published it",
};

/** What happens next, in words, when it isn't this person's step. */
const WAITING: Partial<Record<VersionState, string>> = {
  draft: "With the writer.",
  in_approval: "Waiting for the institution's approver.",
  compliance_review: "Waiting for the institution's compliance officer.",
  editing: "With abcfinance's editors.",
  with_publisher: "With the newspapers. Each paper's editor decides on their own copy.",
};

/** Each paper on the release form, with what will happen there (04.3). */
function releasePapers(preview: ReleasePreview): ReleasePaper[] {
  return preview.papers.map((p) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    ticked: p.targeted && p.plan.action === "create",
    unavailable: p.plan.action === "create" ? null : `${p.plan.reason}.`,
    rule: p.reasons.length
      ? {
          kind: "explicit",
          text: "Waits for the editor's explicit approval:",
          reasons: p.reasons.map((r) => EXPLICIT_REASON_LABELS[r]),
        }
      : {
          kind: "deemed",
          text: `Publishes automatically ${p.autoApproveHours} hours after release unless the editor holds it.`,
          reasons: [],
        },
  }));
}

export default async function ArticlePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; lang: string }>;
  searchParams: Promise<{ done?: string }>;
}) {
  const s = await requireArea("articles");
  const { id, lang } = await params;
  const { done } = await searchParams;
  if (!UUID.test(id)) notFound();
  const data = await getForUser(s, id, lang);
  // Not visible and not existing look the same (D25).
  if (!data) notFound();
  const { article, version, masters, targets, history, actions } = data;
  const [preview, allCopies] = await Promise.all([
    releasePreview(s, version.id),
    copiesFor(article.id),
  ]);
  const copies = allCopies.filter((c) => c.language === lang);
  const morePapers =
    preview && version.state === "with_publisher"
      ? preview.papers.some((p) => p.plan.action === "create")
      : false;
  const ids = { articleId: article.id, versionId: version.id, rev: version.rev, language: lang };
  const canSave = actions.includes("save");
  const yourTurn = actions.some((a) => a !== "save") || (canSave && version.state === "draft");
  const institution = article.type === "institution";
  const missingLanguages = (["en", "mr"] as const).filter(
    (l) => !masters.some((m) => m.language === l),
  );

  return (
    <div className="grid gap-6">
      <div className="grid gap-3">
        <Link href="/articles" className="text-sm text-muted-foreground hover:text-foreground">
          ← Articles
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={STATE_BADGE[version.state]} data-version-state={version.state}>
            {STATE_LABELS[version.state]}
          </Badge>
          <Badge variant="outline">{LANGUAGE_NAMES[lang] ?? lang}</Badge>
          {yourTurn ? <Badge data-your-turn>Your turn</Badge> : null}
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-balance" data-headline>
          {version.headline || "Untitled"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {article.organisationName} · {localized(article.sectionName)}
          {article.authorName ? ` · by ${article.authorName}` : ""} ·{" "}
          {article.type === "independent"
            ? "Independent expert"
            : institution
              ? "Institution article"
              : "abcfinance article"}
        </p>
        {masters.length > 1 ? (
          <nav aria-label="Languages" className="flex gap-1.5">
            {masters.map((m) => (
              <Link
                key={m.id}
                href={`/articles/${article.id}/${m.language}`}
                aria-current={m.language === lang ? "page" : undefined}
                className="rounded-md px-2.5 py-1 text-sm text-muted-foreground transition-colors hover:bg-accent aria-[current=page]:bg-accent aria-[current=page]:font-medium aria-[current=page]:text-foreground"
              >
                {LANGUAGE_NAMES[m.language] ?? m.language} · {STATE_LABELS[m.state]}
              </Link>
            ))}
          </nav>
        ) : null}
      </div>

      {done && DONE_MESSAGES[done] ? (
        <Alert variant="success" data-done={done}>
          <CircleCheck strokeWidth={1.75} />
          <AlertDescription>{DONE_MESSAGES[done]}</AlertDescription>
        </Alert>
      ) : null}

      {/* Phones show the next step before the text, so a decision is one tap away. */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:grid-rows-[auto_1fr]">
        <Card className="gap-4 lg:col-start-2 lg:row-start-1">
          <CardHeader>
            <CardTitle className="text-base">Next step</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4" data-actions>
            {actions.includes("submit") ? (
              <StepForm
                ids={ids}
                action="submit"
                label={institution ? "Submit for approval" : "Submit to the editors"}
                hint="Save your changes first: the saved version is what gets submitted."
              />
            ) : null}
            {actions.includes("approve") ? (
              <StepForm
                ids={ids}
                action="approve"
                label={
                  version.state === "compliance_review"
                    ? "Approve this language version"
                    : "Approve"
                }
              />
            ) : null}
            {actions.includes("release") && preview ? (
              <ReleaseForm
                ids={ids}
                papers={releasePapers(preview)}
                label="Send to selected papers"
              />
            ) : null}
            {actions.includes("return") ? (
              <ReturnForm
                ids={ids}
                label={version.state === "editing" ? "Return to the writer" : "Return to writer"}
              />
            ) : null}
            {actions.filter((a) => a !== "save").length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {WAITING[version.state] ?? "Nothing to do."}
              </p>
            ) : null}
            {morePapers && preview ? (
              <details className="group rounded-lg border p-3" data-send-more>
                <summary className="cursor-pointer text-sm font-medium">
                  Send to more papers
                </summary>
                <div className="mt-3">
                  <ReleaseForm
                    ids={ids}
                    papers={releasePapers(preview)}
                    label="Send to more papers"
                  />
                </div>
              </details>
            ) : null}
          </CardContent>
        </Card>

        <div className="min-w-0 lg:col-start-1 lg:row-span-2 lg:row-start-1">
          {canSave ? (
            <ArticleEditor
              key={`${version.id}:${version.rev}`}
              action={saveArticleAction}
              formName="save"
              hidden={{
                articleId: article.id,
                versionId: version.id,
                rev: String(version.rev),
                language: lang,
              }}
              initial={{
                headline: version.headline,
                summary: version.summary,
                body: version.body,
                slug: article.slug,
              }}
              slugEditable={isBeforeRelease(masters.map((m) => m.state))}
              articleType={article.type}
              submitLabel="Save"
            />
          ) : (
            <Card>
              <CardContent className="grid gap-4">
                <p className="flex items-center gap-2 text-sm text-muted-foreground" data-locked>
                  <Lock className="size-4" strokeWidth={1.75} aria-hidden />
                  Read only. You can&apos;t change the text at this stage.
                </p>
                {version.summary ? (
                  <p className="text-pretty text-muted-foreground">{version.summary}</p>
                ) : null}
                <ArticleBody
                  body={version.body}
                  articleType={article.type}
                  linkHosts={[]}
                  className="article-preview"
                  renderCalculator={(calc) => (
                    <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
                      {calc.name.en}
                    </p>
                  )}
                />
              </CardContent>
            </Card>
          )}
        </div>

        <aside className="grid content-start gap-6 lg:col-start-2 lg:row-start-2">
          <Card className="gap-4">
            <CardHeader>
              <CardTitle className="text-base">Newspapers</CardTitle>
            </CardHeader>
            <CardContent>
              {copies.length ? (
                <ul className="grid gap-3 text-sm" data-copies>
                  {copies.map((c) => {
                    const status = copyStatus(c);
                    return (
                      <li
                        key={c.copyId}
                        className="grid gap-0.5"
                        data-copy={c.tenantSlug}
                        data-copy-status={status}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">{c.tenantName}</span>
                          <Badge variant={COPY_BADGE[status]}>{COPY_STATUS_LABELS[status]}</Badge>
                        </div>
                        <p className="text-xs text-pretty text-muted-foreground">
                          {status === "waiting"
                            ? c.requiresExplicit
                              ? `Needs the editor's approval: ${c.explicitReasons.map((r) => EXPLICIT_REASON_LABELS[r].toLowerCase()).join("; ")}`
                              : `Publishes automatically on ${panelTime.format(c.autoApproveAt!)}`
                            : status === "published"
                              ? `${c.approvalType === "deemed" ? "Published automatically" : "Approved by the editor"} on ${panelTime.format(c.publishedAt!)}`
                              : status === "held"
                                ? "Held by the editor"
                                : "Taken down by the editor"}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <ul className="grid gap-1 text-sm">
                  {targets.map((t) => (
                    <li key={t.id}>{localized(t.name)}</li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {data.canAddLanguage && missingLanguages.length ? (
            <Card className="gap-4">
              <CardContent>
                <AddLanguageForm
                  articleId={article.id}
                  from={lang}
                  options={missingLanguages.map((l) => ({ value: l, label: LANGUAGE_NAMES[l]! }))}
                />
              </CardContent>
            </Card>
          ) : null}

          <Card className="gap-4">
            <CardHeader>
              <CardTitle className="text-base">History</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="grid gap-3" data-history>
                {history.map((e) => (
                  <li key={e.id} className="grid gap-0.5 text-sm">
                    <p>
                      <span className="font-medium">{e.userName ?? e.actorLabel ?? "System"}</span>{" "}
                      {ACTION_TEXT[e.action] ?? e.action}
                      {e.tenantName ? ` on ${localized(e.tenantName)}` : ""}
                      {masters.length > 1 ? ` (${LANGUAGE_NAMES[e.language] ?? e.language})` : ""}
                    </p>
                    {e.comment ? (
                      <p className="rounded-md bg-muted px-2.5 py-1.5 text-pretty">“{e.comment}”</p>
                    ) : null}
                    <time
                      dateTime={e.createdAt.toISOString()}
                      className="text-xs text-muted-foreground tabular-nums"
                    >
                      {panelTime.format(e.createdAt)}
                    </time>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
