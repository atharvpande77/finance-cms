"use client";

import { useActionState, useId } from "react";
import { useFormStatus } from "react-dom";
import { t, type Lang } from "@/domain/i18n";
import { submitLeadAction, type LeadFormState } from "@/app/sites/_actions/lead";

function Submit({ lang }: { lang: Lang }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex min-h-12 w-full items-center justify-center rounded-lg bg-primary px-5 font-semibold text-white transition-[opacity,scale] duration-150 active:scale-[0.98] disabled:opacity-60 sm:w-auto"
    >
      {t(lang, "leadSubmit")}
    </button>
  );
}

const field =
  "min-h-12 w-full rounded-lg bg-page px-3.5 text-base shadow-[inset_0_0_0_1px_oklch(0_0_0/0.15)] outline-none focus:shadow-[inset_0_0_0_2px_var(--t-primary)] aria-invalid:shadow-[inset_0_0_0_2px_#b42318]";

/**
 * The consented lead form (04.6). Only references to what it sits on travel as hidden fields;
 * the server works out the sponsor, and builds the consent text it stores, from those.
 */
export function LeadForm({
  lang,
  sponsor,
  consent,
  interests,
  hidden,
  id,
}: {
  lang: Lang;
  sponsor: string;
  consent: string;
  interests: { key: string; label: string }[];
  hidden: Record<string, string>;
  id?: string;
}) {
  const [state, action] = useActionState<LeadFormState, FormData>(submitLeadAction, {});
  const uid = useId();
  const errors = state.errors ?? {};
  const values = state.values ?? {};

  if (state.done) {
    return (
      <div
        id={id}
        role="status"
        data-lead-done={state.done}
        className="rounded-xl bg-primary/8 p-5 text-pretty font-semibold text-primary"
      >
        {t(lang, state.done === "repeat" ? "leadRepeat" : "leadThanks", { name: sponsor })}
      </div>
    );
  }

  const input = (name: "name" | "phone" | "city", label: string, extra: object = {}) => (
    <div className="grid gap-1.5">
      <label htmlFor={`${uid}-${name}`} className="text-[0.95rem] font-semibold">
        {label}
      </label>
      <input
        id={`${uid}-${name}`}
        name={name}
        required
        defaultValue={values[name]}
        aria-invalid={errors[name] ? true : undefined}
        aria-describedby={errors[name] ? `${uid}-${name}-error` : undefined}
        className={field}
        {...extra}
      />
      {errors[name] ? (
        <p id={`${uid}-${name}-error`} className="text-sm text-[#b42318]" data-lead-error={name}>
          {errors[name]}
        </p>
      ) : null}
    </div>
  );

  return (
    <form
      id={id}
      action={action}
      data-form="lead"
      className="not-prose grid gap-4 rounded-xl bg-surface p-5 shadow-card sm:p-6"
    >
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <div>
        <p className="font-heading text-xl leading-snug font-bold text-balance">
          {t(lang, "talkTo", { name: sponsor })}
        </p>
        <p className="mt-1 text-[0.95rem] text-pretty text-muted">
          {t(lang, "leadIntro", { name: sponsor })}
        </p>
      </div>
      {state.error ? (
        <p
          role="alert"
          className="rounded-lg bg-[#b42318]/8 px-3.5 py-2.5 text-[0.95rem] text-[#b42318]"
        >
          {state.error}
        </p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        {input("name", t(lang, "leadName"), { autoComplete: "name", maxLength: 80 })}
        {input("phone", t(lang, "leadMobile"), {
          type: "tel",
          inputMode: "tel",
          autoComplete: "tel-national",
        })}
        {input("city", t(lang, "leadCity"), { autoComplete: "address-level2", maxLength: 60 })}
        <div className="grid gap-1.5">
          <label htmlFor={`${uid}-interest`} className="text-[0.95rem] font-semibold">
            {t(lang, "leadInterest")}
          </label>
          <select
            id={`${uid}-interest`}
            name="interest"
            required
            defaultValue={values.interest ?? ""}
            aria-invalid={errors.interest ? true : undefined}
            className={field}
          >
            <option value="" disabled>
              {t(lang, "leadChoose")}
            </option>
            {interests.map((i) => (
              <option key={i.key} value={i.key}>
                {i.label}
              </option>
            ))}
          </select>
          {errors.interest ? (
            <p className="text-sm text-[#b42318]" data-lead-error="interest">
              {errors.interest}
            </p>
          ) : null}
        </div>
      </div>
      {/* Only bots fill this in. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Website
          <input type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>
      <label className="flex items-start gap-3 text-[0.95rem] text-pretty">
        <input
          type="checkbox"
          name="consent"
          required
          className="mt-1 size-5 shrink-0 accent-[var(--t-primary)]"
          aria-invalid={errors.consent ? true : undefined}
        />
        <span data-consent>{consent}</span>
      </label>
      {errors.consent ? (
        <p className="-mt-2 text-sm text-[#b42318]" data-lead-error="consent">
          {errors.consent}
        </p>
      ) : null}
      <div>
        <Submit lang={lang} />
      </div>
    </form>
  );
}
