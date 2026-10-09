import { cache } from "react";
import { cookies, headers } from "next/headers";
import { forbidden, redirect } from "next/navigation";
import { env } from "@/server/env";
import { clientIp } from "@/server/http/client-ip";
import { loadSession, type NewSession, type SessionInfo } from "./sessions";
import { canOpenArea, type PanelArea } from "@/domain/panel-menu";

/**
 * The signed-in person for this request, and the guards every panel page and action calls
 * (Next's data-access-layer pattern: layouts alone don't re-run on navigation).
 */

/** Secure cookies follow the public URL's scheme, so http test builds still work (D18). */
function secureCookies(): boolean {
  return env().APP_URL?.startsWith("https:") ?? false;
}

export function sessionCookieName(): string {
  return secureCookies() ? "__Host-abc_session" : "abc_session";
}

export async function setSessionCookie(session: NewSession): Promise<void> {
  (await cookies()).set(sessionCookieName(), session.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: secureCookies(),
    path: "/",
    expires: session.expiresAt,
  });
}

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).delete({ name: sessionCookieName(), path: "/", secure: secureCookies() });
}

export const currentSession = cache(async (): Promise<SessionInfo | null> => {
  const token = (await cookies()).get(sessionCookieName())?.value;
  return loadSession(token);
});

export async function requestIp(): Promise<string> {
  return clientIp(await headers());
}

/** A fully signed-in person: two-step done where it applies. Otherwise sends them on. */
export async function requireUser(): Promise<SessionInfo> {
  const s = await currentSession();
  if (!s) redirect("/login");
  if (s.twoStepRequired && !s.user.totpEnabled) redirect("/account/security");
  if (s.twoStepRequired && !s.mfaVerified) redirect("/login/verify");
  return s;
}

/** For the panel areas: signed in, and one of the roles 05.2 lists for the area. */
export async function requireArea(area: PanelArea): Promise<SessionInfo> {
  const s = await requireUser();
  if (!canOpenArea(s.memberships, area)) forbidden();
  return s;
}

/**
 * Form posts must come from the panel's own origin (06.1). Next already refuses a Server Action
 * whose Origin differs from its Host; this also pins it to APP_URL.
 */
export async function assertSameOrigin(): Promise<void> {
  const h = await headers();
  if (!isSameOrigin(h.get("origin"), env().APP_URL, h.get("x-forwarded-host") ?? h.get("host"))) {
    forbidden();
  }
}

function isSameOrigin(origin: string | null, appUrl: string | undefined, host: string | null) {
  if (!origin) return false;
  if (appUrl) return origin === new URL(appUrl).origin;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
