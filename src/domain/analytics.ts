/**
 * First-party analytics rules (04.8, 05.1): what the beacon accepts, who is a bot, which
 * visits are mobile, and where a visit came from. Pure; the counting is in
 * `src/server/analytics/track.ts`.
 */
import { CALCULATORS } from "@/domain/calc/catalog";

export const ANALYTICS = {
  /** Bodies over this are dropped unread (05.1). */
  maxBodyBytes: 2048,
  /** Events a minute from one visitor (keyed hash of address, browser, day and paper). */
  eventsPerMinute: 120,
  /** Client side: the page must be visible this long… */
  engagedVisibleMs: 20_000,
  /** …and scrolled this far… */
  engagedScroll: 0.5,
  /** …unless it is shorter than this many screens. */
  shortPageScreens: 1.2,
  maxPathLength: 300,
} as const;

export const PAGE_KINDS = ["article", "calculator", "section", "home", "other"] as const;
export type PageKind = (typeof PAGE_KINDS)[number];

export type Hit = {
  t: "v" | "e" | "c";
  pv: string;
  p: string;
  k: PageKind;
  v: string | null;
  l: string;
  calc: string | null;
  /** The referrer's host name (D48), lower-case, or null. */
  r: string | null;
};

const PV = /^[A-Za-z0-9_-]{12,40}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HOST = /^[a-z0-9.-]{1,253}$/;
const LANGS = new Set(["mr", "en", "hi"]);
const CALC_SLUGS = new Set(CALCULATORS.map((c) => c.slug));

const str = (x: unknown): x is string => typeof x === "string";

/** The beacon body, or null for anything malformed (the beacon then ignores it quietly). */
export function parseHit(text: string): Hit | null {
  if (text.length > ANALYTICS.maxBodyBytes) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;

  if (o.t !== "v" && o.t !== "e" && o.t !== "c") return null;
  if (!str(o.pv) || !PV.test(o.pv)) return null;
  if (
    !str(o.p) ||
    !o.p.startsWith("/") ||
    o.p.startsWith("//") ||
    o.p.length > ANALYTICS.maxPathLength ||
    /[?#\s]/.test(o.p)
  ) {
    return null;
  }
  if (!str(o.k) || !(PAGE_KINDS as readonly string[]).includes(o.k)) return null;
  if (!str(o.l) || !LANGS.has(o.l)) return null;
  if (o.v !== undefined && o.v !== null && (!str(o.v) || !UUID.test(o.v))) return null;
  let calc: string | null = null;
  if (o.t === "c") {
    if (!str(o.calc)) return null;
    calc = o.calc;
  }
  let r: string | null = null;
  if (str(o.r) && o.r !== "") {
    const host = o.r.toLowerCase();
    if (!HOST.test(host)) return null;
    r = host;
  }
  return {
    t: o.t,
    pv: o.pv,
    p: o.p,
    k: o.k as PageKind,
    v: str(o.v) ? o.v.toLowerCase() : null,
    l: o.l,
    calc,
    r,
  };
}

/** A calculator the catalogue knows; others are ignored (E2E-AN-23). */
export function isKnownCalculator(slug: string): boolean {
  return CALC_SLUGS.has(slug);
}

/**
 * Crawlers, headless browsers, monitors, link previewers, HTTP libraries and SEO bots (04.8).
 * "bot", "crawl", "spider" and "slurp" catch most crawlers by name.
 */
const BOT_PATTERN = new RegExp(
  [
    // "bot" ending a word, except the phone maker Cubot.
    "(?<!cu)bot\\b",
    "bot/",
    "crawl",
    "spider",
    "slurp",
    "headless",
    "phantomjs",
    "puppeteer",
    "playwright",
    "selenium",
    "webdriver",
    "lighthouse",
    "pagespeed",
    "pingdom",
    "uptime",
    "statuscake",
    "site24x7",
    "newrelic",
    "datadog",
    "monitor",
    "facebookexternalhit",
    "whatsapp",
    "telegram",
    "slack",
    "discord",
    "skype",
    "embedly",
    "preview",
    "curl",
    "wget",
    "python",
    "java/",
    "okhttp",
    "go-http",
    "node-fetch",
    "undici",
    "axios",
    "libwww",
    "httpclient",
    "http_request",
    "guzzle",
    "scrapy",
    "ahrefs",
    "semrush",
    "mj12",
    "dotbot",
    "petalbot",
    "bytespider",
    "yandex",
    "baiduspider",
    "seznam",
    "screaming frog",
  ].join("|"),
  "i",
);

export function isBot(userAgent: string | null | undefined): boolean {
  const ua = userAgent?.trim() ?? "";
  if (ua.length < 20) return true;
  return BOT_PATTERN.test(ua);
}

export function isMobile(userAgent: string | null | undefined): boolean {
  return /Mobi|Android.+Mobile|iPhone|iPod|Windows Phone|Opera Mini|IEMobile/i.test(
    userAgent ?? "",
  );
}

/** Search engines by host name: the label before the public suffix (04.8). */
const SEARCH_ENGINES = [
  "google",
  "bing",
  "duckduckgo",
  "yahoo",
  "yandex",
  "baidu",
  "ecosia",
  "brave",
  "startpage",
];

export type ReferrerType = "search" | "site" | "direct";

/**
 * Where a visit came from (04.8). `refHost` is the referrer's host name (D48); a referrer on the
 * paper's own host is navigation within it, so direct.
 */
export function referrerType(refHost: string | null | undefined, ownHost: string): ReferrerType {
  const host = refHost?.toLowerCase().replace(/^www\./, "");
  if (!host) return "direct";
  const own = ownHost
    .toLowerCase()
    .replace(/:\d+$/, "")
    .replace(/^www\./, "");
  if (host === own) return "direct";
  const labels = host.split(".");
  // "google.co.in", "search.yahoo.com", "search.brave.com", "duckduckgo.com"
  if (labels.some((label) => SEARCH_ENGINES.includes(label))) return "search";
  return "site";
}

/** Window event a calculator fires on the reader's first change of a value; detail = slug. */
export const CALC_USE_EVENT = "abc:calc";
