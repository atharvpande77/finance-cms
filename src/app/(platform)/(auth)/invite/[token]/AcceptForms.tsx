"use client";

import { useActionState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormError } from "@/components/panel/FormError";
import { SubmitButton } from "@/components/panel/SubmitButton";
import { NewPasswordFields } from "@/components/auth/NewPasswordFields";
import {
  acceptInvitationAction,
  acceptWithPasswordAction,
  type LinkFormState,
} from "../../../_actions/links";

/** A new person: their name and a password. */
export function AcceptNewForm({ token, nameHint }: { token: string; nameHint: string }) {
  const [state, action] = useActionState<LinkFormState, FormData>(acceptInvitationAction, {});
  return (
    <form action={action} data-form="accept" className="grid gap-5">
      <input type="hidden" name="token" value={token} />
      <FormError message={state.error} id="accept-error" />
      <div className="grid gap-2">
        <Label htmlFor="name">Your name</Label>
        <Input
          id="name"
          name="name"
          autoComplete="name"
          required
          minLength={2}
          maxLength={80}
          defaultValue={nameHint}
        />
      </div>
      <NewPasswordFields problems={state.problems} />
      <SubmitButton className="w-full">Create my account</SubmitButton>
    </form>
  );
}

/** Someone with an account: their current password adds the roles. */
export function AcceptExistingForm({ token }: { token: string }) {
  const [state, action] = useActionState<LinkFormState, FormData>(acceptWithPasswordAction, {});
  return (
    <form action={action} data-form="accept-existing" className="grid gap-5">
      <input type="hidden" name="token" value={token} />
      <FormError message={state.error} id="accept-error" />
      <div className="grid gap-2">
        <Label htmlFor="password">Your current password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          maxLength={200}
        />
      </div>
      <SubmitButton className="w-full">Add these roles</SubmitButton>
    </form>
  );
}
