import { beforeAll, describe, expect, it } from "vitest";
import { HttpClient, siteOrigin, E2E_PORT } from "../http-client";
import { insertReaderFixtures } from "./fixtures";

const tb = siteOrigin("tarunbharat");
const pb = siteOrigin("paperb");
const pc = siteOrigin("paperc");
const http = new HttpClient();

const get = (url: string) => http.get(url);
const anchors = (html: string, href: string) =>
  [...html.matchAll(/<a\b[^>]*>/g)]
    .map((m) => m[0])
    .filter((tag) => tag.includes(`href="${href}"`));

beforeAll(async () => {
  await insertReaderFixtures();
});

describe("host-based tenancy", () => {
  it("serves each paper in its own theme and default language", async () => {
    const [tbHome, pbHome, pcHome] = await Promise.all([
      get(`${tb}/`),
      get(`${pb}/`),
      get(`${pc}/`),
    ]);
    expect(tbHome.status).toBe(200);
    expect(tbHome.text).toMatch(/<html[^>]*lang="mr"/);
    expect(tbHome.text).toContain("--t-primary:#c8102e");
    expect(pbHome.text).toMatch(/<html[^>]*lang="en"/);
    expect(pbHome.text).toContain("--t-primary:#1546a0");
    expect(pcHome.text).toContain("--t-primary:#17703a");
  });

  it("serves other languages under a prefix", async () => {
    const res = await get(`${tb}/en`);
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/<html[^>]*lang="en"/);
  });

  it("redirects a prefixed default-language URL (308) to its one URL", async () => {
    const tbRes = await get(`${tb}/mr/home-loan?ref=x`);
    expect(tbRes.status).toBe(308);
    expect(tbRes.location).toBe(`http://tarunbharat.localhost:${E2E_PORT}/home-loan?ref=x`);
    const pbRes = await get(`${pb}/en/glossary`);
    expect(pbRes.status).toBe(308);
    expect(pbRes.location).toMatch(/\/glossary$/);
  });

  it("serves nothing on an unknown host, and hides the internal routes on the panel host", async () => {
    expect((await get(`http://unknown.localhost:${E2E_PORT}/`)).status).toBe(404);
    expect((await get(`/sites/tarunbharat.localhost/en`)).status).toBe(404);
  });

  it("treats a language the paper does not publish as an unknown page", async () => {
    expect((await get(`${pc}/en/home-loan`)).status).toBe(404);
  });

  it("answers unknown pages with the paper's own 404", async () => {
    for (const path of [
      "/en/nonexistent",
      "/en/mutual-funds/nope",
      "/en/a/b/c",
      "/calculators/nope",
    ]) {
      expect((await get(`${tb}${path}`)).status, path).toBe(404);
    }
  });
});

