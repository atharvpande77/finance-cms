import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema, type Tx } from "@/server/db/client";
import { audit } from "@/server/audit";
import type { SessionInfo } from "@/server/auth/sessions";
import { ensureOwnProfile } from "./authors";
import { randomInt } from "node:crypto";
import { initialSlug, isPlaceholderSlug, isSlug } from "@/domain/slug";
import { addMonthsToDay, indianDate } from "@/domain/time";
import {
  authorChoices,
  can,
  canAddLanguage,
  canSetSlug,
  canCreate,
  canView,
  isBeforeRelease,
  nextState,
  returnCommentOk,
  validateSubmit,
  type VersionState,
} from "@/domain/workflow";

/**
 * Writes for the article workflow (04.2). Every change is one transaction that also records a
 * workflow event (state changes) and an audit row. Concurrent changes to one version use its
 * `rev`: the update only applies if nobody changed the version since the person loaded it (D22).
 */

export type Actor = Pick<SessionInfo, "memberships"> & { user: { id: string } };
export type ServiceResult<T = object> =
  ({ ok: true } & T) | { ok: false; error: string; code?: string };

export const LANGUAGES = { en: "English", mr: "Marathi" } as const;
export type Language = keyof typeof LANGUAGES;
const language = z.enum(["en", "mr"]);

export const CONFLICT =
  "Someone else changed this article while you were looking at it. Reload to see their changes.";
const NOT_ALLOWED = "You can't do that to this article now.";
const SLUG_RULE = "Use 3–80 lower-case letters, numbers and single hyphens for the web address.";
const SLUG_TAKEN = "Another article already uses this web address. Choose another.";

export function isUniqueViolation(err: unknown, constraint?: string): boolean {
  const e = err as { code?: string; constraint_name?: string; cause?: unknown };
  const pg = e?.code === "23505" ? e : (e?.cause as typeof e | undefined);
  return pg?.code === "23505" && (!constraint || pg.constraint_name === constraint);
}

async function event(
  tx: Tx,
  actor: Actor,
  versionId: string,
  action: string,
  from: VersionState | null,
  to: VersionState,
  comment: string | null,
  ip: string,
  detail: Record<string, unknown> = {},
) {
  await tx.insert(schema.workflowEvents).values({
    versionId,
    fromState: from,
    toState: to,
    userId: actor.user.id,
    action,
    comment,
  });
  await audit(
    {
      userId: actor.user.id,
      action: `article.${action}`,
      detail: { versionId, from, to, ...detail },
      ip,
    },
    tx,
  );
}

const createInput = z.object({
  sectionId: z.string().uuid({ message: "Choose a section." }),
  language,
  /** "self:<organisationId>", "self:abcfinance" or "expert:<authorId>"; blank with one choice. */
  writtenAs: z.string().trim().default(""),
  headline: z.string().trim().max(200),
  summary: z.string().trim().max(400),
  body: z.string().max(50_000),
});
export type CreateInput = z.input<typeof createInput>;

type Byline =
  | { type: "institution"; organisationId: string }
  | { type: "abcfinance" }
  | { type: "independent"; authorId: string };

/** What the new article is filed as, checked against what this person may file as (D42). */
async function resolveByline(actor: Actor, writtenAs: string): Promise<Byline | null> {
  const choices = authorChoices(actor.memberships);
  let pick = writtenAs;
  if (!pick && choices.length === 1) {
    const only = choices[0]!;
    pick = only.kind === "self" && only.type === "institution" ? `self:${only.organisationId}` : "";
  }
  const [kind, id] = pick.split(":") as [string, string | undefined];
  if (kind === "self" && id === "abcfinance") {
    return choices.some((c) => c.kind === "self" && c.type === "abcfinance")
      ? { type: "abcfinance" }
      : null;
  }
  if (kind === "self" && id) {
    return choices.some(
      (c) => c.kind === "self" && c.type === "institution" && c.organisationId === id,
    )
      ? { type: "institution", organisationId: id }
      : null;
  }
  if (kind === "expert" && id && choices.some((c) => c.kind === "expert")) {
    const [expert] = await db()
      .select({ id: schema.authors.id, contributorType: schema.authors.contributorType })
      .from(schema.authors)
      .where(eq(schema.authors.id, id));
    return expert?.contributorType === "independent"
      ? { type: "independent", authorId: expert.id }
      : null;
  }
  return null;
}

const randomPart = () =>
  Array.from({ length: 6 }, () => "abcdefghijklmnopqrstuvwxyz0123456789"[randomInt(36)]).join("");

