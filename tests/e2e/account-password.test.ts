import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db, schema } from "@/server/db/client";
import { hashPassword } from "@/server/auth/password";
import { pageText } from "../http-client";
import { DEMO_PASSWORD, demoEmail, latestEmail, login, person, signInFully } from "./auth-helpers";

const NEW_PASSWORD = "Harbour-Lights-2026";

function change(client: Awaited<ReturnType<typeof signInFully>>, fields: Record<string, string>) {
  return client.submitForm("/account/password", "password", fields);
}

describe("change password", () => {
  // Other suites sign in as writer.abc with the demo password: put it back afterwards.
  afterAll(async () => {
    await db()
      .update(schema.users)
      .set({ passwordHash: await hashPassword(DEMO_PASSWORD) })
      .where(eq(schema.users.email, demoEmail("writer.abc")));
  });

  it("[E2E-USR-89] the change-password page is for signed-in people only", async () => {
    const res = await person().get("/account/password");
    expect(res.status).toBe(307);
    expect(res.location).toBe("/login");
  });

  it("[E2E-USR-90] a wrong current password is refused", async () => {
    const me = await signInFully("writer.abc");
    const res = await change(me, {
      currentPassword: "Not-My-Password-1",
      newPassword: NEW_PASSWORD,
      confirmPassword: NEW_PASSWORD,
    });
    expect(res.status).toBe(200);
    expect(pageText(res.text)).toContain("Your current password is incorrect.");
  });

  it("[E2E-USR-91] a weak new password is refused", async () => {
    const me = await signInFully("writer.abc");
    const res = await change(me, {
      currentPassword: DEMO_PASSWORD,
      newPassword: "password123",
      confirmPassword: "password123",
    });
    expect(pageText(res.text)).toContain("Choose a stronger password.");
    expect(pageText(res.text)).toContain("too common");
  });

  it("[E2E-USR-92] mismatched new passwords are refused", async () => {
    const me = await signInFully("writer.abc");
    const res = await change(me, {
      currentPassword: DEMO_PASSWORD,
      newPassword: NEW_PASSWORD,
      confirmPassword: `${NEW_PASSWORD}x`,
    });
    expect(pageText(res.text)).toContain("The new passwords don't match.");
  });

  it("[E2E-USR-93] the same password again is refused", async () => {
    const me = await signInFully("writer.abc");
    const res = await change(me, {
      currentPassword: DEMO_PASSWORD,
      newPassword: DEMO_PASSWORD,
      confirmPassword: DEMO_PASSWORD,
    });
    expect(pageText(res.text)).toContain("Choose a password different from your current one.");
  });

  describe("a valid change", () => {
    let me: Awaited<ReturnType<typeof signInFully>>;
    let elsewhere: Awaited<ReturnType<typeof signInFully>>;

    it("[E2E-USR-94] a valid change works", async () => {
      elsewhere = await signInFully("writer.abc");
      me = await signInFully("writer.abc");
      const res = await change(me, {
        currentPassword: DEMO_PASSWORD,
        newPassword: NEW_PASSWORD,
        confirmPassword: NEW_PASSWORD,
      });
      expect(res.status).toBe(200);
      expect(pageText(res.text)).toContain("Password changed.");
    });

    it("[E2E-USR-95] this sign-in stays, others end", async () => {
      expect((await me.get("/dashboard")).status).toBe(200);
      const other = await elsewhere.get("/dashboard");
      expect(other.status).toBe(307);
      expect(other.location).toBe("/login");
    });

    it("[E2E-USR-96] the new password works and the old one does not", async () => {
      const old = await login(person(), "writer.abc", DEMO_PASSWORD);
      expect(old.status).toBe(200);
      expect(pageText(old.text)).toContain("The email or password is incorrect.");
      const fresh = await login(person(), "writer.abc", NEW_PASSWORD);
      expect(fresh.status).toBe(303);
      expect(fresh.location).toBe("/dashboard");
    });

    it("[E2E-USR-97] they are emailed about the change", async () => {
      const mail = await latestEmail(demoEmail("writer.abc"), "password_changed");
      expect(mail?.subject).toBe("Your abcfinance password was changed");
      expect(mail!.body).toContain("signed out everywhere else");
      expect(mail!.body).toContain("contact your administrator");
      expect(mail!.body).toContain("http://localhost:3100/login");
    });
  });
});
