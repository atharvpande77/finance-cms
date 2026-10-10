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

export default async function NewArticlePage() {
  const s = await requireArea("articles");
  if (!canCreate(s.memberships)) forbidden();
  const options = await formOptions(s);
  return (
    <>
      <PageHeader
        title="New article"
        description="Write in English or Marathi. You can add the other language later. abcfinance's editor chooses the newspapers and the web address."
      />
      <ArticleEditor
        action={createArticleAction}
        formName="create"
        hidden={{}}
        initial={{ headline: "", summary: "", body: "", slug: "" }}
        slugEditable={false}
        submitLabel="Save draft"
        createOptions={{
          sections: options.sections.map((x) => ({ id: x.id, label: localized(x.name) })),
          writtenAs: options.writtenAs,
        }}
      />
    </>
  );
}
