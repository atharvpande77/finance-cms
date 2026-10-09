"use server";

import { redirect } from "next/navigation";
import { assertSameOrigin, requestIp, requireArea } from "@/server/auth/current";
import { resetRates, saveRates } from "@/server/calc/rates";
import { definitionFor } from "@/domain/calc/fields";

/** Sponsor rates (04.7): save and reset. Each redirects back to the calculator on success. */

export type RatesFormState = {
  error?: string;
  errors?: Record<string, string>;
  values?: Record<string, string>;
};

const text = (form: FormData, key: string) => String(form.get(key) ?? "");

function back(orgId: string, slug: string, done: string) {
  return `/calculators?org=${orgId}&calc=${slug}&done=${done}`;
}

export async function saveRatesAction(
  _prev: RatesFormState,
  form: FormData,
): Promise<RatesFormState> {
  await assertSameOrigin();
  const s = await requireArea("calculators");
  const orgId = text(form, "orgId");
  const slug = text(form, "slug");
  const values: Record<string, string> = { asOf: text(form, "asOf") };
  for (const field of definitionFor(slug)?.rates ?? []) values[field.key] = text(form, field.key);
  const result = await saveRates(s, orgId, slug, values, values.asOf!, await requestIp());
  if (!result.ok) {
    return { error: result.error, errors: "errors" in result ? result.errors : undefined, values };
  }
  redirect(back(orgId, slug, "save"));
}

export async function resetRatesAction(
  _prev: RatesFormState,
  form: FormData,
): Promise<RatesFormState> {
  await assertSameOrigin();
  const s = await requireArea("calculators");
  const orgId = text(form, "orgId");
  const slug = text(form, "slug");
  const result = await resetRates(s, orgId, slug, await requestIp());
  if (!result.ok) return { error: result.error };
  redirect(back(orgId, slug, "reset"));
}
