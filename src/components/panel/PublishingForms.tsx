"use client";

import { useActionState } from "react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/components/ui/utils";
import {
  decideCopyAction,
  releaseAction,
  runDueAction,
  type PublishingFormState,
} from "@/app/(platform)/_actions/publishing";
import type { CopyAction } from "@/domain/publishing";
import { FormError } from "./FormError";
import { SubmitButton } from "./SubmitButton";

export type ReleasePaper = {
  id: string;
  slug: string;
  name: string;
  /** Ticked when the form opens (the author's targets that can still get a copy). */
  ticked: boolean;
  /** Why it can't be chosen (it doesn't publish the language, or already has it). */
  unavailable: string | null;
  rule: { kind: "explicit" | "deemed"; text: string; reasons: string[] } | null;
};

/** Release (04.3): one checkbox per paper, each with what will happen there. */
export function ReleaseForm({
  ids,
  papers,
  label,
}: {
  ids: { articleId: string; versionId: string; rev: number; language: string };
  papers: ReleasePaper[];
  label: string;
}) {
  const [state, formAction] = useActionState<PublishingFormState, FormData>(releaseAction, {});
  const kept = state.values?.tenantIds?.split(",");
  return (
    <form action={formAction} data-form="release" className="grid gap-3">
      <input type="hidden" name="articleId" value={ids.articleId} />
      <input type="hidden" name="versionId" value={ids.versionId} />
      <input type="hidden" name="rev" value={ids.rev} />
      <input type="hidden" name="language" value={ids.language} />
      <FormError message={state.error} />
      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-medium">Newspapers</legend>
        {papers.map((p) => (
          <label
            key={p.id}
            data-paper={p.slug}
            data-paper-rule={p.unavailable ? "unavailable" : p.rule?.kind}
            className={cn(
              "grid cursor-pointer grid-cols-[auto_1fr] gap-x-2.5 gap-y-1 rounded-lg border p-3 text-sm transition-colors duration-150 has-checked:border-primary/40 has-checked:bg-primary/[0.03]",
              p.unavailable && "cursor-not-allowed opacity-60",
            )}
          >
            <input
              type="checkbox"
              name="tenantIds"
              value={p.id}
              defaultChecked={kept ? kept.includes(p.id) : p.ticked}
              disabled={p.unavailable !== null}
              className="mt-0.5 size-4 accent-primary"
            />
            <span className="font-medium">{p.name}</span>
            <span className="col-start-2 text-xs text-pretty text-muted-foreground">
              {p.unavailable ?? p.rule?.text}
            </span>
            {!p.unavailable && p.rule?.reasons.length ? (
              <ul className="col-start-2 grid list-disc gap-0.5 pl-4 text-xs text-pretty text-muted-foreground">
                {p.rule.reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            ) : null}
          </label>
        ))}
      </fieldset>
      <div className="grid gap-2">
        <Label htmlFor="release-note">Note for the editors (optional)</Label>
        <Textarea
          id="release-note"
          name="note"
          rows={2}
          maxLength={1000}
          defaultValue={state.values?.note}
          placeholder="Timing, context, anything they should know"
        />
      </div>
      <SubmitButton className="w-full">{label}</SubmitButton>
      <p className="text-xs text-pretty text-muted-foreground">
        The saved text is sent. After release it can&apos;t be changed.
      </p>
    </form>
  );
}

const DECISION_FORM: Record<CopyAction, string> = {
  approve: "approve-copy",
  hold: "hold-copy",
  take_down: "take-down-copy",
};

function DecisionForm({
  copyId,
  rev,
  action,
  back,
  children,
}: {
  copyId: string;
  rev: number;
  action: CopyAction;
  back: "queue" | "copy";
  children: (state: PublishingFormState) => React.ReactNode;
}) {
  const [state, formAction] = useActionState<PublishingFormState, FormData>(decideCopyAction, {});
  return (
    <form action={formAction} data-form={DECISION_FORM[action]} className="grid gap-2">
      <input type="hidden" name="copyId" value={copyId} />
      <input type="hidden" name="rev" value={rev} />
      <input type="hidden" name="action" value={action} />
      <input type="hidden" name="back" value={back} />
      <FormError message={state.error} />
      {children(state)}
    </form>
  );
}

/** A reason field, for hold and take-down. */
function Reason({
  id,
  label,
  placeholder,
  value,
}: {
  id: string;
  label: string;
  placeholder: string;
  value?: string;
}) {
  return (
    <>
      <Label htmlFor={id}>{label}</Label>
      <Textarea
        id={id}
        name="reason"
        rows={2}
        required
        maxLength={1000}
        defaultValue={value}
        placeholder={placeholder}
      />
    </>
  );
}

/**
 * The paper editor's buttons: approve at once; hold and take down behind a reason. Hold and take
 * down fold away so that a phone shows the decision first.
 */
export function CopyDecisions({
  copyId,
  rev,
  actions,
  back,
}: {
  copyId: string;
  rev: number;
  actions: CopyAction[];
  back: "queue" | "copy";
}) {
  const common = { copyId, rev, back };
  return (
    <div className="grid gap-2" data-decisions>
      {actions.includes("approve") ? (
        <DecisionForm {...common} action="approve">
          {() => <SubmitButton className="w-full">Approve and publish now</SubmitButton>}
        </DecisionForm>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        {actions.includes("hold") ? (
          <details className="group rounded-lg border open:col-span-full open:p-3">
            <summary className="flex h-10 cursor-pointer list-none items-center justify-center rounded-lg text-sm font-medium transition-colors duration-150 group-open:mb-2 group-open:h-auto group-open:justify-start hover:bg-accent group-open:hover:bg-transparent [&::-webkit-details-marker]:hidden">
              Hold
            </summary>
            <DecisionForm {...common} action="hold">
              {(state) => (
                <>
                  <Reason
                    id={`hold-${copyId}`}
                    label="Why are you holding it?"
                    placeholder="The writer and abcfinance see this"
                    value={state.values?.reason}
                  />
                  <SubmitButton variant="outline" className="w-full">
                    Hold it
                  </SubmitButton>
                </>
              )}
            </DecisionForm>
          </details>
        ) : null}
        {actions.includes("take_down") ? (
          <details className="group rounded-lg border open:col-span-full open:p-3">
            <summary className="flex h-10 cursor-pointer list-none items-center justify-center rounded-lg text-sm font-medium text-destructive transition-colors duration-150 group-open:mb-2 group-open:h-auto group-open:justify-start hover:bg-destructive/5 group-open:hover:bg-transparent [&::-webkit-details-marker]:hidden">
              Take down
            </summary>
            <DecisionForm {...common} action="take_down">
              {(state) => (
                <>
                  <Reason
                    id={`take-down-${copyId}`}
                    label="Why are you taking it down?"
                    placeholder="It leaves your site at once"
                    value={state.values?.reason}
                  />
                  <SubmitButton variant="destructive" className="w-full">
                    Take it down
                  </SubmitButton>
                </>
              )}
            </DecisionForm>
          </details>
        ) : null}
      </div>
    </div>
  );
}

export function RunDueForm({ paper, label }: { paper: string; label: string }) {
  const [state, formAction] = useActionState<PublishingFormState, FormData>(runDueAction, {});
  return (
    <form action={formAction} data-form="run-due" className="grid gap-2">
      <input type="hidden" name="paper" value={paper} />
      <FormError message={state.error} />
      <SubmitButton variant="outline" size="sm">
        {label}
      </SubmitButton>
    </form>
  );
}
