"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertSameOrigin, requestIp, requireArea } from "@/server/auth/current";
import { invite, resend, withdraw } from "@/server/users/invitations";
import { removeFromOrg, resetTwoStep, setActive, setRoles } from "@/server/users/manage";
import { sendResetLink } from "@/server/users/resets";
import { parseRoles } from "@/domain/users";

/** The Users page commands (05.3): invite, re-send, withdraw, roles, remove, resets, deactivate. */

export type UserActionState = {
  error?: string;
  /** After an invitation: who it went to, and the link when there is no email service (D56). */
  invited?: { email: string; link?: string };
  values?: { email: string; name: string; roles: string[] };
};

const text = (form: FormData, key: string) => String(form.get(key) ?? "").slice(0, 1000);

async function admin() {
  await assertSameOrigin();
  return requireArea("users");
}

export async function inviteAction(
  _prev: UserActionState,
  form: FormData,
): Promise<UserActionState> {
  const s = await admin();
  const values = {
    email: text(form, "email"),
    name: text(form, "name"),
    roles: form.getAll("roles").map(String),
  };
  const result = await invite(
    s,
    {
      orgId: text(form, "org"),
      email: values.email,
      nameHint: values.name,
      roles: parseRoles(values.roles),
    },
    await requestIp(),
  );
  if (!result.ok) return { error: result.error, values };
  revalidatePath("/users");
  return { invited: { email: result.email, link: result.link } };
}

export async function resendAction(
  _prev: UserActionState,
  form: FormData,
): Promise<UserActionState> {
  const s = await admin();
  const result = await resend(s, text(form, "invitationId"), await requestIp());
  if (!result.ok) return { error: result.error };
  revalidatePath("/users");
  return { invited: { email: result.email, link: result.link } };
}

export async function withdrawAction(
  _prev: UserActionState,
  form: FormData,
): Promise<UserActionState> {
  const s = await admin();
  const result = await withdraw(s, text(form, "invitationId"), await requestIp());
  if (!result.ok) return { error: result.error };
  redirect(`/users?org=${text(form, "org")}&done=withdrawn`);
}

const personUrl = (form: FormData, done: string) =>
  `/users/${text(form, "userId")}?org=${text(form, "org")}&done=${done}`;

export async function setRolesAction(
  _prev: UserActionState,
  form: FormData,
): Promise<UserActionState> {
  const s = await admin();
  const result = await setRoles(
    s,
    text(form, "org"),
    text(form, "userId"),
    parseRoles(form.getAll("roles")),
    await requestIp(),
  );
  if (!result.ok) return { error: result.error };
  redirect(personUrl(form, "roles"));
}

export async function removeAction(
  _prev: UserActionState,
  form: FormData,
): Promise<UserActionState> {
  const s = await admin();
  const result = await removeFromOrg(s, text(form, "org"), text(form, "userId"), await requestIp());
  if (!result.ok) return { error: result.error };
  redirect(`/users?org=${text(form, "org")}&done=removed`);
}

export async function resetTwoStepAction(
  _prev: UserActionState,
  form: FormData,
): Promise<UserActionState> {
  const s = await admin();
  const result = await resetTwoStep(s, text(form, "org"), text(form, "userId"), await requestIp());
  if (!result.ok) return { error: result.error };
  redirect(personUrl(form, "reset2fa"));
}

export async function resetLinkAction(
  _prev: UserActionState,
  form: FormData,
): Promise<UserActionState> {
  const s = await admin();
  const result = await sendResetLink(s, text(form, "org"), text(form, "userId"), await requestIp());
  if (!result.ok) return { error: result.error };
  redirect(personUrl(form, "resetLink"));
}

export async function deactivateAction(
  _prev: UserActionState,
  form: FormData,
): Promise<UserActionState> {
  const s = await admin();
  const result = await setActive(
    s,
    text(form, "org"),
    text(form, "userId"),
    false,
    await requestIp(),
  );
  if (!result.ok) return { error: result.error };
  redirect(personUrl(form, "deactivate"));
}

export async function reactivateAction(
  _prev: UserActionState,
  form: FormData,
): Promise<UserActionState> {
  const s = await admin();
  const result = await setActive(
    s,
    text(form, "org"),
    text(form, "userId"),
    true,
    await requestIp(),
  );
  if (!result.ok) return { error: result.error };
  redirect(personUrl(form, "reactivate"));
}
