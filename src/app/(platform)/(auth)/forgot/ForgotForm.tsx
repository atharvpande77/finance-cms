"use client";

import { useActionState } from "react";
import Link from "next/link";
import { MailCheck } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/panel/SubmitButton";
import { forgotAction, type LinkFormState } from "../../_actions/links";

export function ForgotForm() {
  const [state, action] = useActionState<LinkFormState, FormData>(forgotAction, {});
  if (state.done) {
    return (
      <div className="grid gap-4">
        <Alert variant="success" data-success>
          <MailCheck strokeWidth={1.75} />
          <AlertDescription>
            If that address has an abcfinance account, we&apos;ve emailed it a link to choose a new
            password. The link works once, for 60 minutes.
          </AlertDescription>
        </Alert>
        <Link href="/login" className="text-sm font-medium text-primary hover:underline">
          Back to sign in
        </Link>
      </div>
    );
  }
  return (
    <form action={action} data-form="forgot" className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="username" required autoFocus />
      </div>
      <SubmitButton className="mt-1 w-full">Email me a link</SubmitButton>
      <Link href="/login" className="text-center text-sm text-muted-foreground hover:underline">
        Back to sign in
      </Link>
    </form>
  );
}
