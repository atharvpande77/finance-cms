import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { CircleCheck } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { currentSession } from "@/server/auth/current";
import { env } from "@/server/env";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Sign in" };

const DONE: Record<string, string> = {
  reset: "Your password was changed. Sign in with the new one.",
  invited: "The new roles were added to your account. Sign in to use them.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reset?: string; invited?: string }>;
}) {
  const { reset, invited } = await searchParams;
  const done = reset === "done" ? DONE.reset : invited === "done" ? DONE.invited : undefined;
  const s = await currentSession();
  if (s && (!s.twoStepRequired || s.mfaVerified)) redirect("/dashboard");
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1>Sign in</h1>
        </CardTitle>
        <CardDescription>Use the email address your organisation invited.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {done ? (
          <Alert variant="success" data-success>
            <CircleCheck strokeWidth={1.75} />
            <AlertDescription>{done}</AlertDescription>
          </Alert>
        ) : null}
        <LoginForm />
        {env().PASSWORD_RESET ? (
          <Link
            href="/forgot"
            className="text-center text-sm text-muted-foreground hover:text-foreground hover:underline"
            data-forgot-link
          >
            Forgot your password?
          </Link>
        ) : null}
      </CardContent>
    </Card>
  );
}
