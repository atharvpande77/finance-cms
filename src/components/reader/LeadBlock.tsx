import { formTexts, resolveSource, type LeadSource } from "@/server/leads/capture";
import { asLang } from "@/domain/i18n";
import type { Site } from "@/app/sites/site";
import { LeadForm } from "./LeadForm";

/**
 * A lead form for what it sits on, or nothing when that may not take leads (04.6). The same
 * resolution runs again when the form is posted.
 */
export async function LeadBlock({
  site,
  source,
  id,
}: {
  site: Site;
  source: LeadSource;
  id?: string;
}) {
  const resolved = await resolveSource(site.tenant, site.lang, source);
  if (!resolved) return null;
  const texts = formTexts(resolved);
  const hidden: Record<string, string> =
    source.kind === "article"
      ? { source: "article", versionId: source.versionId }
      : {
          source: "calculator",
          calculator: source.calculator,
          place: source.place,
          ...(source.section ? { section: source.section } : {}),
          ...(source.versionId ? { versionId: source.versionId } : {}),
        };
  return (
    <LeadForm
      id={id}
      lang={asLang(site.lang)}
      sponsor={texts.sponsorName}
      consent={texts.consent}
      interests={texts.interests}
      hidden={{ ...hidden, lang: site.lang }}
    />
  );
}
