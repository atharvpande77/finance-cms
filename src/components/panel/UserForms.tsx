"use client";

import { useActionState } from "react";
import { CircleCheck, Copy } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  deactivateAction,
  inviteAction,
  reactivateAction,
  removeAction,
  resendAction,
  resetLinkAction,
  resetTwoStepAction,
  setRolesAction,
  withdrawAction,
  type UserActionState,
} from "@/app/(platform)/_actions/users";
import { ROLE_LABELS, type Role } from "@/domain/roles";
import { FormError } from "./FormError";
import { SubmitButton } from "./SubmitButton";

type Action = (prev: UserActionState, form: FormData) => Promise<UserActionState>;

/** After an invitation is sent: confirmation, and the link for the sender alone without email (D56). */
function Invited({ invited }: { invited: NonNullable<UserActionState["invited"]> }) {
  return (
    <Alert variant="success" data-invited={invited.email}>
      <CircleCheck strokeWidth={1.75} />
      <AlertDescription className="grid gap-2">
        <span>Invitation sent to {invited.email}. It works once, for 7 days.</span>
        {invited.link ? (
          <span className="grid gap-1.5">
            <span>
              There is no email service set up, so copy this link and send it yourself. Only you can
              see it, and only now.
            </span>
            <span className="flex items-center gap-2">
              <Copy className="size-4 shrink-0" strokeWidth={1.75} aria-hidden />
              <code
                className="min-w-0 break-all rounded bg-background px-1.5 py-0.5 text-xs"
                data-invite-link
              >
                {invited.link}
              </code>
            </span>
          </span>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}

function RoleChecks({ roles, checked }: { roles: readonly Role[]; checked: readonly string[] }) {
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-1 text-sm font-medium">Roles</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {roles.map((r) => (
          <label
            key={r}
            className="flex min-h-11 items-center gap-2.5 rounded-lg border px-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5"
          >
            <input
              type="checkbox"
              name="roles"
              value={r}
              defaultChecked={checked.includes(r)}
              className="size-4 accent-primary"
            />
            {ROLE_LABELS[r]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function InviteForm({ orgId, roles }: { orgId: string; roles: readonly Role[] }) {
  const [state, action] = useActionState<UserActionState, FormData>(inviteAction, {});
  return (
    <form action={action} data-form="invite" className="grid gap-4">
      <input type="hidden" name="org" value={orgId} />
      {state.invited ? <Invited invited={state.invited} /> : null}
      <FormError message={state.error} id="invite-error" />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="invite-email">Email</Label>
          <Input
            id="invite-email"
            name="email"
            type="email"
            required
            maxLength={254}
            defaultValue={state.values?.email}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="invite-name">
            Name <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <Input id="invite-name" name="name" maxLength={80} defaultValue={state.values?.name} />
        </div>
      </div>
      <RoleChecks roles={roles} checked={state.values?.roles ?? []} />
      <SubmitButton className="justify-self-start">Send invitation</SubmitButton>
    </form>
  );
}

function Hidden({ fields }: { fields: Record<string, string> }) {
  return (
    <>
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
    </>
  );
}

export function InvitationButtons({
  orgId,
  invitationId,
}: {
  orgId: string;
  invitationId: string;
}) {
  const [sent, resendFormAction] = useActionState<UserActionState, FormData>(resendAction, {});
  const [withdrawn, withdrawFormAction] = useActionState<UserActionState, FormData>(
    withdrawAction,
    {},
  );
  return (
    <div className="grid gap-2">
      {sent.invited ? <Invited invited={sent.invited} /> : null}
      <FormError message={sent.error ?? withdrawn.error} />
      <div className="flex flex-wrap gap-2">
        <form action={resendFormAction} data-form={`resend-${invitationId}`}>
          <Hidden fields={{ org: orgId, invitationId }} />
          <SubmitButton variant="outline" size="sm">
            Send again
          </SubmitButton>
        </form>
        <form action={withdrawFormAction} data-form={`withdraw-${invitationId}`}>
          <Hidden fields={{ org: orgId, invitationId }} />
          <SubmitButton variant="ghost" size="sm">
            Withdraw
          </SubmitButton>
        </form>
      </div>
    </div>
  );
}

export function RolesForm({
  orgId,
  userId,
  roles,
  current,
}: {
  orgId: string;
  userId: string;
  roles: readonly Role[];
  current: readonly Role[];
}) {
  const [state, action] = useActionState<UserActionState, FormData>(setRolesAction, {});
  return (
    <form action={action} data-form="roles" className="grid gap-4">
      <Hidden fields={{ org: orgId, userId }} />
      <FormError message={state.error} />
      <RoleChecks roles={roles} checked={current} />
      <SubmitButton className="justify-self-start">Save roles</SubmitButton>
    </form>
  );
}

const PERSON_ACTIONS = {
  remove: { action: removeAction, label: "Remove from organisation", destructive: true },
  reset2fa: {
    action: resetTwoStepAction,
    label: "Reset two-step verification",
    destructive: false,
  },
  resetLink: { action: resetLinkAction, label: "Email a password reset link", destructive: false },
  deactivate: { action: deactivateAction, label: "Deactivate account", destructive: true },
  reactivate: { action: reactivateAction, label: "Reactivate account", destructive: false },
} satisfies Record<string, { action: Action; label: string; destructive: boolean }>;

export type PersonActionKey = keyof typeof PERSON_ACTIONS;

/** One command on a person, with what it does written next to it. */
export function PersonActionForm({
  kind,
  orgId,
  userId,
  explain,
}: {
  kind: PersonActionKey;
  orgId: string;
  userId: string;
  explain: string;
}) {
  const def = PERSON_ACTIONS[kind];
  const [state, action] = useActionState<UserActionState, FormData>(def.action, {});
  return (
    <form
      action={action}
      data-form={kind}
      className="grid gap-2 border-t py-4 first:border-t-0 first:pt-0 sm:grid-cols-[1fr_auto] sm:items-center sm:gap-6"
    >
      <Hidden fields={{ org: orgId, userId }} />
      <p className="text-sm text-pretty text-muted-foreground">{explain}</p>
      <SubmitButton
        variant={def.destructive ? "destructive" : "outline"}
        size="sm"
        className="justify-self-start"
      >
        {def.label}
      </SubmitButton>
      {state.error ? (
        <div className="sm:col-span-2">
          <FormError message={state.error} />
        </div>
      ) : null}
    </form>
  );
}
