import { and, eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db, schema } from "@/server/db/client";
import { hashPassword } from "@/server/auth/password";
import { signIn } from "@/server/auth/signin";
import { confirmEnrolment, startEnrolment, verifyCode } from "@/server/auth/twostep";
import { changePassword } from "@/server/auth/password-change";
import { createSession, loadSession } from "@/server/auth/sessions";
import { sha256 } from "@/server/crypto/hash";
import { open } from "@/server/crypto/secret-box";
import { readOutbox } from "@/server/mail/outbox";
import { resetEnvCache } from "@/server/env";
import { stepAt, totpAt } from "@/domain/totp";
import type { Role } from "@/domain/roles";

const PASSWORD = "Monsoon-Rain-2026";
const unique = () => Math.random().toString(36).slice(2, 10);
/** Each test signs in from its own address so the per-address limit doesn't interfere. */
const ip = () => `10.0.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;

async function makeUser(role: Role, orgSlug: string) {
  const [org] = await db()
    .select()
    .from(schema.organisations)
    .where(eq(schema.organisations.slug, orgSlug));
  const email = `t-${unique()}@int.test`;
  const [user] = await db()
    .insert(schema.users)
    .values({ name: "Test Person", email, passwordHash: await hashPassword(PASSWORD) })
    .returning();
  await db().insert(schema.memberships).values({ userId: user!.id, organisationId: org!.id, role });
  return user!;
}

const writer = () => makeUser("institution_writer", "sample-amc");
const approver = () => makeUser("institution_approver", "sample-amc");

async function enrol(userId: string, address: string) {
  const s = await signIn({
    email: (await userById(userId)).email,
    password: PASSWORD,
    ip: address,
  });
  if (s.kind !== "ok") throw new Error(s.kind);
  const e = await startEnrolment(userId);
  const step = stepAt(Date.now());
  const r = await confirmEnrolment({
    userId,
    sessionId: s.session.id,
    code: totpAt(e!.secret, step),
    ip: address,
  });
  if (r.kind !== "ok") throw new Error(r.kind);
  return { secret: e!.secret, step };
}

async function userById(id: string) {
  const [u] = await db().select().from(schema.users).where(eq(schema.users.id, id));
  return u!;
}

async function auditActions(userId: string) {
  const rows = await db()
    .select({ action: schema.auditEvents.action })
    .from(schema.auditEvents)
    .where(eq(schema.auditEvents.userId, userId))
    .orderBy(schema.auditEvents.id);
  return rows.map((r) => r.action);
}

describe("password sign-in", () => {
  it("signs a writer straight in, storing only the token's hash", async () => {
    const u = await writer();
    const r = await signIn({ email: ` ${u.email.toUpperCase()} `, password: PASSWORD, ip: ip() });
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    expect(r.next).toBe("/dashboard");
    const [row] = await db()
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.id, r.session.id));
    expect(row!.tokenHash).toBe(sha256(r.session.token));
    expect(row!.tokenHash).not.toContain(r.session.token);
    expect(row!.mfaVerified).toBe(true);
    const hours = (row!.expiresAt.getTime() - Date.now()) / 3600_000;
    expect(hours).toBeGreaterThan(11.9);
    expect(hours).toBeLessThanOrEqual(12);
  });

  it("gives unknown emails and wrong passwords the same answer", async () => {
    const u = await writer();
    expect((await signIn({ email: u.email, password: "Wrong-Pass-2026", ip: ip() })).kind).toBe(
      "invalid",
    );
    expect(
      (await signIn({ email: `nobody-${unique()}@int.test`, password: PASSWORD, ip: ip() })).kind,
    ).toBe("invalid");
  });

  it("locks after 5 wrong passwords for 15 minutes, then accepts the password again", async () => {
    const u = await writer();
    const address = ip();
    for (let i = 0; i < 5; i++) {
      expect(
        (await signIn({ email: u.email, password: "Wrong-Pass-2026", ip: address })).kind,
      ).toBe("invalid");
    }
    expect((await signIn({ email: u.email, password: PASSWORD, ip: address })).kind).toBe("locked");
    const locked = await userById(u.id);
    const minutes = (locked.lockedUntil!.getTime() - Date.now()) / 60_000;
    expect(minutes).toBeGreaterThan(14.5);
    expect(minutes).toBeLessThanOrEqual(15);
    expect(await auditActions(u.id)).toContain("auth.signin_blocked");

    // The lock runs out.
    await db()
      .update(schema.users)
      .set({ lockedUntil: new Date(Date.now() - 1000) })
      .where(eq(schema.users.id, u.id));
    expect((await signIn({ email: u.email, password: PASSWORD, ip: address })).kind).toBe("ok");
    expect((await userById(u.id)).failedLogins).toBe(0);
  });

  it("locks unknown emails the same way, so the lock reveals nothing (D16)", async () => {
    const email = `nobody-${unique()}@int.test`;
    const kinds = [];
    for (let i = 0; i < 6; i++)
      kinds.push((await signIn({ email, password: PASSWORD, ip: ip() })).kind);
    expect(kinds).toEqual(["invalid", "invalid", "invalid", "invalid", "invalid", "locked"]);
  });

  it("limits sign-in posts per address (D17)", async () => {
    const address = ip();
    const email = `nobody-${unique()}@int.test`;
    const kinds = new Set<string>();
    for (let i = 0; i < 21; i++) {
      kinds.add((await signIn({ email: `${i}${email}`, password: PASSWORD, ip: address })).kind);
    }
    expect(kinds).toEqual(new Set(["invalid", "tooMany"]));
  });

  it("tells a deactivated person only after the correct password, and drops their sessions", async () => {
    const u = await writer();
    const s = await createSession(u.id, { mfaVerified: true });
    await db()
      .update(schema.users)
      .set({ disabledAt: new Date() })
      .where(eq(schema.users.id, u.id));
    expect((await signIn({ email: u.email, password: "Wrong-Pass-2026", ip: ip() })).kind).toBe(
      "invalid",
    );
    expect((await signIn({ email: u.email, password: PASSWORD, ip: ip() })).kind).toBe("disabled");
    expect(await loadSession(s.token)).toBeNull();
  });

  it("rejects an expired session", async () => {
    const u = await writer();
    const s = await createSession(u.id, { mfaVerified: true });
    expect(await loadSession(s.token)).not.toBeNull();
    await db()
      .update(schema.sessions)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(schema.sessions.id, s.id));
    expect(await loadSession(s.token)).toBeNull();
  });
});

describe("two-step verification", () => {
  it("sends an approver to set-up, stores the secret encrypted, and enrols with a right code", async () => {
    const u = await approver();
    const address = ip();
    const r = await signIn({ email: u.email, password: PASSWORD, ip: address });
    expect(r.kind === "ok" && r.next).toBe("/account/security");
    if (r.kind !== "ok") return;
    expect((await loadSession(r.session.token))!.mfaVerified).toBe(false);

    const e = await startEnrolment(u.id);
    const again = await startEnrolment(u.id);
    expect(again!.secret).toBe(e!.secret);
    const stored = (await userById(u.id)).totpSecretEnc!;
    expect(stored).not.toContain(e!.secret);
    expect(open(stored)).toBe(e!.secret);
    expect(e!.qrSvg).toContain("<svg");

    const wrong = await confirmEnrolment({
      userId: u.id,
      sessionId: r.session.id,
      code: "000000",
      ip: address,
    });
    expect(wrong.kind).toBe("invalid");
    expect((await userById(u.id)).failedLogins).toBe(0);

    const ok = await confirmEnrolment({
      userId: u.id,
      sessionId: r.session.id,
      code: totpAt(e!.secret, stepAt(Date.now())),
      ip: address,
    });
    expect(ok.kind).toBe("ok");
    if (ok.kind !== "ok") return;
    expect(await loadSession(r.session.token)).toBeNull();
    expect((await loadSession(ok.session.token))!.mfaVerified).toBe(true);
    expect((await userById(u.id)).totpEnabled).toBe(true);
    expect(await auditActions(u.id)).toEqual([
      "auth.signin",
      "auth.2fa_failed",
      "auth.2fa_enrolled",
    ]);
  });

  it("asks for a code at the next sign-in and refuses a replayed one", async () => {
    const u = await approver();
    const address = ip();
    const { secret, step } = await enrol(u.id, address);
    const r = await signIn({ email: u.email, password: PASSWORD, ip: address });
    expect(r.kind === "ok" && r.next).toBe("/login/verify");
    if (r.kind !== "ok") return;

    const used = totpAt(secret, step);
    expect(
      (await verifyCode({ userId: u.id, sessionId: r.session.id, code: used, ip: address })).kind,
    ).toBe("invalid");
    const next = totpAt(secret, step + 1);
    const ok = await verifyCode({ userId: u.id, sessionId: r.session.id, code: next, ip: address });
    expect(ok.kind).toBe("ok");
  });

  it("lets only one of two simultaneous uses of a code through", async () => {
    const u = await approver();
    const address = ip();
    const { secret, step } = await enrol(u.id, address);
    const a = await signIn({ email: u.email, password: PASSWORD, ip: address });
    const b = await signIn({ email: u.email, password: PASSWORD, ip: address });
    if (a.kind !== "ok" || b.kind !== "ok") throw new Error("sign-in failed");
    const code = totpAt(secret, step + 1);
    const results = await Promise.all([
      verifyCode({ userId: u.id, sessionId: a.session.id, code, ip: address }),
      verifyCode({ userId: u.id, sessionId: b.session.id, code, ip: address }),
    ]);
    expect(results.map((r) => r.kind).sort()).toEqual(["invalid", "ok"]);
  });

  it("counts wrong codes toward the lockout, and a right password does not reset the count (D15)", async () => {
    const u = await approver();
    const address = ip();
    const { secret, step } = await enrol(u.id, address);
    let session = await signIn({ email: u.email, password: PASSWORD, ip: address });
    for (let i = 0; i < 4; i++) {
      if (session.kind !== "ok") throw new Error(session.kind);
      await verifyCode({
        userId: u.id,
        sessionId: session.session.id,
        code: "000000",
        ip: address,
      });
      // Signing in again with the right password must not clear the failures.
      session = await signIn({ email: u.email, password: PASSWORD, ip: address });
    }
    if (session.kind !== "ok") throw new Error(session.kind);
    const fifth = await verifyCode({
      userId: u.id,
      sessionId: session.session.id,
      code: "000000",
      ip: address,
    });
    expect(fifth.kind).toBe("locked");
    const right = await verifyCode({
      userId: u.id,
      sessionId: session.session.id,
      code: totpAt(secret, step + 1),
      ip: address,
    });
    expect(right.kind).toBe("locked");
    expect((await signIn({ email: u.email, password: PASSWORD, ip: address })).kind).toBe("locked");
  });
});

describe("change password", () => {
  it("checks the current and new password, keeps this session and ends the others", async () => {
    const u = await writer();
    const address = ip();
    const here = await createSession(u.id, { mfaVerified: true });
    const elsewhere = await createSession(u.id, { mfaVerified: true });
    const base = { userId: u.id, sessionId: here.id, ip: address };

    expect((await changePassword({ ...base, current: "nope", next: "x", confirm: "x" })).kind).toBe(
      "wrongCurrent",
    );
    expect(
      (
        await changePassword({
          ...base,
          current: PASSWORD,
          next: "River-Bank-2026",
          confirm: "River-Bank-2027",
        })
      ).kind,
    ).toBe("mismatch");
    expect(
      (await changePassword({ ...base, current: PASSWORD, next: "short1", confirm: "short1" }))
        .kind,
    ).toBe("weak");
    expect(
      (await changePassword({ ...base, current: PASSWORD, next: PASSWORD, confirm: PASSWORD }))
        .kind,
    ).toBe("same");
    expect(
      (
        await changePassword({
          ...base,
          current: PASSWORD,
          next: "River-Bank-2026",
          confirm: "River-Bank-2026",
        })
      ).kind,
    ).toBe("ok");

    expect(await loadSession(here.token)).not.toBeNull();
    expect(await loadSession(elsewhere.token)).toBeNull();
    expect((await signIn({ email: u.email, password: PASSWORD, ip: address })).kind).toBe(
      "invalid",
    );
    expect((await signIn({ email: u.email, password: "River-Bank-2026", ip: address })).kind).toBe(
      "ok",
    );

    const [mail] = await db()
      .select()
      .from(schema.emailOutbox)
      .where(
        and(eq(schema.emailOutbox.to, u.email), eq(schema.emailOutbox.kind, "password_changed")),
      );
    const [readable] = await readOutbox(1, [mail!.id]);
    expect(readable!.body).toContain("signed out everywhere else");
    expect(await auditActions(u.id)).toContain("auth.password_changed");
  });
});

describe("audit", () => {
  it("never stores an unknown email in the clear", async () => {
    const email = `secret-${unique()}@int.test`;
    await signIn({ email, password: PASSWORD, ip: ip() });
    const rows = await db().execute(
      sql`SELECT detail::text AS d FROM audit_events WHERE action = 'auth.signin_failed'`,
    );
    expect(JSON.stringify(rows)).not.toContain(email);
  });
});

describe("development two-step bypass (D41)", () => {
  const saved = { ...process.env };
  const withEnv = async (vars: Record<string, string>, run: () => Promise<void>) => {
    Object.assign(process.env, vars);
    resetEnvCache();
    try {
      await run();
    } finally {
      process.env = { ...saved };
      resetEnvCache();
    }
  };

  it("refuses 111111 outside development, even with the flag", async () => {
    await withEnv({ DEV_TOTP_BYPASS: "1" }, async () => {
      const u = await approver();
      const address = ip();
      const s = await signIn({ email: u.email, password: PASSWORD, ip: address });
      if (s.kind !== "ok") throw new Error(s.kind);
      await startEnrolment(u.id);
      const r = await confirmEnrolment({
        userId: u.id,
        sessionId: s.session.id,
        code: "111111",
        ip: address,
      });
      expect(r.kind).toBe("invalid");
    });
  });

  it("accepts 111111 for set-up and sign-in under development with the flag", async () => {
    await withEnv({ NODE_ENV: "development", DEV_TOTP_BYPASS: "1" }, async () => {
      const u = await approver();
      const address = ip();
      const first = await signIn({ email: u.email, password: PASSWORD, ip: address });
      if (first.kind !== "ok") throw new Error(first.kind);
      await startEnrolment(u.id);
      const enrolled = await confirmEnrolment({
        userId: u.id,
        sessionId: first.session.id,
        code: "111111",
        ip: address,
      });
      expect(enrolled.kind).toBe("ok");
      expect((await userById(u.id)).totpEnabled).toBe(true);
      const second = await signIn({ email: u.email, password: PASSWORD, ip: address });
      if (second.kind !== "ok") throw new Error(second.kind);
      const verified = await verifyCode({
        userId: u.id,
        sessionId: second.session.id,
        code: "111111",
        ip: address,
      });
      expect(verified.kind).toBe("ok");
      const bypassed = await db()
        .select()
        .from(schema.auditEvents)
        .where(eq(schema.auditEvents.userId, u.id));
      expect(bypassed.filter((a) => a.detail.devBypass === true).map((a) => a.action)).toEqual([
        "auth.2fa_enrolled",
        "auth.2fa_ok",
      ]);
    });
  });

  it("still requires the flag in development", async () => {
    await withEnv({ NODE_ENV: "development", DEV_TOTP_BYPASS: "0" }, async () => {
      const u = await approver();
      const address = ip();
      const s = await signIn({ email: u.email, password: PASSWORD, ip: address });
      if (s.kind !== "ok") throw new Error(s.kind);
      await startEnrolment(u.id);
      const r = await confirmEnrolment({
        userId: u.id,
        sessionId: s.session.id,
        code: "111111",
        ip: address,
      });
      expect(r.kind).toBe("invalid");
    });
  });
});
