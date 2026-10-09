import { describe, expect, it } from "vitest";
import { localePath, normalizeHost, siteOrigin, splitLanguage } from "@/domain/urls";

const tarunBharat = { languages: ["mr", "en"], defaultLanguage: "mr" };
const paperB = { languages: ["en", "mr"], defaultLanguage: "en" };
const paperC = { languages: ["mr"], defaultLanguage: "mr" };

describe("language prefixes", () => {
  it("serves the default language without a prefix", () => {
    expect(splitLanguage("/", tarunBharat)).toEqual({ kind: "page", lang: "mr", rest: "/" });
    expect(splitLanguage("/home-loan/home-loan-checklist", tarunBharat)).toEqual({
      kind: "page",
      lang: "mr",
      rest: "/home-loan/home-loan-checklist",
    });
  });

  it("serves other languages under /<lang>", () => {
    expect(splitLanguage("/en", tarunBharat)).toEqual({ kind: "page", lang: "en", rest: "/" });
    expect(splitLanguage("/en/mutual-funds/sip-basics", tarunBharat)).toEqual({
      kind: "page",
      lang: "en",
      rest: "/mutual-funds/sip-basics",
    });
    expect(splitLanguage("/mr/glossary", paperB)).toEqual({
      kind: "page",
      lang: "mr",
      rest: "/glossary",
    });
  });

  it("redirects a prefixed default-language URL to the unprefixed one", () => {
    expect(splitLanguage("/mr/home-loan", tarunBharat)).toEqual({
      kind: "redirect",
      location: "/home-loan",
    });
    expect(splitLanguage("/mr", tarunBharat)).toEqual({ kind: "redirect", location: "/" });
    expect(splitLanguage("/en/glossary", paperB)).toEqual({
      kind: "redirect",
      location: "/glossary",
    });
  });

  it("treats a language the paper does not publish as an ordinary path", () => {
    expect(splitLanguage("/en/home-loan", paperC)).toEqual({
      kind: "page",
      lang: "mr",
      rest: "/en/home-loan",
    });
  });

  it("builds public paths", () => {
    expect(localePath(tarunBharat, "mr", "/home-loan")).toBe("/home-loan");
    expect(localePath(tarunBharat, "en", "/home-loan")).toBe("/en/home-loan");
    expect(localePath(tarunBharat, "en", "/")).toBe("/en");
    expect(localePath(paperB, "en")).toBe("/");
  });
});

describe("hosts", () => {
  it("normalises hosts", () => {
    expect(normalizeHost("TarunBharat.localhost:3000")).toBe("tarunbharat.localhost");
    expect(normalizeHost("money.tarunbharat.net.")).toBe("money.tarunbharat.net");
    expect(normalizeHost("evil host")).toBeNull();
    expect(normalizeHost(null)).toBeNull();
  });

  it("derives a site origin from APP_URL", () => {
    expect(siteOrigin("tarunbharat.localhost", "http://localhost:3000")).toBe(
      "http://tarunbharat.localhost:3000",
    );
    expect(siteOrigin("money.tarunbharat.net", "https://abcfinance.com")).toBe(
      "https://money.tarunbharat.net",
    );
    expect(siteOrigin("money.tarunbharat.net", undefined)).toBe("https://money.tarunbharat.net");
  });
});
