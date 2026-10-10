import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { env } from "@/server/env";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ForgotForm } from "./ForgotForm";

export const metadata: Metadata = {
  title: "Forgot your password?",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default function ForgotPage() {
  // No password reset before email exists (D58).
  if (!env().PASSWORD_RESET) notFound();
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1>Forgot your password?</h1>
        </CardTitle>
        <CardDescription>
          Enter the email address you sign in with, and we&apos;ll email you a link to choose a new
          password.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ForgotForm />
      </CardContent>
    </Card>
  );
}