export async function createArticle(
  actor: Actor,
  raw: CreateInput,
  ip: string,
): Promise<ServiceResult<{ articleId: string; language: Language }>> {
  if (!canCreate(actor.memberships)) return { ok: false, error: NOT_ALLOWED };
  const parsed = createInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };
  const input = parsed.data;
  if (!input.headline) return { ok: false, error: "Write a headline." };
  const byline = await resolveByline(actor, input.writtenAs);
  if (!byline) return { ok: false, error: "Choose who it's written by." };
  const [abc] = await db()
    .select({ id: schema.organisations.id })
    .from(schema.organisations)
    .where(eq(schema.organisations.type, "abcfinance"));
  const organisationId = byline.type === "institution" ? byline.organisationId : abc!.id;

  const now = new Date();
  // The web address is the editor's to set (D44): a readable one from an English headline, else
  // a placeholder. A clash with another article's gets a short suffix.
  const first = initialSlug(input.headline, randomPart());
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = attempt === 0 ? first : `${first.slice(0, 73).replace(/-+$/, "")}-${randomPart()}`;
    try {
      const articleId = await db().transaction(async (tx) => {
        const authorId =
          byline.type === "independent"
            ? byline.authorId
            : (
                await ensureOwnProfile(
                  tx,
                  actor.user,
                  organisationId,
                  byline.type === "institution" ? "institution" : "staff",
                )
              ).id;
        const [article] = await tx
          .insert(schema.articles)
          .values({
            slug,
            type: byline.type,
            masterLanguage: input.language,
            organisationId,
            authorId,
            sectionId: input.sectionId,
            // Reviewed 6 months after creation by default (04.3).
            reviewBy: addMonthsToDay(indianDate(now), 6),
            createdById: actor.user.id,
          })
          .returning({ id: schema.articles.id });
        const [version] = await tx
          .insert(schema.articleVersions)
          .values({
            articleId: article!.id,
            language: input.language,
            headline: input.headline,
            summary: input.summary,
            body: input.body,
            state: "draft",
          })
          .returning({ id: schema.articleVersions.id });
        await event(tx, actor, version!.id, "create", null, "draft", null, ip, {
          type: byline.type,
        });
        return article!.id;
      });
      return { ok: true, articleId, language: input.language };
    } catch (err) {
      if (!isUniqueViolation(err, "articles_slug_unique")) throw err;
    }
  }
  return { ok: false, error: "Couldn't create the article. Try again." };
}

async function loadVersion(versionId: string) {
  const [row] = await db()
    .select({
      version: schema.articleVersions,
      type: schema.articles.type,
      organisationId: schema.articles.organisationId,
      createdById: schema.articles.createdById,
    })
    .from(schema.articleVersions)
    .innerJoin(schema.articles, eq(schema.articles.id, schema.articleVersions.articleId))
    .where(eq(schema.articleVersions.id, versionId));
  return row;
}

const saveInput = z.object({
  headline: z.string().trim().max(200),
  summary: z.string().trim().max(400),
  body: z.string().max(50_000),
  slug: z.string().trim().toLowerCase().optional(),
});

/** Saves the text (and, before the first release, the web address). */
export async function saveVersion(
  actor: Actor,
  versionId: string,
  rev: number,
  raw: z.input<typeof saveInput>,
  ip: string,
): Promise<ServiceResult> {
  const row = await loadVersion(versionId);
  if (!row || !canView(actor.memberships, row, actor.user.id))
    return { ok: false, error: "Article not found." };
  if (!can(actor.memberships, row, row.version, "save")) return { ok: false, error: NOT_ALLOWED };
  const parsed = saveInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };
  const input = parsed.data;
  if (!input.headline) return { ok: false, error: "Write a headline." };

  // Only abcfinance's editors set the web address, and only before the first release (D44).
  const v = schema.articleVersions;
  let newSlug: string | null = null;
  if (input.slug !== undefined) {
    const [article] = await db()
      .select({ slug: schema.articles.slug })
      .from(schema.articles)
      .where(eq(schema.articles.id, row.version.articleId));
    if (article!.slug !== input.slug) {
      const states = await db()
        .select({ state: v.state })
        .from(v)
        .where(and(eq(v.articleId, row.version.articleId), isNull(v.tenantId)));
      const masterStates = states.map((s) => s.state);
      if (!isBeforeRelease(masterStates)) {
        return { ok: false, error: "The web address can't change after the article is released." };
      }
      if (!canSetSlug(actor.memberships, masterStates)) {
        return { ok: false, error: "Only abcfinance's editors set the web address." };
      }
      if (isPlaceholderSlug(input.slug)) {
        return { ok: false, error: "Choose a web address that doesn't start with draft-." };
      }
      if (!isSlug(input.slug)) return { ok: false, error: SLUG_RULE };
      newSlug = input.slug;
    }
  }

  try {
    return await db().transaction(async (tx) => {
      const updated = await tx
        .update(v)
        .set({
          headline: input.headline,
          summary: input.summary,
          body: input.body,
          rev: sql`${v.rev} + 1`,
          updatedAt: new Date(),
        })
        .where(and(eq(v.id, versionId), eq(v.rev, rev), eq(v.state, row.version.state)))
        .returning({ id: v.id });
      if (updated.length === 0) return { ok: false as const, error: CONFLICT, code: "conflict" };
      if (newSlug) {
        await tx
          .update(schema.articles)
          .set({ slug: newSlug })
          .where(eq(schema.articles.id, row.version.articleId));
      }
      await audit(
        {
          userId: actor.user.id,
          action: "article.save",
          detail: { versionId, slug: newSlug ?? undefined },
          ip,
        },
        tx,
      );
      return { ok: true as const };
    });
  } catch (err) {
    if (isUniqueViolation(err, "articles_slug_unique")) return { ok: false, error: SLUG_TAKEN };
    throw err;
  }
}

