import type { Metadata } from "next";
import { forbidden } from "next/navigation";
import { PageHeader } from "@/components/panel/PageHeader";
import { ArticleEditor } from "@/components/panel/ArticleEditor";
import { localized } from "@/components/panel/articleLabels";
import { requireArea } from "@/server/auth/current";
import { formOptions } from "@/server/articles/queries";
import { canCreate } from "@/domain/workflow";
import { createArticleAction } from "@/app/(platform)/_actions/articles";

export const metadata: Metadata = { title: "New article" };

const AUTHOR_KIND = {
  institution: "",
  staff: " (abcfinance)",
  independent: " (independent expert)",
};

export default async function NewArticlePage() {
  const s = await requireArea("articles");
  if (!canCreate(s.memberships)) forbidden();
  const options = await formOptions(s);
  return (
    <>
      <PageHeader
        title="New article"
        description="Write in English or Marathi. You can add the other language later."
      />
      <ArticleEditor
        action={createArticleAction}
        formName="create"
        hidden={{}}
        initial={{ headline: "", summary: "", body: "", slug: "" }}
        slugEditable
        submitLabel="Save draft"
        createOptions={{
          sections: options.sections.map((x) => ({ id: x.id, label: localized(x.name) })),
          authors: options.authors.map((a) => ({
            id: a.id,
            label: `${a.name}${AUTHOR_KIND[a.contributorType]}`,
            contributorType: a.contributorType,
          })),
          tenants: options.tenants.map((t) => ({ id: t.id, label: localized(t.name) })),
        }}
      />
    </>
  );
}
