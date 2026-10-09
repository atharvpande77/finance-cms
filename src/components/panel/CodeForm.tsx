"use client";

import { useActionState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormError } from "./FormError";
import { SubmitButton } from "./SubmitButton";

type State = { error?: string };

/** One six-digit code from an authenticator app. */
export function CodeForm({
  action,
  name,
  submitLabel,
}: {
  action: (prev: State, form: FormData) => Promise<State>;
  name: string;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState<State, FormData>(action, {});
  return (
    <form action={formAction} data-form={name} className="grid gap-4">
      <FormError message={state.error} id={`${name}-error`} />
      <div className="grid gap-2">
        <Label htmlFor="code">6-digit code</Label>
        <Input
          id="code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9 ]{6,7}"
          maxLength={7}
          required
          autoFocus
          className="text-center font-mono text-lg tracking-[0.3em] tabular-nums md:text-lg"
          aria-describedby={state.error ? `${name}-error` : undefined}
        />
      </div>
      <SubmitButton className="w-full">{submitLabel}</SubmitButton>
    </form>
  );
}
