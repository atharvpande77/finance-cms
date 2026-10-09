import { pick } from "@/domain/i18n";
import type { PublishedCopy } from "@/server/content/queries";
import type { Site } from "@/app/sites/site";
import { ArticleLabel } from "./Labels";

export function ArticleCard({
  copy,
  site,
  lead = false,
}: {
  copy: PublishedCopy;
  site: Site;
  lead?: boolean;
}) {
  const href = site.path(`/${copy.sectionSlug}/${copy.slug}`);
  return (
    <article
      className={
        lead
          ? ""
          : "rounded-xl bg-surface p-5 shadow-card transition-shadow duration-150 hover:shadow-card-hover"
      }
    >
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <a
          href={site.path(`/${copy.sectionSlug}`)}
          className="font-semibold text-primary hover:underline"
        >
          {pick(copy.sectionName, site.lang)}
        </a>
        <ArticleLabel type={copy.type} lang={site.lang} />
      </div>
      <h3
        className={`mt-2 font-heading font-bold text-balance ${lead ? "text-3xl leading-tight sm:text-4xl" : "text-xl leading-snug"}`}
      >
        <a href={href} className="hover:text-primary">
          {copy.headline}
        </a>
      </h3>
      <p className={`mt-2 text-pretty text-muted ${lead ? "text-lg" : "line-clamp-3"}`}>
        {copy.summary}
      </p>
    </article>
  );
}
