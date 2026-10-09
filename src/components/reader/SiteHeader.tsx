import { pick, t } from "@/domain/i18n";
import type { Site } from "@/app/sites/site";
import { LanguageSwitcher, type LanguageLink } from "./LanguageSwitcher";

type Section = { slug: string; name: Record<string, string> };

/**
 * The paper's chrome, following its main site: a dark utility strip, the masthead (wordmark and
 * the section's menu label), and a sticky section menu with a heavy rule.
 */
export function SiteHeader({
  site,
  sections,
  languages,
  currentSection,
}: {
  site: Site;
  sections: Section[];
  languages: LanguageLink[];
  currentSection?: string;
}) {
  return (
    <>
      <div className="bg-bar text-sm text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4">
          <a
            href={site.tenant.mainSiteUrl}
            className="inline-flex min-h-11 items-center gap-1.5 opacity-90 transition-opacity duration-150 hover:opacity-100"
          >
            <span aria-hidden="true">←</span>{" "}
            {t(site.lang, "backToPaper", { paper: site.paperName })}
          </a>
          <LanguageSwitcher links={languages} />
        </div>
      </div>

      <header className="bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-end gap-x-4 gap-y-1 px-4 pt-6 pb-4">
          <a
            href={site.path("/")}
            className="font-display text-4xl leading-none font-bold text-primary sm:text-5xl"
          >
            {site.paperName}
          </a>
          <span className="font-display text-2xl leading-none font-bold text-ink sm:text-3xl">
            <span aria-hidden="true" className="mr-3 text-muted/50">
              |
            </span>
            {site.sectionLabel}
          </span>
        </div>
      </header>

      <nav
        aria-label={t(site.lang, "sections")}
        className="sticky top-0 z-20 border-b-[3px] border-rule bg-surface shadow-sm"
      >
        <ul className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-2 [scrollbar-width:none]">
          {[{ slug: "", name: { en: t("en", "home"), mr: t("mr", "home") } }, ...sections].map(
            (s) => {
              const current = s.slug === "" ? currentSection === "" : s.slug === currentSection;
              return (
                <li key={s.slug || "home"} className="shrink-0">
                  <a
                    href={site.path(s.slug ? `/${s.slug}` : "/")}
                    aria-current={current ? "page" : undefined}
                    className={`font-display inline-flex min-h-11 items-center border-b-[3px] px-3 pt-1 text-[1.05rem] font-bold lg:px-2.5 lg:text-base whitespace-nowrap transition-colors duration-150 -mb-[3px] ${
                      current
                        ? "border-primary text-primary"
                        : "border-transparent text-ink hover:text-primary"
                    }`}
                  >
                    {pick(s.name, site.lang)}
                  </a>
                </li>
              );
            },
          )}
        </ul>
      </nav>
    </>
  );
}
