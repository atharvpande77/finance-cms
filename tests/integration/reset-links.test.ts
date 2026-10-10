import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db, schema } from "@/server/db/client";
import { membershipsOf } from "@/server/auth/sessions";
import { readOutbox } from "@/server/mail/outbox";
import { completeReset, openReset, recentAdminReset, sendResetLink } from "@/server/users/resets";
import { resetTwoStep } from "@/server/users/manage";

/** Admin-made reset links while there is no email (D59); PASSWORD_RESET is off here. */

const IP = "10.4.0.1";

async function admin(handle: string) {
  const [user] = await db()
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, `${handle}@demo.abcfinance.test`));
  return { user: { id: user!.id, name: user!.name }, memberships: await membershipsOf(user!.id) };
}

async function amcPerson(role: "institution_writer" | "institution_approver", twoStep = false) {
  const [org] = await db()
    .select()
    .from(schema.organisations)
    .where(eq(schema.organisations.slug, "sample-amc"));
  const [user] = await db()
    .insert(schema.users)
    .values({
      name: "Link Person",
      email: `int-${randomBytes(5).toString("hex")}@example.test`,
      passwordHash: "x",
      totpEnabled: twoStep,
      totpSecretEnc: twoStep ? "sealed" : null,
    })
    .returning();
  await db().insert(schema.memberships).values({ userId: user!.id, organisationId: org!.id, role });
  return { user: user!, orgId: org!.id };
}

describe("admin-made reset links without email", () => {
  it("returns the link to the admin and queues no email", async () => {
    const amcAdmin = await admin("admin.amc");
    const { user, orgId } = await amcPerson("institution_writer");
    const result = await sendResetLink(amcAdmin, orgId, user.id, IP);
    expect(result).toMatchObject({ ok: true, mode: "copy" });
    if (!result.ok || result.mode !== "copy") throw new Error("expected a copied link");
    expect((await readOutbox(200)).some((e) => e.to === user.email)).toBe(false);

    const token = result.link.split("/reset/")[1]!;
    const open = await openReset(token);
    expect(open).toMatchObject({ state: "ok", madeBy: { id: amcAdmin.user.id } });
    const pw = "Gentle-Breeze-2030";
    expect(await completeReset({ token, password: pw, confirm: pw, ip: IP })).toEqual({
      kind: "ok",
    });
    expect(await recentAdminReset(user.id)).toMatchObject({ by: amcAdmin.user.name });
  });

  it("won't let one institution admin do both a link and a two-step reset within 24 hours", async () => {
    const amcAdmin = await admin("admin.amc");
    const sup = await admin("super.abc");

    const a = await amcPerson("institution_approver", true);
    expect(await resetTwoStep(amcAdmin, a.orgId, a.user.id, IP)).toEqual({ ok: true });
    expect(await sendResetLink(amcAdmin, a.orgId, a.user.id, IP)).toMatchObject({ ok: false });
    expect(await sendResetLink(sup, a.orgId, a.user.id, IP)).toMatchObject({ ok: true });

    const b = await amcPerson("institution_approver", true);
    expect(await sendResetLink(amcAdmin, b.orgId, b.user.id, IP)).toMatchObject({ ok: true });
    expect(await resetTwoStep(amcAdmin, b.orgId, b.user.id, IP)).toMatchObject({ ok: false });
    expect(await resetTwoStep(sup, b.orgId, b.user.id, IP)).toEqual({ ok: true });
  });
});
