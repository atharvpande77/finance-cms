/** A newspaper's look, stored on its tenant row and applied as CSS variables (doc 11.3). */
export const FONT_KEYS = ["karma", "noto-sans", "mukta", "open-sans"] as const;
export type FontKey = (typeof FONT_KEYS)[number];

export type TenantTheme = {
  /** Brand colour: wordmark, links, accents. */
  primary: string;
  /** Secondary brand colour. */
  accent: string;
  /** Page background. */
  bg: string;
  /** Cards and panels on top of the page. */
  surface: string;
  ink: string;
  muted: string;
  /** Strong rules, e.g. under the section menu. */
  rule: string;
  /** The utility strip at the very top. */
  bar: string;
  /** Masthead wordmark and section menu. */
  displayFont: FontKey;
  headingFont: FontKey;
  bodyFont: FontKey;
};

/**
 * CSS custom properties for a theme, prefixed --t-* so they don't collide with Tailwind's own
 * --color-* and --font-* theme variables (site.css maps them onto utilities). Fonts resolve
 * to the next/font variables set on <html>, with Noto Sans Devanagari as the Marathi fallback.
 */
export function themeVariables(theme: TenantTheme): Record<string, string> {
  const font = (key: FontKey) => `var(--font-${key}), var(--font-noto-sans), system-ui, sans-serif`;
  return {
    "--t-primary": theme.primary,
    "--t-accent": theme.accent,
    "--t-bg": theme.bg,
    "--t-surface": theme.surface,
    "--t-ink": theme.ink,
    "--t-muted": theme.muted,
    "--t-rule": theme.rule,
    "--t-bar": theme.bar,
    "--t-font-display": font(theme.displayFont),
    "--t-font-heading": font(theme.headingFont),
    "--t-font-body": font(theme.bodyFont),
  };
}
