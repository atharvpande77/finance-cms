import { randomBytes } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { parse } from "node-html-parser";
import { beforeAll, describe, expect, it } from "vitest";
import { db, schema } from "@/server/db/client";
import { HttpClient, pageText } from "../http-client";
import { latestEmail, person, userByEmail } from "./auth-helpers";
import {
  emailedLink,
  emailsTo,
  errorOf,
  formsOn,
  freshEmail,
  invite,
  linkPath,
  linkShown,
  orgIdOf,
  sessionFor,
  signInWith,
  throwaway,
  type Throwaway,
} from "./user-helpers";
import { freshInstitution } from "./publishing-helpers";

const NEW_PASSWORD = "Brisk-Monsoon-2027";

/**
 * Password reset is off until email exists (D58). These checks are due in M6, which runs the
 * suite with PASSWORD_RESET=1; until then the "while it is off" block below runs instead.
 */
const RESET = process.env.PASSWORD_RESET === "1";

/** Asks for a reset as a visitor from their own address; returns the page's answer. */
async function forgot(email: string, client: HttpClient = person()) {
  const res = await client.submitForm("/forgot", "forgot", { email });
  return parse(res.text).querySelector("[data-success]")?.textContent.trim() ?? null;
}

const stateOf = async (url: string) =>
  parse((await person().get(linkPath(url))).text)
    .querySelector("[data-link-state]")
    ?.getAttribute("data-link-state");

describe.runIf(RESET)("asking for a reset link", () => {
  it("[E2E-USR-66] the forgot-password page is not cached", async () => {
    const res = await person().get("/forgot");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    expect(res.headers.get("x-robots-tag")).toContain("noindex");
    expect(formsOn(res)).toEqual(["forgot"]);
  });

  let real: Throwaway;
  const unknown = freshEmail("nobody");
  beforeAll(async () => {
    real = await throwaway([{ org: "sample-amc", roles: ["institution_writer"] }]);
  });

  it("[E2E-USR-67] the answer is the same whether or not the address has an account", async () => {
    const forReal = await forgot(real.email);
    const forNobody = await forgot(unknown);
    expect(forReal).toContain("If that address has an abcfinance account");
    expect(forNobody).toBe(forReal);
  });

  it("[E2E-USR-68] only the real account gets an email", async () => {
    expect(await emailsTo(real.email, "password_reset")).toBe(1);
    expect(await emailsTo(unknown, "password_reset")).toBe(0);
  });

  it("[E2E-USR-69] an invalid address gets the same answer and nothing is sent", async () => {
    const before = await db().$count(schema.emailOutbox);
    const answer = await forgot("not an address");
    expect(answer).toBe(await forgot(unknown));
    expect(await db().$count(schema.emailOutbox)).toBe(before);
  });

  it("[E2E-USR-70] the email carries a reset link from the configured site address", async () => {
    const link = await emailedLink(real.email, "password_reset", "reset");
    expect(link.origin).toBe("http://localhost:3100");
    expect(link.body).toContain("60 minutes");
  });

  it("[E2E-USR-71] only the newest link works", async () => {
    const first = await emailedLink(real.email, "password_reset", "reset");
    await forgot(real.email);
    const second = await emailedLink(real.email, "password_reset", "reset");
    expect(second.token).not.toBe(first.token);
    expect(await stateOf(first.url)).toBe("used");
    expect(await stateOf(second.url)).toBe("ok");
  });

  it("[E2E-USR-72] no more than three reset emails an hour go to one address", async () => {
    const someone = await throwaway([{ org: "sample-amc", roles: ["institution_writer"] }]);
    for (let i = 0; i < 5; i++) {
      // From different addresses, so only the per-address limit applies.
      expect(await forgot(someone.email)).toContain("If that address");
    }
    expect(await emailsTo(someone.email, "password_reset")).toBe(3);
  });
});

