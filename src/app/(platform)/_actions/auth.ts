"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { audit } from "@/server/audit";
import {
  assertSameOrigin,
  clearSessionCookie,
  currentSession,
  requestIp,
  setSessionCookie,
} from "@/server/auth/current";
import { endSession } from "@/server/auth/sessions";
import { signIn } from "@/server/auth/signin";
import { confirmEnrolment, verifyCode } from "@/server/auth/twostep";

export type FormState = { error?: string; email?: string };

const LOCKED = "Too many attempts. This account is locked for 15 minutes.";
const TOO_MANY = "Too many sign-in attempts from your network. Try again in a few minutes.";

const signInForm = z.object({
  email: z.string().max(320).default(""),
  password: z.string().max(1000).default(""),
});

export async function signInAction(_prev: FormState, form: FormData): Promise<FormState> {
  await assertSameOrigin();
  const input = signInForm.parse({ email: form.get("email"), password: form.get("password") });
  const result = await signIn({ ...input, ip: await requestIp() });
  switch (result.kind) {
    case "ok":
      await setSessionCookie(result.session);
      redirect(result.next);
    case "invalid":
      return { email: input.email, error: "The email or password is incorrect." };
    case "locked":
      return { email: input.email, error: LOCKED };
    case "tooMany":
      return { email: input.email, error: TOO_MANY };
    case "disabled":
      return {
        email: input.email,
        error: "This account has been deactivated. Contact your administrator.",
      };
  }
}

const codeForm = z.object({ code: z.string().max(20).default("") });

/** The second sign-in step, and the first code when setting up (same form, different service). */
async function submitCode(form: FormData, setup: boolean): Promise<FormState> {
  await assertSameOrigin();
  const s = await currentSession();
  if (!s) redirect("/login");
  const { code } = codeForm.parse({ code: form.get("code") });
  const input = { userId: s.user.id, sessionId: s.sessionId, code, ip: await requestIp() };
  const result = setup ? await confirmEnrolment(input) : await verifyCode(input);
  switch (result.kind) {
    case "ok":
      await setSessionCookie(result.session);
      redirect("/dashboard");
    case "invalid":
      return { error: "That code didn't work. Check your authenticator app and try again." };
    case "locked":
      return { error: LOCKED };
    case "tooMany":
      return {
        error: setup ? "Too many tries. Wait a few minutes and scan the code again." : TOO_MANY,
      };
  }
}

export async function verifyCodeAction(_prev: FormState, form: FormData): Promise<FormState> {
  return submitCode(form, false);
}

export async function enrolAction(_prev: FormState, form: FormData): Promise<FormState> {
  return submitCode(form, true);
}

export async function signOutAction(): Promise<void> {
  await assertSameOrigin();
  const s = await currentSession();
  if (s) {
    await endSession(s.sessionId);
    await audit({ userId: s.user.id, action: "auth.signout", ip: await requestIp() });
  }
  await clearSessionCookie();
  redirect("/login");
}
