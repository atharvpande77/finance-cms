import { t } from "@/domain/i18n";
import type { Site } from "@/app/sites/site";
import { LanguageSwitcher, type LanguageLink } from "./LanguageSwitcher";

export function SiteFooter({ site, languages }: { site: Site; languages: LanguageLink[] }) {
  return (
    <footer className="mt-16 bg-bar text-sm text-white/85">
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-10 sm:grid-cols-[1fr_auto] sm:items-start">
        <div>
          <p className="font-display text-xl font-bold text-white">
            {site.paperName} · {site.sectionLabel}
          </p>
          <ul className="mt-3 flex flex-wrap gap-x-5">
            <li>
              <a
                href={site.path("/calculators")}
                className="inline-flex min-h-11 items-center hover:text-white hover:underline"
              >
                {t(site.lang, "calculators")}
              </a>
            </li>
            <li>
              <a
                href={site.path("/glossary")}
                className="inline-flex min-h-11 items-center hover:text-white hover:underline"
              >
                {t(site.lang, "glossary")}
              </a>
            </li>
            <li>
              <a
                href={site.tenant.mainSiteUrl}
                className="inline-flex min-h-11 items-center hover:text-white hover:underline"
              >
                {t(site.lang, "backToPaper", { paper: site.paperName })}
              </a>
            </li>
          </ul>
        </div>
        <LanguageSwitcher links={languages} className="-mx-2" />
      </div>
      <div className="border-t border-white/15">
        <p className="mx-auto max-w-6xl px-4 py-4 text-white/70">{t(site.lang, "poweredBy")}</p>
      </div>
    </footer>
  );
}
