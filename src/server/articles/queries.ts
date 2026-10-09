import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { db, schema } from "@/server/db/client";
import type { SessionInfo } from "@/server/auth/sessions";
import {
  allowedActions,
  canView,
  isAuthorSide,
  isYourTurn,
  type ArticleRef,
  type VersionState,
} from "@/domain/workflow";

/** The writing area's reads (04.1 visibility): only what this person may see. */

const a = schema.articles;
const v = schema.articleVersions;
const s = schema.sections;

type Session = Pick<SessionInfo, "memberships">;

function visibleOrgs(session: Session): string[] | "all" | "none" {
  if (session.memberships.some((m) => m.organisationType === "abcfinance")) return "all";
  const orgs = session.memberships
    .filter((m) => m.organisationType === "institution")
    .map((m) => m.organisationId);
  return orgs.length ? orgs : "none";
}

export type ArticleListItem = {
  articleId: string;
  slug: string;
  type: ArticleRef["type"];
  organisationName: string;
  sectionName: Record<string, string>;
  versions: Array<{
    versionId: string;
    language: string;
    headline: string;
    state: VersionState;
    updatedAt: Date;
    yourTurn: boolean;
  }>;
  yourTurn: boolean;
  updatedAt: Date;
};

export async function listForUser(session: Session): Promise<ArticleListItem[]> {
  const orgs = visibleOrgs(session);
  if (orgs === "none") return [];
  const rows = await db()
    .select({
      articleId: a.id,
      slug: a.slug,
      type: a.type,
      organisationId: a.organisationId,
      organisationName: schema.organisations.name,
      sectionName: s.name,
      versionId: v.id,
      language: v.language,
      headline: v.headline,
      state: v.state,
      updatedAt: v.updatedAt,
    })
    .from(a)
    .innerJoin(v, and(eq(v.articleId, a.id), isNull(v.tenantId)))
    .innerJoin(s, eq(s.id, a.sectionId))
    .innerJoin(schema.organisations, eq(schema.organisations.id, a.organisationId))
    .where(orgs === "all" ? undefined : inArray(a.organisationId, orgs))
    .orderBy(desc(v.updatedAt));

  const byArticle = new Map<string, ArticleListItem>();
  for (const r of rows) {
    const ref = { type: r.type, organisationId: r.organisationId };
    const yourTurn = isYourTurn(session.memberships, ref, { state: r.state, tenantId: null });
    let item = byArticle.get(r.articleId);
    if (!item) {
      item = {
        articleId: r.articleId,
        slug: r.slug,
        type: r.type,
        organisationName: r.organisationName,
        sectionName: r.sectionName,
        versions: [],
        yourTurn: false,
        updatedAt: r.updatedAt,
      };
      byArticle.set(r.articleId, item);
    }
    item.versions.push({
      versionId: r.versionId,
      language: r.language,
      headline: r.headline,
      state: r.state,
      updatedAt: r.updatedAt,
      yourTurn,
    });
    item.yourTurn ||= yourTurn;
  }
  return [...byArticle.values()].sort(
    (x, y) =>
      Number(y.yourTurn) - Number(x.yourTurn) || y.updatedAt.getTime() - x.updatedAt.getTime(),
  );
}

/** Versions whose next step is this person's (dashboard "Waiting for you"). */
export async function waitingFor(session: Session) {
  const items = await listForUser(session);
  return items.flatMap((item) =>
    item.versions
      .filter((ver) => ver.yourTurn)
      .map((ver) => ({
        ...ver,
        articleId: item.articleId,
        organisationName: item.organisationName,
      })),
  );
}

/** One article in one language, with everything its page shows; null if not visible. */
export async function getForUser(session: Session, articleId: string, language: string) {
  const [article] = await db()
    .select({
      id: a.id,
      slug: a.slug,
      type: a.type,
      masterLanguage: a.masterLanguage,
      organisationId: a.organisationId,
      organisationName: schema.organisations.name,
      sectionId: a.sectionId,
      sectionName: s.name,
      sectionSlug: s.slug,
      authorName: schema.authors.name,
      reviewBy: a.reviewBy,
      createdAt: a.createdAt,
    })
    .from(a)
    .innerJoin(s, eq(s.id, a.sectionId))
    .innerJoin(schema.organisations, eq(schema.organisations.id, a.organisationId))
    .leftJoin(schema.authors, eq(schema.authors.id, a.authorId))
    .where(eq(a.id, articleId));
  if (!article || !canView(session.memberships, article)) return null;

  const masters = await db()
    .select()
    .from(v)
    .where(and(eq(v.articleId, articleId), isNull(v.tenantId)))
    .orderBy(asc(v.createdAt));
  const version = masters.find((m) => m.language === language);
  if (!version) return null;

  const targets = await db()
    .select({
      id: schema.tenants.id,
      name: schema.tenants.name,
      languages: schema.tenants.languages,
    })
    .from(schema.articleTargets)
    .innerJoin(schema.tenants, eq(schema.tenants.id, schema.articleTargets.tenantId))
    .where(eq(schema.articleTargets.articleId, articleId));

  const e = schema.workflowEvents;
  const history = await db()
    .select({
      id: e.id,
      language: v.language,
      fromState: e.fromState,
      toState: e.toState,
      action: e.action,
      comment: e.comment,
      createdAt: e.createdAt,
      userName: schema.users.name,
      actorLabel: e.actorLabel,
    })
    .from(e)
    .innerJoin(v, eq(v.id, e.versionId))
    .leftJoin(schema.users, eq(schema.users.id, e.userId))
    .where(and(eq(v.articleId, articleId), isNull(v.tenantId)))
    .orderBy(desc(e.id));

  const ref = { type: article.type, organisationId: article.organisationId };
  return {
    article,
    version,
    masters,
    targets,
    history,
    actions: allowedActions(session.memberships, ref, version),
    canAddLanguage: isAuthorSide(session.memberships, ref),
  };
}

/** Choices for the new-article form: sections, papers, and the author profiles allowed. */
export async function formOptions(session: Session) {
  const [sections, tenants, authors] = await Promise.all([
    db().select({ id: s.id, slug: s.slug, name: s.name }).from(s).orderBy(asc(s.sortOrder)),
    db()
      .select({
        id: schema.tenants.id,
        name: schema.tenants.name,
        languages: schema.tenants.languages,
      })
      .from(schema.tenants)
      .orderBy(asc(schema.tenants.slug)),
    db()
      .select({
        id: schema.authors.id,
        name: schema.authors.name,
        organisationId: schema.authors.organisationId,
        contributorType: schema.authors.contributorType,
      })
      .from(schema.authors)
      .orderBy(asc(schema.authors.name)),
  ]);
  return { sections, tenants, authors: authors.filter((au) => authorAllowed(session, au)) };
}

/**
 * D24: institution authors write under their institution's profiles; abcfinance writers and
 * editors under staff profiles or as an independent expert.
 */
export function authorAllowed(
  session: Session,
  author: {
    organisationId: string | null;
    contributorType: "staff" | "institution" | "independent";
  },
): boolean {
  if (author.contributorType === "institution") {
    return (
      author.organisationId !== null &&
      isAuthorSide(session.memberships, {
        type: "institution",
        organisationId: author.organisationId,
      })
    );
  }
  return isAuthorSide(session.memberships, { type: "abcfinance", organisationId: "" });
}
