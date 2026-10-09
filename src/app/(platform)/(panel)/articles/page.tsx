import type { Metadata } from "next";
import Link from "next/link";
import { FileText, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/panel/PageHeader";
import { LANGUAGE_NAMES, STATE_BADGE, localized } from "@/components/panel/articleLabels";
import { requireArea } from "@/server/auth/current";
import { listForUser } from "@/server/articles/queries";
import { canCreate, STATE_LABELS } from "@/domain/workflow";
import { indianDate } from "@/domain/time";

export const metadata: Metadata = { title: "Articles" };

const when = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  timeZone: "Asia/Kolkata",
});

export default async function ArticlesPage() {
  const s = await requireArea("articles");
  const items = await listForUser(s);
  const today = indianDate(new Date());
  return (
    <>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <PageHeader
          className="mb-0"
          title="Articles"
          description="Drafts and articles moving through approval."
        />
        {canCreate(s.memberships) ? (
          <Button asChild>
            <Link href="/articles/new" data-new-article>
              <Plus strokeWidth={2} />
              New article
            </Link>
          </Button>
        ) : null}
      </div>
      {items.length === 0 ? (
        <div className="grid place-items-center gap-2 rounded-xl border border-dashed px-6 py-16 text-center">
          <FileText className="size-5 text-muted-foreground" strokeWidth={1.75} aria-hidden />
          <p className="font-medium">No articles yet</p>
        </div>
      ) : (
        <ul className="divide-y overflow-hidden rounded-xl bg-card shadow-[0_0_0_1px_oklch(0_0_0/0.08)] dark:shadow-[0_0_0_1px_oklch(1_0_0/0.1)]">
          {items.map((item) => (
            <li
              key={item.articleId}
              data-article={item.slug}
              className="grid gap-2 px-4 py-4 sm:px-5"
            >
              {item.versions.map((v) => (
                <div key={v.versionId} className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <Link
                    href={`/articles/${item.articleId}/${v.language}`}
                    className="min-w-0 flex-1 basis-64 font-medium text-pretty hover:underline"
                  >
                    {v.headline || "Untitled"}
                  </Link>
                  <div className="flex items-center gap-1.5">
                    {v.yourTurn ? (
                      <Badge data-your-turn className="bg-primary">
                        Your turn
                      </Badge>
                    ) : null}
                    <Badge variant="outline">{LANGUAGE_NAMES[v.language] ?? v.language}</Badge>
                    <Badge variant={STATE_BADGE[v.state]} data-version-state={v.state}>
                      {STATE_LABELS[v.state]}
                    </Badge>
                  </div>
                </div>
              ))}
              <p className="text-xs text-muted-foreground">
                {item.organisationName} · {localized(item.sectionName)} · updated{" "}
                <span className="tabular-nums">{when.format(item.updatedAt)}</span>
                {/* Review dates (04.3) are only flagged in phase 1, never acted on. */}
                {item.reviewBy < today ? (
                  <Badge variant="warning" className="ml-2 align-middle" data-overdue>
                    Overdue review
                  </Badge>
                ) : null}
              </p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
