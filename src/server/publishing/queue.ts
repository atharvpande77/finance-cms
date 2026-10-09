import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/server/db/client";
import type { SessionInfo } from "@/server/auth/sessions";
import { can, organisationsFor } from "@/domain/permissions";
import {
  canSeeQueue,
  copyActions,
  type CopyAction,
  type ExplicitReason,
} from "@/domain/publishing";
import type { ArticleType, VersionState } from "@/domain/workflow";
import { localePath, siteOrigin } from "@/domain/urls";
import { env } from "@/server/env";
import { paperName } from "./release";

/** The papers' side (04.3): queues, copies and the per-paper table on the article page. */

type Session = Pick<SessionInfo, "memberships">;

const v = schema.articleVersions;
const a = schema.articles;
const t = schema.tenants;
const e = schema.workflowEvents;

export type Paper = { id: string; slug: string; name: string; publisherOrgId: string };

/** The papers whose queue this person may see: their own, or every paper for staff (D28). */
export async function papersFor(session: Session): Promise<Paper[]> {
  const rows = await db()
    .select({ id: t.id, slug: t.slug, name: t.name, publisherOrgId: t.publisherOrgId })
    .from(t)
    .orderBy(asc(t.slug));
  return rows
    .filter((p) => canSeeQueue(session.memberships, p.publisherOrgId))
    .map((p) => ({ ...p, name: paperName(p.name, p.slug) }));
}

const copyColumns = {
  copyId: v.id,
  articleId: v.articleId,
  tenantId: v.tenantId,
  rev: v.rev,
  language: v.language,
  headline: v.headline,
  summary: v.summary,
  body: v.body,
  state: v.state,
  approvalType: v.approvalType,
  publishedAt: v.publishedAt,
  autoApproveAt: v.autoApproveAt,
  heldAt: v.heldAt,
  requiresExplicit: v.requiresExplicit,
  explicitReasons: v.explicitReasons,
  releasedAt: v.createdAt,
  slug: a.slug,
  articleType: a.type,
  sectionSlug: schema.sections.slug,
  sectionName: schema.sections.name,
  organisationName: schema.organisations.name,
  authorName: schema.authors.name,
  tenantSlug: t.slug,
  tenantName: t.name,
  tenantHosts: t.hosts,
  tenantDefaultLanguage: t.defaultLanguage,
  publisherOrgId: t.publisherOrgId,
};

function copies() {
  return db()
    .select(copyColumns)
    .from(v)
    .innerJoin(a, eq(a.id, v.articleId))
    .innerJoin(t, eq(t.id, v.tenantId))
    .innerJoin(schema.sections, eq(schema.sections.id, a.sectionId))
    .innerJoin(schema.organisations, eq(schema.organisations.id, a.organisationId))
    .leftJoin(schema.authors, eq(schema.authors.id, a.authorId));
}

type CopyRow = Awaited<ReturnType<ReturnType<typeof copies>["where"]>>[number];

export type QueueCopy = Omit<CopyRow, "explicitReasons" | "tenantName"> & {
  articleType: ArticleType;
  state: VersionState;
  explicitReasons: ExplicitReason[];
  tenantName: string;
  releaseNote: string | null;
  holdReason: string | null;
  actions: CopyAction[];
  /** Where readers find the copy once it is live. */
  publicUrl: string;
};

/** The editor's release note and the latest hold reason of each copy, from its events. */
async function notesFor(copyIds: string[]) {
  if (copyIds.length === 0) return new Map<string, { note: string | null; hold: string | null }>();
  const rows = await db()
    .select({ versionId: e.versionId, action: e.action, comment: e.comment })
    .from(e)
    .where(and(inArray(e.versionId, copyIds), inArray(e.action, ["release", "hold"])))
    .orderBy(asc(e.id));
  const notes = new Map<string, { note: string | null; hold: string | null }>();
  for (const r of rows) {
    const n = notes.get(r.versionId) ?? { note: null, hold: null };
    if (r.action === "release") n.note = r.comment;
    else n.hold = r.comment;
    notes.set(r.versionId, n);
  }
  return notes;
}

