import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { articleMetadata, ArticleView } from "./article-view";
import { sectionMetadata, SectionView } from "./section-view";

type Props = { params: Promise<{ host: string; lang: string; path: string[] }> };

/**
 * /<section> and /<section>/<slug>. One catch-all so that any deeper or unknown path also ends
 * in this site's themed "not found" page rather than Next's default one.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { host, lang, path } = await params;
  if (path.length === 1) return sectionMetadata({ host, lang, section: path[0]! });
  if (path.length === 2) return articleMetadata({ host, lang, section: path[0]!, slug: path[1]! });
  return {};
}

export default async function SectionOrArticlePage({ params }: Props) {
  const { host, lang, path } = await params;
  if (path.length === 1) return <SectionView host={host} lang={lang} section={path[0]!} />;
  if (path.length === 2)
    return <ArticleView host={host} lang={lang} section={path[0]!} slug={path[1]!} />;
  notFound();
}