describe.runIf(RESET)("using a reset link", () => {
  let target: Throwaway;
  let earlier: HttpClient;
  let link: { url: string; token: string };
  /** The reset page as first opened, for replaying its form once the link is spent. */
  let formPage: Awaited<ReturnType<HttpClient["get"]>>;

  beforeAll(async () => {
    target = await throwaway([{ org: "sample-amc", roles: ["institution_writer"] }]);
    earlier = person();
    expect((await signInWith(earlier, target.email, target.password)).location).toBe("/dashboard");
  });

  it("[E2E-USR-73] (set-up) the account is locked after repeated wrong passwords", async () => {
    const attacker = person();
    for (let i = 0; i < 5; i++) await signInWith(attacker, target.email, "Not-The-Password-9");
    const user = await userByEmail(target.email);
    expect(user.lockedUntil!.getTime()).toBeGreaterThan(Date.now());
    const res = await signInWith(person(), target.email, target.password);
    expect(errorOf(res)).toContain("locked");
    await forgot(target.email);
    link = await emailedLink(target.email, "password_reset", "reset");
  });

  it("[E2E-USR-74] the reset page names the account, and is never cached or leaked", async () => {
    const res = await person().get(linkPath(link.url));
    formPage = res;
    expect(parse(res.text).querySelector("[data-account]")!.textContent).toBe(target.email);
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    expect(res.headers.get("x-robots-tag")).toContain("noindex");
  });

  const submit = (fields: Record<string, string>) =>
    person().submitForm(linkPath(link.url), "reset", {
      newPassword: NEW_PASSWORD,
      confirmPassword: NEW_PASSWORD,
      ...fields,
    });

  it("[E2E-USR-75] a weak new password is refused", async () => {
    const res = await submit({ newPassword: "abc", confirmPassword: "abc" });
    expect(errorOf(res)).toContain("stronger password");
    expect(await stateOf(link.url)).toBe("ok");
  });

  it("[E2E-USR-76] mismatched passwords are refused", async () => {
    const res = await submit({ confirmPassword: `${NEW_PASSWORD}!` });
    expect(errorOf(res)).toContain("don't match");
  });

  it("[E2E-USR-77] a good new password is accepted and sends them to sign in", async () => {
    const res = await submit({});
    expect(res.status).toBe(303);
    expect(res.location).toBe("/login?reset=done");
    const login = await person().get("/login?reset=done");
    expect(pageText(login.text)).toContain("Your password was changed");
  });

  it("[E2E-USR-78] the old password no longer works and the new one does", async () => {
    expect(errorOf(await signInWith(person(), target.email, target.password))).toContain(
      "incorrect",
    );
    expect((await signInWith(person(), target.email, NEW_PASSWORD)).location).toBe("/dashboard");
  });

  it("[E2E-USR-79] every earlier sign-in of theirs was ended", async () => {
    const res = await earlier.get("/dashboard");
    expect(res.location).toBe("/login");
  });

  it("[E2E-USR-80] the lockout was cleared by the reset", async () => {
    const user = await userByEmail(target.email);
    expect(user.lockedUntil).toBeNull();
    expect(user.failedLogins).toBe(0);
  });

  it("[E2E-USR-81] the same link cannot be used again", async () => {
    expect(await stateOf(link.url)).toBe("used");
    const res = await person().submitForm(
      linkPath(link.url),
      "reset",
      { newPassword: "Another-Fine-Pass-3", confirmPassword: "Another-Fine-Pass-3" },
      { page: formPage },
    );
    // Refused: the page now says the link is spent, and the password stays as it was.
    expect(res.status).not.toBe(303);
    expect(pageText(res.text)).toContain("This link no longer works");
    expect((await signInWith(person(), target.email, NEW_PASSWORD)).location).toBe("/dashboard");
  });

  it("[E2E-USR-82] they are emailed that the password was changed", async () => {
    const mail = await latestEmail(target.email, "password_changed");
    expect(mail!.subject).toContain("password was changed");
    expect(mail!.body).toContain("signed out everywhere");
  });
});

describe.runIf(RESET)("links that should not work", () => {
  it("[E2E-USR-83] an expired reset link says so", async () => {
    const someone = await throwaway([{ org: "sample-amc", roles: ["institution_writer"] }]);
    await forgot(someone.email);
    const link = await emailedLink(someone.email, "password_reset", "reset");
    await db()
      .update(schema.passwordResets)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(schema.passwordResets.userId, someone.id));
    const page = await person().get(linkPath(link.url));
    expect(
      parse(page.text).querySelector("[data-link-state]")!.getAttribute("data-link-state"),
    ).toBe("expired");
    expect(pageText(page.text)).toContain("expired");
    expect(formsOn(page)).toEqual([]);
  });

  it("[E2E-USR-84] a password reset does not switch off two-step verification", async () => {
    const approver = await throwaway([{ org: "sample-amc", roles: ["institution_approver"] }], {
      twoStep: true,
    });
    await forgot(approver.email);
    const link = await emailedLink(approver.email, "password_reset", "reset");
    const res = await person().submitForm(linkPath(link.url), "reset", {
      newPassword: NEW_PASSWORD,
      confirmPassword: NEW_PASSWORD,
    });
    expect(res.location).toBe("/login?reset=done");
    const user = await userByEmail(approver.email);
    expect(user.totpEnabled).toBe(true);
    expect(user.totpSecretEnc).not.toBeNull();
    expect((await signInWith(person(), approver.email, NEW_PASSWORD)).location).toBe(
      "/login/verify",
    );
  });

  it("[E2E-USR-85] a reset link stops working if the account is deactivated", async () => {
    const someone = await throwaway([{ org: "sample-amc", roles: ["institution_writer"] }]);
    await forgot(someone.email);
    const link = await emailedLink(someone.email, "password_reset", "reset");
    // A tab opened before the account was deactivated.
    const tab = person();
    const stale = await tab.get(linkPath(link.url));
    expect(formsOn(stale)).toEqual(["reset"]);
    await db()
      .update(schema.users)
      .set({ disabledAt: new Date() })
      .where(eq(schema.users.id, someone.id));
    expect(await stateOf(link.url)).toBe("used");
    const before = (await userByEmail(someone.email)).passwordHash;
    const res = await tab.submitForm(
      linkPath(link.url),
      "reset",
      { newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD },
      { page: stale },
    );
    expect(res.status).not.toBe(303);
    expect((await userByEmail(someone.email)).passwordHash).toBe(before);
  });
});

