/**
 * Lead rules (04.6): Indian mobile numbers, the consent wording, interests per section, form
 * validation and the lead-quality report. Pure, so the server and the tests share them.
 */
import type { Lang } from "@/domain/i18n";
import { toAsciiDigits } from "@/domain/calc/money";

type L = Record<Lang, string>;

export const LEAD_LIMITS = {
  /** Leads per hour from one address (keyed hash). */
  perAddressPerHour: 5,
  /** Stored leads per phone number in 24 hours, across sponsors. */
  perPhonePerDay: 3,
  /** A repeat from the same number to the same sponsor in this window isn't stored again. */
  repeatWindowHours: 24,
  /** The hidden field only bots fill. */
  honeypot: "website",
} as const;

/**
 * A 10-digit Indian mobile (starting 6–9), or null. Accepts spaces and hyphens, a `+91`, `91` or
 * `0` prefix, and Devanagari digits. `91` is stripped only from 12 digits and `0` only from 11,
 * so numbers that merely start with 9 or 0 aren't damaged.
 */
export function normalizeIndianMobile(raw: string): string | null {
  const text = toAsciiDigits(raw).trim();
  if (!/^\+?[\d\s-]+$/.test(text)) return null;
  let digits = text.replace(/[^\d]/g, "");
  if (text.startsWith("+")) {
    if (!digits.startsWith("91")) return null;
    digits = digits.slice(2);
  } else if (digits.length === 12 && digits.startsWith("91")) {
    digits = digits.slice(2);
  } else if (digits.length === 11 && digits.startsWith("0")) {
    digits = digits.slice(1);
  }
  return /^[6-9]\d{9}$/.test(digits) ? digits : null;
}

export const CONSENT_VERSION = "v1";

/**
 * The consent wording shown beside the checkbox and stored with the lead. English is 04.6's; the
 * Marathi is a draft for legal and native review (D39). Deterministic: what is stored is exactly
 * what was shown.
 */
export function consentText(sponsor: string, lang: Lang): string {
  return lang === "mr"
    ? `माझ्या चौकशीबद्दल ${sponsor} मला फोनवर संपर्क करू शकते, याला माझी संमती आहे. माझे नाव, मोबाइल क्रमांक, शहर आणि आवड फक्त ${sponsor} सोबत शेअर केली जाईल आणि फक्त या विनंतीला उत्तर देण्यासाठी वापरली जाईल. मी ${sponsor} ला माझी माहिती कधीही हटवण्यास सांगू शकते/शकतो.`
    : `I agree that ${sponsor} may contact me by phone about my enquiry. My name, mobile number, city and interest will be shared only with ${sponsor} and used only to respond to this request. I can ask ${sponsor} to delete my details at any time.`;
}

export type Interest = { key: string; label: L };

const NOT_SURE: Interest = {
  key: "not_sure",
  label: { en: "Not sure yet", mr: "अजून ठरवले नाही" },
};
const i = (key: string, en: string, mr: string): Interest => ({ key, label: { en, mr } });

/** What a reader may be interested in, per section (04.6). Marathi labels are a draft (D39). */
export const INTERESTS: Record<string, readonly Interest[]> = {
  "mutual-funds": [
    i("sip", "Start a SIP", "एसआयपी सुरू करणे"),
    i("lump_sum", "Lump sum", "एकरकमी गुंतवणूक"),
    i("tax_saving", "Tax saving", "कर बचत"),
    NOT_SURE,
  ],
  "health-insurance": [
    i("myself", "For myself", "स्वतःसाठी"),
    i("family_floater", "Family floater", "फॅमिली फ्लोटर"),
    i("parents", "Parents or seniors", "आई-वडील किंवा ज्येष्ठ नागरिक"),
    NOT_SURE,
  ],
  "life-insurance": [
    i("term", "Term insurance", "टर्म विमा"),
    i("savings", "Savings plan", "बचत योजना"),
    i("retirement", "Retirement plan", "निवृत्ती योजना"),
    NOT_SURE,
  ],
  "motor-insurance": [
    i("car", "Car", "कार"),
    i("two_wheeler", "Two-wheeler", "दुचाकी"),
    i("renewal", "Renewal", "पॉलिसी नूतनीकरण"),
    NOT_SURE,
  ],
  "home-loan": [
    i("new", "New home loan", "नवीन गृहकर्ज"),
    i("balance_transfer", "Balance transfer", "बॅलन्स ट्रान्सफर"),
    i("top_up", "Top-up", "टॉप-अप कर्ज"),
    NOT_SURE,
  ],
  "education-loan": [
    i("india", "Study in India", "भारतात शिक्षण"),
    i("abroad", "Study abroad", "परदेशात शिक्षण"),
    NOT_SURE,
  ],
  "gold-loans": [
    i("loan", "Gold loan", "सोने तारण कर्ज"),
    i("renewal_transfer", "Renewal or transfer", "नूतनीकरण किंवा ट्रान्सफर"),
    NOT_SURE,
  ],
  "credit-cards": [
    i("travel", "Travel", "प्रवास"),
    i("rewards", "Rewards", "रिवॉर्ड्स"),
    i("fuel", "Fuel", "इंधन"),
    NOT_SURE,
  ],
};

