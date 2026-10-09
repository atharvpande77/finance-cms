import type { VersionState } from "@/domain/workflow";

export const LANGUAGE_NAMES: Record<string, string> = { en: "English", mr: "Marathi" };

/** Badge colour per workflow state. */
export const STATE_BADGE: Record<
  VersionState,
  "secondary" | "warning" | "default" | "success" | "outline"
> = {
  draft: "secondary",
  in_approval: "warning",
  compliance_review: "warning",
  editing: "default",
  with_publisher: "success",
  published: "success",
  review_due: "warning",
  unpublished: "outline",
};

export const DONE_MESSAGES: Record<string, string> = {
  create: "Draft created.",
  save: "Saved.",
  submit: "Submitted. It's now with the next person.",
  approve: "Approved and passed on.",
  return: "Returned to the writer with your comment.",
  add_language: "New language version started. Rewrite the copied text, then submit it.",
};

export function localized(value: Record<string, string> | null | undefined, lang = "en"): string {
  return value?.[lang] ?? value?.en ?? Object.values(value ?? {})[0] ?? "";
}
