"use client";

import { useState } from "react";
import type { Lang } from "@/domain/i18n";
import { t } from "@/domain/i18n";
import type { NumberInput } from "@/domain/calc/fields";
import { formatNumber, localDigits, toAsciiDigits } from "@/domain/calc/money";

/** Slider steps used for a log-scale money range (the typed box stays exact). */
const LOG_STEPS = 1000;

function snap(value: number, input: NumberInput): number {
  const stepped = Math.round(value / input.step) * input.step;
  const clamped = Math.min(Math.max(stepped, input.min), input.max);
  // Avoid 0.30000000000000004 from float steps.
  return Number(clamped.toFixed(4));
}

function toPosition(value: number, input: NumberInput): number {
  if (input.scale !== "log") return value;
  return Math.round((Math.log(value / input.min) / Math.log(input.max / input.min)) * LOG_STEPS);
}

function fromPosition(position: number, input: NumberInput): number {
  if (input.scale !== "log") return position;
  const raw = input.min * (input.max / input.min) ** (position / LOG_STEPS);
  // Round to two significant figures on the log scale, so dragging lands on friendly numbers.
  const magnitude = 10 ** Math.max(Math.floor(Math.log10(raw)) - 1, 0);
  return snap(Math.round(raw / magnitude) * magnitude, input);
}

function decimalsOf(step: number): number {
  return (String(step).split(".")[1] ?? "").length;
}

/**
 * One number input as a slider plus a typed box (one-handed on phones, exact when typed). The
 * box accepts Devanagari digits and commas, and clamps to the range when it loses focus.
 */
export function RangeField({
  id,
  input,
  value,
  onChange,
  lang,
}: {
  id: string;
  input: NumberInput;
  value: number;
  onChange: (value: number) => void;
  lang: Lang;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const decimals = decimalsOf(input.step);
  const shown = draft ?? formatNumber(value, lang, decimals);
  const suffix =
    input.unit === "percent"
      ? "%"
      : input.unit === "years"
        ? t(lang, "unitYears")
        : input.unit === "months"
          ? t(lang, "unitMonths")
          : input.unit === "grams"
            ? t(lang, "unitGrams")
            : null;

  function typed(text: string) {
    setDraft(text);
    const n = Number(toAsciiDigits(text).replace(/[,\s₹]/g, ""));
    if (text.trim() !== "" && Number.isFinite(n) && n >= input.min && n <= input.max) onChange(n);
  }

  function commit() {
    if (draft !== null) {
      const n = Number(toAsciiDigits(draft).replace(/[,\s₹]/g, ""));
      onChange(Number.isFinite(n) && draft.trim() !== "" ? snap(n, input) : value);
    }
    setDraft(null);
  }

  return (
    <div className="grid gap-2" data-input={input.key}>
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={id} className="text-[0.95rem] leading-snug font-semibold">
          {localDigits(input.label[lang], lang)}
        </label>
        <div className="flex h-10 w-40 shrink-0 items-center rounded-lg bg-page px-3 shadow-[inset_0_0_0_1px_oklch(0_0_0/0.12)] focus-within:shadow-[inset_0_0_0_2px_var(--t-primary)]">
          {input.unit === "rupees" ? (
            <span aria-hidden="true" className="mr-1 text-muted">
              ₹
            </span>
          ) : null}
          <input
            id={id}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={shown}
            onChange={(e) => typed(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
            }}
            className="w-full min-w-0 bg-transparent text-right font-semibold tabular-nums outline-none"
          />
          {suffix ? (
            <span aria-hidden="true" className="ml-1.5 text-sm text-muted">
              {suffix}
            </span>
          ) : null}
        </div>
      </div>
      <input
        type="range"
        aria-label={input.label[lang]}
        aria-valuetext={`${shown}${suffix ? ` ${suffix}` : ""}`}
        min={input.scale === "log" ? 0 : input.min}
        max={input.scale === "log" ? LOG_STEPS : input.max}
        step={input.scale === "log" ? 1 : input.step}
        value={toPosition(value, input)}
        onChange={(e) => {
          setDraft(null);
          onChange(fromPosition(Number(e.target.value), input));
        }}
        className="calc-range h-6 w-full cursor-pointer"
      />
      {input.hint ? (
        <p className="text-sm text-muted">{localDigits(input.hint[lang], lang)}</p>
      ) : null}
    </div>
  );
}
