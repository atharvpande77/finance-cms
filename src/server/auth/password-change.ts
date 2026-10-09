import { eq } from "drizzle-orm";
import { db, schema } from "@/server/db/client";
import { audit } from "@/server/audit";
import { queueEmail } from "@/server/mail/outbox";
import { passwordChangedEmail } from "@/server/mail/templates";
import { hashPassword, verifyPassword } from "./password";
import { endOtherSessions } from "./sessions";
import { checkPassword, type PasswordProblem } from "@/domain/password-policy";

export type ChangePasswordResult =
  | { kind: "ok" }
  | { kind: "wrongCurrent" }
  | { kind: "mismatch" }
  | { kind: "same" }
  | { kind: "weak"; problems: PasswordProblem[] };

/**
 * Changes the signed-in person's password (04.12): needs the current one, keeps this session,
 * ends the others, and emails a notice.
 */
export async function changePassword(input: {
  userId: string;
  sessionId: string;
  current: string;
  next: string;
  confirm: string;
  ip: string;
}): Promise<ChangePasswordResult> {
  const [user] = await db().select().from(schema.users).where(eq(schema.users.id, input.userId));
  if (!user) throw new Error("User not found");
  if (!(await verifyPassword(input.current, user.passwordHash))) {
    await audit({ userId: user.id, action: "auth.password_change_refused", ip: input.ip });
    return { kind: "wrongCurrent" };
  }
  if (input.next !== input.confirm) return { kind: "mismatch" };
  const problems = checkPassword(input.next, user);
  if (problems.length) return { kind: "weak", problems };
  if (await verifyPassword(input.next, user.passwordHash)) return { kind: "same" };

  const passwordHash = await hashPassword(input.next);
  const now = new Date();
  await db().transaction(async (tx) => {
    await tx.update(schema.users).set({ passwordHash }).where(eq(schema.users.id, user.id));
    const ended = await endOtherSessions(user.id, input.sessionId, tx);
    await queueEmail(
      {
        to: user.email,
        kind: "password_changed",
        createdById: user.id,
        ...passwordChangedEmail(user, now),
      },
      tx,
    );
    await audit(
      {
        userId: user.id,
        action: "auth.password_changed",
        detail: { endedSessions: ended },
        ip: input.ip,
      },
      tx,
    );
  });
  return { kind: "ok" };
}
