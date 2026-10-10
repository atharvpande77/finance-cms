import { and, eq } from "drizzle-orm";
import { parse } from "node-html-parser";
import { beforeAll, describe, expect, it } from "vitest";
import { db, schema } from "@/server/db/client";
import { sha256 } from "@/server/crypto/hash";
import { HttpClient, pageText } from "../http-client";
import { demoEmail, menuLinks, person, signInFully, userByEmail } from "./auth-helpers";
import {
  emailedLink,
  errorOf,
  formsOn,
  freshEmail,
  GOOD_PASSWORD,
  invite,
  linkPath,
  orgIdOf,
  signInWith,
  throwaway,
} from "./user-helpers";

let adminAmc: HttpClient;
let superAdmin: HttpClient;
let amc: string;

beforeAll(async () => {
  [adminAmc, superAdmin] = (await Promise.all(["admin.amc", "super.abc"].map(signInFully))) as [
    HttpClient,
    HttpClient,
  ];
  amc = await orgIdOf("sample-amc");
});

const invitationsTo = (email: string) =>
  db().select().from(schema.invitations).where(eq(schema.invitations.email, email));

describe("who sees the Users page", () => {
  it("[E2E-USR-01] an institution's account admin sees their own organisation's people", async () => {
    const res = await adminAmc.get("/users");
    expect(res.status).toBe(200);
    expect(parse(res.text).querySelector("[data-users-org]")!.getAttribute("data-users-org")).toBe(
      amc,
    );
    expect(res.text).toContain(demoEmail("writer.amc"));
    expect(res.text).not.toContain(demoEmail("writer.gi"));
    expect(parse(res.text).querySelector("[data-org-switcher]")).toBeNull();
    const gi = await orgIdOf("sample-general-insurer");
    expect((await adminAmc.get(`/users?org=${gi}`)).status).toBe(403);
  });

  it("[E2E-USR-02] a super admin sees every organisation", async () => {
    const res = await superAdmin.get("/users");
    const links = parse(res.text).querySelectorAll("[data-org-switcher] a");
    const orgs = await db().select().from(schema.organisations);
    expect(links).toHaveLength(orgs.length);
    const gi = await orgIdOf("sample-general-insurer");
    const giPage = await superAdmin.get(`/users?org=${gi}`);
    expect(giPage.status).toBe(200);
    expect(giPage.text).toContain(demoEmail("writer.gi"));
  });

  it("[E2E-USR-03] a writer cannot open it", async () => {
    const writer = await signInFully("writer.amc");
    expect((await writer.get("/users")).status).toBe(403);
  });

  it("[E2E-USR-04] neither can an approver, an editor or a publisher admin", async () => {
    for (const handle of ["approver.amc", "editor.abc", "admin.tb"]) {
      const client = await signInFully(handle);
      expect((await client.get("/users")).status, handle).toBe(403);
    }
  });

  it("[E2E-USR-05] the Users link appears for administrators only", async () => {
    expect(menuLinks(await adminAmc.get("/dashboard"))).toContain("/users");
    expect(menuLinks(await superAdmin.get("/dashboard"))).toContain("/users");
    for (const handle of ["writer.gi", "compliance.gi", "desk.abc", "editor.tb"]) {
      const client = await signInFully(handle);
      expect(menuLinks(await client.get("/dashboard")), handle).not.toContain("/users");
    }
  });
});

