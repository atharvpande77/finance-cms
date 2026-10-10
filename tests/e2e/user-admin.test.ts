import { and, eq, gte, inArray } from "drizzle-orm";
import { parse } from "node-html-parser";
import { beforeAll, describe, expect, it } from "vitest";
import { db, schema } from "@/server/db/client";
import { HttpClient, pageText } from "../http-client";
import { demoEmail, latestEmail, person, userByEmail } from "./auth-helpers";
import {
  emailedLink,
  emailsTo,
  errorOf,
  formsOn,
  freshEmail,
  GOOD_PASSWORD,
  invite,
  linkPath,
  linkShown,
  orgIdOf,
  sessionFor,
  signInWith,
  signedIn,
  throwaway,
  type Throwaway,
} from "./user-helpers";
import { freshInstitution } from "./publishing-helpers";

const started = new Date();
/** Password reset is off until email exists (D58); M6 runs its checks with PASSWORD_RESET=1. */
const RESET = process.env.PASSWORD_RESET === "1";
let adminAmc: HttpClient;
let superAdmin: HttpClient;
let adminAmcId: string;
let superId: string;
let amc: string;
let abc: string;

let orgSlug: string;
const ADMIN_NAME = "Leela Admin";

beforeAll(async () => {
  // An institution of its own, whose only account admin is a throwaway with two-step set up,
  // and a throwaway super admin: no other suite signs these in or changes them.
  orgSlug = (await freshInstitution()).orgSlug;
  amc = await orgIdOf(orgSlug);
  abc = await orgIdOf("abcfinance");
  const admin = await throwaway([{ org: orgSlug, roles: ["institution_account_admin"] }], {
    twoStep: true,
    name: ADMIN_NAME,
  });
  const sup = await throwaway([{ org: "abcfinance", roles: ["abcfinance_super_admin"] }], {
    twoStep: true,
    name: "Sunil Super",
  });
  adminAmcId = admin.id;
  superId = sup.id;
  adminAmc = await sessionFor(adminAmcId);
  superAdmin = await sessionFor(superId);
});

const page = (client: HttpClient, userId: string, org = amc) =>
  client.get(`/users/${userId}?org=${org}`);
const act = (
  client: HttpClient,
  userId: string,
  form: string,
  fields: Record<string, string | string[]> = {},
  opts: { org?: string; page?: Awaited<ReturnType<typeof page>> } = {},
) =>
  client.submitForm(`/users/${userId}?org=${opts.org ?? amc}`, form, fields, { page: opts.page });

async function rolesOf(userId: string, orgId = amc) {
  const rows = await db()
    .select({ role: schema.memberships.role })
    .from(schema.memberships)
    .where(
      and(eq(schema.memberships.userId, userId), eq(schema.memberships.organisationId, orgId)),
    );
  return rows.map((r) => r.role).sort();
}

