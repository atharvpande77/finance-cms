import { and, eq, inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db, schema } from "@/server/db/client";
import { open } from "@/server/crypto/secret-box";
import { pageText } from "../http-client";
import {
  DEMO_PASSWORD,
  demoEmail,
  freshCode,
  login,
  person,
  totpSecret,
  userByEmail,
} from "./auth-helpers";

const GENERIC = "The email or password is incorrect.";
const BAD_CODE = "That code didn't work";

describe("sign-in, two-step verification, lockout and audit trail", () => {
  const writer = person();

  it("[E2E-AUTH-01] writer: login redirects to /dashboard", async () => {
    const res = await login(writer, "writer.amc");
    expect(res.status).toBe(303);
    expect(res.location).toBe("/dashboard");
    const cookie = res.headers.getSetCookie().join("\n");
    expect(cookie).toMatch(/abc_session=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=lax/i);
  });

  it("[E2E-AUTH-02] writer: dashboard shows roles", async () => {
    const res = await writer.get("/dashboard");
    expect(res.status).toBe(200);
    const text = pageText(res.text);
    expect(text).toContain("Sample AMC");
    expect(text).toContain("Institution writer");
  });

  const stranger = person();

  it("[E2E-AUTH-03] wrong password: generic error", async () => {
    const res = await login(stranger, "writer.amc", "Not-The-Password-1");
    expect(res.status).toBe(200);
    expect(pageText(res.text)).toContain(GENERIC);
    expect(stranger.cookie("abc_session")).toBeUndefined();
  });

  it("[E2E-AUTH-04] wrong password: no access", async () => {
    const res = await stranger.get("/dashboard");
    expect(res.status).toBe(307);
    expect(res.location).toBe("/login");
  });

  it("[E2E-AUTH-05] unknown email: same generic error", async () => {
    const res = await stranger.submitForm("/login", "login", {
      email: "nobody@demo.abcfinance.test",
      password: DEMO_PASSWORD,
    });
    expect(res.status).toBe(200);
    expect(pageText(res.text)).toContain(GENERIC);
  });

  const approver = person();
  let secret = "";

  it("[E2E-AUTH-06] approver: sent to 2FA setup", async () => {
    const res = await login(approver, "approver.amc");
    expect(res.status).toBe(303);
    expect(res.location).toBe("/account/security");
  });

  it("[E2E-AUTH-07] approver: dashboard blocked before 2FA", async () => {
    const res = await approver.get("/dashboard");
    expect(res.status).toBe(307);
    expect(res.location).toBe("/account/security");
    expect((await approver.get("/articles")).location).toBe("/account/security");
  });

  it("[E2E-AUTH-08] approver: setup page shows a key + QR", async () => {
    const res = await approver.get("/account/security");
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/<img[^>]*src="data:image\/svg\+xml;base64,[^"]+"[^>]*data-qr/);
    const shown = res.text.match(/data-secret[^>]*>([A-Z2-7 ]+)</)?.[1];
    expect(shown).toBeTruthy();
    secret = shown!.replace(/ /g, "");
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
  });

  it("[E2E-AUTH-09] secret is stored encrypted, not in plain text", async () => {
    const user = await userByEmail(demoEmail("approver.amc"));
    expect(user.totpSecretEnc).toMatch(/^v1:/);
    expect(user.totpSecretEnc).not.toContain(secret);
    expect(open(user.totpSecretEnc!)).toBe(secret);
    expect(await totpSecret("approver.amc")).toBe(secret);
  });

  it("[E2E-AUTH-10] enrol: wrong code rejected", async () => {
    const res = await approver.submitForm("/account/security", "enrol", { code: "000000" });
    expect(res.status).toBe(200);
    expect(pageText(res.text)).toContain(BAD_CODE);
    expect((await userByEmail(demoEmail("approver.amc"))).totpEnabled).toBe(false);
  });

  it("[E2E-AUTH-11] enrol: right code accepted", async () => {
    const res = await approver.submitForm("/account/security", "enrol", {
      code: await freshCode("approver.amc"),
    });
    expect(res.status).toBe(303);
    expect(res.location).toBe("/dashboard");
    expect((await userByEmail(demoEmail("approver.amc"))).totpEnabled).toBe(true);
  });

  it("[E2E-AUTH-12] approver: dashboard open after enrol", async () => {
    const res = await approver.get("/dashboard");
    expect(res.status).toBe(200);
    expect(pageText(res.text)).toContain("Institution approver");
  });

  it("[E2E-AUTH-13] logout: session gone", async () => {
    const token = approver.cookie("abc_session")!;
    const res = await approver.submitForm("/dashboard", "signout");
    expect(res.status).toBe(303);
    expect(res.location).toBe("/login");
    expect(approver.cookie("abc_session")).toBeUndefined();
    expect((await approver.get("/dashboard")).location).toBe("/login");
    // The old token is dead on the server too, not just forgotten by the browser.
    const replayed = person();
    const res2 = await replayed.get("/dashboard", { cookie: `abc_session=${token}` });
    expect(res2.location).toBe("/login");
  });

  it("[E2E-AUTH-14] re-login: sent to /login/verify", async () => {
    const res = await login(approver, "approver.amc");
    expect(res.status).toBe(303);
    expect(res.location).toBe("/login/verify");
  });

  it("[E2E-AUTH-15] re-login: dashboard blocked until code", async () => {
    const res = await approver.get("/dashboard");
    expect(res.status).toBe(307);
    expect(res.location).toBe("/login/verify");
  });

  it("[E2E-AUTH-16] verify: wrong code rejected", async () => {
    const res = await approver.submitForm("/login/verify", "verify", { code: "000000" });
    expect(res.status).toBe(200);
    expect(pageText(res.text)).toContain(BAD_CODE);
    expect((await approver.get("/dashboard")).location).toBe("/login/verify");
  });

  let usedCode = "";

  it("[E2E-AUTH-17] verify: right code accepted", async () => {
    usedCode = await freshCode("approver.amc");
    const res = await approver.submitForm("/login/verify", "verify", { code: usedCode });
    expect(res.status).toBe(303);
    expect(res.location).toBe("/dashboard");
    expect((await approver.get("/dashboard")).status).toBe(200);
  });

  it("[E2E-AUTH-18] replay: used code rejected", async () => {
    const other = person();
    expect((await login(other, "approver.amc")).location).toBe("/login/verify");
    const res = await other.submitForm("/login/verify", "verify", { code: usedCode });
    expect(res.status).toBe(200);
    expect(pageText(res.text)).toContain(BAD_CODE);
    expect((await other.get("/dashboard")).location).toBe("/login/verify");
  });

  it("[E2E-AUTH-19] lockout: correct password refused while locked", async () => {
    const attacker = person();
    for (let i = 0; i < 5; i++) {
      const res = await login(attacker, "writer.gi", `Wrong-Guess-${i}0`);
      expect(pageText(res.text)).toContain(GENERIC);
    }
    const owner = person();
    const res = await login(owner, "writer.gi");
    expect(res.status).toBe(200);
    expect(pageText(res.text)).toContain("locked for 15 minutes");
    expect(owner.cookie("abc_session")).toBeUndefined();
    expect((await owner.get("/dashboard")).location).toBe("/login");
  });

  it("[E2E-AUTH-20] audit trail recorded events", async () => {
    const approverId = (await userByEmail(demoEmail("approver.amc"))).id;
    const writerGi = (await userByEmail(demoEmail("writer.gi"))).id;
    const rows = await db()
      .select({ userId: schema.auditEvents.userId, action: schema.auditEvents.action })
      .from(schema.auditEvents)
      .where(inArray(schema.auditEvents.userId, [approverId, writerGi]));
    const of = (id: string) => new Set(rows.filter((r) => r.userId === id).map((r) => r.action));
    expect([...of(approverId)]).toEqual(
      expect.arrayContaining([
        "auth.signin",
        "auth.2fa_failed",
        "auth.2fa_enrolled",
        "auth.signout",
        "auth.2fa_ok",
      ]),
    );
    expect([...of(writerGi)]).toEqual(
      expect.arrayContaining(["auth.signin_failed", "auth.signin_blocked"]),
    );
    const [failure] = await db()
      .select()
      .from(schema.auditEvents)
      .where(
        and(
          eq(schema.auditEvents.userId, writerGi),
          eq(schema.auditEvents.action, "auth.signin_failed"),
        ),
      );
    expect(failure!.ip).toMatch(/^10\.9\./);
  });
});