describe("sending an invitation", () => {
  const email = freshEmail("invitee");
  let response: Awaited<ReturnType<typeof invite>>;

  beforeAll(async () => {
    response = await invite(adminAmc, amc, {
      email,
      roles: ["institution_writer"],
      name: "Nisha Rao",
    });
  });

  it("[E2E-USR-06] an invitation is sent", async () => {
    expect(response.status).toBe(200);
    expect(parse(response.text).querySelector("[data-invited]")!.getAttribute("data-invited")).toBe(
      email,
    );
    expect(await invitationsTo(email)).toHaveLength(1);
  });

  it("[E2E-USR-07] it is stored with the roles and a one-week expiry", async () => {
    const [row] = await invitationsTo(email);
    expect(row).toMatchObject({
      organisationId: amc,
      roles: ["institution_writer"],
      nameHint: "Nisha Rao",
    });
    const week = Date.now() + 7 * 86_400_000;
    expect(Math.abs(row!.expiresAt.getTime() - week)).toBeLessThan(5 * 60_000);
    expect(row!.acceptedAt).toBeNull();
    expect(row!.revokedAt).toBeNull();
  });

  it("[E2E-USR-08] an email to that address carries the invitation link, from the configured site address", async () => {
    const link = await emailedLink(email, "invitation", "invite");
    expect(link.origin).toBe("http://localhost:3100");
    expect(link.body).toContain("Sample AMC");
    expect(link.body).toContain("Institution writer");
  });

  it("[E2E-USR-09] only the link's hash is stored, never the token", async () => {
    const { token } = await emailedLink(email, "invitation", "invite");
    const [row] = await invitationsTo(email);
    expect(row!.tokenHash).toBe(sha256(token));
    expect(JSON.stringify(row)).not.toContain(token);
  });

  it("[E2E-USR-10] with no email service, the sender is shown the link (and only the sender)", async () => {
    const { url, token } = await emailedLink(email, "invitation", "invite");
    expect(parse(response.text).querySelector("[data-invite-link]")!.textContent).toBe(url);
    // Not on the page afterwards, for the sender or any other admin.
    expect((await adminAmc.get(`/users?org=${amc}`)).text).not.toContain(token);
    expect((await superAdmin.get(`/users?org=${amc}`)).text).not.toContain(token);
  });

  it("[E2E-USR-11] a malformed email is refused", async () => {
    const res = await invite(adminAmc, amc, {
      email: "not-an-address",
      roles: ["institution_writer"],
    });
    expect(errorOf(res)).toContain("valid email");
    expect(await invitationsTo("not-an-address")).toHaveLength(0);
  });

  it("[E2E-USR-12] an invitation needs a role", async () => {
    const other = freshEmail();
    const res = await invite(adminAmc, amc, { email: other, roles: [] });
    expect(errorOf(res)).toContain("at least one role");
    expect(await invitationsTo(other)).toHaveLength(0);
  });

  it("[E2E-USR-13] a role from another kind of organisation is refused", async () => {
    const other = freshEmail();
    const res = await invite(adminAmc, amc, { email: other, roles: ["publisher_editor"] });
    expect(errorOf(res)).toContain("isn't a role in an institution");
    expect(await invitationsTo(other)).toHaveLength(0);
  });

  it("[E2E-USR-14] an account admin cannot invite into another organisation", async () => {
    const other = freshEmail();
    const gi = await orgIdOf("sample-general-insurer");
    const res = await invite(adminAmc, amc, {
      email: other,
      roles: ["institution_writer"],
      org: gi,
    });
    expect(errorOf(res)).toContain("can't invite people into that organisation");
    expect(await invitationsTo(other)).toHaveLength(0);
  });

  it("[E2E-USR-15] or into a newspaper or abcfinance", async () => {
    for (const [slug, role] of [
      ["tarun-bharat", "publisher_editor"],
      ["abcfinance", "abcfinance_writer"],
    ] as const) {
      const other = freshEmail();
      const res = await invite(adminAmc, amc, {
        email: other,
        roles: [role],
        org: await orgIdOf(slug),
      });
      expect(errorOf(res), slug).toContain("can't invite people into that organisation");
      expect(await invitationsTo(other)).toHaveLength(0);
    }
  });

  it("[E2E-USR-16] inviting someone who already has those roles is refused", async () => {
    const res = await invite(adminAmc, amc, {
      email: demoEmail("writer.amc"),
      roles: ["institution_writer"],
    });
    expect(errorOf(res)).toContain("already has those roles");
  });

  it("[E2E-USR-17] a super admin can invite into a newspaper's organisation", async () => {
    const other = freshEmail();
    const tb = await orgIdOf("tarun-bharat");
    const res = await invite(superAdmin, tb, { email: other, roles: ["publisher_editor"] });
    expect(parse(res.text).querySelector("[data-invited]")).not.toBeNull();
    expect((await invitationsTo(other))[0]).toMatchObject({
      organisationId: tb,
      roles: ["publisher_editor"],
    });
  });

  it("[E2E-USR-18] a second invitation to the same address replaces the first", async () => {
    const other = freshEmail();
    await invite(adminAmc, amc, { email: other, roles: ["institution_writer"] });
    const first = await emailedLink(other, "invitation", "invite");
    await invite(adminAmc, amc, { email: other, roles: ["institution_approver"] });
    const rows = await invitationsTo(other);
    expect(rows).toHaveLength(2);
    expect(rows.filter((r) => r.revokedAt === null).map((r) => r.roles)).toEqual([
      ["institution_approver"],
    ]);
    const old = await person().get(linkPath(first.url));
    expect(
      parse(old.text).querySelector("[data-link-state]")!.getAttribute("data-link-state"),
    ).toBe("used");
  });
});