export type TransitionAction = "submit" | "approve" | "return";

/** Moves a master version one step (04.2). Exactly one of two simultaneous moves wins. */
export async function transition(
  actor: Actor,
  versionId: string,
  rev: number,
  action: TransitionAction,
  comment: string | null,
  ip: string,
): Promise<ServiceResult<{ state: VersionState }>> {
  const row = await loadVersion(versionId);
  if (!row || !canView(actor.memberships, row, actor.user.id))
    return { ok: false, error: "Article not found." };
  const { version } = row;
  if (!can(actor.memberships, row, version, action)) {
    // A stale page asking for a step that has already happened is a conflict, not a refusal.
    return version.rev !== rev
      ? { ok: false, error: CONFLICT, code: "conflict" }
      : { ok: false, error: NOT_ALLOWED, code: "forbidden" };
  }
  const to = nextState(row.type, version.state, action)!;
  const note = comment?.trim() || null;
  if (action === "return" && !returnCommentOk(note)) {
    return {
      ok: false,
      error: "Say why you're returning it: a comment is required.",
      code: "comment",
    };
  }
  if (action === "submit") {
    const problems = validateSubmit(version);
    if (problems.includes("headline_required"))
      return { ok: false, error: "Write a headline before submitting." };
    if (problems.includes("body_too_short")) {
      return { ok: false, error: "Write at least 20 characters of body before submitting." };
    }
  }

  return db().transaction(async (tx) => {
    const v = schema.articleVersions;
    const moved = await tx
      .update(v)
      .set({ state: to, rev: sql`${v.rev} + 1`, updatedAt: new Date() })
      .where(and(eq(v.id, versionId), eq(v.rev, rev), eq(v.state, version.state)))
      .returning({ id: v.id });
    if (moved.length === 0) return { ok: false as const, error: CONFLICT, code: "conflict" };
    await event(tx, actor, versionId, action, version.state, to, note, ip);
    return { ok: true as const, state: to };
  });
}

/** Starts a master draft in another language, as a copy for a person to rewrite (04.2, 04.4). */
export async function addLanguage(
  actor: Actor,
  articleId: string,
  from: string,
  to: string,
  ip: string,
): Promise<ServiceResult<{ language: Language }>> {
  const target = language.safeParse(to);
  if (!target.success) return { ok: false, error: "Choose a language." };
  const [article] = await db()
    .select()
    .from(schema.articles)
    .where(eq(schema.articles.id, articleId));
  if (!article || !canView(actor.memberships, article, actor.user.id))
    return { ok: false, error: "Article not found." };
  if (!canAddLanguage(actor.memberships, article)) return { ok: false, error: NOT_ALLOWED };
  const v = schema.articleVersions;
  const [source] = await db()
    .select()
    .from(v)
    .where(and(eq(v.articleId, articleId), isNull(v.tenantId), eq(v.language, from)));
  if (!source) return { ok: false, error: "Article not found." };
  const already = `This article already has a${target.data === "en" ? "n" : ""} ${LANGUAGES[target.data]} version.`;
  if (source.language === target.data) return { ok: false, error: already };

  try {
    await db().transaction(async (tx) => {
      const [created] = await tx
        .insert(v)
        .values({
          articleId,
          language: target.data,
          headline: source.headline,
          summary: source.summary,
          body: source.body,
          state: "draft",
        })
        .returning({ id: v.id });
      await event(tx, actor, created!.id, "add_language", null, "draft", null, ip, {
        from: source.language,
      });
    });
  } catch (err) {
    if (isUniqueViolation(err, "article_versions_one_master")) return { ok: false, error: already };
    throw err;
  }
  return { ok: true, language: target.data };
}