describe("roles and removal", () => {
  let writer: Throwaway;
  let leaver: Throwaway;
  beforeAll(async () => {
    writer = await throwaway([{ org: orgSlug, roles: ["institution_writer"] }]);
    leaver = await throwaway([{ org: orgSlug, roles: ["institution_writer"] }]);
  });

  it("[E2E-USR-45] an admin can change someone's roles", async () => {
    const res = await act(adminAmc, writer.id, "roles", {
      roles: ["institution_writer", "institution_approver"],
    });
    expect(res.status).toBe(303);
    expect(res.location).toContain("done=roles");
    expect(await rolesOf(writer.id)).toEqual(["institution_approver", "institution_writer"]);
  });

  it("[E2E-USR-46] a role from another kind of organisation is refused", async () => {
    const res = await act(adminAmc, writer.id, "roles", { roles: ["publisher_editor"] });
    expect(errorOf(res)).toContain("isn't a role in an institution");
    expect(await rolesOf(writer.id)).toEqual(["institution_approver", "institution_writer"]);
  });

  it("[E2E-USR-47] an organisation cannot be left without an administrator", async () => {
    const res = await act(superAdmin, adminAmcId, "roles", { roles: ["institution_writer"] });
    expect(errorOf(res)).toContain("must keep at least one active account admin");
    const removed = await act(superAdmin, adminAmcId, "remove");
    expect(errorOf(removed)).toContain("must keep at least one active account admin");
    expect(await rolesOf(adminAmcId)).toEqual(["institution_account_admin"]);
  });

  it("[E2E-USR-48] nobody gets a button to remove themselves, and forcing it is refused", async () => {
    const own = await page(adminAmc, adminAmcId);
    expect(own.status).toBe(200);
    expect(formsOn(own)).not.toContain("remove");
    expect(formsOn(own)).not.toContain("roles");
    const other = await page(adminAmc, writer.id);
    const res = await act(adminAmc, writer.id, "remove", { userId: adminAmcId }, { page: other });
    expect(errorOf(res)).toContain("can't remove yourself");
    expect(await rolesOf(adminAmcId)).toEqual(["institution_account_admin"]);
  });

  it("[E2E-USR-49] an admin can remove someone from the organisation", async () => {
    const res = await act(adminAmc, leaver.id, "remove");
    expect(res.status).toBe(303);
    expect(res.location).toBe(`/users?org=${amc}&done=removed`);
    expect(await rolesOf(leaver.id)).toEqual([]);
    // The account stays, without access (D52).
    const client = await signedIn(leaver.email, leaver.password);
    const dashboard = await client.get("/dashboard");
    expect(parse(dashboard.text).querySelector("[data-no-roles]")).not.toBeNull();
    expect((await client.get("/articles")).status).toBe(403);
  });

  it("[E2E-USR-50] a forged request for someone from another organisation is refused by the server", async () => {
    const writerGi = await userByEmail(demoEmail("writer.gi"));
    const gi = await orgIdOf("sample-general-insurer");
    const before = await rolesOf(writerGi.id, gi);
    const form = await page(adminAmc, writer.id);
    const res = await act(
      adminAmc,
      writer.id,
      "roles",
      { userId: writerGi.id, roles: ["institution_approver"] },
      { page: form },
    );
    expect(errorOf(res)).toBe("Person not found.");
    const res2 = await act(
      adminAmc,
      writer.id,
      "roles",
      { org: gi, userId: writerGi.id, roles: ["institution_approver"] },
      { page: form },
    );
    expect(errorOf(res2)).toBe("Person not found.");
    expect(await rolesOf(writerGi.id, gi)).toEqual(before);
    expect((await page(adminAmc, writerGi.id, gi)).status).toBe(404);
  });
});

describe("deactivating an account", () => {
  let target: Throwaway;
  let theirs: HttpClient;
  let superPage: Awaited<ReturnType<typeof page>>;

  it("[E2E-USR-51] (set-up) the throwaway writer is signed in", async () => {
    target = await throwaway([{ org: orgSlug, roles: ["institution_writer"] }]);
    theirs = await signedIn(target.email, target.password);
    expect((await theirs.get("/dashboard")).status).toBe(200);
  });

  it("[E2E-USR-52] an org admin has no deactivate button", async () => {
    expect(formsOn(await page(adminAmc, target.id))).not.toContain("deactivate");
  });

  it("[E2E-USR-53] an org admin cannot deactivate even by calling the service", async () => {
    superPage = await page(superAdmin, target.id);
    const res = await act(adminAmc, target.id, "deactivate", {}, { page: superPage });
    // Refused by the service (the admin's own page has no such form to show the message on).
    expect(res.status).not.toBe(303);
    expect(res.location).toBeNull();
    expect((await userByEmail(target.email)).disabledAt).toBeNull();
  });

  it("[E2E-USR-54] a super admin has the button", async () => {
    expect(formsOn(superPage)).toContain("deactivate");
  });

  it("[E2E-USR-55] deactivating signs the person out everywhere at once", async () => {
    const second = await signedIn(target.email, target.password);
    const res = await act(superAdmin, target.id, "deactivate");
    expect(res.status).toBe(303);
    expect(res.location).toContain("done=deactivate");
    for (const client of [theirs, second]) {
      expect((await client.get("/dashboard")).location).toBe("/login");
    }
    const sessions = await db()
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.userId, target.id));
    expect(sessions).toHaveLength(0);
  });

  it("[E2E-USR-56] they are told the account is deactivated, after giving the right password", async () => {
    const res = await signInWith(person(), target.email, target.password);
    expect(errorOf(res)).toContain("deactivated");
  });

  it("[E2E-USR-57] a wrong password still gets the ordinary message, so this does not reveal who has an account", async () => {
    const wrong = errorOf(await signInWith(person(), target.email, "Wrong-Password-77"));
    const nobody = errorOf(await signInWith(person(), freshEmail(), "Wrong-Password-77"));
    expect(wrong).toBe("The email or password is incorrect.");
    expect(nobody).toBe(wrong);
  });

  it.runIf(RESET)("[E2E-USR-58] no reset email is sent to a deactivated account", async () => {
    const answer = await person().submitForm("/forgot", "forgot", { email: target.email });
    expect(pageText(answer.text)).toContain("If that address has an abcfinance account");
    expect(await emailsTo(target.email, "password_reset")).toBe(0);
  });

  it("[E2E-USR-59] reactivating lets them sign in again", async () => {
    const res = await act(superAdmin, target.id, "reactivate");
    expect(res.location).toContain("done=reactivate");
    expect((await signInWith(person(), target.email, target.password)).location).toBe("/dashboard");
  });

  it("[E2E-USR-60] a super admin gets no button to deactivate themselves", async () => {
    const own = await page(superAdmin, superId, abc);
    expect(own.status).toBe(200);
    expect(formsOn(own)).not.toContain("deactivate");
    const res = await act(
      superAdmin,
      target.id,
      "deactivate",
      { userId: superId, org: abc },
      { page: superPage },
    );
    expect(errorOf(res)).toContain("can't deactivate yourself");
    const [me] = await db().select().from(schema.users).where(eq(schema.users.id, superId));
    expect(me!.disabledAt).toBeNull();
  });
});

