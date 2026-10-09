/** Per-request context for a newspaper's reader site: the tenant, language and URL helpers. */
import { cache } from "react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { env } from "@/server/env";
import { primaryHost, tenantByHost, type Tenant } from "@/server/tenants";
import { localePath, PAGE_PATH_HEADER, siteOrigin } from "@/domain/urls";
import { pick, t } from "@/domain/i18n";

export type Site = {
  tenant: Tenant;
  lang: string;
  origin: string;
  paperName: string;
  sectionLabel: string;
  /** Public path of `path` in `lang` (default: the page language). */
  path: (path?: string, lang?: string) => string;
  /** Absolute URL of `path` in `lang`. */
  url: (path?: string, lang?: string) => string;
};

export const getSite = cache(async (host: string, lang: string): Promise<Site> => {
  const tenant = await tenantByHost(decodeURIComponent(host));
  if (!tenant || !tenant.languages.includes(lang)) notFound();
  const origin = siteOrigin(primaryHost(tenant), env().APP_URL);
  const path = (p = "/", l = lang) => localePath(tenant, l, p);
  return {
    tenant,
    lang,
    origin,
    paperName: pick(tenant.name, lang),
    sectionLabel: pick(tenant.menuLabel, lang),
    path,
    url: (p = "/", l = lang) => `${origin}${path(p, l)}`,
  };
});

/** The page path without language, as resolved by the proxy (e.g. "/home-loan/x"). */
export async function currentPagePath(): Promise<string> {
  return (await headers()).get(PAGE_PATH_HEADER) ?? "/";
}

export type PageMeta = {
  title?: string;
  description?: string;
  /** Page path without language. */
  path: string;
  /** Languages this page exists in on this paper (defaults to every language the paper publishes). */
  languages?: string[];
  /** Absolute canonical URL, when it differs from this page (cross-paper articles, 04.4). */
  canonical?: string;
  type?: "website" | "article";
  publishedTime?: Date;
};

/**
 * Metadata shared by every reader page: canonical, hreflang alternates (with x-default for the
 * paper's default language, decision D9), Open Graph, and noindex for staging papers.
 */
export function pageMetadata(site: Site, meta: PageMeta): Metadata {
  const langs = meta.languages ?? site.tenant.languages;
  const languages: Record<string, string> = {};
  for (const l of site.tenant.languages)
    if (langs.includes(l)) languages[l] = site.url(meta.path, l);
  if (langs.includes(site.tenant.defaultLanguage)) {
    languages["x-default"] = site.url(meta.path, site.tenant.defaultLanguage);
  }
  const url = site.url(meta.path);
  const staging = site.tenant.status === "staging";
  return {
    title: meta.title,
    description: meta.description,
    alternates: { canonical: meta.canonical ?? url, languages },
    robots: staging ? { index: false, follow: false } : { index: true, follow: true },
    openGraph: {
      title: meta.title ?? site.sectionLabel,
      description: meta.description,
      url,
      siteName: `${site.paperName} · ${site.sectionLabel}`,
      locale: site.lang === "mr" ? "mr_IN" : "en_IN",
      type: meta.type ?? "website",
      ...(meta.publishedTime ? { publishedTime: meta.publishedTime.toISOString() } : {}),
    },
  };
}

/** Labels shown to readers for a published copy (04.3). */
export function approvalLine(site: Site, approval: "explicit" | "deemed" | null): string | null {
  if (approval === "explicit") return t(site.lang, "approvedByEditor", { paper: site.paperName });
  if (approval === "deemed") return t(site.lang, "publishedByDesk", { paper: site.paperName });
  return null;
}
