import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { env } from "@/server/env";
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
    text: "Reset links work for 60 minutes.",
  },
  used: {
    title: "This link no longer works",
    text: "It has been used already, or a newer link was made.",
  },
  invalid: { title: "This link isn't valid", text: "Check that you copied the whole link." },
} as const;

/**
 * Choosing a new password from a one-time link (04.12). Without email the links come only from
 * an administrator, who sends them on (D59); "Forgot your password?" arrives with email (D58).
 */
export default async function ResetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = await openReset(token);
  const selfService = env().PASSWORD_RESET;
  if (link.state !== "ok") {
    const dead = DEAD[link.state];
    return (
      <Card data-link-state={link.state}>
        <CardHeader>
          <CardTitle>
            <h1>{dead.title}</h1>
          </CardTitle>
          <CardDescription>
            {dead.text}{" "}
            {selfService ? "Ask for a new one." : "Ask your administrator for a new one."}
          </CardDescription>
        </CardHeader>
        {selfService ? (
          <CardContent>
            <Link href="/forgot" className="text-sm font-medium text-primary hover:underline">
              Ask for a new link
            </Link>
          </CardContent>
        ) : null}
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
          .
          {link.madeBy ? (
            <>
              {" "}
              This link was made by{" "}
              <span data-made-by className="font-medium text-foreground">
                {link.madeBy.name}
              </span>
              .
            </>
          ) : null}{" "}
          You&apos;ll be signed out everywhere, then sign in with the new password.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResetForm token={token} />
      </CardContent>
    </Card>
  );
}
