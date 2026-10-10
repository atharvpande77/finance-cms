"use client";

import { useActionState } from "react";
import { FormError } from "@/components/panel/FormError";
import { SubmitButton } from "@/components/panel/SubmitButton";
import { NewPasswordFields } from "@/components/auth/NewPasswordFields";
import { resetPasswordAction, type LinkFormState } from "../../../_actions/links";

export function ResetForm({ token }: { token: string }) {
  const [state, action] = useActionState<LinkFormState, FormData>(resetPasswordAction, {});
  return (
    <form action={action} data-form="reset" className="grid gap-5">
      <input type="hidden" name="token" value={token} />
      <FormError message={state.error} id="reset-error" />
      <NewPasswordFields problems={state.problems} />
      <SubmitButton className="w-full">Set new password</SubmitButton>
    </form>
  );
}
