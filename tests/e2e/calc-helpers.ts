/** Reading calculators from reader pages, and changing rates through the panel's forms. */
import { parse } from "node-html-parser";
import { db, schema } from "@/server/db/client";
import { indianDate } from "@/domain/time";

/** The data attributes of a calculator on a page (`data-calc`, `data-rate-*`, `data-result-*`). */
export function calcAttrs(html: string, slug: string): Record<string, string> | null {
  const el = parse(html).querySelector(`[data-calc="${slug}"]`);
  return el ? el.attributes : null;
}

export function resultOf(html: string, slug: string, key: string): number {
  const attrs = calcAttrs(html, slug);
  if (!attrs) throw new Error(`No calculator ${slug} on the page`);
  return Number(attrs[`data-result-${key}`]);
}

export function rateOf(html: string, slug: string, key: string): number {
  return Number(calcAttrs(html, slug)?.[`data-rate-${key}`]);
}

/** The brand line of a calculator, or null when unbranded. */
export function brandOf(html: string, slug: string): string | null {
  const el = parse(html).querySelector(`[data-calc="${slug}"] [data-brand]`);
  return el ? el.textContent.trim() : null;
}

/** An Indian calendar day `days` before today. */
export function daysAgo(days: number): string {
  return indianDate(new Date(Date.now() - days * 86_400_000));
}

export async function clearRates() {
  await db().delete(schema.calculatorRates);
}
