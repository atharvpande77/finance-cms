import type { Metadata } from "next";
import Link from "next/link";
import { forbidden } from "next/navigation";
import { ChevronRight, CircleCheck } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/panel/PageHeader";
import { InvitationButtons, InviteForm } from "@/components/panel/UserForms";
import { panelTime } from "@/components/panel/articleLabels";
import { requireArea } from "@/server/auth/current";
import { usersPage, type Person } from "@/server/users/manage";
import { ROLE_LABELS } from "@/domain/roles";
import { ROLES_BY_KIND } from "@/domain/users";

export const metadata: Metadata = { title: "Users" };

const DONE: Record<string, string> = {
  removed: "They were removed from the organisation. Their account stays, without these roles.",
  withdrawn: "The invitation was withdrawn. Its link no longer works.",
};

const TYPE_HEADINGS = {
  institution: "Institutions",
  publisher: "Newspapers",
  abcfinance: "abcfinance",
};

const TAB =
  "shrink-0 rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors duration-150 hover:bg-accent aria-[current=page]:bg-accent aria-[current=page]:font-medium aria-[current=page]:text-foreground";

const CARD =
  "rounded-xl bg-card shadow-[0_0_0_1px_oklch(0_0_0/0.08)] dark:shadow-[0_0_0_1px_oklch(1_0_0/0.1)]";

function Markers({ p }: { p: Person }) {
  return (
    <span className="flex flex-wrap gap-1.5">
      {p.roles.map((r) => (
        <Badge key={r} variant="secondary" data-role={r}>
          {ROLE_LABELS[r]}
        </Badge>
      ))}
      {p.disabled ? (
        <Badge variant="warning" data-deactivated>
          Deactivated
        </Badge>
      ) : null}
      {p.elsewhere === true || (Array.isArray(p.elsewhere) && p.elsewhere.length) ? (
        <Badge variant="outline" data-elsewhere>
          {Array.isArray(p.elsewhere)
            ? `Also in ${p.elsewhere.join(", ")}`
            : "Also has roles in another organisation"}
        </Badge>
      ) : null}
    </span>
  );
}

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string; done?: string }>;
}) {
  const s = await requireArea("users");
  const { org: orgParam, done } = await searchParams;
  const page = await usersPage(s, orgParam);
  if (!page) forbidden();
  const { orgs, org, people, invitations } = page;
  const groups = (["institution", "publisher", "abcfinance"] as const)
    .map((type) => ({ type, orgs: orgs.filter((o) => o.type === type) }))
    .filter((g) => g.orgs.length);

  return (
    <div className="grid gap-6" data-users-org={org.id}>
      <PageHeader
        className="mb-0"
        title="Users"
        description={`People in ${org.name}: invite them, change their roles, and help them back in.`}
      />

      {orgs.length > 1 ? (
        <nav aria-label="Organisations" className="grid gap-2" data-org-switcher>
          {groups.map((g) => (
            <div key={g.type} className="flex flex-wrap items-center gap-1">
              {groups.length > 1 ? (
                <span className="w-24 shrink-0 text-xs font-medium text-muted-foreground">
                  {TYPE_HEADINGS[g.type]}
                </span>
              ) : null}
              {g.orgs.map((o) => (
                <Link
                  key={o.id}
                  href={`/users?org=${o.id}`}
                  aria-current={o.id === org.id ? "page" : undefined}
                  className={TAB}
                >
                  {o.name}
                </Link>
              ))}
            </div>
          ))}
        </nav>
      ) : null}

      {done && DONE[done] ? (
        <Alert variant="success" data-done={done}>
          <CircleCheck strokeWidth={1.75} />
          <AlertDescription>{DONE[done]}</AlertDescription>
        </Alert>
      ) : null}

      <section aria-labelledby="people" className="grid gap-3">
        <h2 id="people" className="font-semibold">
          People{" "}
          <span className="font-normal text-muted-foreground tabular-nums">{people.length}</span>
        </h2>
        <ul className={`${CARD} divide-y`}>
          {people.map((p) => (
            <li key={p.id} data-person={p.id}>
              <Link
                href={`/users/${p.id}?org=${org.id}`}
                className="flex items-center gap-3 px-4 py-3 transition-colors duration-150 hover:bg-accent/60"
              >
                <span className="grid min-w-0 flex-1 gap-1.5">
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-medium">{p.name}</span>
                    <span className="truncate text-sm text-muted-foreground">{p.email}</span>
                  </span>
                  <Markers p={p} />
                  <span
                    className="text-xs text-muted-foreground"
                    data-last-sign-in={p.lastSignInAt?.toISOString() ?? ""}
                  >
                    {p.totpEnabled ? "Two-step on" : "Two-step not set up"} ·{" "}
                    {p.lastSignInAt
                      ? `Last signed in ${panelTime.format(p.lastSignInAt)}`
                      : "Never signed in"}
                  </span>
                </span>
                {p.actions.length ? (
                  <ChevronRight
                    className="size-4 shrink-0 text-muted-foreground"
                    strokeWidth={1.75}
                    aria-hidden
                  />
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="invite" className={`${CARD} grid gap-4 p-4 sm:p-5`}>
        <div className="grid gap-1">
          <h2 id="invite" className="font-semibold">
            Invite someone
          </h2>
          <p className="text-sm text-pretty text-muted-foreground">
            They get an email with a link that works once, for 7 days. Someone who already has an
            account adds these roles with their password.
          </p>
        </div>
        <InviteForm orgId={org.id} roles={ROLES_BY_KIND[org.type]} />
      </section>

      <section aria-labelledby="pending" className="grid gap-3">
        <h2 id="pending" className="font-semibold">
          Invitations not yet accepted
        </h2>
        {invitations.length === 0 ? (
          <p className="text-sm text-muted-foreground">None.</p>
        ) : (
          <ul className={`${CARD} divide-y`}>
            {invitations.map((i) => (
              <li
                key={i.id}
                className="grid gap-3 px-4 py-3 sm:grid-cols-[1fr_auto] sm:items-start"
                data-invitation={i.id}
                data-expired={i.expired}
              >
                <div className="grid gap-1.5">
                  <span className="font-medium break-all">{i.email}</span>
                  <span className="flex flex-wrap gap-1.5">
                    {i.roles.map((r) => (
                      <Badge key={r} variant="secondary">
                        {ROLE_LABELS[r]}
                      </Badge>
                    ))}
                    {i.expired ? <Badge variant="warning">Expired</Badge> : null}
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {i.expired ? "Expired" : "Expires"} {panelTime.format(i.expiresAt)}
                    {i.invitedBy ? ` · invited by ${i.invitedBy}` : ""}
                  </span>
                </div>
                <InvitationButtons orgId={org.id} invitationId={i.id} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
