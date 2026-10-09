/**
 * Reader-site strings. Marathi wording is a first draft and needs native-editor and
 * compliance review before launch (decisions D10, handover 09.4).
 */
export type Lang = "en" | "mr";

export const LANGUAGE_NAMES: Record<string, string> = { en: "English", mr: "मराठी", hi: "हिन्दी" };

const strings = {
  partnerContent: { en: "Partner content", mr: "भागीदार मजकूर" },
  independentExpert: { en: "Independent expert", mr: "स्वतंत्र तज्ज्ञ" },
  approvedByEditor: {
    en: "Approved by the {paper} editor",
    mr: "{paper} च्या संपादकांनी मंजूर केलेले",
  },
  publishedByDesk: {
    en: "Published by the {paper} finance desk",
    mr: "{paper} अर्थ विभागाद्वारे प्रकाशित",
  },
  poweredBy: { en: "Powered by abcfinance", mr: "abcfinance द्वारे संचालित" },
  latest: { en: "Latest", mr: "ताजे लेख" },
  sections: { en: "Sections", mr: "विभाग" },
  calculators: { en: "Calculators", mr: "कॅल्क्युलेटर" },
  glossary: { en: "Glossary", mr: "शब्दकोश" },
  relatedReads: { en: "Related reads", mr: "संबंधित लेख" },
  noArticlesYet: { en: "No articles here yet.", mr: "येथे अद्याप लेख नाहीत." },
  by: { en: "By", mr: "लेखक" },
  published: { en: "Published", mr: "प्रकाशित" },
  lastReviewed: { en: "Last reviewed", mr: "शेवटचे पुनरावलोकन" },
  disclosedAffiliations: { en: "Disclosed affiliations", mr: "जाहीर केलेले संबंध" },
  licence: { en: "Licence", mr: "परवाना" },
  articlesBy: { en: "Articles by {name}", mr: "{name} यांचे लेख" },
  articlesFrom: { en: "Articles from {name}", mr: "{name} कडील लेख" },
  sponsoredBy: { en: "Sponsored by {name}", mr: "{name} यांच्या सौजन्याने" },
  calculatorBy: { en: "Calculator by {name}", mr: "{name} यांचा कॅल्क्युलेटर" },
  ratesAsOf: { en: "Rates as of {date}", mr: "{date} रोजीचे दर" },
  howWorkedOut: { en: "How this is worked out", mr: "हे कसे काढले जाते" },
  estimateNotAdvice: {
    en: "An estimate to help you plan, not financial advice.",
    mr: "नियोजनासाठी केवळ अंदाज, आर्थिक सल्ला नव्हे.",
  },
  workedSteps: { en: "Step by step", mr: "टप्प्याटप्प्याने" },
  unitYears: { en: "years", mr: "वर्षे" },
  unitMonths: { en: "months", mr: "महिने" },
  unitGrams: { en: "g", mr: "ग्रॅम" },
  openCalculator: { en: "Open calculator", mr: "कॅल्क्युलेटर उघडा" },
  backToPaper: { en: "{paper} home", mr: "{paper} मुख्यपृष्ठ" },
  notFoundTitle: { en: "Page not found", mr: "पान सापडले नाही" },
  notFoundBody: {
    en: "This page doesn't exist or is no longer available.",
    mr: "हे पान अस्तित्वात नाही किंवा आता उपलब्ध नाही.",
  },
  goHome: { en: "Go to the finance section home", mr: "अर्थविभागाच्या मुख्यपृष्ठावर जा" },
  readInLanguage: { en: "Read in", mr: "भाषा" },
  disclaimer: { en: "Disclaimer", mr: "अस्वीकरण" },
  home: { en: "Home", mr: "मुख्यपृष्ठ" },
  skipToContent: { en: "Skip to content", mr: "मुख्य मजकुराकडे जा" },
  allCalculators: { en: "All calculators", mr: "सर्व कॅल्क्युलेटर" },
  allTerms: { en: "All terms", mr: "सर्व संज्ञा" },
} satisfies Record<string, Record<Lang, string>>;

export type StringKey = keyof typeof strings;

export function asLang(value: string): Lang {
  return value === "mr" ? "mr" : "en";
}

/** Translated string with {placeholders} filled in. */
export function t(lang: string, key: StringKey, vars: Record<string, string> = {}): string {
  const template = strings[key][asLang(lang)];
  return template.replace(/\{(\w+)\}/g, (_, name: string) => vars[name] ?? `{${name}}`);
}

/** Picks the language's text from a `{ mr, en }` value, falling back to any available one. */
export function pick(
  text: Partial<Record<string, string>> | null | undefined,
  lang: string,
): string {
  if (!text) return "";
  return text[lang] ?? text.en ?? text.mr ?? Object.values(text)[0] ?? "";
}

/** Long date in the page language, in Indian time. */
export function formatDate(at: Date, lang: string): string {
  return new Intl.DateTimeFormat(lang === "mr" ? "mr-IN" : "en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(at);
}