describe("reader pages (TESTING §1)", () => {
  it("opens every page type", async () => {
    for (const path of [
      "/",
      "/en",
      "/home-loan",
      "/en/home-loan",
      "/en/mutual-funds/sip-basics",
      "/home-loan/home-loan-checklist",
      "/en/home-loan/home-loan-checklist",
      "/en/calculators",
      "/en/calculators/sip",
      "/en/glossary",
      "/en/glossary/sip",
      "/en/partners/sample-amc",
      "/en/experts/suresh-patil",
    ]) {
      expect((await get(`${tb}${path}`)).status, path).toBe(200);
    }
  });

  it("[E2E-UI-20] readers can open the live article", async () => {
    const res = await get(`${tb}/en/mutual-funds/sip-basics`);
    expect(res.status).toBe(200);
    expect(res.text).toContain("SIP basics: how a small monthly investment adds up");
  });

  it("[E2E-UI-21] it carries the Partner content label and the editor's sign-off", async () => {
    const { text } = await get(`${tb}/en/mutual-funds/sip-basics`);
    expect(text).toContain("Partner content");
    expect(text).toContain("Approved by the Tarun Bharat editor");
    const deemed = await get(`${tb}/en/home-loan/home-loan-checklist`);
    expect(deemed.text).toContain("Published by the Tarun Bharat finance desk");
    expect(deemed.text).not.toContain("Partner content");
  });

  it("[E2E-UI-22] it carries the mutual fund disclaimer", async () => {
    const { text } = await get(`${tb}/en/mutual-funds/sip-basics`);
    expect(text).toContain("Mutual fund investments are subject to market risks");
  });

  it("shows the byline, embedded calculator, related reads and structured data", async () => {
    const { text } = await get(`${tb}/en/mutual-funds/sip-basics`);
    expect(text).toContain('href="/en/experts/anita-kulkarni"');
    expect(text).toContain("SIP calculator");
    expect(text).toContain("Related reads");
    expect(text).toContain('"@type":"Article"');
  });

  it("shows an independent expert's tag and disclosed affiliations", async () => {
    const article = await get(`${tb}/en/mutual-funds/emergency-fund-first`);
    expect(article.text).toContain("Independent expert");
    expect(article.text).toContain("Disclosed affiliations");
    const expert = await get(`${tb}/en/experts/suresh-patil`);
    expect(expert.text).toContain("Distributor of mutual funds for several AMCs");
    expect(expert.text).toContain('"@type":"Person"');
  });

  it("switches language to the same page, or to that language's home when it is missing", async () => {
    const both = await get(`${tb}/en/home-loan/home-loan-checklist`);
    expect(both.text).toContain('href="/home-loan/home-loan-checklist" hrefLang="mr"');
    const englishOnly = await get(`${tb}/en/mutual-funds/sip-basics`);
    expect(englishOnly.text).toContain('href="/" hrefLang="mr"');
  });
});

describe("only published copies are visible", () => {
  it("drafts, copies waiting for the paper, taken-down copies and other papers' copies return 404", async () => {
    for (const slug of [
      "fixture-draft-only",
      "fixture-waiting",
      "fixture-taken-down",
      "fixture-other-paper",
    ]) {
      expect((await get(`${tb}/en/mutual-funds/${slug}`)).status, slug).toBe(404);
    }
    expect((await get(`${pb}/mutual-funds/fixture-other-paper`)).status).toBe(200);
  });
});

describe("links in article bodies (04.11)", () => {
  it("[E2E-ADS-34] an outbound link in an institution's article carries rel=sponsored", async () => {
    const { text } = await get(`${tb}/en/mutual-funds/fixture-links`);
    const [tag] = anchors(text, "https://www.sebi.gov.in/");
    expect(tag).toContain('rel="sponsored noopener noreferrer"');
    expect(tag).toContain('target="_blank"');
  });

  it("[E2E-ADS-35] a link within the site stays a plain link", async () => {
    const { text } = await get(`${tb}/en/mutual-funds/fixture-links`);
    const [tag] = anchors(text, "/en/glossary/sip");
    expect(tag).toBeDefined();
    expect(tag).not.toContain("rel=");
    expect(tag).not.toContain("target=");
  });

  it("[E2E-ADS-36] links that could run code or leave the site unexpectedly are shown as plain text", async () => {
    const { text } = await get(`${tb}/en/mutual-funds/fixture-links`);
    expect(text).toContain("run code");
    expect(text).not.toMatch(/href="javascript:/i);
    expect(text).not.toContain('href="//evil.example');
    expect(text).not.toContain('evil.example"');
  });

  it("[E2E-ADS-37] an outbound link in an abcfinance article is not marked as sponsored", async () => {
    const { text } = await get(`${tb}/en/home-loan/home-loan-checklist`);
    const [tag] = anchors(text, "https://www.rbi.org.in/");
    expect(tag).toContain('rel="noopener noreferrer"');
    expect(tag).not.toContain("sponsored");
  });
});

describe("privacy", () => {
  it("[E2E-AN-02] reader pages set no cookies", async () => {
    for (const url of [
      `${tb}/`,
      `${tb}/en/mutual-funds/sip-basics`,
      `${pb}/`,
      `${tb}/en/nonexistent`,
      `${tb}/sitemap.xml`,
    ]) {
      const res = await new HttpClient().get(url);
      expect(res.headers.getSetCookie(), url).toEqual([]);
    }
  });
});
