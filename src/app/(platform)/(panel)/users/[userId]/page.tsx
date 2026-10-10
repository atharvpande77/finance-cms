import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CircleCheck } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/panel/PageHeader";
import { PersonActionForm, RolesForm } from "@/components/panel/UserForms";
import { panelTime } from "@/components/panel/articleLabels";
import { requireArea } from "@/server/auth/current";
import { env } from "@/server/env";
import { personFor } from "@/server/users/manage";
import { ROLE_LABELS } from "@/domain/roles";
import { ROLES_BY_KIND } from "@/domain/users";

export const metadata: Metadata = { title: "Manage a person" };

const DONE: Record<string, string> = {
  roles: "Roles saved.",
  reset2fa:
    "Two-step verification was reset. They were signed out and emailed; they'll set it up again at their next sign-in.",
  resetLink: "A reset link was emailed to them. It works once, for 60 minutes.",
  deactivate: "The account is deactivated and was signed out everywhere.",
  reactivate: "The account is active again.",
};

const CARD =
  "rounded-xl bg-card p-4 shadow-[0_0_0_1px_oklch(0_0_0/0.08)] sm:p-5 dark:shadow-[0_0_0_1px_oklch(1_0_0/0.1)]";

export default async function PersonPage({
  params,
  searchParams,
}: {
  params: Promise<{ userId: string }>;
  searchParams: Promise<{ org?: string; done?: string }>;
}) {
  const s = await requireArea("users");
  const [{ userId }, { org: orgId = "", done }] = await Promise.all([params, searchParams]);
  const person = await personFor(s, orgId, userId);
  if (!person) notFound();
  const { org, user, rolesHere, elsewhere, actions } = person;
  const self = user.id === s.user.id;
  // With email, reset links are emailed; without, the admin copies one (D59).
  const emailedResets = env().PASSWORD_RESET;

  return (
    <div className="grid gap-6" data-manage={user.id}>
      <Link
        href={`/users?org=${org.id}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" strokeWidth={1.75} aria-hidden />
        {org.name}
      </Link>
      <PageHeader
        className="mb-0"
        title={user.name}
        description={
          <span className="grid gap-2">
            <span className="break-all">{user.email}</span>
            <span className="flex flex-wrap gap-1.5">
              {rolesHere.map((r) => (
                <Badge key={r} variant="secondary">
                  {ROLE_LABELS[r]}
                </Badge>
              ))}
              {user.disabledAt ? (
                <Badge variant="warning" data-deactivated>
                  Deactivated
                </Badge>
              ) : null}
              {elsewhere === true || (Array.isArray(elsewhere) && elsewhere.length) ? (
                <Badge variant="outline" data-elsewhere>
                  {Array.isArray(elsewhere)
                    ? `Also in ${elsewhere.join(", ")}`
                    : "Also has roles in another organisation"}
                </Badge>
              ) : null}
            </span>
            <span className="text-sm">
              {user.totpEnabled ? "Two-step on" : "Two-step not set up"} ·{" "}
              {user.lastSignInAt
                ? `Last signed in ${panelTime.format(user.lastSignInAt)}`
                : "Never signed in"}
            </span>
          </span>
        }
      />

      {done && DONE[done] ? (
        <Alert variant="success" data-done={done}>
          <CircleCheck strokeWidth={1.75} />
          <AlertDescription>{DONE[done]}</AlertDescription>
        </Alert>
      ) : null}

      {self ? (
        <p className="text-sm text-pretty text-muted-foreground" data-self>
          This is you. Another administrator changes your roles or account.
        </p>
      ) : null}

      {actions.includes("roles") ? (
        <section aria-labelledby="roles" className={`${CARD} grid gap-4`}>
          <h2 id="roles" className="font-semibold">
            Roles in {org.name}
          </h2>
          <RolesForm
            orgId={org.id}
            userId={user.id}
            roles={ROLES_BY_KIND[org.type]}
            current={rolesHere}
          />
        </section>
      ) : null}

      {actions.some((a) => a !== "roles") ? (
        <section aria-labelledby="account" className={`${CARD} grid`}>
          <h2 id="account" className="mb-4 font-semibold">
            Account
          </h2>
          {actions.includes("resetLink") ? (
            <PersonActionForm
              kind="resetLink"
              orgId={org.id}
              userId={user.id}
              personName={user.name}
              {...(emailedResets
                ? {
                    label: "Email a password reset link",
                    explain: "Emails them a link to choose a new password. You won't see the link.",
                  }
                : {
                    label: "Get a password reset link",
                    explain:
                      "Makes a one-time link for them to choose a new password, for you to send them. Their two-step stays on.",
                  })}
            />
          ) : null}
          {actions.includes("reset2fa") ? (
            <PersonActionForm
              kind="reset2fa"
              orgId={org.id}
              userId={user.id}
              explain="For a lost phone: signs them out, and they set two-step up again at the next sign-in."
            />
          ) : null}
          {actions.includes("remove") ? (
            <PersonActionForm
              kind="remove"
              orgId={org.id}
              userId={user.id}
              explain={`Takes away their roles in ${org.name}. Their account stays.`}
            />
          ) : null}
          {actions.includes("deactivate") ? (
            <PersonActionForm
              kind="deactivate"
              orgId={org.id}
              userId={user.id}
              explain="Signs them out everywhere and stops them signing in, in every organisation."
            />
          ) : null}
          {actions.includes("reactivate") ? (
            <PersonActionForm
              kind="reactivate"
              orgId={org.id}
              userId={user.id}
              explain="Lets them sign in again with their roles."
            />
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
