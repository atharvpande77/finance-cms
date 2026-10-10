/** Article slugs (D23): lower-case Latin letters, digits and single hyphens, 3–80 characters. */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isSlug(value: string): boolean {
  return value.length >= 3 && value.length <= 80 && SLUG_PATTERN.test(value);
}

/**
 * A slug from a Latin-script headline ("SIP basics: how it adds up" → "sip-basics-how-it-adds-up").
 * Returns "" for a headline that is mostly not Latin (e.g. Marathi): the writer types one instead.
 */
export function suggestSlug(headline: string): string {
  const letters = headline.match(/\p{L}/gu) ?? [];
  const latin = letters.filter((c) => /[a-z]/i.test(c.normalize("NFD")[0]!));
  if (letters.length === 0 || latin.length / letters.length < 0.8) return "";
  const slug = headline
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (slug.length <= 80) return slug;
  return slug.slice(0, 80).replace(/-[^-]*$/, "");
}

/**
 * A slug the system chose for a headline it couldn't turn into one (e.g. Marathi). abcfinance's
 * editor replaces it before release, and nobody may save one by hand (D44).
 */
export const PLACEHOLDER_PREFIX = "draft-";

export function isPlaceholderSlug(slug: string): boolean {
  return slug.startsWith(PLACEHOLDER_PREFIX);
}

/** The web address an article starts with: from an English headline, else a placeholder. */
export function initialSlug(headline: string, random: string): string {
  const suggested = suggestSlug(headline);
  return isSlug(suggested) && !isPlaceholderSlug(suggested)
    ? suggested
    : `${PLACEHOLDER_PREFIX}${random}`;
}
