/**
 * Reset links an admin makes and sends on themselves while there is no email (D59). With email
 * (PASSWORD_RESET=1) the admin's links are emailed instead: see password-reset.test.ts and
 * E2E-USR-86/87.
 */
import { eq } from "drizzle-orm";
import { parse } from "node-html-parser";
import { beforeAll, describe, expect, it } from "vitest";
import { db, schema } from "@/server/db/client";
import { HttpClient, pageText } from "../http-client";
import { person, userByEmail } from "./auth-helpers";
import { freshInstitution } from "./publishing-helpers";
import {
  emailsTo,
  errorOf,
  formsOn,
  linkPath,
  orgIdOf,
  sessionFor,
  signInWith,
  signedIn,
  throwaway,
  type Throwaway,
} from "./user-helpers";

const COPY_MODE = process.env.PASSWORD_RESET !== "1";
const NEW_PASSWORD = "Amber-Lighthouse-2029";

let orgSlug: string;
let orgId: string;
let admin: Throwaway;
let adminClient: HttpClient;
let superClient: HttpClient;

beforeAll(async () => {
  if (!COPY_MODE) return;
  orgSlug = (await freshInstitution()).orgSlug;
  orgId = await orgIdOf(orgSlug);
  admin = await throwaway([{ org: orgSlug, roles: ["institution_account_admin"] }], {
    twoStep: true,
    name: "Rekha Admin",
  });
  const sup = await throwaway([{ org: "abcfinance", roles: ["abcfinance_super_admin"] }], {
    twoStep: true,
  });
  adminClient = await sessionFor(admin.id);
  superClient = await sessionFor(sup.id);
});

/** Someone in this suite's institution. */
const newPerson = (roles: Parameters<typeof throwaway>[0][number]["roles"], twoStep = false) =>
  throwaway([{ org: orgSlug, roles }], { twoStep });

/** Asks for a link as `client` on the person's page; returns the response and the link shown. */
async function makeLink(client: HttpClient, userId: string) {
  const res = await client.submitForm(`/users/${userId}?org=${orgId}`, "resetLink");
  const link = parse(res.text).querySelector("[data-reset-link]")?.textContent.trim() ?? null;
  return { res, link };
}

const stateOf = async (link: string) =>
  parse((await person().get(linkPath(link))).text)
    .querySelector("[data-link-state]")
    ?.getAttribute("data-link-state");

describe.runIf(COPY_MODE)("an admin makes a reset link (D59)", () => {
  let target: Throwaway;
  let link: string;
  let earlier: HttpClient;

  beforeAll(async () => {
    target = await newPerson(["institution_approver"], true);
    earlier = await sessionFor(target.id);
  });

  it("offers 'Get a password reset link' and shows the link, sending nothing", async () => {
    const page = await adminClient.get(`/users/${target.id}?org=${orgId}`);
    expect(formsOn(page)).toContain("resetLink");
    expect(pageText(page.text)).toContain("Get a password reset link");
    const made = await makeLink(adminClient, target.id);
    expect(made.res.status).toBe(200);
    expect(made.link).toMatch(/^http:\/\/localhost:3100\/reset\/[A-Za-z0-9_-]{43}$/);
    expect(pageText(made.res.text)).toContain("Send this link to Test Person yourself");
    link = made.link!;
    expect(await emailsTo(target.email, "password_reset")).toBe(0);
    const [row] = await db()
      .select()
      .from(schema.passwordResets)
      .where(eq(schema.passwordResets.userId, target.id));
    expect(row!.requestedById).toBe(admin.id);
    expect(row!.tokenHash).not.toContain(link.split("/").pop()!);
    const audits = await db()
      .select()
      .from(schema.auditEvents)
      .where(eq(schema.auditEvents.action, "user.reset_link_created"));
    expect(audits.some((a) => a.userId === admin.id && a.detail.targetUserId === target.id)).toBe(
      true,
    );
  });

  it("the link page names the account and the admin, and is never cached or leaked", async () => {
    const res = await person().get(linkPath(link));
    const page = parse(res.text);
    expect(page.querySelector("[data-account]")!.textContent).toBe(target.email);
    expect(page.querySelector("[data-made-by]")!.textContent).toBe("Rekha Admin");
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    expect(res.headers.get("x-robots-tag")).toContain("noindex");
  });

  it("refuses weak and mismatched passwords", async () => {
    const weak = await person().submitForm(linkPath(link), "reset", {
      newPassword: "abc",
      confirmPassword: "abc",
    });
    expect(errorOf(weak)).toContain("stronger password");
    const mismatch = await person().submitForm(linkPath(link), "reset", {
      newPassword: NEW_PASSWORD,
      confirmPassword: `${NEW_PASSWORD}!`,
    });
    expect(errorOf(mismatch)).toContain("don't match");
    expect(await stateOf(link)).toBe("ok");
  });

  it("sets the password, ends their sessions, clears a lockout and keeps two-step", async () => {
    await db()
      .update(schema.users)
      .set({ failedLogins: 3, lockedUntil: new Date(Date.now() + 600_000) })
      .where(eq(schema.users.id, target.id));
    const res = await person().submitForm(linkPath(link), "reset", {
      newPassword: NEW_PASSWORD,
      confirmPassword: NEW_PASSWORD,
    });
    expect(res.location).toBe("/login?reset=done");
    expect((await earlier.get("/dashboard")).location).toBe("/login");
    const user = await userByEmail(target.email);
    expect(user.lockedUntil).toBeNull();
    expect(user.failedLogins).toBe(0);
    expect(user.totpEnabled).toBe(true);
    expect(errorOf(await signInWith(person(), target.email, target.password))).toContain(
      "incorrect",
    );
    // Two-step still applies: the new password leads to the code step.
    expect((await signInWith(person(), target.email, NEW_PASSWORD)).location).toBe("/login/verify");
  });

  it("works once", async () => {
    expect(await stateOf(link)).toBe("used");
  });

  it("tells the person on their dashboard", async () => {
    const client = await sessionFor(target.id);
    const notice = parse((await client.get("/dashboard")).text).querySelector(
      "[data-reset-notice]",
    );
    expect(notice!.textContent).toContain("with a link from Rekha Admin");
  });
});

