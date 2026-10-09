/**
 * Public URLs on a newspaper host (04.4): the paper's default language has no prefix, other
 * languages use /<lang>/..., and a prefixed default-language URL redirects (308) to the
 * unprefixed one so every page has exactly one URL.
 */
export type SiteLanguages = { languages: readonly string[]; defaultLanguage: string };

export type LanguageSplit =
  { kind: "redirect"; location: string } | { kind: "page"; lang: string; rest: string };

/** Lower-cased host without port or trailing dot; null when it is not a plausible host name. */
export function normalizeHost(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const host = raw.trim().toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
  return /^[a-z0-9.-]+$/.test(host) ? host : null;
}

/** Splits the language prefix off a newspaper-host path. */
export function splitLanguage(pathname: string, site: SiteLanguages): LanguageSplit {
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const first = path.split("/")[1] ?? "";
  const remainder = path.slice(first.length + 1) || "/";
  if (first === site.defaultLanguage) return { kind: "redirect", location: remainder };
  if (first !== "" && site.languages.includes(first))
    return { kind: "page", lang: first, rest: remainder };
  return { kind: "page", lang: site.defaultLanguage, rest: path };
}

/** The public path of `path` (which starts with "/") in `lang` on this site. */
export function localePath(site: SiteLanguages, lang: string, path = "/"): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  if (lang === site.defaultLanguage) return p;
  return p === "/" ? `/${lang}` : `/${lang}${p}`;
}

/**
 * Origin of a newspaper host. Scheme and port follow APP_URL, so development gives
 * http://tarunbharat.localhost:3000 and production https://money.tarunbharat.net.
 */
export function siteOrigin(host: string, appUrl: string | undefined): string {
  if (!appUrl) return `https://${host}`;
  const app = new URL(appUrl);
  return `${app.protocol}//${host}${app.port ? `:${app.port}` : ""}`;
}

/** Request header the proxy sets with the page path without language, for the reader layout. */
export const PAGE_PATH_HEADER = "x-abc-page-path";
/** Request header the proxy sets with the page language (read by the "not found" page). */
export const PAGE_LANG_HEADER = "x-abc-page-lang";
