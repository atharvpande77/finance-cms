"use client";

import { useId, useRef, useState } from "react";
import { CALC_USE_EVENT } from "@/domain/analytics";
import { t, type Lang } from "@/domain/i18n";
import {
  choiceOptions,
  definitionFor,
  initialValues,
  readerInputs,
  type ChoiceInput,
} from "@/domain/calc/fields";
import { computeResult, type ResultItem } from "@/domain/calc/compute";
import { formatAmount, formatNumber, localDigits } from "@/domain/calc/money";
import { RangeField } from "./RangeField";

export type CalculatorProps = {
  slug: string;
  lang: Lang;
  name: string;
  /** The rates this place uses (the brand's, abcfinance's or the defaults; D33). */
  rates: Record<string, number>;
  asOf: string;
  /** "Rates as of" date, formatted on the server. */
  asOfLabel: string;
  brand: { name: string; label: "calculator_by" | "sponsored_by" } | null;
  embedded?: boolean;
  /** Link to the calculator's own page, shown when embedded. */
  pageHref?: string;
  /** The lead call-to-action, when the calculator has one (M4b). */
  children?: React.ReactNode;
};

/** camelCase keys as data-attribute names (React wants them lower-case). */
const kebab = (key: string) => key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

function formatValue(item: ResultItem, lang: Lang, words: boolean): string {
  switch (item.unit) {
    case "rupees":
      return words
        ? formatAmount(item.value, lang)
        : `₹${formatNumber(Math.round(item.value), lang)}`;
    case "percent":
      return `${formatNumber(item.value, lang, 2)}%`;
    case "multiple":
      return `${formatNumber(item.value, lang, 1)}×`;
    case "years":
      return `${formatNumber(item.value, lang)} ${t(lang, "unitYears")}`;
  }
}

