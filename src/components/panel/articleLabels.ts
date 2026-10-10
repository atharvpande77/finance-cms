import type { VersionState } from "@/domain/workflow";
import type { copyStatus } from "@/domain/publishing";

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
  release: "Sent to the newspapers. Each paper's editor decides on their own copy.",
};

/** How the papers' side names each kind of article (the reader label for institution ones). */
export const ARTICLE_TYPE_LABELS = {
  institution: "Partner content",
  abcfinance: "abcfinance",
  independent: "Independent expert",
} as const;

export const COPY_DONE_MESSAGES: Record<string, string> = {
  approve: "Approved. It's live on your site now.",
  hold: "Held. It won't publish until you approve it.",
  take_down: "Taken down. It's off your site.",
};

/** Badge colour per copy status on the papers' side. */
export const COPY_BADGE: Record<
  ReturnType<typeof copyStatus>,
  "secondary" | "warning" | "success" | "outline"
> = {
  waiting: "secondary",
  held: "warning",
  published: "success",
  taken_down: "outline",
};

/** A released version's status on one paper, in words (D45). */
export const PAPER_STATUS_TEXT: Record<keyof typeof COPY_BADGE, (paper: string) => string> = {
  published: (paper) => `Live on ${paper}`,
  waiting: (paper) => `Waiting at ${paper}`,
  held: (paper) => `Held by ${paper}`,
  taken_down: (paper) => `Taken down from ${paper}`,
};

/** Date and time in India, as the panel shows them. */
export const panelTime = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Asia/Kolkata",
});

export function localized(value: Record<string, string> | null | undefined, lang = "en"): string {
  return value?.[lang] ?? value?.en ?? Object.values(value ?? {})[0] ?? "";
}
