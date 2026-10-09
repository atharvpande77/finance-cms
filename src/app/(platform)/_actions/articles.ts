"use server";

import { redirect } from "next/navigation";
import { assertSameOrigin, requestIp, requireArea } from "@/server/auth/current";
import {
  addLanguage,
  createArticle,
  saveVersion,
  transition,
  type TransitionAction,
} from "@/server/articles/service";

/** The article commands (05.3). Each redirects to the article page on success. */

export type ArticleFormState = {
  error?: string;
  values?: Record<string, string>;
};

const text = (form: FormData, key: string) => String(form.get(key) ?? "");

function articlePath(articleId: string, language: string, done: string) {
  return `/articles/${articleId}/${language}?done=${done}`;
}

export async function createArticleAction(
  _prev: ArticleFormState,
  form: FormData,
): Promise<ArticleFormState> {
  await assertSameOrigin();
  const s = await requireArea("articles");
  const values = {
    sectionId: text(form, "sectionId"),
    language: text(form, "language"),
    authorId: text(form, "authorId"),
    headline: text(form, "headline"),
    slug: text(form, "slug"),
    summary: text(form, "summary"),
    body: text(form, "body"),
  };
  const tenantIds = form.getAll("tenantIds").map(String);
  const result = await createArticle(
    s,
    { ...values, language: values.language as "en" | "mr", tenantIds },
    await requestIp(),
  );
  if (!result.ok)
    return { error: result.error, values: { ...values, tenantIds: tenantIds.join(",") } };
  redirect(articlePath(result.articleId, result.language, "create"));
}

export async function saveArticleAction(
  _prev: ArticleFormState,
  form: FormData,
): Promise<ArticleFormState> {
  await assertSameOrigin();
  const s = await requireArea("articles");
  const values = {
    headline: text(form, "headline"),
    summary: text(form, "summary"),
    body: text(form, "body"),
    slug: text(form, "slug"),
  };
  const result = await saveVersion(
    s,
    text(form, "versionId"),
    Number(text(form, "rev")),
    { ...values, slug: form.has("slug") ? values.slug : undefined },
    await requestIp(),
  );
  if (!result.ok) return { error: result.error, values };
  redirect(articlePath(text(form, "articleId"), text(form, "language"), "save"));
}

export async function transitionAction(
  _prev: ArticleFormState,
  form: FormData,
): Promise<ArticleFormState> {
  await assertSameOrigin();
  const s = await requireArea("articles");
  const action = text(form, "action");
  if (!["submit", "approve", "return"].includes(action)) return { error: "Unknown action." };
  const comment = text(form, "comment");
  const result = await transition(
    s,
    text(form, "versionId"),
    Number(text(form, "rev")),
    action as TransitionAction,
    comment,
    await requestIp(),
  );
  if (!result.ok) return { error: result.error, values: { comment } };
  redirect(articlePath(text(form, "articleId"), text(form, "language"), action));
}

export async function addLanguageAction(
  _prev: ArticleFormState,
  form: FormData,
): Promise<ArticleFormState> {
  await assertSameOrigin();
  const s = await requireArea("articles");
  const articleId = text(form, "articleId");
  const result = await addLanguage(
    s,
    articleId,
    text(form, "from"),
    text(form, "to"),
    await requestIp(),
  );
  if (!result.ok) return { error: result.error };
  redirect(articlePath(articleId, result.language, "add_language"));
}
