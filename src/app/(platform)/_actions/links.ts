"use server";

import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { assertSameOrigin, requestIp, setSessionCookie } from "@/server/auth/current";
import { env } from "@/server/env";
import { acceptExisting, acceptNew } from "@/server/users/invitations";
import { completeReset, requestReset } from "@/server/users/resets";
import { PASSWORD_PROBLEM_TEXT } from "@/domain/password-policy";

/** The pages reached without signing in: forgot password, reset, and (below) invitations. */

export type LinkFormState = { error?: string; problems?: string[]; done?: boolean };

const LINK_TEXT = {
  expired: "This link has expired. Ask for a new one.",
  used: "This link has already been used or replaced by a newer one.",
  invalid: "This link isn't valid.",
} as const;

export async function forgotAction(_prev: LinkFormState, form: FormData): Promise<LinkFormState> {
  if (!env().PASSWORD_RESET) notFound(); // No reset before email exists (D58).
  await assertSameOrigin();
  const { email } = z.object({ email: z.string().max(1000).default("") }).parse({
    email: form.get("email"),
  });
  await requestReset(email, await requestIp());
  // The same answer for every address (04.12).
  return { done: true };
}

const resetForm = z.object({
  token: z.string().max(200).default(""),
  newPassword: z.string().max(1000).default(""),
  confirmPassword: z.string().max(1000).default(""),
});

export async function resetPasswordAction(
  _prev: LinkFormState,
  form: FormData,
): Promise<LinkFormState> {
  await assertSameOrigin();
  const input = resetForm.parse({
    token: form.get("token"),
    newPassword: form.get("newPassword"),
    confirmPassword: form.get("confirmPassword"),
  });
  const result = await completeReset({
    token: input.token,
    password: input.newPassword,
    confirm: input.confirmPassword,
    ip: await requestIp(),
  });
  switch (result.kind) {
    case "ok":
      redirect("/login?reset=done");
    case "link":
      return { error: LINK_TEXT[result.state] };
    case "mismatch":
      return { error: "The new passwords don't match." };
    case "weak":
      return {
        error: "Choose a stronger password.",
        problems: result.problems.map((p) => PASSWORD_PROBLEM_TEXT[p]),
      };
  }
}

const acceptForm = z.object({
  token: z.string().max(200).default(""),
  name: z.string().max(1000).default(""),
  newPassword: z.string().max(1000).default(""),
  confirmPassword: z.string().max(1000).default(""),
  password: z.string().max(1000).default(""),
});

const field = (form: FormData, key: string) => form.get(key) ?? undefined;

/** A new person accepts an invitation and is signed in (04.12). */
export async function acceptInvitationAction(
  _prev: LinkFormState,
  form: FormData,
): Promise<LinkFormState> {
  await assertSameOrigin();
  const input = acceptForm.parse({
    token: field(form, "token"),
    name: field(form, "name"),
    newPassword: field(form, "newPassword"),
    confirmPassword: field(form, "confirmPassword"),
  });
  const result = await acceptNew({
    token: input.token,
    name: input.name,
    password: input.newPassword,
    confirm: input.confirmPassword,
    ip: await requestIp(),
  });
  switch (result.kind) {
    case "ok":
      await setSessionCookie(result.session);
      redirect(result.next);
    case "link":
      return { error: LINK_TEXT[result.state] };
    case "name":
      return { error: "Enter your name (2 to 80 characters)." };
    case "mismatch":
      return { error: "The new passwords don't match." };
    case "weak":
      return {
        error: "Choose a stronger password.",
        problems: result.problems.map((p) => PASSWORD_PROBLEM_TEXT[p]),
      };
  }
}

/** Someone with an account adds the invited roles with their current password (04.12). */
export async function acceptWithPasswordAction(
  _prev: LinkFormState,
  form: FormData,
): Promise<LinkFormState> {
  await assertSameOrigin();
  const input = acceptForm.parse({
    token: field(form, "token"),
    password: field(form, "password"),
  });
  const result = await acceptExisting({
    token: input.token,
    password: input.password,
    ip: await requestIp(),
  });
  switch (result.kind) {
    case "ok":
      redirect("/login?invited=done");
    case "link":
      return { error: LINK_TEXT[result.state] };
    case "wrongPassword":
      return { error: "That password is incorrect. The roles were not added." };
    case "locked":
      return { error: "Too many attempts. Try again in 15 minutes." };
  }
}
