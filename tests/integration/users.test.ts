import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { db, schema } from "@/server/db/client";
import { membershipsOf } from "@/server/auth/sessions";
import { acceptNew, invite } from "@/server/users/invitations";
import { completeReset, openReset, requestReset } from "@/server/users/resets";
import { removeFromOrg, setRoles } from "@/server/users/manage";
import { readOutbox } from "@/server/mail/outbox";

// Password reset is off by default (D58); these tests exercise it as M6 will run it.
vi.hoisted(() => {
  process.env.PASSWORD_RESET = "1";
});

const IP = "10.3.0.1";
const freshEmail = () => `int-${randomBytes(5).toString("hex")}@example.test`;

async function admin(handle: string) {
  const [user] = await db()
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, `${handle}@demo.abcfinance.test`));
  return { user: { id: user!.id, name: user!.name }, memberships: await membershipsOf(user!.id) };
}

async function orgId(slug: string) {
  const [row] = await db()
    .select()
    .from(schema.organisations)
    .where(eq(schema.organisations.slug, slug));
  return row!.id;
}

/** The link in the newest email to `to`. */
async function linkTo(to: string, path: "invite" | "reset") {
  const mail = (await readOutbox(200)).find((e) => e.to === to);
  return mail!.body.match(new RegExp(`/${path}/([A-Za-z0-9_-]+)`))![1]!;
}

describe("invitations", () => {
  it("stores only the token's hash, and one of two simultaneous accepts wins", async () => {
    const amcAdmin = await admin("admin.amc");
    const email = freshEmail();
    const result = await invite(
      amcAdmin,
      { orgId: await orgId("sample-amc"), email, nameHint: "", roles: ["institution_writer"] },
      IP,
    );
    expect(result).toMatchObject({ ok: true, email, emailed: false });
    if (!result.ok) throw new Error(result.error);
    // The link goes to the admin; no email is queued while INVITE_EMAILS is off (D58).
    const token = result.link.split("/invite/")[1]!;
    expect((await readOutbox(200)).some((e) => e.to === email)).toBe(false);
    const [row] = await db()
      .select()
      .from(schema.invitations)
      .where(eq(schema.invitations.email, email));
    expect(row!.tokenHash).not.toContain(token);
    expect(JSON.stringify(row)).not.toContain(token);

    const accept = () =>
      acceptNew({
        token,
        name: "Int Writer",
        password: "Quiet-River-2026",
        confirm: "Quiet-River-2026",
        ip: IP,
      });
    const results = await Promise.all([accept(), accept()]);
    expect(results.map((r) => r.kind).sort()).toEqual(["link", "ok"]);
    const users = await db().select().from(schema.users).where(eq(schema.users.email, email));
    expect(users).toHaveLength(1);
  });
});

describe("password reset links", () => {
  it("only the newest works, and only once", async () => {
    const email = freshEmail();
    const [user] = await db()
      .insert(schema.users)
      .values({ name: "Reset Person", email, passwordHash: "x" })
      .returning();
    await requestReset(email, "10.3.1.1");
    const first = await linkTo(email, "reset");
    await requestReset(email, "10.3.1.2");
    const second = await linkTo(email, "reset");
    expect(second).not.toBe(first);
    expect((await openReset(first)).state).toBe("used");
    expect((await openReset(second)).state).toBe("ok");
    const pw = "Calm-Harbour-2026";
    const done = await Promise.all([
      completeReset({ token: second, password: pw, confirm: pw, ip: IP }),
      completeReset({ token: second, password: pw, confirm: pw, ip: IP }),
    ]);
    expect(done.map((d) => d.kind).sort()).toEqual(["link", "ok"]);
    expect((await openReset(second)).state).toBe("used");
    const rows = await db()
      .select()
      .from(schema.passwordResets)
      .where(eq(schema.passwordResets.userId, user!.id));
    expect(rows.every((r) => r.tokenHash !== first && r.tokenHash !== second)).toBe(true);
  });
});

describe("an organisation keeps its administrator", () => {
  it("refuses to demote or remove the only account admin", async () => {
    const sup = await admin("super.abc");
    const amcAdmin = await admin("admin.amc");
    const amc = await orgId("sample-amc");
    expect(await setRoles(sup, amc, amcAdmin.user.id, ["institution_writer"], IP)).toMatchObject({
      ok: false,
      error: expect.stringContaining("must keep at least one active account admin"),
    });
    expect(await removeFromOrg(sup, amc, amcAdmin.user.id, IP)).toMatchObject({ ok: false });
    // Nobody changes their own roles (D53).
    expect(
      await setRoles(amcAdmin, amc, amcAdmin.user.id, ["institution_account_admin"], IP),
    ).toMatchObject({
      ok: false,
    });
  });
});