describe("resetting two-step verification", () => {
  let lost: Throwaway;
  let theirs: HttpClient;
  beforeAll(async () => {
    lost = await throwaway([{ org: orgSlug, roles: ["institution_approver"] }], {
      twoStep: true,
    });
    theirs = await sessionFor(lost.id);
  });

  it("[E2E-USR-61] an admin can reset two-step verification for someone who lost their phone", async () => {
    const form = await page(adminAmc, lost.id);
    expect(formsOn(form)).toContain("reset2fa");
    const res = await act(adminAmc, lost.id, "reset2fa", {}, { page: form });
    expect(res.status).toBe(303);
    expect(res.location).toContain("done=reset2fa");
    const user = await userByEmail(lost.email);
    expect(user.totpEnabled).toBe(false);
    expect(user.totpSecretEnc).toBeNull();
  });

  it("[E2E-USR-62] their sessions end and they are emailed about it", async () => {
    expect((await theirs.get("/dashboard")).location).toBe("/login");
    const mail = await latestEmail(lost.email, "two_step_reset");
    expect(mail!.body).toContain(ADMIN_NAME);
    expect(mail!.body).toContain("set it up again");
  });

  it("[E2E-USR-63] at the next sign-in they are asked to set it up again", async () => {
    const res = await signInWith(person(), lost.email, lost.password);
    expect(res.location).toBe("/account/security");
  });

  it("[E2E-USR-64] nobody can reset their own two-step", async () => {
    expect(formsOn(await page(adminAmc, adminAmcId))).not.toContain("reset2fa");
    const other = await throwaway([{ org: orgSlug, roles: ["institution_approver"] }], {
      twoStep: true,
    });
    const form = await page(adminAmc, other.id);
    const res = await act(adminAmc, other.id, "reset2fa", { userId: adminAmcId }, { page: form });
    expect(errorOf(res)).toContain("can't reset your own");
    const [me] = await db().select().from(schema.users).where(eq(schema.users.id, adminAmcId));
    expect(me!.totpEnabled).toBe(true);
  });

  it("[E2E-USR-65] someone who has not set it up gets a clear message", async () => {
    const fresh = await throwaway([{ org: orgSlug, roles: ["institution_writer"] }]);
    expect(formsOn(await page(adminAmc, fresh.id))).not.toContain("reset2fa");
    const other = await throwaway([{ org: orgSlug, roles: ["institution_approver"] }], {
      twoStep: true,
    });
    const form = await page(adminAmc, other.id);
    const res = await act(adminAmc, other.id, "reset2fa", { userId: fresh.id }, { page: form });
    expect(errorOf(res)).toContain("hasn't set up two-step verification");
  });
});

