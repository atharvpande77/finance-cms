import { beforeAll, describe, expect, it } from "vitest";
import { HttpClient, siteOrigin, E2E_PORT } from "../http-client";
import { insertReaderFixtures } from "./fixtures";

beforeAll(async () => {
  await insertReaderFixtures();
});

const tb = siteOrigin("tarunbharat");
const pb = siteOrigin("paperb");
const pc = siteOrigin("paperc");
const http = new HttpClient();
const origin = (paper: string) => `http://${paper}.localhost:${E2E_PORT}`;

function linkTags(html: string): string[] {
  return [...html.matchAll(/<link\b[^>]*>/g)].map((m) => m[0]);
}
async function hreflangs(url: string): Promise<string[]> {
  return linkTags((await http.get(url)).text)
    .filter((t) => t.includes("hrefLang"))
    .map((t) => t.match(/hrefLang="([^"]+)"/)![1]!)
    .sort();
}

describe("canonical and hreflang (04.4)", () => {
  it("[E2E-UI-23] it has a canonical tag and an hreflang link", async () => {
    const { text } = await http.get(`${tb}/mutual-funds/sip-basics`);
    const tags = linkTags(text);
    expect(tags).toContainEqual(
      expect.stringMatching(
        /rel="canonical" href="http:\/\/tarunbharat\.localhost:\d+\/mutual-funds\/sip-basics"/,
      ),
    );
    expect(tags).toContainEqual(
      expect.stringMatching(/rel="alternate" hrefLang="mr" href="[^"]*\/mutual-funds\/sip-basics"/),
    );
  });

  it("lists only languages published on this paper", async () => {
    expect(await hreflangs(`${tb}/mutual-funds/sip-basics`)).toEqual(["mr", "x-default"]);
    expect(await hreflangs(`${pb}/mutual-funds/sip-basics`)).toEqual(["en", "x-default"]);
    expect(await hreflangs(`${pb}/mutual-funds/emergency-fund-first`)).toEqual([
      "en",
      "mr",
      "x-default",
    ]);
  });

  it("points a later copy's canonical at the first paper that published it", async () => {
    const { text } = await http.get(`${pc}/home-loan/home-loan-checklist`);
    expect(text).toContain(
      `rel="canonical" href="${origin("tarunbharat")}/home-loan/home-loan-checklist"`,
    );
  });
});

describe("indexing", () => {
  it("staging papers are noindex on every page and closed in robots.txt", async () => {
    const page = await http.get(`${pb}/`);
    expect(page.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(page.text).toMatch(/<meta name="robots" content="noindex, nofollow"/);
    const robots = await http.get(`${pb}/robots.txt`);
    expect(robots.status).toBe(200);
    expect(robots.text).toContain("Disallow: /");
  });

  it("live papers allow crawling and advertise the sitemap", async () => {
    const page = await http.get(`${tb}/`);
    expect(page.headers.get("x-robots-tag")).toBeNull();
    expect(page.text).toMatch(/<meta name="robots" content="index, follow"/);
    const robots = await http.get(`${tb}/robots.txt`);
    expect(robots.text).toContain("Allow: /");
    expect(robots.text).toContain(`Sitemap: ${origin("tarunbharat")}/sitemap.xml`);
  });

  it("[E2E-UI-25] the live article is in that paper's sitemap", async () => {
    const res = await http.get(`${tb}/sitemap.xml`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/xml");
    expect(res.text).toContain(`<loc>${origin("tarunbharat")}/mutual-funds/sip-basics</loc>`);
    const pbMap = (await http.get(`${pb}/sitemap.xml`)).text;
    expect(pbMap).toContain(
      `hreflang="mr" href="${origin("paperb")}/mr/mutual-funds/emergency-fund-first"`,
    );
  });

  it("sitemaps list only published content and the paper's own languages", async () => {
    const tbMap = (await http.get(`${tb}/sitemap.xml`)).text;
    for (const slug of [
      "fixture-draft-only",
      "fixture-waiting",
      "fixture-taken-down",
      "fixture-other-paper",
    ]) {
      expect(tbMap, slug).not.toContain(slug);
    }
    expect(tbMap).not.toContain(`${origin("tarunbharat")}/en`);
    const pcMap = (await http.get(`${pc}/sitemap.xml`)).text;
    expect(pcMap).not.toContain("sip-basics");
    expect(pcMap).toContain("gold-loan-before-you-pledge");
  });
});
