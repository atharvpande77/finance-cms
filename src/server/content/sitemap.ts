import { CALCULATOR_SLUGS } from "@/domain/calc/catalog";
import { localePath, siteOrigin } from "@/domain/urls";
import { env } from "@/server/env";
import { allSections, glossaryTerms, sitemapEntries } from "@/server/content/queries";
import { primaryHost, type Tenant } from "@/server/tenants";

type Page = { path: string; languages: string[]; lastModified?: Date };

const xml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Sitemap for one paper (04.4): every public page in every language it exists in, each with its
 * hreflang alternates. Only published content appears.
 */
export async function buildSitemap(tenant: Tenant): Promise<string> {
  const [entries, sections, terms] = await Promise.all([
    sitemapEntries(tenant.id),
    allSections(),
    glossaryTerms(),
  ]);
  const all = tenant.languages;
  const pages: Page[] = [
    { path: "/", languages: all },
    ...sections.map((s) => ({ path: `/${s.slug}`, languages: all })),
    { path: "/calculators", languages: all },
    ...CALCULATOR_SLUGS.map((slug) => ({ path: `/calculators/${slug}`, languages: all })),
    { path: "/glossary", languages: all },
    ...terms.map((t) => ({ path: `/glossary/${t.slug}`, languages: all })),
  ];

  const articles = new Map<string, Page>();
  const authors = new Set<string>();
  const partners = new Set<string>();
  for (const e of entries) {
    const path = `/${e.sectionSlug}/${e.slug}`;
    const page = articles.get(e.articleId) ?? { path, languages: [] };
    page.languages.push(e.language);
    if (e.publishedAt && (!page.lastModified || e.publishedAt > page.lastModified))
      page.lastModified = e.publishedAt;
    articles.set(e.articleId, page);
    if (e.authorSlug) authors.add(e.authorSlug);
    if (e.orgType === "institution") partners.add(e.orgSlug);
  }
  pages.push(...[...authors].map((slug) => ({ path: `/experts/${slug}`, languages: all })));
  pages.push(...[...partners].map((slug) => ({ path: `/partners/${slug}`, languages: all })));
  pages.push(...articles.values());

  const origin = siteOrigin(primaryHost(tenant), env().APP_URL);
  const url = (path: string, lang: string) => `${origin}${localePath(tenant, lang, path)}`;
  const body = pages
    .flatMap((page) =>
      all
        .filter((lang) => page.languages.includes(lang))
        .map((lang) => {
          const alternates = all
            .filter((l) => page.languages.includes(l))
            .map(
              (l) =>
                `    <xhtml:link rel="alternate" hreflang="${l}" href="${xml(url(page.path, l))}"/>`,
            );
          const lastmod = page.lastModified
            ? `\n    <lastmod>${page.lastModified.toISOString()}</lastmod>`
            : "";
          return `  <url>\n    <loc>${xml(url(page.path, lang))}</loc>${lastmod}\n${alternates.join("\n")}\n  </url>`;
        }),
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${body}
</urlset>
`;
}

/** robots.txt (04.4): staging papers are closed to crawlers; live papers advertise the sitemap. */
export function buildRobots(tenant: Tenant): string {
  if (tenant.status !== "live") return "User-agent: *\nDisallow: /\n";
  const origin = siteOrigin(primaryHost(tenant), env().APP_URL);
  return `User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n`;
}
