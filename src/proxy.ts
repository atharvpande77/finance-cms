/**
 * Host-based multi-tenancy (02 §2.1–2.3). Runs before routing:
 *
 *  - the panel host (APP_URL, localhost) passes through; the internal /sites tree is hidden;
 *  - a newspaper host is rewritten to /sites/<host>/<lang>/<path>, with the default language
 *    unprefixed and a prefixed default-language URL redirected (308) to its one URL;
 *  - any other host gets a plain 404 ("unknown hosts serve nothing").
 */
import { NextResponse, type NextRequest } from "next/server";
import { normalizeHost, PAGE_LANG_HEADER, PAGE_PATH_HEADER, splitLanguage } from "@/domain/urls";
import { isPanelHost, tenantByHost } from "@/server/tenants";

/**
 * Per-host files and their internal routes. The route folders avoid the names sitemap.xml and
 * robots.txt, which Next treats as its own (static, host-less) metadata files.
 */
const SITE_FILES: Record<string, string> = {
  "/sitemap.xml": "sitemap-xml",
  "/robots.txt": "robots-txt",
  // The tracking beacon (05.1); folders starting with "_" are private in the App Router.
  "/_a/h": "beacon",
};

/** The panel pages that carry a one-time token, or ask for one (05.2). */
const LINK_PAGE = /^\/(forgot|reset\/[^/]+|invite\/[^/]+)\/?$/;

function notFound() {
  return new NextResponse("Not found", {
    status: 404,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

/** Absolute URL on the host the reader used, with the scheme nginx reports (TLS ends there). */
function publicUrl(request: NextRequest, path: string): URL {
  const proto =
    request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "");
  return new URL(path, `${proto}://${request.headers.get("host")}`);
}

export async function proxy(request: NextRequest) {
  const rawHost = request.headers.get("host");
  const { pathname, search } = request.nextUrl;

  if (isPanelHost(rawHost)) {
    if (pathname === "/sites" || pathname.startsWith("/sites/")) return notFound();
    // The page headers are ours to set; a client's own copies never reach the panel.
    const headers = new Headers(request.headers);
    headers.delete(PAGE_PATH_HEADER);
    headers.delete(PAGE_LANG_HEADER);
    const response = NextResponse.next({ request: { headers } });
    // One-time link pages never leak their token through Referer, and are never indexed (05.2).
    if (LINK_PAGE.test(pathname)) {
      response.headers.set("Referrer-Policy", "no-referrer");
      response.headers.set("X-Robots-Tag", "noindex, nofollow");
      response.headers.set("Cache-Control", "no-store");
    }
    return response;
  }

  const tenant = await tenantByHost(rawHost);
  if (!tenant) return notFound();
  const host = normalizeHost(rawHost)!;

  let target: string;
  let pagePath = pathname;
  let lang = tenant.defaultLanguage;
  const file = SITE_FILES[pathname];
  if (file) {
    target = `/sites/${host}/${file}`;
  } else {
    const split = splitLanguage(pathname, tenant);
    if (split.kind === "redirect") {
      return NextResponse.redirect(publicUrl(request, `${split.location}${search}`), 308);
    }
    pagePath = split.rest;
    lang = split.lang;
    target = `/sites/${host}/${split.lang}${split.rest === "/" ? "" : split.rest}`;
  }

  const headers = new Headers(request.headers);
  headers.set(PAGE_PATH_HEADER, pagePath);
  headers.set(PAGE_LANG_HEADER, lang);
  // Next treats a rewrite as internal only when its origin matches the server's own origin,
  // which it builds from HOSTNAME. Start the server with HOSTNAME=0.0.0.0 (as the Docker image
  // does), never 127.0.0.1: request URLs normalise that to "localhost", the origins differ, and
  // the rewrite becomes an external proxy request.
  const response = NextResponse.rewrite(new URL(`${target}${search}`, request.url), {
    request: { headers },
  });
  if (tenant.status === "staging") response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}

export const config = {
  // Everything except build assets and Next's own dev endpoints.
  matcher: ["/((?!_next/|__nextjs|favicon.ico).*)"],
};
