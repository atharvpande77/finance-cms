import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { openInvitation } from "@/server/users/invitations";
import { ROLE_LABELS } from "@/domain/roles";
import { AcceptExistingForm, AcceptNewForm } from "./AcceptForms";

export const metadata: Metadata = {
  title: "Invitation",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

const DEAD = {
  expired: {
    title: "This invitation has expired",
    text: "Invitations work for 7 days. Ask the person who invited you to send it again.",
  },
  used: {
    title: "This invitation can't be used",
    text: "It has been used, withdrawn or replaced by a newer one.",
  },
  invalid: { title: "This link isn't valid", text: "Check that you copied the whole link." },
} as const;

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const open = await openInvitation(token);
  if (open.state !== "ok") {
    const dead = DEAD[open.state];
    return (
      <Card data-link-state={open.state}>
        <CardHeader>
          <CardTitle>
            <h1>{dead.title}</h1>
          </CardTitle>
          <CardDescription>{dead.text}</CardDescription>
        </CardHeader>
      </Card>
    );
  }
  const { invitation, org, inviter, existingUser } = open;
  return (
    <Card data-link-state="ok">
      <CardHeader>
        <CardTitle>
          <h1>Join {org.name} on abcfinance</h1>
        </CardTitle>
        <CardDescription className="grid gap-2" data-offer>
          <span>
            {inviter} invited{" "}
            <span className="font-medium text-foreground">{invitation.email}</span> as:
          </span>
          <span className="flex flex-wrap gap-1.5">
            {invitation.roles.map((r) => (
              <span
                key={r}
                className="rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground"
                data-offered-role={r}
              >
                {ROLE_LABELS[r]}
              </span>
            ))}
          </span>
          {existingUser ? (
            <span>
              You already have an abcfinance account. Enter its password to add these roles.
            </span>
          ) : null}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {existingUser ? (
          <AcceptExistingForm token={token} />
        ) : (
          <AcceptNewForm token={token} nameHint={invitation.nameHint ?? ""} />
        )}
      </CardContent>
    </Card>
  );
}
