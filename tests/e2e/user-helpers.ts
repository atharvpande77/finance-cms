/** People for the user-management tests: fresh addresses, throwaway accounts, emailed links. */
import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { parse } from "node-html-parser";
import { expect } from "vitest";
import { db, schema } from "@/server/db/client";
import { hashPassword } from "@/server/auth/password";
import { createSession } from "@/server/auth/sessions";
import { seal } from "@/server/crypto/secret-box";
import type { Role } from "@/domain/roles";
import { HttpClient, PANEL_ORIGIN, type HttpResponse } from "../http-client";
import { latestEmail, person } from "./auth-helpers";

export const freshEmail = (tag = "e2e") => `${tag}-${randomBytes(5).toString("hex")}@example.test`;
export const GOOD_PASSWORD = "Quiet-Lantern-2026";

export async function orgIdOf(slug: string): Promise<string> {
  const [row] = await db()
    .select()
    .from(schema.organisations)
    .where(eq(schema.organisations.slug, slug));
  return row!.id;
}

/** The one-time link in the newest email of `kind` to `to`. */
export async function emailedLink(to: string, kind: string, path: "invite" | "reset") {
  const mail = await latestEmail(to, kind);
  expect(mail, `${kind} email to ${to}`).toBeDefined();
  const match = mail!.body.match(new RegExp(`(https?://[^\\s]+)/${path}/([A-Za-z0-9_-]+)`))!;
  return {
    url: `${match[1]}/${path}/${match[2]}`,
    origin: match[1]!,
    token: match[2]!,
    body: mail!.body,
  };
}

export async function emailsTo(to: string, kind: string): Promise<number> {
  const rows = await db()
    .select({ id: schema.emailOutbox.id })
    .from(schema.emailOutbox)
    .where(and(eq(schema.emailOutbox.to, to), eq(schema.emailOutbox.kind, kind)));
  return rows.length;
}

export type Throwaway = { id: string; email: string; name: string; password: string };

/** An account made directly in the database, for tests that change or lock it. */
export async function throwaway(
  memberships: Array<{ org: string; roles: Role[] }>,
  opts: { twoStep?: boolean; name?: string } = {},
): Promise<Throwaway> {
  const email = freshEmail("person");
  const name = opts.name ?? "Test Person";
  const password = GOOD_PASSWORD;
  const [user] = await db()
    .insert(schema.users)
    .values({
      name,
      email,
      passwordHash: await hashPassword(password),
      totpEnabled: opts.twoStep ?? false,
      totpSecretEnc: opts.twoStep ? seal("JBSWY3DPEHPK3PXP") : null,
    })
    .returning({ id: schema.users.id });
  for (const m of memberships) {
    const organisationId = await orgIdOf(m.org);
    await db()
      .insert(schema.memberships)
      .values(m.roles.map((role) => ({ userId: user!.id, organisationId, role })));
  }
  return { id: user!.id, email, name, password };
}

/** A client already signed in as `userId` (skips the sign-in forms). */
export async function sessionFor(
  userId: string,
  headers: Record<string, string> = {},
): Promise<HttpClient> {
  const session = await createSession(userId, { mfaVerified: true });
  return new HttpClient({
    cookie: `abc_session=${session.token}`,
    "x-real-ip": `10.8.${[...randomBytes(2)].join(".")}`,
    ...headers,
  });
}

export function signInWith(client: HttpClient, email: string, password: string) {
  return client.submitForm("/login", "login", { email, password });
}

/** Signs in a person whose roles need no two-step code, and checks they reached the dashboard. */
export async function signedIn(email: string, password: string): Promise<HttpClient> {
  const client = person();
  const res = await signInWith(client, email, password);
  expect(res.location).toBe("/dashboard");
  return client;
}

/** Posts the invite form on `pageOrgId`'s Users page; `fields.org` forges another organisation. */
export function invite(
  client: HttpClient,
  pageOrgId: string,
  fields: { email: string; roles: string[]; name?: string; org?: string },
  page?: HttpResponse,
) {
  return client.submitForm(
    `/users?org=${pageOrgId}`,
    "invite",
    {
      email: fields.email,
      name: fields.name ?? "",
      roles: fields.roles,
      org: fields.org ?? pageOrgId,
    },
    { page },
  );
}

/** The one-time link the Users page shows the admin after adding someone (D58). */
export function linkShown(res: HttpResponse) {
  const url = parse(res.text).querySelector("[data-invite-link]")?.textContent.trim();
  expect(url, "invitation link shown to the admin").toBeTruthy();
  const parsed = new URL(url!);
  return { url: url!, origin: parsed.origin, token: parsed.pathname.split("/").pop()! };
}

/** The forms on a page, by `data-form`. */
export function formsOn(res: HttpResponse): string[] {
  return parse(res.text)
    .querySelectorAll("form[data-form]")
    .map((f) => f.getAttribute("data-form")!);
}

export const errorOf = (res: HttpResponse) =>
  parse(res.text).querySelector("[data-error]")?.textContent.trim() ?? null;

export const linkPath = (url: string) => new URL(url).pathname;
export { PANEL_ORIGIN };
