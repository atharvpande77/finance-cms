import { LANGUAGE_NAMES } from "@/domain/i18n";

export type LanguageLink = { lang: string; href: string; current: boolean };

/** Links to this page in each of the paper's languages (04.4). */
export function LanguageSwitcher({
  links,
  className = "",
}: {
  links: LanguageLink[];
  className?: string;
}) {
  if (links.length < 2) return null;
  return (
    <ul className={`flex items-center gap-1 ${className}`}>
      {links.map((l) => (
        <li key={l.lang}>
          {l.current ? (
            <span
              aria-current="true"
              className="inline-flex min-h-11 items-center px-2 font-semibold"
            >
              {LANGUAGE_NAMES[l.lang] ?? l.lang}
            </span>
          ) : (
            <a
              href={l.href}
              hrefLang={l.lang}
              lang={l.lang}
              className="inline-flex min-h-11 items-center px-2 opacity-80 underline-offset-4 transition-opacity duration-150 hover:opacity-100 hover:underline"
            >
              {LANGUAGE_NAMES[l.lang] ?? l.lang}
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}
