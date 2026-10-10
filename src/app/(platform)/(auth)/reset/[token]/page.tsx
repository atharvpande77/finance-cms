import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { env } from "@/server/env";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { openReset } from "@/server/users/resets";
import { ResetForm } from "./ResetForm";

export const metadata: Metadata = {
  title: "Choose a new password",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

const DEAD = {
  expired: {
    title: "This link has expired",
    text: "Reset links work for 60 minutes. Ask for a new one.",
  },
  used: {
    title: "This link no longer works",
    text: "It has been used already, or a newer link was sent. Use the newest email, or ask for another.",
  },
  invalid: { title: "This link isn't valid", text: "Check that you copied the whole link." },
} as const;

export default async function ResetPage({ params }: { params: Promise<{ token: string }> }) {
  if (!env().PASSWORD_RESET) notFound(); // No password reset before email exists (D58).
  const { token } = await params;
  const link = await openReset(token);
  if (link.state !== "ok") {
    const dead = DEAD[link.state];
    return (
      <Card data-link-state={link.state}>
        <CardHeader>
          <CardTitle>
            <h1>{dead.title}</h1>
          </CardTitle>
          <CardDescription>{dead.text}</CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/forgot" className="text-sm font-medium text-primary hover:underline">
            Ask for a new link
          </Link>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card data-link-state="ok">
      <CardHeader>
        <CardTitle>
          <h1>Choose a new password</h1>
        </CardTitle>
        <CardDescription>
          For{" "}
          <span data-account className="font-medium text-foreground">
            {link.user.email}
          </span>
          . You&apos;ll be signed out everywhere, then sign in with the new password.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResetForm token={token} />
      </CardContent>
    </Card>
  );
}
