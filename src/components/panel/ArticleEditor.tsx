"use client";

import { useActionState, useMemo, useState } from "react";
import { CircleAlert, CircleCheck, Calculator } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/components/ui/utils";
import { ArticleBody } from "@/components/reader/ArticleBody";
import { runChecks } from "@/domain/checks";
import { suggestSlug } from "@/domain/slug";
import type { ArticleKind } from "@/domain/markup";
import type { ArticleFormState } from "@/app/(platform)/_actions/articles";
import { FormError } from "./FormError";
import { SubmitButton } from "./SubmitButton";

type Option = { id: string; label: string };
type AuthorOption = Option & { contributorType: "staff" | "institution" | "independent" };

export type CreateOptions = {
  sections: Option[];
  authors: AuthorOption[];
  tenants: Option[];
};

const TYPE_FOR: Record<AuthorOption["contributorType"], ArticleKind> = {
  institution: "institution",
  staff: "abcfinance",
  independent: "independent",
};

/**
 * The article editor: markup on one side, the live preview and automated checks on the other
 * (tabs on phones). It posts a plain form, so it works without JavaScript too.
 */
export function ArticleEditor({
  action,
  formName,
  hidden,
  initial,
  slugEditable,
  articleType,
  createOptions,
  submitLabel,
}: {
  action: (prev: ArticleFormState, form: FormData) => Promise<ArticleFormState>;
  formName: string;
  hidden: Record<string, string>;
  initial: { headline: string; summary: string; body: string; slug: string };
  slugEditable: boolean;
  articleType?: ArticleKind;
  createOptions?: CreateOptions;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState<ArticleFormState, FormData>(action, {});
  const start = { ...initial, ...state.values };
  const [headline, setHeadline] = useState(start.headline);
  const [slug, setSlug] = useState(start.slug);
  const [slugTouched, setSlugTouched] = useState(Boolean(start.slug));
  const [body, setBody] = useState(start.body);
  const [authorId, setAuthorId] = useState(
    state.values?.authorId ?? createOptions?.authors[0]?.id ?? "",
  );
  const [tab, setTab] = useState<"write" | "preview">("write");

  const type: ArticleKind =
    articleType ??
    TYPE_FOR[
      createOptions?.authors.find((a) => a.id === authorId)?.contributorType ?? "institution"
    ];
  const checks = useMemo(() => runChecks({ headline, body }), [headline, body]);
  const ticked = state.values?.tenantIds?.split(",");

  return (
    <form action={formAction} data-form={formName} className="grid gap-6">
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <FormError message={state.error} id={`${formName}-error`} />

      {createOptions ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="sectionId">Section</Label>
            <NativeSelect
              id="sectionId"
              name="sectionId"
              defaultValue={state.values?.sectionId}
              required
            >
              {createOptions.sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="authorId">Author</Label>
            <NativeSelect
              id="authorId"
              name="authorId"
              value={authorId}
              onChange={(e) => setAuthorId(e.target.value)}
              required
            >
              {createOptions.authors.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </NativeSelect>
          </div>
          <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm font-medium">Language</legend>
            <div className="flex gap-4">
              {[
                ["en", "English"],
                ["mr", "Marathi"],
              ].map(([value, label]) => (
                <label key={value} className="flex h-10 items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="language"
                    value={value}
                    defaultChecked={(state.values?.language ?? "en") === value}
                    className="size-4 accent-primary"
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="grid gap-2" data-papers>
            <legend className="mb-2 text-sm font-medium">Newspapers</legend>
            <div className="flex flex-wrap gap-x-4">
              {createOptions.tenants.map((t) => (
                <label key={t.id} className="flex h-10 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="tenantIds"
                    value={t.id}
                    defaultChecked={ticked ? ticked.includes(t.id) : true}
                    className="size-4 accent-primary"
                  />
                  {t.label}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-[1fr_16rem]">
        <div className="grid gap-2">
          <Label htmlFor="headline">Headline</Label>
          <Input
            id="headline"
            name="headline"
            value={headline}
            maxLength={200}
            required
            onChange={(e) => {
              setHeadline(e.target.value);
              if (slugEditable && !slugTouched) setSlug(suggestSlug(e.target.value));
            }}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="slug">Web address</Label>
          {slugEditable ? (
            <Input
              id="slug"
              name="slug"
              value={slug}
              required
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              minLength={3}
              maxLength={80}
              placeholder="debt-funds-explained"
              className="font-mono md:text-sm"
              onChange={(e) => {
                setSlug(e.target.value);
                setSlugTouched(true);
              }}
            />
          ) : (
            <p className="flex h-10 items-center truncate font-mono text-sm text-muted-foreground">
              /{slug}
            </p>
          )}
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="summary">Summary</Label>
        <Textarea
          id="summary"
          name="summary"
          defaultValue={start.summary}
          maxLength={400}
          rows={2}
        />
      </div>

      <div className="grid gap-2">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="body">Body</Label>
          <div className="flex rounded-md bg-muted p-0.5 text-sm md:hidden" role="tablist">
            {(["write", "preview"] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={cn(
                  "h-8 rounded-[5px] px-3 capitalize transition-colors duration-150",
                  tab === t ? "bg-background font-medium shadow-xs" : "text-muted-foreground",
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className={cn("grid gap-2", tab === "preview" && "max-md:hidden")}>
            <Textarea
              id="body"
              name="body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={18}
              className="min-h-80 leading-relaxed"
              aria-describedby="markup-help"
            />
            <details id="markup-help" className="text-sm text-muted-foreground">
              <summary className="cursor-pointer py-1 select-none">How to format</summary>
              <ul className="mt-2 grid gap-1 font-mono text-xs">
                <li>Blank line → new paragraph</li>
                <li>## Heading</li>
                <li>- bullet point</li>
                <li>**bold**</li>
                <li>[link text](https://…)</li>
                <li>{"{{calc:emi}}"} on its own line → calculator</li>
              </ul>
            </details>
          </div>
          <div
            className={cn(
              "min-h-80 rounded-lg border bg-card p-4 sm:p-5",
              tab === "write" && "max-md:hidden",
            )}
            aria-label="Preview"
            data-preview
          >
            <p className="mb-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Preview
            </p>
            {headline ? (
              <h2 className="mb-4 text-xl font-semibold text-balance">{headline}</h2>
            ) : null}
            <ArticleBody
              body={body}
              articleType={type}
              linkHosts={[]}
              className="article-preview"
              renderCalculator={(calc) => (
                <div className="flex items-center gap-2 rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
                  <Calculator className="size-4" strokeWidth={1.75} aria-hidden />
                  {calc.name.en}
                </div>
              )}
            />
          </div>
        </div>
      </div>

      <section aria-labelledby={`${formName}-checks`} className="grid gap-2" data-checks>
        <h3 id={`${formName}-checks`} className="text-sm font-medium">
          Automated checks
        </h3>
        {checks.ok ? (
          <p className="flex items-center gap-2 text-sm text-success">
            <CircleCheck className="size-4" strokeWidth={1.75} aria-hidden />
            No problems found.
          </p>
        ) : (
          <ul className="grid gap-1.5">
            {checks.flags.map((f) => (
              <li
                key={f.message}
                className="flex items-start gap-2 text-sm text-warning-foreground"
              >
                <CircleAlert className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} aria-hidden />
                {f.message}
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-pretty text-muted-foreground">
          A flag doesn&apos;t stop the article. It means each newspaper must approve it explicitly.
        </p>
      </section>

      <div>
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