describe("accepting an invitation as a new person", () => {
  const email = freshEmail("newcomer");
  let link: string;
  let invitee: HttpClient;

  beforeAll(async () => {
    await invite(adminAmc, amc, { email, roles: ["institution_writer"], name: "Kavya Iyer" });
    link = linkPath((await emailedLink(email, "invitation", "invite")).url);
    invitee = person();
  });

  const accept = (fields: Record<string, string>) =>
    invitee.submitForm(link, "accept", {
      name: "Kavya Iyer",
      newPassword: GOOD_PASSWORD,
      confirmPassword: GOOD_PASSWORD,
      ...fields,
    });

  it("[E2E-USR-19] the invitation page shows what is being offered, and nothing else", async () => {
    const res = await invitee.get(link);
    expect(res.status).toBe(200);
    const offer = parse(res.text).querySelector("[data-offer]")!;
    expect(offer.textContent).toContain(email);
    expect(offer.textContent).toContain("Aditya Admin (AMC)");
    expect(parse(res.text).querySelector("h1")!.textContent).toContain("Sample AMC");
    expect(
      parse(res.text)
        .querySelectorAll("[data-offered-role]")
        .map((r) => r.getAttribute("data-offered-role")),
    ).toEqual(["institution_writer"]);
    // No panel, no one else's details.
    expect(res.text).not.toContain("data-panel-menu");
    expect(res.text).not.toContain(demoEmail("admin.amc"));
    expect(formsOn(res)).toEqual(["accept"]);
  });

  it("[E2E-USR-20] the link page is never cached and does not leak itself through the Referer header", async () => {
    const res = await invitee.get(link);
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    expect(res.headers.get("x-robots-tag")).toContain("noindex");
  });

  it("[E2E-USR-21] a made-up link shows a plain 'not valid' page", async () => {
    const res = await person().get("/invite/made-up-token-that-does-not-exist-123");
    expect(res.status).toBe(200);
    expect(
      parse(res.text).querySelector("[data-link-state]")!.getAttribute("data-link-state"),
    ).toBe("invalid");
    expect(pageText(res.text)).toContain("This link isn't valid");
    expect(formsOn(res)).toEqual([]);
  });

  it("[E2E-USR-22] a weak password is refused", async () => {
    const res = await accept({ newPassword: "short1", confirmPassword: "short1" });
    expect(errorOf(res)).toContain("stronger password");
    expect(parse(res.text).querySelector("[data-problems]")!.textContent).toContain("at least 10");
  });

  it("[E2E-USR-23] a common password is refused", async () => {
    const res = await accept({ newPassword: "Password123", confirmPassword: "Password123" });
    expect(parse(res.text).querySelector("[data-problems]")!.textContent).toContain("too common");
  });

  it("[E2E-USR-24] a password containing their email name is refused", async () => {
    const local = email.split("@")[0]!;
    const pw = `${local}-X9`;
    const res = await accept({ newPassword: pw, confirmPassword: pw });
    expect(parse(res.text).querySelector("[data-problems]")!.textContent).toContain("email name");
  });

  it("[E2E-USR-25] two different passwords are refused", async () => {
    const res = await accept({ confirmPassword: `${GOOD_PASSWORD}x` });
    expect(errorOf(res)).toContain("don't match");
  });

  it("[E2E-USR-26] a missing name is refused", async () => {
    const res = await accept({ name: "  " });
    expect(errorOf(res)).toContain("Enter your name");
    expect(
      await db().select().from(schema.users).where(eq(schema.users.email, email)),
    ).toHaveLength(0);
  });

  it("[E2E-USR-27] accepting creates the account and signs them in", async () => {
    const res = await accept({});
    expect(res.status).toBe(303);
    expect(res.location).toBe("/dashboard");
    expect(invitee.cookie("abc_session")).toBeDefined();
  });

  it("[E2E-USR-28] they land on a dashboard with the invited role", async () => {
    const res = await invitee.get("/dashboard");
    expect(res.status).toBe(200);
    expect(pageText(res.text)).toContain("Institution writer");
    expect(pageText(res.text)).toContain("Sample AMC");
  });

  it("[E2E-USR-29] the account has exactly the invited roles, and the invitation is marked used", async () => {
    const user = await userByEmail(email);
    expect(user.name).toBe("Kavya Iyer");
    const roles = await db()
      .select()
      .from(schema.memberships)
      .where(eq(schema.memberships.userId, user.id));
    expect(roles.map((r) => [r.organisationId, r.role])).toEqual([[amc, "institution_writer"]]);
    const [row] = await invitationsTo(email);
    expect(row!.acceptedAt).not.toBeNull();
  });

  it("[E2E-USR-30] the link cannot be used a second time", async () => {
    const page = await person().get(link);
    expect(
      parse(page.text).querySelector("[data-link-state]")!.getAttribute("data-link-state"),
    ).toBe("used");
    expect(formsOn(page)).toEqual([]);
  });

  it("[E2E-USR-31] they can sign in with the password they chose", async () => {
    const res = await signInWith(person(), email, GOOD_PASSWORD);
    expect(res.location).toBe("/dashboard");
  });

  it("[E2E-USR-32] signing in is recorded as their last sign-in", async () => {
    const user = await userByEmail(email);
    expect(Date.now() - user.lastSignInAt!.getTime()).toBeLessThan(5 * 60_000);
    const page = await adminAmc.get(`/users?org=${amc}`);
    const row = parse(page.text).querySelector(`[data-person="${user.id}"]`)!;
    expect(row.querySelector("[data-last-sign-in]")!.getAttribute("data-last-sign-in")).not.toBe(
      "",
    );
  });
});

