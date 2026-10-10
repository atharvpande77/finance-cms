import { describe, expect, it } from "vitest";
import { isBot, isKnownCalculator, isMobile, parseHit, referrerType } from "@/domain/analytics";
import { csvCell, percent, toCsv } from "@/domain/csv";

const CHROME_DESKTOP =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const CHROME_ANDROID =
  "Mozilla/5.0 (Linux; Android 14; SM-A156E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36";
const SAFARI_IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";
const FIREFOX_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14.6; rv:143.0) Gecko/20100101 Firefox/143.0";
const IPAD =
  "Mozilla/5.0 (iPad; CPU OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/604.1";

describe("bot filter", () => {
  it("[U-AN-01] lets ordinary browsers through", () => {
    for (const ua of [CHROME_DESKTOP, CHROME_ANDROID, SAFARI_IPHONE, FIREFOX_MAC, IPAD]) {
      expect(isBot(ua), ua).toBe(false);
    }
    // A phone maker whose name ends in "bot".
    expect(
      isBot("Mozilla/5.0 (Linux; Android 12; CUBOT X50) AppleWebKit/537.36 Chrome/120 Mobile"),
    ).toBe(false);
  });

  it("[U-AN-02] catches crawlers, headless browsers, monitors and HTTP libraries", () => {
    for (const ua of [
      "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
      "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36 (compatible; Googlebot/2.1)",
      "Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)",
      "Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)",
      "Mozilla/5.0 (compatible; SemrushBot/7~bl; +http://www.semrush.com/bot.html)",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/141.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Unknown; Linux x86_64) AppleWebKit/538.1 (KHTML, like Gecko) PhantomJS/2.1.1 Safari/538.1",
      "Mozilla/5.0 (compatible; Chrome-Lighthouse) AppleWebKit/537.36 Chrome/141 Safari/537.36",
      "Pingdom.com_bot_version_1.4_(http://www.pingdom.com/)",
      "Mozilla/5.0+(compatible; UptimeRobot/2.0; http://www.uptimerobot.com/)",
      "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
      "WhatsApp/2.23.20.0 A",
      "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
      "TelegramBot (like TwitterBot)",
      "curl/8.5.0 (x86_64-pc-linux-gnu) libcurl",
      "Wget/1.21.4 (linux-gnu) something",
      "python-requests/2.32.3 (some long tail)",
      "Go-http-client/1.1 extended agent string",
      "Java/17.0.2 HotSpot runtime agent",
      "okhttp/4.12.0 android client lib",
      "axios/1.7.2 node.js http library",
      "node-fetch/1.0 (+https://github.com/bitinn/node-fetch)",
      "Screaming Frog SEO Spider/20.0",
    ]) {
      expect(isBot(ua), ua).toBe(true);
    }
  });

  it("[U-AN-03] treats a missing or tiny user agent as a bot", () => {
    expect(isBot(undefined)).toBe(true);
    expect(isBot(null)).toBe(true);
    expect(isBot("")).toBe(true);
    expect(isBot("Mozilla/5.0")).toBe(true);
    expect(isBot("   Mozilla/5.0 (X11)   ")).toBe(true);
  });

  it("[U-AN-04] tells mobile from desktop", () => {
    expect(isMobile(CHROME_ANDROID)).toBe(true);
    expect(isMobile(SAFARI_IPHONE)).toBe(true);
    expect(isMobile(CHROME_DESKTOP)).toBe(false);
    expect(isMobile(FIREFOX_MAC)).toBe(false);
    expect(isMobile(IPAD)).toBe(false);
    expect(isMobile(null)).toBe(false);
  });

  it("[U-AN-05] classifies where a visit came from", () => {
    const own = "money.tarunbharat.net";
    for (const host of [
      "www.google.com",
      "www.google.co.in",
      "google.com",
      "www.bing.com",
      "duckduckgo.com",
      "search.yahoo.com",
      "in.search.yahoo.com",
      "yandex.ru",
      "www.baidu.com",
      "www.ecosia.org",
      "search.brave.com",
      "www.startpage.com",
    ]) {
      expect(referrerType(host, own), host).toBe("search");
    }
    expect(referrerType("www.tarunbharat.net", own)).toBe("site");
    expect(referrerType("news.example.org", own)).toBe("site");
    expect(referrerType(null, own)).toBe("direct");
    expect(referrerType("", own)).toBe("direct");
    // Navigation within the paper's own finance host.
    expect(referrerType("money.tarunbharat.net", own)).toBe("direct");
    expect(referrerType("tarunbharat.localhost", "tarunbharat.localhost:3000")).toBe("direct");
  });
});