describe.runIf(COPY_MODE)("links that stop working", () => {
  it("a newer link kills the older one", async () => {
    const target = await newPerson(["institution_writer"]);
    const first = (await makeLink(adminClient, target.id)).link!;
    const second = (await makeLink(adminClient, target.id)).link!;
    expect(await stateOf(first)).toBe("used");
    expect(await stateOf(second)).toBe("ok");
  });

  it("an expired link says so", async () => {
    const target = await newPerson(["institution_writer"]);
    const link = (await makeLink(adminClient, target.id)).link!;
    await db()
      .update(schema.passwordResets)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(schema.passwordResets.userId, target.id));
    expect(await stateOf(link)).toBe("expired");
  });

  it("deactivating the account stops it", async () => {
    const target = await newPerson(["institution_writer"]);
    const link = (await makeLink(adminClient, target.id)).link!;
    await db()
      .update(schema.users)
      .set({ disabledAt: new Date() })
      .where(eq(schema.users.id, target.id));
    expect(await stateOf(link)).toBe("used");
  });

  it("nobody makes a reset link for themselves", async () => {
    const own = await adminClient.get(`/users/${admin.id}?org=${orgId}`);
    expect(formsOn(own)).not.toContain("resetLink");
  });
});

describe.runIf(COPY_MODE)("one admin can't do both within 24 hours (D59)", () => {
  it("after a two-step reset, an institution admin can't make a reset link", async () => {
    const target = await newPerson(["institution_approver"], true);
    const reset = await adminClient.submitForm(`/users/${target.id}?org=${orgId}`, "reset2fa");
    expect(reset.location).toContain("done=reset2fa");
    const made = await makeLink(adminClient, target.id);
    expect(made.link).toBeNull();
    expect(errorOf(made.res)).toContain("two-step verification was reset in the last 24 hours");
    // The super admin can.
    expect((await makeLink(superClient, target.id)).link).not.toBeNull();
  });

  it("after a reset link, an institution admin can't reset two-step", async () => {
    const target = await newPerson(["institution_approver"], true);
    expect((await makeLink(adminClient, target.id)).link).not.toBeNull();
    const res = await adminClient.submitForm(`/users/${target.id}?org=${orgId}`, "reset2fa");
    expect(errorOf(res)).toContain("A reset link was made for this person in the last 24 hours");
    expect((await userByEmail(target.email)).totpEnabled).toBe(true);
    // The super admin can.
    const sup = await superClient.submitForm(`/users/${target.id}?org=${orgId}`, "reset2fa");
    expect(sup.location).toContain("done=reset2fa");
  });
});

describe.runIf(COPY_MODE)("signing in afterwards", () => {
  it("a writer without two-step signs straight in with the new password", async () => {
    const target = await newPerson(["institution_writer"]);
    const link = (await makeLink(adminClient, target.id)).link!;
    await person().submitForm(linkPath(link), "reset", {
      newPassword: NEW_PASSWORD,
      confirmPassword: NEW_PASSWORD,
    });
    const client = await signedIn(target.email, NEW_PASSWORD);
    expect(
      parse((await client.get("/dashboard")).text).querySelector("[data-reset-notice]"),
    ).not.toBeNull();
  });
});
