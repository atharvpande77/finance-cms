"use client";

import { useActionState } from "react";
import { CircleCheck } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormError } from "@/components/panel/FormError";
import { SubmitButton } from "@/components/panel/SubmitButton";
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
      <div className="grid gap-2">
        <Label htmlFor="newPassword">New password</Label>
        <Input
          id="newPassword"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          required
          minLength={10}
          maxLength={200}
          aria-describedby="password-rules"
        />
        {state.problems?.length ? (
          <ul className="grid gap-1 text-sm text-destructive" data-problems>
            {state.problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        ) : (
          <p id="password-rules" className="text-sm text-pretty text-muted-foreground">
            At least 10 characters, with letters and a number. Avoid common passwords and your own
            name.
          </p>
        )}
      </div>
      <div className="grid gap-2">
        <Label htmlFor="confirmPassword">Repeat the new password</Label>
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
        />
      </div>
      <SubmitButton className="justify-self-start">Change password</SubmitButton>
    </form>
  );
}
