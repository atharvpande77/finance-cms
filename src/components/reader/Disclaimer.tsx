import { pick, t } from "@/domain/i18n";

/** The section's disclaimer template, inserted verbatim and never rephrased (04.5). */
export function Disclaimer({
  text,
  lang,
}: {
  text: Record<string, string> | undefined;
  lang: string;
}) {
  const body = pick(text, lang);
  if (!body) return null;
  return (
    <aside
      aria-label={t(lang, "disclaimer")}
      className="rounded-xl bg-surface p-5 text-sm leading-relaxed text-muted shadow-card"
    >
      <p className="mb-1 font-semibold text-ink">{t(lang, "disclaimer")}</p>
      <p className="text-pretty">{body}</p>
    </aside>
  );
}
