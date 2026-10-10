/** Signing in as demo users over HTTP, and reading what the server stored or emailed. */
import { randomBytes } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { expect } from "vitest";
import { db, schema } from "@/server/db/client";
import { open } from "@/server/crypto/secret-box";
import { stepAt, totpAt } from "@/domain/totp";
import { HttpClient, type HttpResponse } from "../http-client";

export const DEMO_PASSWORD = "Demo-Pass-2026";
export const demoEmail = (name: string) => `${name}@demo.abcfinance.test`;

/**
 * One simulated person: their own cookies, and their own address as nginx would report it.
 * Random, so suites running in parallel never share a sign-in rate-limit bucket.
 */
export function person(): HttpClient {
  return new HttpClient({ "x-real-ip": `10.9.${[...randomBytes(2)].join(".")}` });
}

export function login(client: HttpClient, name: string, password = DEMO_PASSWORD) {
  return client.submitForm("/login", "login", { email: demoEmail(name), password });
}

export async function userByEmail(email: string) {
  const [user] = await db().select().from(schema.users).where(eq(schema.users.email, email));
  return user!;
}

export async function totpSecret(name: string): Promise<string> {
  const user = await userByEmail(demoEmail(name));
  return open(user.totpSecretEnc!);
}

/**
 * A code the server will accept: for the current time step, or the next one when the current
 * step was already used (codes can't be replayed). Waits if both are used.
 */
export async function freshCode(name: string): Promise<string> {
  const secret = await totpSecret(name);
  for (;;) {
    const { totpLastStep } = await userByEmail(demoEmail(name));
    const now = stepAt(Date.now());
    const step = totpLastStep === null || totpLastStep < now ? now : totpLastStep + 1;
    if (step <= now + 1) return totpAt(secret, step);
    await new Promise((r) => setTimeout(r, 1000));
  }
}

/** Signs in fully, setting up two-step first if the account needs it. */
export async function signInFully(name: string): Promise<HttpClient> {
  const client = person();
  const res = await login(client, name);
  expect(res.status).toBe(303);
  if (res.location === "/account/security") {
    await client.get("/account/security");
    const done = await client.submitForm("/account/security", "enrol", {
      code: await freshCode(name),
    });
    expect(done.location).toBe("/dashboard");
  } else if (res.location === "/login/verify") {
    const done = await client.submitForm("/login/verify", "verify", {
      code: await freshCode(name),
    });
    expect(done.location).toBe("/dashboard");
  } else {
    expect(res.location).toBe("/dashboard");
  }
  return client;
}

export async function latestEmail(to: string, kind: string) {
  const t = schema.emailOutbox;
  const [row] = await db()
    .select()
    .from(t)
    .where(and(eq(t.to, to), eq(t.kind, kind)))
    .orderBy(desc(t.createdAt))
    .limit(1);
  return row ? { ...row, body: open(row.bodyEnc) } : undefined;
}

/** The menu links of a panel page. */
export function menuLinks(res: HttpResponse): string[] {
  const nav = res.text.match(/<nav[^>]*data-panel-menu[^>]*>([\s\S]*?)<\/nav>/)?.[1] ?? "";
  return [...nav.matchAll(/href="([^"]+)"/g)].map((m) => m[1]!);
}