describe("links in email are built from the configured address", () => {
  it.runIf(RESET)(
    "[E2E-USR-98] a forged Host header cannot redirect the link in a reset email",
    async () => {
      const someone = await throwaway([{ org: "sample-amc", roles: ["institution_writer"] }]);
      const forger = new HttpClient({
        "x-forwarded-host": "evil.example",
        "x-real-ip": `10.7.${[...randomBytes(2)].join(".")}`,
      });
      // A forged forwarded host is refused before anything is sent, whatever the Origin says.
      for (const origin of ["http://localhost:3100", "http://evil.example"]) {
        const res = await forger.submitForm(
          "/forgot",
          "forgot",
          { email: someone.email },
          { origin },
        );
        expect(res.status, origin).toBeGreaterThanOrEqual(400);
      }
      expect(await emailsTo(someone.email, "password_reset")).toBe(0);

      // A genuine request's link comes from the configured address, not from the request.
      await forgot(someone.email);
      const link = await emailedLink(someone.email, "password_reset", "reset");
      expect(link.origin).toBe("http://localhost:3100");

      // The same for an invitation.
      const { orgSlug } = await freshInstitution();
      const adminUser = await throwaway([{ org: orgSlug, roles: ["institution_account_admin"] }], {
        twoStep: true,
      });
      const admin = await sessionFor(adminUser.id);
      const email = freshEmail();
      const invitation = linkShown(
        await invite(admin, await orgIdOf(orgSlug), { email, roles: ["institution_writer"] }),
      );
      expect(invitation.origin).toBe("http://localhost:3100");
    },
  );

  it("[E2E-USR-99] the development outbox does not exist in production", async () => {
    const res = await person().get("/dev/outbox");
    expect(res.status).toBe(404);
    expect(res.text).not.toContain("decrypted");
    const latest = await db()
      .select()
      .from(schema.emailOutbox)
      .orderBy(desc(schema.emailOutbox.createdAt))
      .limit(1);
    expect(res.text).not.toContain(latest[0]!.subject);
  });
});

describe.runIf(!RESET)("while password reset is off (D58)", () => {
  it("has no forgot-password or reset pages", async () => {
    for (const path of ["/forgot", "/reset/abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG"]) {
      expect((await person().get(path)).status, path).toBe(404);
    }
  });

  it("offers no forgot-password link at sign-in", async () => {
    const res = await person().get("/login");
    expect(res.text).not.toContain("data-forgot-link");
    expect(pageText(res.text)).not.toContain("Forgot your password?");
  });

  it("gives admins no reset-link button, and sends nothing", async () => {
    const { orgSlug } = await freshInstitution();
    const admin = await throwaway([{ org: orgSlug, roles: ["institution_account_admin"] }], {
      twoStep: true,
    });
    const target = await throwaway([{ org: orgSlug, roles: ["institution_approver"] }], {
      twoStep: true,
    });
    const org = await orgIdOf(orgSlug);
    const client = await sessionFor(admin.id);
    const page = await client.get(`/users/${target.id}?org=${org}`);
    expect(formsOn(page)).not.toContain("resetLink");
    expect(formsOn(page)).toContain("reset2fa");
    const resets = await db()
      .select()
      .from(schema.passwordResets)
      .where(eq(schema.passwordResets.userId, target.id));
    expect(resets).toHaveLength(0);
    expect(await emailsTo(target.email, "password_reset")).toBe(0);
  });
});
