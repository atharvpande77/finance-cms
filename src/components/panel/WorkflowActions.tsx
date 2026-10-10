"use client";

import { useActionState } from "react";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import {
  addLanguageAction,
  transitionAction,
  type ArticleFormState,
} from "@/app/(platform)/_actions/articles";
import { FormError } from "./FormError";
import { SubmitButton } from "./SubmitButton";

type Ids = { articleId: string; versionId: string; rev: number; language: string };

function Hidden({ ids, action }: { ids: Ids; action: string }) {
  return (
    <>
      <input type="hidden" name="articleId" value={ids.articleId} />
      <input type="hidden" name="versionId" value={ids.versionId} />
      <input type="hidden" name="rev" value={ids.rev} />
      <input type="hidden" name="language" value={ids.language} />
      <input type="hidden" name="action" value={action} />
    </>
  );
}

/** One workflow step as a button (submit, approve), with any refusal shown above it. */
export function StepForm({
  ids,
  action,
  label,
  hint,
  variant = "default",
}: {
  ids: Ids;
  action: "submit" | "approve";
  label: string;
  hint?: string;
  variant?: "default" | "outline";
}) {
  const [state, formAction] = useActionState<ArticleFormState, FormData>(transitionAction, {});
  return (
    <form action={formAction} data-form={action} className="grid gap-2">
      <Hidden ids={ids} action={action} />
      <FormError message={state.error} />
      <SubmitButton variant={variant} className="w-full">
        {label}
      </SubmitButton>
      {hint ? <p className="text-xs text-pretty text-muted-foreground">{hint}</p> : null}
    </form>
  );
}

/**
 * The institution approver's step: approve, choosing the newspapers from the institution's plan
 * (D46). abcfinance's editor later sends it to all or some of these.
 */
export function ApproveWithPapersForm({
  ids,
  papers,
  chosen,
}: {
  ids: Ids;
  papers: { id: string; name: string }[];
  chosen: string[];
}) {
  const [state, formAction] = useActionState<ArticleFormState, FormData>(transitionAction, {});
  // First approval: every plan paper ticked; after a return, what was chosen before.
  const ticked = chosen.length ? chosen : papers.map((p) => p.id);
  return (
    <form action={formAction} data-form="approve" className="grid gap-3">
      <Hidden ids={ids} action="approve" />
      <FormError message={state.error} />
      <fieldset className="grid gap-2" data-choose-papers>
        <legend className="mb-1 text-sm font-medium">Newspapers to publish in</legend>
        {papers.map((p) => (
          <label key={p.id} className="flex min-h-9 items-center gap-2.5 text-sm">
            <input
              type="checkbox"
              name="tenantIds"
              value={p.id}
              defaultChecked={ticked.includes(p.id)}
              className="size-4 accent-primary"
            />
            {p.name}
          </label>
        ))}
        <p className="text-xs text-pretty text-muted-foreground">
          The papers on your plan. abcfinance&apos;s editor sends it to all or some of these.
        </p>
      </fieldset>
      <SubmitButton className="w-full">Approve</SubmitButton>
    </form>
  );
}

/** Returning always needs a comment (04.2). */
export function ReturnForm({ ids, label }: { ids: Ids; label: string }) {
  const [state, formAction] = useActionState<ArticleFormState, FormData>(transitionAction, {});
  return (
    <form action={formAction} data-form="return" className="grid gap-2">
      <Hidden ids={ids} action="return" />
      <FormError message={state.error} />
      <Label htmlFor="comment">Comment for the writer</Label>
      <Textarea
        id="comment"
        name="comment"
        rows={3}
        required
        defaultValue={state.values?.comment}
        placeholder="What needs to change?"
      />
      <SubmitButton variant="outline" className="w-full">
        {label}
      </SubmitButton>
    </form>
  );
}

export function AddLanguageForm({
  articleId,
  from,
  options,
}: {
  articleId: string;
  from: string;
  options: { value: string; label: string }[];
}) {
  const [state, formAction] = useActionState<ArticleFormState, FormData>(addLanguageAction, {});
  return (
    <form action={formAction} data-form="add-language" className="grid gap-2">
      <input type="hidden" name="articleId" value={articleId} />
      <input type="hidden" name="from" value={from} />
      <FormError message={state.error} />
      <Label htmlFor="to">Add a language version</Label>
      <div className="flex gap-2">
        <div className="flex-1">
          <NativeSelect id="to" name="to">
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </NativeSelect>
        </div>
        <SubmitButton variant="outline">Add</SubmitButton>
      </div>
      <p className="text-xs text-pretty text-muted-foreground">
        Starts as a copy of this version for you to rewrite. It goes through its own approvals.
      </p>
    </form>
  );
}