export function interestsFor(sectionSlug: string): readonly Interest[] {
  return INTERESTS[sectionSlug] ?? [NOT_SURE];
}

const MESSAGES = {
  name: { en: "Enter your name (2 to 80 characters).", mr: "तुमचे नाव लिहा (2 ते 80 अक्षरे)." },
  phone: {
    en: "Enter a 10-digit Indian mobile number.",
    mr: "10 अंकी भारतीय मोबाइल क्रमांक लिहा.",
  },
  city: { en: "Enter your city (2 to 60 characters).", mr: "तुमचे शहर लिहा (2 ते 60 अक्षरे)." },
  markup: {
    en: "Please don't use < or > here.",
    mr: "येथे < किंवा > वापरू नका.",
  },
  interest: { en: "Choose what you're interested in.", mr: "तुम्हाला कशात रस आहे ते निवडा." },
  consent: {
    en: "Tick the box to agree to be contacted.",
    mr: "संपर्कासाठी संमती देण्यासाठी चौकट निवडा.",
  },
} satisfies Record<string, L>;

export type LeadInput = {
  name: string;
  phone: string;
  city: string;
  interest: string;
  consent: boolean;
};

export type ValidLead = {
  name: string;
  phone: string;
  city: string;
  interestKey: string;
  interestLabel: string;
};

const tidy = (s: string) => s.trim().replace(/\s+/g, " ");
const length = (s: string) => [...s].length;

/** Checks a lead form; messages come back in the reader's language. */
export function validateLead(
  input: LeadInput,
  sectionSlug: string,
  lang: Lang,
): { ok: true; lead: ValidLead } | { ok: false; errors: Partial<Record<keyof LeadInput, string>> } {
  const errors: Partial<Record<keyof LeadInput, string>> = {};
  const name = tidy(input.name);
  const city = tidy(input.city);
  if (/[<>]/.test(name)) errors.name = MESSAGES.markup[lang];
  else if (length(name) < 2 || length(name) > 80) errors.name = MESSAGES.name[lang];
  const phone = normalizeIndianMobile(input.phone);
  if (!phone) errors.phone = MESSAGES.phone[lang];
  if (/[<>]/.test(city)) errors.city = MESSAGES.markup[lang];
  else if (length(city) < 2 || length(city) > 60) errors.city = MESSAGES.city[lang];
  const interest = interestsFor(sectionSlug).find((x) => x.key === input.interest);
  if (!interest) errors.interest = MESSAGES.interest[lang];
  if (!input.consent) errors.consent = MESSAGES.consent[lang];
  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    lead: {
      name,
      phone: phone!,
      city,
      interestKey: interest!.key,
      interestLabel: interest!.label[lang],
    },
  };
}

export type LeadStatus = "new" | "contacted" | "qualified" | "junk";
export const LEAD_STATUSES: readonly LeadStatus[] = ["new", "contacted", "qualified", "junk"];

/**
 * The quality report (04.6): worked = moved off "new"; qualified share of worked leads that
 * aren't junk; junk share of all leads (D40). Fractions from 0 to 1; zero for an empty inbox.
 */
export function qualityReport(counts: Partial<Record<LeadStatus, number>>) {
  const n = (s: LeadStatus) => counts[s] ?? 0;
  const total = LEAD_STATUSES.reduce((sum, s) => sum + n(s), 0);
  const worked = n("contacted") + n("qualified") + n("junk");
  const workedNotJunk = worked - n("junk");
  const share = (part: number, whole: number) => (whole > 0 ? part / whole : 0);
  return {
    total,
    worked,
    workedShare: share(worked, total),
    qualifiedShare: share(n("qualified"), workedNotJunk),
    junkShare: share(n("junk"), total),
  };
}
