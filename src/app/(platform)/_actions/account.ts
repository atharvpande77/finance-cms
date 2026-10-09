"use server";

import { z } from "zod";
import { assertSameOrigin, requestIp, requireUser } from "@/server/auth/current";
import { changePassword } from "@/server/auth/password-change";
import { PASSWORD_PROBLEM_TEXT } from "@/domain/password-policy";

export type PasswordFormState = { error?: string; problems?: string[]; done?: boolean };

const form = z.object({
  currentPassword: z.string().max(1000).default(""),
  newPassword: z.string().max(1000).default(""),
  confirmPassword: z.string().max(1000).default(""),
});

export async function changePasswordAction(
  _prev: PasswordFormState,
  data: FormData,
): Promise<PasswordFormState> {
  await assertSameOrigin();
  const s = await requireUser();
  const input = form.parse({
    currentPassword: data.get("currentPassword"),
    newPassword: data.get("newPassword"),
    confirmPassword: data.get("confirmPassword"),
  });
  const result = await changePassword({
    userId: s.user.id,
    sessionId: s.sessionId,
    current: input.currentPassword,
    next: input.newPassword,
    confirm: input.confirmPassword,
    ip: await requestIp(),
  });
  switch (result.kind) {
    case "ok":
      return { done: true };
    case "wrongCurrent":
      return { error: "Your current password is incorrect." };
    case "mismatch":
      return { error: "The new passwords don't match." };
    case "same":
      return { error: "Choose a password different from your current one." };
    case "weak":
      return {
        error: "Choose a stronger password.",
        problems: result.problems.map((p) => PASSWORD_PROBLEM_TEXT[p]),
      };
  }
}