async function withDetails(session: Session, rows: CopyRow[]): Promise<QueueCopy[]> {
  const notes = await notesFor(rows.map((r) => r.copyId));
  return rows.map((r) => ({
    ...r,
    explicitReasons: r.explicitReasons as ExplicitReason[],
    tenantName: paperName(r.tenantName, r.tenantSlug),
    releaseNote: notes.get(r.copyId)?.note ?? null,
    holdReason: r.heldAt ? (notes.get(r.copyId)?.hold ?? null) : null,
    actions: copyActions(session.memberships, r),
    publicUrl:
      siteOrigin(r.tenantHosts[0]!, env().APP_URL) +
      localePath(
        { languages: [], defaultLanguage: r.tenantDefaultLanguage },
        r.language,
        `/${r.sectionSlug}/${r.slug}`,
      ),
  }));
}

export type Queue = {
  papers: Paper[];
  paper: Paper;
  canRunDue: boolean;
  waiting: QueueCopy[];
  live: QueueCopy[];
};

const LIVE_LIMIT = 30;

/** One paper's queue: copies waiting for a decision and the live ones, newest first. */
export async function queueFor(session: Session, paperSlug?: string): Promise<Queue | null> {
  const papers = await papersFor(session);
  const paper = papers.find((p) => p.slug === paperSlug) ?? papers[0];
  if (!paper) return null;
  const [waiting, live] = await Promise.all([
    copies()
      .where(and(eq(v.tenantId, paper.id), eq(v.state, "with_publisher")))
      .orderBy(desc(v.createdAt)),
    copies()
      .where(and(eq(v.tenantId, paper.id), eq(v.state, "published")))
      .orderBy(desc(v.publishedAt))
      .limit(LIVE_LIMIT),
  ]);
  return {
    papers,
    paper,
    canRunDue: can(session.memberships, "copy.run_due", paper.publisherOrgId),
    waiting: await withDetails(session, waiting),
    live: await withDetails(session, live),
  };
}

/** One copy for its preview page; null when it doesn't exist or isn't this person's to see. */
export async function copyForUser(session: Session, copyId: string): Promise<QueueCopy | null> {
  const [row] = await copies().where(eq(v.id, copyId));
  if (!row || !canSeeQueue(session.memberships, row.publisherOrgId)) return null;
  const [copy] = await withDetails(session, [row]);
  return copy!;
}

/** Copies waiting for this person's decision (dashboard): explicit ones first, then by deadline. */
export async function waitingCopies(session: Session): Promise<QueueCopy[]> {
  const orgs = organisationsFor(session.memberships, "copy.decide");
  if (orgs.length === 0) return [];
  const rows = await copies().where(
    and(eq(v.state, "with_publisher"), inArray(t.publisherOrgId, orgs)),
  );
  const items = await withDetails(session, rows);
  const deadline = (c: QueueCopy) => c.autoApproveAt?.getTime() ?? Infinity;
  return items
    .filter((c) => c.actions.length > 0)
    .sort(
      (x, y) =>
        Number(y.requiresExplicit) - Number(x.requiresExplicit) ||
        deadline(x) - deadline(y) ||
        y.releasedAt.getTime() - x.releasedAt.getTime(),
    );
}

export type ArticleCopy = Pick<
  QueueCopy,
  | "copyId"
  | "language"
  | "state"
  | "heldAt"
  | "approvalType"
  | "autoApproveAt"
  | "publishedAt"
  | "requiresExplicit"
  | "explicitReasons"
  | "tenantSlug"
  | "tenantName"
>;

/** The per-paper copies of an article (article page), by paper then language. */
export async function copiesFor(articleId: string): Promise<ArticleCopy[]> {
  const rows = await db()
    .select({
      copyId: v.id,
      language: v.language,
      state: v.state,
      heldAt: v.heldAt,
      approvalType: v.approvalType,
      autoApproveAt: v.autoApproveAt,
      publishedAt: v.publishedAt,
      requiresExplicit: v.requiresExplicit,
      explicitReasons: v.explicitReasons,
      tenantSlug: t.slug,
      tenantName: t.name,
    })
    .from(v)
    .innerJoin(t, eq(t.id, v.tenantId))
    .where(eq(v.articleId, articleId))
    .orderBy(asc(t.slug), asc(v.language));
  return rows.map((r) => ({
    ...r,
    explicitReasons: r.explicitReasons as ExplicitReason[],
    tenantName: paperName(r.tenantName, r.tenantSlug),
  }));
}
