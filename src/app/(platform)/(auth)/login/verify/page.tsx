import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CodeForm } from "@/components/panel/CodeForm";
import { SignOutButton } from "@/components/panel/SignOutButton";
import { currentSession } from "@/server/auth/current";
import { verifyCodeAction } from "../../../_actions/auth";

export const metadata: Metadata = { title: "Two-step verification" };

export default async function VerifyPage() {
  const s = await currentSession();
  if (!s) redirect("/login");
  if (!s.user.totpEnabled) redirect(s.twoStepRequired ? "/account/security" : "/dashboard");
  if (s.mfaVerified) redirect("/dashboard");
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1>Enter your code</h1>
        </CardTitle>
        <CardDescription>
          Open your authenticator app and enter the 6-digit code for abcfinance.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <CodeForm action={verifyCodeAction} name="verify" submitLabel="Verify" />
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span className="truncate">{s.user.email}</span>
          <SignOutButton label="Not you?" variant="link" className="h-auto px-0" />
        </div>
      </CardContent>
    </Card>
  );
}