describe("beacon body", () => {
  const ok = { t: "v", pv: "abcdefghijkl", p: "/home-loan/emi-basics", k: "article", l: "en" };
  const parse = (o: unknown) => parseHit(JSON.stringify(o));

  it("accepts the documented shape", () => {
    expect(parse(ok)).toEqual({ ...ok, v: null, calc: null, r: null });
    const v = "0b6f3c9e-1d2a-4b5c-8d7e-9f0a1b2c3d4e";
    expect(parse({ ...ok, v, r: "WWW.Google.com" })).toMatchObject({ v, r: "www.google.com" });
    expect(parse({ ...ok, t: "c", calc: "emi" })).toMatchObject({ calc: "emi" });
    expect(parse({ ...ok, p: "/" })).not.toBeNull();
  });

  it("refuses anything malformed", () => {
    for (const bad of [
      "not json",
      "[]",
      "null",
      JSON.stringify({ ...ok, t: "x" }),
      JSON.stringify({ ...ok, pv: "short" }),
      JSON.stringify({ ...ok, pv: "has spaces in it!" }),
      JSON.stringify({ ...ok, pv: "a".repeat(41) }),
      JSON.stringify({ ...ok, p: "relative/path" }),
      JSON.stringify({ ...ok, p: "//evil.example/x" }),
      JSON.stringify({ ...ok, p: "/a?b=c" }),
      JSON.stringify({ ...ok, p: `/${"a".repeat(300)}` }),
      JSON.stringify({ ...ok, k: "page" }),
      JSON.stringify({ ...ok, l: "fr" }),
      JSON.stringify({ ...ok, v: "not-a-uuid" }),
      JSON.stringify({ ...ok, t: "c" }),
      JSON.stringify({ ...ok, r: "https://www.google.com/search?q=x" }),
      JSON.stringify({ ...ok, junk: "x".repeat(2100) }),
    ]) {
      expect(parseHit(bad), bad.slice(0, 40)).toBeNull();
    }
  });

  it("knows the catalogue's calculators", () => {
    expect(isKnownCalculator("sip")).toBe(true);
    expect(isKnownCalculator("crypto")).toBe(false);
  });
});

describe("csv", () => {
  it("[U-AN-10] quotes commas, quotes and newlines, and starts with a byte-order mark for Excel", () => {
    const csv = toCsv([
      ["Headline", "Views"],
      ["Gold, silver", 12],
      ['The "best" SIP', 3],
      ["Two\nlines", 0],
      ["गृहकर्ज", null],
    ]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1)).toBe(
      [
        `"Headline","Views"`,
        `"Gold, silver","12"`,
        `"The ""best"" SIP","3"`,
        `"Two\nlines","0"`,
        `"गृहकर्ज",""`,
        "",
      ].join("\r\n"),
    );
  });

  it("[U-AN-11] neutralises spreadsheet formulas but keeps negative numbers", () => {
    expect(csvCell("=SUM(A1:A9)")).toBe(`"'=SUM(A1:A9)"`);
    expect(csvCell("+1 call me")).toBe(`"'+1 call me"`);
    expect(csvCell("-cmd|' /C calc'!A0")).toBe(`"'-cmd|' /C calc'!A0"`);
    expect(csvCell("@SUM(1)")).toBe(`"'@SUM(1)"`);
    expect(csvCell(-12)).toBe(`"-12"`);
    expect(csvCell(-0.5)).toBe(`"-0.5"`);
    expect(csvCell("-12.5")).toBe(`"-12.5"`);
    expect(csvCell("-3%")).toBe(`"-3%"`);
  });

  it("[U-AN-12] percentages guard against dividing by zero", () => {
    expect(percent(0, 0)).toBe(0);
    expect(percent(5, 0)).toBe(0);
    expect(percent(1, 3)).toBe(33.3);
    expect(percent(2, 3)).toBe(66.7);
    expect(percent(10, 10)).toBe(100);
    expect(percent(Number.NaN, 4)).toBe(0);
  });
});
