import type { Metadata } from "next";
import Link from "next/link";
import { Inbox, ShieldAlert, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/panel/PageHeader";
import { requireUser } from "@/server/auth/current";
import { recentActivity } from "@/server/auth/activity";
import { waitingFor } from "@/server/articles/queries";
import { waitingCopies } from "@/server/publishing/queue";
import { LANGUAGE_NAMES } from "@/components/panel/articleLabels";
import { activityLabel, isWarning } from "@/domain/activity";
import { ROLE_LABELS, type Role } from "@/domain/roles";
import { STATE_LABELS } from "@/domain/workflow";

export const metadata: Metadata = { title: "Dashboard" };

const ORG_KIND = { institution: "Institution", publisher: "Newspaper", abcfinance: "abcfinance" };

const when = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Asia/Kolkata",
});

export default async function DashboardPage() {
  const s = await requireUser();
  if (s.memberships.length === 0) {
    // Removed from every organisation: the account stays, without access (D52).
    return (
      <>
        <PageHeader title={`Welcome, ${s.user.name.split(" ")[0]}`} />
        <Card data-no-roles>
          <CardHeader>
            <CardTitle>You aren&apos;t part of any organisation yet</CardTitle>
            <CardDescription>
              An administrator can invite you again. You&apos;ll add the roles with your password.
            </CardDescription>
          </CardHeader>
        </Card>
      </>
    );
  }
  const [activity, waiting, copies] = await Promise.all([
    recentActivity(s.user.id),
    waitingFor(s),
    waitingCopies(s),
  ]);

  const orgs = new Map<string, { name: string; kind: string; roles: Role[] }>();
  for (const m of s.memberships) {
    const org = orgs.get(m.organisationId) ?? {
      name: m.organisationName,
      kind: ORG_KIND[m.organisationType],
      roles: [],
    };
    org.roles.push(m.role);
    orgs.set(m.organisationId, org);
  }

  return (
    <>
      <PageHeader title={`Welcome, ${s.user.name.split(" ")[0]}`} />
      <div className="grid gap-6 md:grid-cols-2">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Waiting for you</CardTitle>
            <CardDescription>Articles and decisions that need your action.</CardDescription>
          </CardHeader>
          <CardContent>
            {waiting.length === 0 && copies.length === 0 ? (
              <div className="flex items-center gap-3 rounded-lg bg-muted/60 px-4 py-5 text-sm text-muted-foreground">
                <Inbox className="size-4 shrink-0" strokeWidth={1.75} aria-hidden />
                Nothing needs your attention right now.
              </div>
            ) : (
              <ul className="-mx-2 grid" data-waiting>
                {copies.map((c) => (
                  <li key={c.copyId} data-waiting-copy={c.copyId}>
                    <Link
                      href={`/publisher/${c.copyId}`}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md px-2 py-2.5 transition-colors duration-150 hover:bg-accent"
                    >
                      <span className="min-w-0 flex-1 basis-56 font-medium text-pretty">
                        {c.headline}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {c.heldAt
                          ? "Held"
                          : c.requiresExplicit
                            ? "Needs your approval"
                            : `Publishes ${when.format(c.autoApproveAt!)}`}{" "}
                        · {LANGUAGE_NAMES[c.language] ?? c.language} · {c.tenantName}
                      </span>
                    </Link>
                  </li>
                ))}
                {waiting.map((w) => (
                  <li key={w.versionId}>
                    <Link
                      href={`/articles/${w.articleId}/${w.language}`}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md px-2 py-2.5 transition-colors duration-150 hover:bg-accent"
                    >
                      <span className="min-w-0 flex-1 basis-56 font-medium text-pretty">
                        {w.headline || "Untitled"}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {STATE_LABELS[w.state]} · {LANGUAGE_NAMES[w.language] ?? w.language} ·{" "}
                        {w.organisationName}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Your roles</CardTitle>
            <CardDescription>What you can do, by organisation.</CardDescription>
          </CardHeader>
          <CardContent>
            {orgs.size === 0 ? (
              <p className="text-sm text-muted-foreground">You have no roles yet.</p>
            ) : (
              <ul className="grid gap-4" data-roles>
                {[...orgs].map(([id, org]) => (
                  <li key={id} className="grid gap-2">
                    <p className="text-sm">
                      <span className="font-medium">{org.name}</span>{" "}
                      <span className="text-muted-foreground">· {org.kind}</span>
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {org.roles.map((r) => (
                        <Badge key={r} variant="secondary" data-role={r}>
                          {ROLE_LABELS[r]}
                        </Badge>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-6 flex items-center gap-2 border-t pt-4 text-sm">
              {s.user.totpEnabled ? (
                <>
                  <ShieldCheck className="size-4 text-success" strokeWidth={1.75} aria-hidden />
                  <span>Two-step verification is on</span>
                </>
              ) : (
                <>
                  <ShieldAlert
                    className="size-4 text-muted-foreground"
                    strokeWidth={1.75}
                    aria-hidden
                  />
                  <span className="text-muted-foreground">Two-step verification is off.</span>
                  <Link
                    href="/account/security"
                    className="font-medium text-primary hover:underline"
                  >
                    Turn it on
                  </Link>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
            <CardDescription>Sign-ins and changes to your account.</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="grid gap-3" data-activity>
              {activity.map((e) => (
                <li key={e.id} className="flex items-baseline justify-between gap-4 text-sm">
                  <span className={isWarning(e.action) ? "text-destructive" : undefined}>
                    {activityLabel(e.action)}
                  </span>
                  <time
                    dateTime={e.createdAt.toISOString()}
                    className="shrink-0 text-xs text-muted-foreground tabular-nums"
                  >
                    {when.format(e.createdAt)}
                  </time>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
