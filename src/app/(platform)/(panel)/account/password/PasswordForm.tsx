"use client";

import { useActionState } from "react";
import { CircleCheck } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormError } from "@/components/panel/FormError";
import { SubmitButton } from "@/components/panel/SubmitButton";
import { NewPasswordFields } from "@/components/auth/NewPasswordFields";
import { changePasswordAction, type PasswordFormState } from "../../../_actions/account";

export function PasswordForm() {
  const [state, action] = useActionState<PasswordFormState, FormData>(changePasswordAction, {});
  return (
    <form action={action} data-form="password" className="grid gap-5">
      {state.done ? (
        <Alert variant="success" data-success>
          <CircleCheck strokeWidth={1.75} />
          <AlertDescription>
            Password changed. You&apos;ve been signed out everywhere else, and we&apos;ve emailed
            you a notice.
          </AlertDescription>
        </Alert>
      ) : null}
      <FormError message={state.error} id="password-error" />
      <div className="grid gap-2">
        <Label htmlFor="currentPassword">Current password</Label>
        <Input
          id="currentPassword"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>
      <NewPasswordFields problems={state.problems} />
      <SubmitButton className="justify-self-start">Change password</SubmitButton>
    </form>
  );
}
