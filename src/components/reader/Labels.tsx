import { t } from "@/domain/i18n";

/** "Partner content": every institution article (04.3). */
export function PartnerLabel({ lang }: { lang: string }) {
  return (
    <span className="inline-flex items-center rounded-sm border border-accent/60 px-1.5 py-0.5 text-xs font-semibold tracking-wide text-accent uppercase">
      {t(lang, "partnerContent")}
    </span>
  );
}

/** "Independent expert": articles by independent contributors. */
export function ExpertTag({ lang }: { lang: string }) {
  return (
    <span className="inline-flex items-center rounded-sm bg-accent/10 px-1.5 py-0.5 text-xs font-semibold tracking-wide text-accent uppercase">
      {t(lang, "independentExpert")}
    </span>
  );
}

export function ArticleLabel({ type, lang }: { type: string; lang: string }) {
  if (type === "institution") return <PartnerLabel lang={lang} />;
  if (type === "independent") return <ExpertTag lang={lang} />;
  return null;
}
