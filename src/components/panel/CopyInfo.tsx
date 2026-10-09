import { Clock, MessageSquareQuote, CirclePause, ShieldAlert } from "lucide-react";
import { EXPLICIT_REASON_LABELS, copyStatus, type ExplicitReason } from "@/domain/publishing";
import type { VersionState } from "@/domain/workflow";
import { panelTime } from "./articleLabels";

/**
 * What a paper's editor needs to decide on a copy: whether it waits for them or publishes
 * itself (and when), why it was held, and the note abcfinance sent with it.
 */
export function CopyInfo({
  copy,
}: {
  copy: {
    state: VersionState;
    heldAt: Date | null;
    requiresExplicit: boolean;
    explicitReasons: ExplicitReason[];
    autoApproveAt: Date | null;
    approvalType: "explicit" | "deemed" | null;
    publishedAt: Date | null;
    holdReason: string | null;
    releaseNote: string | null;
  };
}) {
  const status = copyStatus(copy);
  return (
    <div className="grid gap-2 text-sm">
      {status === "waiting" && copy.requiresExplicit ? (
        <div
          className="grid gap-1 rounded-lg bg-warning/10 px-3 py-2.5 text-pretty"
          data-explicit-reasons
        >
          <p className="flex items-center gap-2 font-medium">
            <ShieldAlert className="size-4 shrink-0" strokeWidth={1.75} aria-hidden />
            Needs an explicit approval
          </p>
          <ul className="grid list-disc gap-0.5 pl-10 text-muted-foreground">
            {copy.explicitReasons.map((r) => (
              <li key={r}>{EXPLICIT_REASON_LABELS[r]}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {status === "waiting" && !copy.requiresExplicit && copy.autoApproveAt ? (
        <p className="flex items-center gap-2 text-muted-foreground" data-deadline>
          <Clock className="size-4 shrink-0" strokeWidth={1.75} aria-hidden />
          <span>
            Publishes automatically on{" "}
            <time
              dateTime={copy.autoApproveAt.toISOString()}
              className="font-medium text-foreground tabular-nums"
            >
              {panelTime.format(copy.autoApproveAt)}
            </time>{" "}
            unless it&apos;s held.
          </span>
        </p>
      ) : null}
      {status === "held" ? (
        <div className="grid gap-1 rounded-lg bg-warning/10 px-3 py-2.5" data-held>
          <p className="flex items-center gap-2 font-medium">
            <CirclePause className="size-4 shrink-0" strokeWidth={1.75} aria-hidden />
            Held on <span className="tabular-nums">{panelTime.format(copy.heldAt!)}</span>
          </p>
          {copy.holdReason ? (
            <p className="pl-6 text-pretty text-muted-foreground">“{copy.holdReason}”</p>
          ) : null}
          <p className="pl-6 text-xs text-muted-foreground">
            It stays off the site until the editor approves it or takes it down.
          </p>
        </div>
      ) : null}
      {status === "published" && copy.publishedAt ? (
        <p className="text-muted-foreground" data-approval={copy.approvalType}>
          {copy.approvalType === "deemed" ? "Published automatically" : "Approved by the editor"} on{" "}
          <span className="tabular-nums">{panelTime.format(copy.publishedAt)}</span>
        </p>
      ) : null}
      {copy.releaseNote ? (
        <figure
          className="grid gap-0.5 border-l-2 border-primary/30 pl-3 text-pretty"
          data-release-note
        >
          <figcaption className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <MessageSquareQuote className="size-3.5" strokeWidth={1.75} aria-hidden />
            Note from abcfinance
          </figcaption>
          <blockquote>{copy.releaseNote}</blockquote>
        </figure>
      ) : null}
    </div>
  );
}
