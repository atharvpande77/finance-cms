"use server";

import { redirect } from "next/navigation";
import { assertSameOrigin, requestIp, requireArea } from "@/server/auth/current";
import { release } from "@/server/publishing/release";
import { decideCopy } from "@/server/publishing/decide";
import { publishDue } from "@/server/publishing/deemed";
import { papersFor } from "@/server/publishing/queue";
import { can } from "@/domain/permissions";
import type { CopyAction } from "@/domain/publishing";

/** Release and the papers' decisions (04.3). Each redirects on success; failures stay inline. */

export type PublishingFormState = {
  error?: string;
  values?: Record<string, string>;
};

const text = (form: FormData, key: string) => String(form.get(key) ?? "");
const COPY_ACTIONS: readonly CopyAction[] = ["approve", "hold", "take_down"];

export async function releaseAction(
  _prev: PublishingFormState,
  form: FormData,
): Promise<PublishingFormState> {
  await assertSameOrigin();
  const s = await requireArea("articles");
  const tenantIds = form.getAll("tenantIds").map(String);
  const note = text(form, "note");
  const result = await release(
    s,
    text(form, "versionId"),
    Number(text(form, "rev")),
    tenantIds,
    note,
    await requestIp(),
  );
  if (!result.ok) return { error: result.error, values: { note, tenantIds: tenantIds.join(",") } };
  redirect(`/articles/${text(form, "articleId")}/${text(form, "language")}?done=release`);
}

export async function decideCopyAction(
  _prev: PublishingFormState,
  form: FormData,
): Promise<PublishingFormState> {
  await assertSameOrigin();
  const s = await requireArea("publisher");
  const action = text(form, "action") as CopyAction;
  if (!COPY_ACTIONS.includes(action)) return { error: "Unknown action." };
  const copyId = text(form, "copyId");
  const reason = text(form, "reason");
  const result = await decideCopy(
    s,
    copyId,
    Number(text(form, "rev")),
    action,
    reason,
    await requestIp(),
  );
  if (!result.ok) return { error: result.error, values: { reason } };
  // Back to where the decision was taken: the copy's page or the paper's queue.
  redirect(
    text(form, "back") === "copy"
      ? `/publisher/${copyId}?done=${action}`
      : `/publisher?paper=${result.tenantSlug}&done=${action}`,
  );
}

/**
 * "Publish anything past its window now": a paper's editor for their papers, abcfinance staff for
 * every paper (D28).
 */
export async function runDueAction(
  _prev: PublishingFormState,
  form: FormData,
): Promise<PublishingFormState> {
  await assertSameOrigin();
  const s = await requireArea("publisher");
  const papers = await papersFor(s);
  const paper = papers.find((p) => p.slug === text(form, "paper"));
  if (!paper || !can(s.memberships, "copy.run_due", paper.publisherOrgId)) {
    return { error: "You can't do that on this paper." };
  }
  const tenantIds = can(s.memberships, "copy.oversee")
    ? undefined
    : papers.filter((p) => can(s.memberships, "copy.run_due", p.publisherOrgId)).map((p) => p.id);
  const published = await publishDue(new Date(), { tenantIds, requestedBy: s.user.id });
  redirect(`/publisher?paper=${paper.slug}&done=run_due&count=${published.length}`);
}
