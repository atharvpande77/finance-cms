import { and, asc, desc, eq, inArray, isNull, ne, or } from "drizzle-orm";
import { db, schema } from "@/server/db/client";
import type { SessionInfo } from "@/server/auth/sessions";
import { copyStatus } from "@/domain/publishing";
import {
  allowedActions,
  authorChoices,
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

type Session = Pick<SessionInfo, "memberships"> & { user: { id: string } };

function visibleOrgs(session: Session): string[] | "all" | "none" {
  if (session.memberships.some((m) => m.organisationType === "abcfinance")) return "all";
  const orgs = session.memberships
    .filter((m) => m.organisationType === "institution")
    .map((m) => m.organisationId);
  return orgs.length ? orgs : "none";
}

export type PaperStatus = { paper: string; status: ReturnType<typeof copyStatus> };

export type ArticleListItem = {
  articleId: string;
  slug: string;
  type: ArticleRef["type"];
  organisationName: string;
  sectionName: Record<string, string>;
  reviewBy: string;
  versions: Array<{
    versionId: string;
    language: string;
    headline: string;
    state: VersionState;
    updatedAt: Date;
    yourTurn: boolean;
    /** Where the released version is on each paper (D45), newest papers last. */
    papers: PaperStatus[];
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
      reviewBy: a.reviewBy,
      createdById: a.createdById,
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
  // Writers see only what they filed (D45); the organisation filter above is the coarse cut.
  const visible = rows.filter((r) => canView(session.memberships, r, session.user.id));
  const papers = await paperStatuses([...new Set(visible.map((r) => r.articleId))]);
  for (const r of visible) {
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
        reviewBy: r.reviewBy,
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
      papers: papers.get(`${r.articleId}:${r.language}`) ?? [],
    });
    item.yourTurn ||= yourTurn;
  }
  return [...byArticle.values()].sort(
    (x, y) =>
      Number(y.yourTurn) - Number(x.yourTurn) || y.updatedAt.getTime() - x.updatedAt.getTime(),
  );
}

/** Each article language's status on every paper it was sent to, keyed "articleId:language". */
async function paperStatuses(articleIds: string[]): Promise<Map<string, PaperStatus[]>> {
  const out = new Map<string, PaperStatus[]>();
  if (articleIds.length === 0) return out;
  const copies = await db()
    .select({
      articleId: v.articleId,
      language: v.language,
      state: v.state,
      heldAt: v.heldAt,
      name: schema.tenants.name,
      slug: schema.tenants.slug,
    })
    .from(v)
    .innerJoin(schema.tenants, eq(schema.tenants.id, v.tenantId))
    .where(inArray(v.articleId, articleIds))
    .orderBy(asc(schema.tenants.slug));
  for (const c of copies) {
    const key = `${c.articleId}:${c.language}`;
    const list = out.get(key) ?? [];
    list.push({ paper: c.name.en ?? Object.values(c.name)[0] ?? c.slug, status: copyStatus(c) });
    out.set(key, list);
  }
  return out;
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
      createdById: a.createdById,
    })
    .from(a)
    .innerJoin(s, eq(s.id, a.sectionId))
    .innerJoin(schema.organisations, eq(schema.organisations.id, a.organisationId))
    .leftJoin(schema.authors, eq(schema.authors.id, a.authorId))
    .where(eq(a.id, articleId));
  if (!article || !canView(session.memberships, article, session.user.id)) return null;

  const masters = await db()
    .select()
    .from(v)
    .where(and(eq(v.articleId, articleId), isNull(v.tenantId)))
    .orderBy(asc(v.createdAt));
  const version = masters.find((m) => m.language === language);
  if (!version) return null;

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
      tenantName: schema.tenants.name,
    })
    .from(e)
    .innerJoin(v, eq(v.id, e.versionId))
    .leftJoin(schema.users, eq(schema.users.id, e.userId))
    .leftJoin(schema.tenants, eq(schema.tenants.id, v.tenantId))
    .where(and(eq(v.articleId, articleId), or(isNull(v.tenantId), ne(e.action, "release"))))
    .orderBy(desc(e.id));

  const ref = { type: article.type, organisationId: article.organisationId };
  return {
    article,
    version,
    masters,
    history,
    actions: allowedActions(session.memberships, ref, version),
    canAddLanguage: isAuthorSide(session.memberships, ref),
  };
}

export type WrittenAsOption = {
  value: string;
  label: string;
  type: "institution" | "abcfinance" | "independent";
};

/**
 * Choices for the new-article form: sections, and what the person may file as (D42). One
 * choice means no "Written by" field: the writer is the author.
 */
export async function formOptions(session: Session & { user: { name: string } }) {
  const choices = authorChoices(session.memberships);
  const [sections, experts] = await Promise.all([
    db().select({ id: s.id, slug: s.slug, name: s.name }).from(s).orderBy(asc(s.sortOrder)),
    choices.some((c) => c.kind === "expert")
      ? db()
          .select({ id: schema.authors.id, name: schema.authors.name })
          .from(schema.authors)
          .where(eq(schema.authors.contributorType, "independent"))
          .orderBy(asc(schema.authors.name))
      : Promise.resolve([]),
  ]);
  const orgName = (id: string) =>
    session.memberships.find((m) => m.organisationId === id)?.organisationName ?? "";
  const writtenAs: WrittenAsOption[] = choices.flatMap((c): WrittenAsOption[] => {
    if (c.kind === "expert") {
      return experts.map((e) => ({
        value: `expert:${e.id}`,
        label: `${e.name} (independent expert)`,
        type: "independent",
      }));
    }
    return c.type === "institution"
      ? [
          {
            value: `self:${c.organisationId}`,
            label: `${session.user.name}, for ${orgName(c.organisationId)}`,
            type: "institution",
          },
        ]
      : [
          {
            value: "self:abcfinance",
            label: `${session.user.name} (abcfinance)`,
            type: "abcfinance",
          },
        ];
  });
  return { sections, writtenAs };
}