describe("expired, re-sent and withdrawn invitations", () => {
  it("[E2E-USR-33] an expired invitation says so and cannot be accepted", async () => {
    const email = freshEmail();
    await invite(adminAmc, amc, { email, roles: ["institution_writer"] });
    const { url } = await emailedLink(email, "invitation", "invite");
    await db()
      .update(schema.invitations)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(schema.invitations.email, email));
    const client = person();
    const page = await client.get(linkPath(url));
    expect(
      parse(page.text).querySelector("[data-link-state]")!.getAttribute("data-link-state"),
    ).toBe("expired");
    expect(pageText(page.text)).toContain("expired");
    expect(formsOn(page)).toEqual([]);
  });

  it("[E2E-USR-34] the admin sees it marked expired, and can send it again", async () => {
    const email = freshEmail();
    await invite(adminAmc, amc, { email, roles: ["institution_writer"] });
    await db()
      .update(schema.invitations)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(schema.invitations.email, email));
    const [row] = await invitationsTo(email);
    const page = await adminAmc.get(`/users?org=${amc}`);
    const item = parse(page.text).querySelector(`[data-invitation="${row!.id}"]`)!;
    expect(item.getAttribute("data-expired")).toBe("true");
    expect(item.textContent).toContain("Expired");
    expect(formsOn(page)).toContain(`resend-${row!.id}`);
  });

  it("[E2E-USR-35] sending again gives a new link, and the old one stays dead", async () => {
    const email = freshEmail();
    await invite(adminAmc, amc, { email, roles: ["institution_writer"] });
    const old = await emailedLink(email, "invitation", "invite");
    const [row] = await invitationsTo(email);
    const res = await adminAmc.submitForm(`/users?org=${amc}`, `resend-${row!.id}`);
    expect(parse(res.text).querySelector("[data-invited]")).not.toBeNull();
    const fresh = await emailedLink(email, "invitation", "invite");
    expect(fresh.token).not.toBe(old.token);
    const state = async (url: string) =>
      parse((await person().get(linkPath(url))).text)
        .querySelector("[data-link-state]")!
        .getAttribute("data-link-state");
    expect(await state(old.url)).not.toBe("ok");
    expect(await state(fresh.url)).toBe("ok");
  });

  it("[E2E-USR-36] a withdrawn invitation stops working", async () => {
    const email = freshEmail();
    await invite(adminAmc, amc, { email, roles: ["institution_writer"] });
    const { url } = await emailedLink(email, "invitation", "invite");
    const [row] = await invitationsTo(email);
    const res = await adminAmc.submitForm(`/users?org=${amc}`, `withdraw-${row!.id}`);
    expect(res.status).toBe(303);
    expect(res.location).toContain("done=withdrawn");
    const page = await person().get(linkPath(url));
    expect(
      parse(page.text).querySelector("[data-link-state]")!.getAttribute("data-link-state"),
    ).toBe("used");
  });
});

describe("an invited approver", () => {
  const email = freshEmail("approver");
  let client: HttpClient;

  it("[E2E-USR-37] an approver is sent to set up two-step verification first", async () => {
    await invite(adminAmc, amc, { email, roles: ["institution_approver"] });
    const { url } = await emailedLink(email, "invitation", "invite");
    client = person();
    const res = await client.submitForm(linkPath(url), "accept", {
      name: "Farhan Ali",
      newPassword: GOOD_PASSWORD,
      confirmPassword: GOOD_PASSWORD,
    });
    expect(res.location).toBe("/account/security");
  });

  it("[E2E-USR-38] and cannot reach the dashboard until they do", async () => {
    for (const path of ["/dashboard", "/articles"]) {
      const res = await client.get(path);
      expect(res.location, path).toBe("/account/security");
    }
  });
});

