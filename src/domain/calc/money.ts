/**
 * Indian number formatting for calculator results (04.7): grouping as 12,34,567 and amounts over
 * one lakh in lakh and crore, with Devanagari digits in Marathi. Written without `Intl`, so the
 * server and every browser produce the same text (no hydration mismatch from ICU differences).
 */
import type { Lang } from "@/domain/i18n";

const DEVANAGARI = "०१२३४५६७८९";
const LAKH = 100_000;
const CRORE = 10_000_000;

/** Western digits to Devanagari in Marathi; unchanged in English. */
export function localDigits(text: string, lang: Lang): string {
  return lang === "mr" ? text.replace(/[0-9]/g, (d) => DEVANAGARI[Number(d)]!) : text;
}

/** Devanagari digits (and Indian commas) back to a plain number string, for typed input. */
export function toAsciiDigits(text: string): string {
  return text.replace(/[०-९]/g, (d) => String(DEVANAGARI.indexOf(d)));
}

/** Indian digit grouping of a non-negative integer string: 1234567 → 12,34,567. */
function groupIndian(digits: string): string {
  if (digits.length <= 3) return digits;
  const last3 = digits.slice(-3);
  const rest = digits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return `${rest},${last3}`;
}

/** A number with Indian grouping and up to `decimals` places (trailing zeros dropped). */
export function formatNumber(n: number, lang: Lang, decimals = 0): string {
  if (!Number.isFinite(n)) return localDigits("0", lang);
  const negative = n < 0;
  const fixed = Math.abs(n).toFixed(decimals);
  const [whole, frac] = fixed.split(".") as [string, string | undefined];
  const trimmed = frac?.replace(/0+$/, "");
  const text = `${negative ? "−" : ""}${groupIndian(whole)}${trimmed ? `.${trimmed}` : ""}`;
  return localDigits(text, lang);
}

/** Whole rupees with Indian grouping: ₹12,34,567. */
export function formatRupees(n: number, lang: Lang): string {
  return `₹${formatNumber(Math.round(n), lang)}`;
}

/**
 * Rupees in words for large amounts: ₹45.26 lakh, ₹1.6 crore (₹४५.२६ लाख, ₹१.६ कोटी). Below one
 * lakh, plain grouped rupees. The unit is chosen after rounding, so ₹99,99,999 reads "₹1 crore".
 */
export function formatAmount(n: number, lang: Lang): string {
  const abs = Math.abs(n);
  if (Math.round(abs) < LAKH) return formatRupees(n, lang);
  const sign = n < 0 ? "−" : "";
  const lakhs = Math.round((abs / LAKH) * 100) / 100;
  if (lakhs < 100) {
    return `${sign}₹${formatNumber(lakhs, lang, 2)} ${lang === "mr" ? "लाख" : "lakh"}`;
  }
  const crores = Math.round((abs / CRORE) * 100) / 100;
  return `${sign}₹${formatNumber(crores, lang, 2)} ${lang === "mr" ? "कोटी" : "crore"}`;
}