function ChoiceField({
  input,
  value,
  values,
  onChange,
  lang,
}: {
  input: ChoiceInput;
  value: string;
  values: Record<string, number | string>;
  onChange: (value: string) => void;
  lang: Lang;
}) {
  const name = useId();
  return (
    <fieldset className="grid gap-2" data-input={input.key}>
      <legend className="mb-2 text-[0.95rem] leading-snug font-semibold">
        {localDigits(input.label[lang], lang)}
      </legend>
      <div className="flex flex-wrap gap-2">
        {choiceOptions(input, values).map((o) => (
          <label
            key={o.value}
            className="relative inline-flex min-h-10 cursor-pointer items-center rounded-full bg-page px-3.5 py-1.5 text-sm font-medium shadow-[inset_0_0_0_1px_oklch(0_0_0/0.12)] transition-[box-shadow,background-color] duration-150 has-checked:bg-primary/10 has-checked:text-primary has-checked:shadow-[inset_0_0_0_2px_var(--t-primary)] has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-primary"
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              className="sr-only"
            />
            {localDigits(o.label[lang], lang)}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * One of the seven calculators (04.7), live in the browser. The server renders the first result
 * from the same props, so the page doesn't shift when it becomes interactive.
 */
export function Calculator({
  slug,
  lang,
  name,
  rates,
  asOf,
  asOfLabel,
  brand,
  embedded = false,
  pageHref,
  children,
}: CalculatorProps) {
  const def = definitionFor(slug)!;
  const inputs = readerInputs(def, rates);
  const [values, setValues] = useState(() => initialValues(inputs));
  const idBase = useId();
  const used = useRef(false);
  const result = computeResult(slug, values, rates);
  const all = [result.main, ...result.items, ...(result.steps ?? [])];

  function set(key: string, value: number | string) {
    if (!used.current) {
      // The reader's first change counts as one use of this calculator (04.8).
      used.current = true;
      dispatchEvent(new CustomEvent(CALC_USE_EVENT, { detail: slug }));
    }
    setValues((current) => {
      const next = { ...current, [key]: value };
      // A dependent choice (the engine band) must stay one of its new options.
      for (const input of inputs) {
        if (input.kind === "choice" && input.dependsOn?.key === key) {
          const options = choiceOptions(input, next);
          if (!options.some((o) => o.value === next[input.key])) {
            next[input.key] = (options[1] ?? options[0])!.value;
          }
        }
      }
      return next;
    });
  }

  return (
    <section
      aria-label={name}
      data-calc={slug}
      data-as-of={asOf}
      {...Object.fromEntries(Object.entries(rates).map(([k, v]) => [`data-rate-${kebab(k)}`, v]))}
      {...Object.fromEntries(all.map((r) => [`data-result-${kebab(r.key)}`, r.value]))}
      className={`not-prose rounded-xl bg-surface p-5 shadow-card sm:p-6 ${embedded ? "my-8 border-l-4 border-primary" : ""}`}
    >
      {/* On its own page the heading above already names the calculator. */}
      {embedded || brand ? (
        <header className="mb-5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          {embedded ? (
            <p className="font-heading text-lg leading-snug font-bold text-balance">{name}</p>
          ) : null}
          {brand ? (
            <p className="text-sm font-semibold text-primary" data-brand={brand.label}>
              {t(lang, brand.label === "calculator_by" ? "calculatorBy" : "sponsoredBy", {
                name: brand.name,
              })}
            </p>
          ) : null}
        </header>
      ) : null}

      <div
        className={`grid gap-6 ${embedded ? "" : "md:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)] md:gap-8"}`}
      >
        <div className="grid content-start gap-5">
          {inputs.map((input) =>
            input.kind === "number" ? (
              <RangeField
                key={input.key}
                id={`${idBase}-${input.key}`}
                input={input}
                value={Number(values[input.key])}
                onChange={(v) => set(input.key, v)}
                lang={lang}
              />
            ) : (
              <ChoiceField
                key={input.key}
                input={input}
                value={String(values[input.key])}
                values={values}
                onChange={(v) => set(input.key, v)}
                lang={lang}
              />
            ),
          )}
        </div>

        <div
          className={`grid content-start gap-4 self-start rounded-lg bg-page p-4 sm:p-5 ${embedded ? "" : "md:sticky md:top-20"}`}
          aria-live="polite"
        >
          <div>
            <p className="text-sm text-muted">{localDigits(result.main.label[lang], lang)}</p>
            <p className="mt-1 font-display text-3xl leading-tight font-bold text-primary tabular-nums">
              {formatValue(result.main, lang, true)}
            </p>
          </div>
          <dl className="grid gap-2 text-[0.95rem]">
            {result.items.map((item) => (
              <div key={item.key} className="flex items-baseline justify-between gap-3">
                <dt className="text-muted">{localDigits(item.label[lang], lang)}</dt>
                <dd className="text-right font-semibold tabular-nums">
                  {formatValue(item, lang, true)}
                </dd>
              </div>
            ))}
          </dl>
          {result.steps ? (
            <details className="group text-[0.95rem]">
              <summary className="cursor-pointer font-semibold text-primary">
                {t(lang, "workedSteps")}
              </summary>
              <dl className="mt-2 grid gap-1.5">
                {result.steps.map((item) => (
                  <div key={item.key} className="flex items-baseline justify-between gap-3">
                    <dt className="text-muted">{localDigits(item.label[lang], lang)}</dt>
                    <dd className="text-right tabular-nums">{formatValue(item, lang, false)}</dd>
                  </div>
                ))}
              </dl>
            </details>
          ) : null}
          {children}
        </div>
      </div>

      <footer className="mt-5 grid gap-2 border-t border-black/10 pt-4 text-sm text-muted">
        <details>
          <summary className="cursor-pointer font-semibold text-ink">
            {t(lang, "howWorkedOut")}
          </summary>
          <p className="mt-2 text-pretty" data-explain>
            {localDigits(def.explain[lang], lang)}
          </p>
        </details>
        <p>
          {t(lang, "ratesAsOf", { date: asOfLabel })} · {t(lang, "estimateNotAdvice")}
        </p>
        {embedded && pageHref ? (
          <a
            href={pageHref}
            className="inline-flex min-h-10 items-center font-semibold text-primary underline-offset-4 hover:underline"
          >
            {t(lang, "openCalculator")} <span aria-hidden="true">&nbsp;→</span>
          </a>
        ) : null}
      </footer>
    </section>
  );
}
