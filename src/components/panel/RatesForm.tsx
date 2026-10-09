"use client";

import { useActionState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  resetRatesAction,
  saveRatesAction,
  type RatesFormState,
} from "@/app/(platform)/_actions/calculators";
import type { RateField } from "@/domain/calc/fields";
import { formatNumber } from "@/domain/calc/money";
import { FormError } from "./FormError";
import { SubmitButton } from "./SubmitButton";

const n = (value: number) => formatNumber(value, "en", 2);
const UNIT: Record<string, string> = { percent: "%", years: "years" };

/** One calculator's editable rates and "as of" date (04.7), with the reset beside it. */
export function RatesForm({
  orgId,
  slug,
  fields,
  values,
  asOf,
  today,
}: {
  orgId: string;
  slug: string;
  fields: readonly RateField[];
  values: Record<string, number>;
  asOf: string | null;
  today: string;
}) {
  const [state, save] = useActionState<RatesFormState, FormData>(saveRatesAction, {});
  const [resetState, reset] = useActionState<RatesFormState, FormData>(resetRatesAction, {});
  const errors = state.errors ?? {};
  return (
    <div className="grid gap-4">
      <form action={save} data-form={`rates-save-${slug}`} className="grid gap-4" noValidate>
        <input type="hidden" name="orgId" value={orgId} />
        <input type="hidden" name="slug" value={slug} />
        <FormError message={state.error} />
        <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
          {fields.map((f) => {
            const id = `${slug}-${f.key}`;
            return (
              <div key={f.key} className="grid content-start gap-1.5">
                <Label htmlFor={id} className="leading-snug">
                  {f.label.en}
                </Label>
                <div className="relative">
                  {f.unit === "rupees" ? (
                    <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">
                      ₹
                    </span>
                  ) : null}
                  <Input
                    id={id}
                    name={f.key}
                    inputMode="decimal"
                    defaultValue={state.values?.[f.key] ?? String(values[f.key])}
                    aria-invalid={errors[f.key] ? true : undefined}
                    aria-describedby={`${id}-hint`}
                    className={`tabular-nums ${f.unit === "rupees" ? "pl-7" : "pr-16"}`}
                  />
                  {f.unit !== "rupees" ? (
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">
                      {UNIT[f.unit] ?? ""}
                    </span>
                  ) : null}
                </div>
                <p
                  id={`${id}-hint`}
                  className={`text-xs ${errors[f.key] ? "text-destructive" : "text-muted-foreground"}`}
                  data-field-error={errors[f.key] ? f.key : undefined}
                >
                  {errors[f.key] ?? `Allowed ${n(f.min)} to ${n(f.max)}. Standard ${n(f.default)}.`}
                </p>
              </div>
            );
          })}
        </div>
        <div className="grid max-w-56 gap-1.5">
          <Label htmlFor={`${slug}-asOf`}>Rates as of</Label>
          <Input
            id={`${slug}-asOf`}
            name="asOf"
            type="date"
            max={today}
            defaultValue={state.values?.asOf ?? asOf ?? today}
            aria-invalid={errors.asOf ? true : undefined}
          />
          {errors.asOf ? (
            <p className="text-xs text-destructive" data-field-error="asOf">
              {errors.asOf}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">Readers see this date under the result.</p>
          )}
        </div>
        <SubmitButton className="w-full sm:w-fit">Save rates</SubmitButton>
      </form>
      {asOf ? (
        <form
          action={reset}
          data-form={`rates-reset-${slug}`}
          className="grid gap-2 border-t pt-4 sm:flex sm:items-center sm:justify-between"
        >
          <input type="hidden" name="orgId" value={orgId} />
          <input type="hidden" name="slug" value={slug} />
          <FormError message={resetState.error} />
          <p className="text-sm text-muted-foreground">
            Go back to the standard figures and drop your saved ones.
          </p>
          <SubmitButton variant="outline" className="w-full sm:w-fit">
            Reset to standard defaults
          </SubmitButton>
        </form>
      ) : null}
    </div>
  );
}
