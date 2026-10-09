import { t } from "@/domain/i18n";
import { allSections, getPublishedArticle, publishedLanguages } from "@/server/content/queries";
import { SiteHeader } from "@/components/reader/SiteHeader";
import { SiteFooter } from "@/components/reader/SiteFooter";
import type { LanguageLink } from "@/components/reader/LanguageSwitcher";
import { currentPagePath, getSite, type Site } from "@/app/sites/site";

type Props = { children: React.ReactNode; params: Promise<{ host: string; lang: string }> };

const STATIC_SEGMENTS = new Set(["calculators", "glossary", "experts", "partners"]);

/** The paper's chrome around every reader page, with a language switcher for this page (04.4). */
export default async function SiteChromeLayout({ children, params }: Props) {
  const { host, lang } = await params;
  const site = await getSite(host, lang);
  const [sections, pagePath] = await Promise.all([allSections(), currentPagePath()]);
  const first = pagePath.split("/").filter(Boolean)[0] ?? "";
  const languages = await languageLinks(site, pagePath);

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2"
      >
        {t(lang, "skipToContent")}
      </a>
      <SiteHeader
        site={site}
        sections={sections}
        languages={languages}
        currentSection={STATIC_SEGMENTS.has(first) ? undefined : first}
      />
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 pt-8">
        {children}
      </main>
      <SiteFooter site={site} languages={languages} />
    </div>
  );
}

async function languageLinks(site: Site, pagePath: string): Promise<LanguageLink[]> {
  const segments = pagePath.split("/").filter(Boolean);
  let available: string[] | undefined;
  if (segments.length === 2 && !STATIC_SEGMENTS.has(segments[0]!)) {
    const copy = await getPublishedArticle(site.tenant.id, site.lang, segments[0]!, segments[1]!);
    if (copy) available = await publishedLanguages(site.tenant.id, copy.articleId);
  }
  return site.tenant.languages.map((l) => ({
    lang: l,
    current: l === site.lang,
    // An article missing in a language links to that language's home (04.4).
    href: available && !available.includes(l) ? site.path("/", l) : site.path(pagePath, l),
  }));
}
