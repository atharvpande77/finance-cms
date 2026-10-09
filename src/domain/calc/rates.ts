/**
 * Sponsor-editable rates (04.7): merging saved rates with the defaults, and validating the rates
 * form. Every field has an allowed range, and the "rates as of" date is required.
 */
import { addMonthsToDay } from "@/domain/time";
import { definitionFor, defaultRates, type RateField } from "./fields";

/** Saved rates over the defaults, ignoring unknown, non-numeric and out-of-range values. */
export function mergeRates(slug: string, saved: unknown): Record<string, number> {
  const merged = defaultRates(slug);
  if (!saved || typeof saved !== "object") return merged;
  for (const field of definitionFor(slug)?.rates ?? []) {
    const value = (saved as Record<string, unknown>)[field.key];
    if (typeof value === "number" && Number.isFinite(value) && inRange(field, value)) {
      merged[field.key] = value;
    }
  }
  return merged;
}

function inRange(field: RateField, value: number): boolean {
  return value >= field.min && value <= field.max;
}

const MAX_DECIMALS = 2;
const AS_OF_YEARS = 5;

/**
 * The "as of" date must be a real calendar date, not after today and not more than five years
 * before it. `today` is the Indian calendar day ("YYYY-MM-DD").
 */
export function asOfProblem(asOf: string, today: string): string | null {
  const real =
    /^\d{4}-\d{2}-\d{2}$/.test(asOf) &&
    !Number.isNaN(Date.parse(`${asOf}T00:00:00Z`)) &&
    new Date(`${asOf}T00:00:00Z`).toISOString().slice(0, 10) === asOf;
  if (!real) return "Enter the date these rates apply from.";
  if (asOf > today) return "The “as of” date can't be in the future.";
  if (asOf < addMonthsToDay(today, -12 * AS_OF_YEARS)) {
    return `The “as of” date must be within the last ${AS_OF_YEARS} years.`;
  }
  return null;
}

export type RatesValidation =
  | { ok: true; rates: Record<string, number>; asOf: string }
  | { ok: false; errors: Record<string, string> };

/** Checks a submitted rates form: every field present, numeric, in range; a valid date. */
export function validateRates(
  slug: string,
  form: Record<string, string | undefined>,
  asOf: string,
  today: string,
): RatesValidation {
  const def = definitionFor(slug);
  if (!def) return { ok: false, errors: { form: "Unknown calculator." } };
  const errors: Record<string, string> = {};
  const rates: Record<string, number> = {};
  for (const field of def.rates) {
    const raw = (form[field.key] ?? "").trim().replace(/,/g, "");
    const name = field.label.en;
    if (raw === "") {
      errors[field.key] = `Enter ${lower(name)}.`;
      continue;
    }
    if (!/^-?\d+(\.\d+)?$/.test(raw)) {
      errors[field.key] = `${name} must be a number.`;
      continue;
    }
    if ((raw.split(".")[1] ?? "").length > MAX_DECIMALS) {
      errors[field.key] = `${name} can have at most ${MAX_DECIMALS} decimal places.`;
      continue;
    }
    const value = Number(raw);
    if (!inRange(field, value)) {
      errors[field.key] = `${name} must be between ${field.min} and ${field.max}.`;
      continue;
    }
    rates[field.key] = value;
  }
  const dateProblem = asOfProblem(asOf.trim(), today);
  if (dateProblem) errors.asOf = dateProblem;
  return Object.keys(errors).length
    ? { ok: false, errors }
    : { ok: true, rates, asOf: asOf.trim() };
}

function lower(label: string): string {
  return label.charAt(0).toLowerCase() + label.slice(1);
}
