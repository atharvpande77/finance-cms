"use client";

import { useActionState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormError } from "@/components/panel/FormError";
import { SubmitButton } from "@/components/panel/SubmitButton";
import { signInAction, type FormState } from "../../_actions/auth";

export function LoginForm() {
  const [state, action] = useActionState<FormState, FormData>(signInAction, {});
  return (
    <form action={action} data-form="login" className="grid gap-4">
      <FormError message={state.error} id="login-error" />
      <div className="grid gap-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          autoFocus
          defaultValue={state.email}
          aria-describedby={state.error ? "login-error" : undefined}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          maxLength={200}
        />
      </div>
      <SubmitButton className="mt-1 w-full">Sign in</SubmitButton>
    </form>
  );
}
