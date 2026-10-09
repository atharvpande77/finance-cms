import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CodeForm } from "@/components/panel/CodeForm";
import { SignOutButton } from "@/components/panel/SignOutButton";
import { currentSession } from "@/server/auth/current";
import { startEnrolment } from "@/server/auth/twostep";
import { enrolAction } from "../../../_actions/auth";

export const metadata: Metadata = { title: "Two-step verification" };

/** Groups a base32 key in fours so it can be typed into an app by hand. */
function grouped(secret: string) {
  return secret.match(/.{1,4}/g)!.join(" ");
}

export default async function SecurityPage() {
  const s = await currentSession();
  if (!s) redirect("/login");

  if (s.user.totpEnabled) {
    if (!s.mfaVerified) redirect("/login/verify");
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-success" strokeWidth={2} aria-hidden />
            <h1>Two-step verification is on</h1>
          </CardTitle>
          <CardDescription>
            Each sign-in asks for a code from your authenticator app. If you lose your phone, ask
            your administrator to reset it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline" className="w-full">
            <Link href="/dashboard">Back to dashboard</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const enrolment = (await startEnrolment(s.user.id))!;
  const qr = `data:image/svg+xml;base64,${Buffer.from(enrolment.qrSvg).toString("base64")}`;
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1>Set up two-step verification</h1>
        </CardTitle>
        <CardDescription>
          {s.twoStepRequired
            ? "Your role needs a code from an authenticator app at each sign-in. Set it up once to continue."
            : "Optional for your role. Once it's on, every sign-in asks for a code."}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">
        <ol className="grid gap-4 text-sm">
          <li className="grid gap-3">
            <span>
              <span className="font-medium">1.</span> Scan this with Google Authenticator, Microsoft
              Authenticator or Authy.
            </span>
            {/* eslint-disable-next-line @next/next/no-img-element -- inline SVG data, nothing to optimise */}
            <img
              src={qr}
              alt="QR code for your authenticator app"
              width={176}
              height={176}
              data-qr
              className="mx-auto size-44 rounded-lg bg-white p-2 outline outline-1 -outline-offset-1 outline-black/10"
            />
          </li>
          <li className="grid gap-2">
            <span>
              <span className="font-medium">2.</span> Can&apos;t scan? Enter this key instead:
            </span>
            <code
              data-secret
              className="rounded-md bg-muted px-3 py-2 text-center font-mono text-sm tracking-wider break-all select-all"
            >
              {grouped(enrolment.secret)}
            </code>
          </li>
          <li>
            <span className="font-medium">3.</span> Enter the 6-digit code the app shows.
          </li>
        </ol>
        <CodeForm action={enrolAction} name="enrol" submitLabel="Turn on two-step" />
        <div className="flex justify-center">
          {s.twoStepRequired ? (
            <SignOutButton label="Sign out" variant="link" className="h-auto px-0" />
          ) : (
            <Button asChild variant="link" className="h-auto px-0">
              <Link href="/dashboard">Not now</Link>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