describe.runIf(RESET)("an admin sends a reset link", () => {
  let target: Throwaway;
  let response: Awaited<ReturnType<typeof act>>;
  beforeAll(async () => {
    target = await throwaway([{ org: orgSlug, roles: ["institution_writer"] }]);
  });

  it("[E2E-USR-86] an admin can send a reset link, and it goes to the person's own email", async () => {
    response = await act(adminAmc, target.id, "resetLink");
    expect(response.status).toBe(303);
    const link = await emailedLink(target.email, "password_reset", "reset");
    expect(link.body).toContain(`${ADMIN_NAME}, an administrator`);
    expect(await emailsTo(target.email, "password_reset")).toBe(1);
  });

  it("[E2E-USR-87] the admin never sees the link", async () => {
    const { token } = await emailedLink(target.email, "password_reset", "reset");
    expect(response.text).not.toContain(token);
    expect(response.location).not.toContain(token);
    const after = await adminAmc.get(response.location!);
    expect(after.text).not.toContain(token);
    expect(pageText(after.text)).toContain("A reset link was emailed to them");
  });
});

describe("reset links and other organisations", () => {
  it("[E2E-USR-88] an org admin gets no such button for someone who also belongs elsewhere", async () => {
    const both = await throwaway([
      { org: orgSlug, roles: ["institution_writer"] },
      { org: "sample-general-insurer", roles: ["institution_writer"] },
    ]);
    expect(formsOn(await page(adminAmc, both.id))).not.toContain("resetLink");
    expect(formsOn(await page(superAdmin, both.id))).toContain("resetLink");
  });
});

describe("the audit trail", () => {
  it("[E2E-USR-100] every one of those actions is in the audit trail", async () => {
    // The invitation and reset flows too, end to end, so this suite sees each action itself.
    const email = freshEmail();
    await invite(adminAmc, amc, { email, roles: ["institution_writer"] });
    const [first] = await db()
      .select()
      .from(schema.invitations)
      .where(eq(schema.invitations.email, email));
    const { url } = linkShown(
      await adminAmc.submitForm(`/users?org=${amc}`, `resend-${first!.id}`),
    );
    await person().submitForm(linkPath(url), "accept", {
      name: "Audit Person",
      newPassword: GOOD_PASSWORD,
      confirmPassword: GOOD_PASSWORD,
    });
    const withdrawn = freshEmail();
    await invite(adminAmc, amc, { email: withdrawn, roles: ["institution_writer"] });
    const [w] = await db()
      .select()
      .from(schema.invitations)
      .where(eq(schema.invitations.email, withdrawn));
    await adminAmc.submitForm(`/users?org=${amc}`, `withdraw-${w!.id}`);
    if (RESET) {
      const resetter = await throwaway([{ org: orgSlug, roles: ["institution_writer"] }]);
      await person().submitForm("/forgot", "forgot", { email: resetter.email });
      const reset = await emailedLink(resetter.email, "password_reset", "reset");
      await person().submitForm(linkPath(reset.url), "reset", {
        newPassword: "Steady-Current-2028",
        confirmPassword: "Steady-Current-2028",
      });
    }

    const actions = [
      "user.invited",
      "invitation.resent",
      "invitation.accepted",
      "invitation.withdrawn",
      "user.roles_changed",
      "user.removed",
      "user.deactivated",
      "user.reactivated",
      "user.2fa_reset",
      // Password reset exists only once email does (D58).
      ...(RESET ? ["user.reset_link_sent", "auth.reset_requested", "auth.password_reset"] : []),
    ];
    const rows = await db()
      .select({
        action: schema.auditEvents.action,
        userId: schema.auditEvents.userId,
        ip: schema.auditEvents.ip,
      })
      .from(schema.auditEvents)
      .where(
        and(
          inArray(schema.auditEvents.action, actions),
          gte(schema.auditEvents.createdAt, started),
        ),
      );
    expect([...new Set(rows.map((r) => r.action))].sort()).toEqual([...actions].sort());
    // Admin actions name who did them.
    expect(
      rows.filter((r) => r.action === "user.deactivated").every((r) => r.userId === superId),
    ).toBe(true);
    expect(rows.every((r) => r.ip)).toBe(true);
  });
});
