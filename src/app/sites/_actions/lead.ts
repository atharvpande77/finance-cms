"use server";

import { headers } from "next/headers";
import { tenantByHost } from "@/server/tenants";
import { clientIp } from "@/server/http/client-ip";
import { hit } from "@/server/ratelimit";
import { captureLead, resolveSource, type LeadSource } from "@/server/leads/capture";
import { LEAD_LIMITS, validateLead } from "@/domain/leads";
import { asLang, t } from "@/domain/i18n";

/**
 * The reader's lead form (04.6), posted from the newspaper page itself, so it works without
 * JavaScript. Action ids are global, so the paper is taken from the Host header and the Origin
 * must be that same host (D35). The sponsor is worked out on the server from what the form
 * points at; the browser never names it.
 */

export type LeadFormState = {
  done?: "thanks" | "repeat";
  /** The sponsor's name for the confirmation. */
  sponsor?: string;
  error?: string;
  errors?: Record<string, string>;
  values?: Record<string, string>;
};

const text = (form: FormData, key: string) => String(form.get(key) ?? "");

function source(form: FormData): LeadSource {
  if (text(form, "source") === "calculator") {
    const place = text(form, "place");
    return {
      kind: "calculator",
      calculator: text(form, "calculator"),
      place: place === "section_page" || place === "article" ? place : "calculator_page",
      section: text(form, "section") || undefined,
      versionId: text(form, "versionId") || undefined,
    };
  }
  return { kind: "article", versionId: text(form, "versionId") };
}

export async function submitLeadAction(
  _prev: LeadFormState,
  form: FormData,
): Promise<LeadFormState> {
  const lang = asLang(text(form, "lang"));
  const h = await headers();
  const host = h.get("host");
  const tenant = await tenantByHost(host);
  const origin = h.get("origin");
  let sameHost = false;
  try {
    sameHost = !!origin && !!host && new URL(origin).host === host;
  } catch {
    sameHost = false;
  }
  if (!tenant || !sameHost) return { error: t(lang, "leadRefused") };

  // Bots fill the hidden field: they get a thank-you and nothing is stored.
  if (text(form, LEAD_LIMITS.honeypot)) return { done: "thanks" };

  const values = {
    name: text(form, "name"),
    phone: text(form, "phone"),
    city: text(form, "city"),
    interest: text(form, "interest"),
  };
  const resolved = await resolveSource(tenant, text(form, "lang"), source(form));
  if (!resolved) return { error: t(lang, "leadRefused"), values };

  const checked = validateLead(
    { ...values, consent: form.get("consent") === "on" },
    resolved.sectionSlug,
    resolved.language,
  );
  if (!checked.ok) return { errors: checked.errors, values };

  const ip = clientIp(h);
  const limit = await hit("lead:ip", ip, LEAD_LIMITS.perAddressPerHour, 3600);
  if (!limit.allowed) return { error: t(resolved.language, "leadTooMany"), values };

  const result = await captureLead({ tenant, source: resolved, lead: checked.lead, ip });
  if (result.status === "phone_limit") {
    return { error: t(resolved.language, "leadPhoneLimit"), values };
  }
  return { done: result.status === "repeat" ? "repeat" : "thanks", sponsor: resolved.sponsorName };
}