describe("inviting someone who already has an account", () => {
  let existing: Awaited<ReturnType<typeof throwaway>>;
  let link: string;
  let invitee: HttpClient;

  beforeAll(async () => {
    existing = await throwaway([{ org: "sample-general-insurer", roles: ["institution_writer"] }]);
    await invite(adminAmc, amc, { email: existing.email, roles: ["institution_writer"] });
    link = linkPath((await emailedLink(existing.email, "invitation", "invite")).url);
    invitee = person();
  });

  it("[E2E-USR-39] someone with an account is asked for their password, not a new one", async () => {
    const res = await invitee.get(link);
    expect(formsOn(res)).toEqual(["accept-existing"]);
    const form = parse(res.text).querySelector('form[data-form="accept-existing"]')!;
    expect(form.querySelector('input[name="password"]')).not.toBeNull();
    expect(form.querySelector('input[name="newPassword"]')).toBeNull();
    expect(form.querySelector('input[name="name"]')).toBeNull();
  });

  it("[E2E-USR-40] a wrong password does not add the roles", async () => {
    const res = await invitee.submitForm(link, "accept-existing", { password: "Wrong-Password-1" });
    expect(errorOf(res)).toContain("incorrect");
    const roles = await db()
      .select()
      .from(schema.memberships)
      .where(
        and(eq(schema.memberships.userId, existing.id), eq(schema.memberships.organisationId, amc)),
      );
    expect(roles).toHaveLength(0);
  });

  it("[E2E-USR-41] the right password adds the roles and sends them to sign in", async () => {
    const res = await invitee.submitForm(link, "accept-existing", { password: existing.password });
    expect(res.status).toBe(303);
    expect(res.location).toBe("/login?invited=done");
    const roles = await db()
      .select()
      .from(schema.memberships)
      .where(eq(schema.memberships.userId, existing.id));
    expect(roles).toHaveLength(2);
    // The account itself is untouched: same name, same password.
    expect((await userByEmail(existing.email)).name).toBe(existing.name);
    expect((await signInWith(person(), existing.email, existing.password)).location).toBe(
      "/dashboard",
    );
  });

  it("[E2E-USR-42] they now belong to two organisations, and the admin can see that", async () => {
    const amcPage = await adminAmc.get(`/users?org=${amc}`);
    const row = parse(amcPage.text).querySelector(`[data-person="${existing.id}"]`)!;
    expect(row.querySelector("[data-elsewhere]")!.textContent).toBe(
      "Also has roles in another organisation",
    );
    const superPage = await superAdmin.get(`/users?org=${amc}`);
    const superRow = parse(superPage.text).querySelector(`[data-person="${existing.id}"]`)!;
    expect(superRow.querySelector("[data-elsewhere]")!.textContent).toContain(
      "Sample General Insurer",
    );
  });

  it("[E2E-USR-43] an org admin cannot reset two-step or send a reset link for someone who also belongs elsewhere", async () => {
    const page = await adminAmc.get(`/users/${existing.id}?org=${amc}`);
    expect(formsOn(page)).not.toContain("reset2fa");
    expect(formsOn(page)).not.toContain("resetLink");
    // Forged: replay the form from a single-organisation person's page with this person's id.
    const writer = await userByEmail(demoEmail("writer.amc"));
    const other = await adminAmc.get(`/users/${writer.id}?org=${amc}`);
    const res = await adminAmc.submitForm(
      `/users/${writer.id}?org=${amc}`,
      "resetLink",
      { userId: existing.id },
      { page: other },
    );
    expect(errorOf(res)).toContain("also belongs to another organisation");
    const sent = await db()
      .select()
      .from(schema.passwordResets)
      .where(eq(schema.passwordResets.userId, existing.id));
    expect(sent).toHaveLength(0);
  });

  it("[E2E-USR-44] a deactivated person cannot be invited", async () => {
    const gone = await throwaway([
      { org: "sample-general-insurer", roles: ["institution_writer"] },
    ]);
    await db()
      .update(schema.users)
      .set({ disabledAt: new Date() })
      .where(eq(schema.users.id, gone.id));
    const res = await invite(adminAmc, amc, { email: gone.email, roles: ["institution_writer"] });
    expect(errorOf(res)).toContain("deactivated");
    expect(await invitationsTo(gone.email)).toHaveLength(0);
  });
});
