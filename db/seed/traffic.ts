/**
 * 45 days of demo traffic (TESTING.md: "45 days of traffic"), so the reports have something to
 * show. Figures are invented: fixed-seed random numbers per paper, page and day, so a reset
 * gives the same data. Only adds missing rows. No per-view rows are made (they would be pruned
 * after 30 days anyway); the real counters come from the tracker.
 */
import { and, eq, isNotNull } from "drizzle-orm";
import { schema, type Db } from "@/server/db/client";
import { CALCULATORS } from "@/domain/calc/catalog";
import { brandingFor, type BrandContext } from "@/domain/sponsor";
import { addDays, indianDate } from "@/domain/time";
import { localePath } from "@/domain/urls";

export const TRAFFIC_DAYS = 45;

/** How busy each paper is compared with Tarun Bharat. */
const PAPER_SCALE: Record<string, number> = { tarunbharat: 1, paperb: 0.4, paperc: 0.25 };

/** mulberry32, seeded from a string. */
function random(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const between = (rnd: () => number, lo: number, hi: number) => lo + rnd() * (hi - lo);

type Page = {
  path: string;
  language: string;
  kind: "home" | "section" | "calculator" | "article" | "other";
  versionId: string | null;
  /** Mean views a day on Tarun Bharat. */
  base: number;
  /** First day the page existed (articles: their publication). */
  from: string;
  /** Calculators on the page, with where they sit for branding. */
  calculators: { slug: string; context: BrandContext; share: number }[];
};

export async function seedTraffic(d: Db, now = new Date()): Promise<number> {
  const [tenants, sections, sponsorships, copies] = await Promise.all([
    d.select().from(schema.tenants),
    d.select().from(schema.sections),
    d.select().from(schema.sponsorships),
    d
      .select({
        id: schema.articleVersions.id,
        tenantId: schema.articleVersions.tenantId,
        language: schema.articleVersions.language,
        body: schema.articleVersions.body,
        publishedAt: schema.articleVersions.publishedAt,
        slug: schema.articles.slug,
        type: schema.articles.type,
        orgId: schema.articles.organisationId,
        sectionSlug: schema.sections.slug,
      })
      .from(schema.articleVersions)
      .innerJoin(schema.articles, eq(schema.articles.id, schema.articleVersions.articleId))
      .innerJoin(schema.sections, eq(schema.sections.id, schema.articles.sectionId))
      .where(
        and(
          isNotNull(schema.articleVersions.tenantId),
          eq(schema.articleVersions.state, "published"),
        ),
      ),
  ]);
  const sectionCalcs = sections.map((s) => ({ slug: s.slug, calculatorSlugs: s.calculatorSlugs }));
  const today = indianDate(now);
  const firstDay = addDays(today, -TRAFFIC_DAYS);

  const stats: (typeof schema.pageStats.$inferInsert)[] = [];
  const uses = new Map<string, typeof schema.calculatorUses.$inferInsert>();

  for (const tenant of tenants) {
    const scale = PAPER_SCALE[tenant.slug] ?? 0.2;
    const pages: Page[] = [];
    for (const lang of tenant.languages) {
      const own = lang === tenant.defaultLanguage ? 1 : 0.35;
      const path = (p: string) => localePath(tenant, lang, p);
      pages.push({
        path: path("/"),
        language: lang,
        kind: "home",
        versionId: null,
        base: 140 * own,
        from: firstDay,
        calculators: [],
      });
      pages.push({
        path: path("/calculators"),
        language: lang,
        kind: "other",
        versionId: null,
        base: 18 * own,
        from: firstDay,
        calculators: [],
      });
      pages.push({
        path: path("/glossary"),
        language: lang,
        kind: "other",
        versionId: null,
        base: 8 * own,
        from: firstDay,
        calculators: [],
      });
      for (const s of sections) {
        pages.push({
          path: path(`/${s.slug}`),
          language: lang,
          kind: "section",
          versionId: null,
          base: 24 * own,
          from: firstDay,
          calculators: s.calculatorSlugs.map((slug) => ({
            slug,
            context: { kind: "section_page", sectionSlug: s.slug },
            share: 0.06,
          })),
        });
      }
      for (const c of CALCULATORS) {
        pages.push({
          path: path(`/calculators/${c.slug}`),
          language: lang,
          kind: "calculator",
          versionId: null,
          base: 20 * own,
          from: firstDay,
          calculators: [{ slug: c.slug, context: { kind: "calculator_page" }, share: 0.3 }],
        });
      }
    }
    for (const copy of copies.filter((c) => c.tenantId === tenant.id)) {
      const context: BrandContext =
        copy.type === "institution"
          ? { kind: "institution_article", orgId: copy.orgId, sectionSlug: copy.sectionSlug }
          : copy.type === "independent"
            ? { kind: "independent_article" }
            : { kind: "abcfinance_article", sectionSlug: copy.sectionSlug };
      const embedded = [...copy.body.matchAll(/^\{\{calc:([a-z-]+)\}\}$/gm)].map((m) => m[1]!);
      pages.push({
        path: localePath(tenant, copy.language, `/${copy.sectionSlug}/${copy.slug}`),
        language: copy.language,
        kind: "article",
        versionId: copy.id,
        base: copy.language === tenant.defaultLanguage ? 70 : 25,
        from: copy.publishedAt ? indianDate(copy.publishedAt) : today,
        calculators: [...new Set(embedded)].map((slug) => ({ slug, context, share: 0.1 })),
      });
    }

    for (const page of pages) {
      for (
        let day = firstDay < page.from ? page.from : firstDay;
        day < today;
        day = addDays(day, 1)
      ) {
        const rnd = random(`${tenant.slug}|${page.path}|${day}`);
        const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
        const week = weekday === 0 || weekday === 6 ? 0.75 : 1;
        const views = Math.round(page.base * scale * week * between(rnd, 0.6, 1.4));
        if (views === 0) continue;
        const article = page.kind === "article";
        stats.push({
          tenantId: tenant.id,
          versionId: page.versionId,
          pagePath: page.path,
          language: page.language,
          kind: page.kind,
          date: day,
          views,
          engagedReads: Math.round(
            views * (article ? between(rnd, 0.3, 0.45) : between(rnd, 0.08, 0.16)),
          ),
          searchViews: Math.round(
            views * (article ? between(rnd, 0.45, 0.65) : between(rnd, 0.1, 0.25)),
          ),
          mobileViews: Math.round(views * between(rnd, 0.65, 0.8)),
        });
        for (const calc of page.calculators) {
          const n = Math.round(views * calc.share * between(rnd, 0.5, 1.5));
          if (n === 0) continue;
          const sponsorOrgId =
            brandingFor({
              context: calc.context,
              calculatorSlug: calc.slug,
              sponsorships,
              sections: sectionCalcs,
              today: day,
            }).brand?.orgId ?? null;
          const key = `${tenant.id}|${calc.slug}|${sponsorOrgId}|${day}`;
          const row = uses.get(key);
          if (row) row.uses = (row.uses ?? 0) + n;
          else
            uses.set(key, {
              tenantId: tenant.id,
              calculatorSlug: calc.slug,
              sponsorOrgId,
              date: day,
              uses: n,
            });
        }
      }
    }
  }

  for (let i = 0; i < stats.length; i += 1000) {
    await d
      .insert(schema.pageStats)
      .values(stats.slice(i, i + 1000))
      .onConflictDoNothing();
  }
  const useRows = [...uses.values()];
  for (let i = 0; i < useRows.length; i += 1000) {
    await d
      .insert(schema.calculatorUses)
      .values(useRows.slice(i, i + 1000))
      .onConflictDoNothing();
  }
  return stats.length;
}
