import { beforeAll, describe, expect, it } from "vitest";
import { parse } from "node-html-parser";
import { pageText, siteOrigin, type HttpClient } from "../http-client";
import { person } from "./auth-helpers";
import { brandOf, calcAttrs, clearRates, resultOf } from "./calc-helpers";
import { CALCULATORS } from "@/domain/calc/catalog";

const pb = siteOrigin("paperb");
const tb = siteOrigin("tarunbharat");

describe("the seven calculators on the reader site", () => {
  let reader: HttpClient;
  const page = (url: string) => reader.get(url);

  beforeAll(async () => {
    // Other suites may have saved rates; these checks are about the standard defaults.
    await clearRates();
    reader = person();
  });

  it("[E2E-CALC-01] all seven calculators are listed and linked", async () => {
    const res = await page(`${pb}/calculators`);
    expect(res.status).toBe(200);
    const links = parse(res.text)
      .querySelectorAll("main a")
      .map((a) => a.getAttribute("href"));
    for (const c of CALCULATORS) {
      expect(links).toContain(`/calculators/${c.slug}`);
      expect(pageText(res.text)).toContain(c.name.en);
      const one = await page(`${pb}/calculators/${c.slug}`);
      expect(one.status, c.slug).toBe(200);
      expect(calcAttrs(one.text, c.slug), c.slug).not.toBeNull();
    }
  });

  it("[E2E-CALC-02] home loan eligibility: affordable EMI = 50% of income minus existing EMIs", async () => {
    const res = await page(`${pb}/calculators/home-loan-eligibility`);
    // 1,00,000 × 50% − 10,000.
    expect(resultOf(res.text, "home-loan-eligibility", "max-emi")).toBe(40_000);
    expect(resultOf(res.text, "home-loan-eligibility", "loan")).toBeCloseTo(4_526_368.14, 1);
    expect(pageText(res.text)).toContain("₹40,000");
  });

  it("[E2E-CALC-03] home loan eligibility: carries the assumptions note", async () => {
    const res = await page(`${pb}/calculators/home-loan-eligibility`);
    const text = pageText(res.text);
    expect(text).toContain("How this is worked out");
    expect(text).toContain("income × FOIR − existing EMIs");
    expect(text).toContain("Rates as of 1 October 2026");
    expect(text).toContain("not financial advice");
  });

  it("[E2E-CALC-04] gold loan: value and eligible loan for 50 g of 22 K at the default price", async () => {
    const res = await page(`${pb}/calculators/gold-loan`);
    expect(resultOf(res.text, "gold-loan", "value")).toBeCloseTo(504_166.67, 1);
    expect(resultOf(res.text, "gold-loan", "loan")).toBe(378_125);
    expect(pageText(res.text)).toContain("₹3.78 lakh");
  });

  it("[E2E-CALC-05] gold loan: offers the three repayment types", async () => {
    const text = pageText((await page(`${pb}/calculators/gold-loan`)).text);
    for (const option of [
      "Interest monthly, principal at the end",
      "EMI",
      "Everything at the end",
    ]) {
      expect(text).toContain(option);
    }
  });

  it("[E2E-CALC-06] motor: estimated premium with GST for the default car", async () => {
    const res = await page(`${pb}/calculators/motor-premium`);
    expect(resultOf(res.text, "motor-premium", "total")).toBeCloseTo(15_919.38, 2);
    expect(resultOf(res.text, "motor-premium", "gst")).toBeCloseTo(2_428.38, 2);
    expect(pageText(res.text)).toContain("₹15,919");
  });

  it("[E2E-CALC-07] motor: shows the No Claim Bonus saving and the steps", async () => {
    const res = await page(`${pb}/calculators/motor-premium`);
    expect(resultOf(res.text, "motor-premium", "ncb-saving")).toBe(5_425);
    expect(resultOf(res.text, "motor-premium", "next-ncb-pct")).toBe(45);
    const text = pageText(res.text);
    expect(text).toContain("Your No Claim Bonus saves");
    for (const step of [
      "Own damage (IDV × rate)",
      "Own damage after NCB",
      "Third-party premium",
      "GST (18%)",
    ]) {
      expect(text).toContain(step);
    }
  });

  it("[E2E-CALC-08] health: suggested sum insured for a 35-year-old family in a large city", async () => {
    const res = await page(`${pb}/calculators/health-cover`);
    expect(resultOf(res.text, "health-cover", "suggested")).toBe(1_750_000);
    expect(resultOf(res.text, "health-cover", "gap")).toBe(1_250_000);
    expect(pageText(res.text)).toContain("₹17.5 lakh");
  });

  it("[E2E-CALC-09] term: suggested cover for the default profile", async () => {
    const res = await page(`${pb}/calculators/term-cover`);
    expect(resultOf(res.text, "term-cover", "suggested")).toBe(16_000_000);
    expect(resultOf(res.text, "term-cover", "multiple")).toBe(16);
    expect(pageText(res.text)).toContain("₹1.6 crore");
  });

  it("[E2E-CALC-10] EMI and SIP still work", async () => {
    const emi = await page(`${pb}/calculators/emi`);
    expect(resultOf(emi.text, "emi", "emi")).toBeCloseTo(17_674.21, 1);
    expect(pageText(emi.text)).toContain("₹17,674");
    const sip = await page(`${pb}/calculators/sip`);
    expect(resultOf(sip.text, "sip", "future-value")).toBeCloseTo(1_161_695.38, 1);
    // Embedded in an article, too.
    const article = await page(`${pb}/mutual-funds/sip-basics`);
    expect(calcAttrs(article.text, "sip")).not.toBeNull();
  });

  it("[E2E-CALC-11] calculators are available in Marathi", async () => {
    const list = pageText((await page(`${tb}/calculators`)).text);
    for (const c of CALCULATORS) expect(list).toContain(c.name.mr);
    const emi = await page(`${tb}/calculators/emi`);
    expect(emi.status).toBe(200);
    const text = pageText(emi.text);
    expect(text).toContain("कर्जाची रक्कम");
    expect(text).toContain("मासिक ईएमआय");
    expect(text).toContain("हे कसे काढले जाते");
    expect((await page(`${pb}/mr/calculators/sip`)).status).toBe(200);
  });

  it("[E2E-CALC-12] Marathi results use lakh and crore words", async () => {
    expect(pageText((await page(`${tb}/calculators/home-loan-eligibility`)).text)).toContain(
      "₹४५.२६ लाख",
    );
    expect(pageText((await page(`${tb}/calculators/term-cover`)).text)).toContain("₹१.६ कोटी");
  });

  it("[E2E-CALC-13] motor and health calculators are sponsored by the General Insurer", async () => {
    for (const slug of ["motor-premium", "health-cover"]) {
      const res = await page(`${pb}/calculators/${slug}`);
      expect(brandOf(res.text, slug), slug).toBe("Sponsored by Sample General Insurer");
    }
  });

  it("[E2E-CALC-14] term calculator is sponsored by the Life Insurer", async () => {
    const res = await page(`${pb}/calculators/term-cover`);
    expect(brandOf(res.text, "term-cover")).toBe("Sponsored by Sample Life Insurer");
    // On abcfinance's own article in the life-insurance section, too.
    const article = await page(`${pb}/life-insurance/how-much-term-cover`);
    expect(brandOf(article.text, "term-cover")).toBe("Sponsored by Sample Life Insurer");
  });

  it("[E2E-CALC-16] unsponsored calculators have neither", async () => {
    for (const slug of ["emi", "gold-loan", "home-loan-eligibility"]) {
      const res = await page(`${pb}/calculators/${slug}`);
      expect(brandOf(res.text, slug), slug).toBeNull();
      expect(res.text, slug).not.toContain("data-lead-cta");
    }
  });

  it("brands an institution's article with its own name and an expert's article with none", async () => {
    const own = await page(`${pb}/mutual-funds/sip-basics`);
    expect(brandOf(own.text, "sip")).toBe("Calculator by Sample AMC");
    const expert = await page(`${pb}/mutual-funds/emergency-fund-first`);
    expect(calcAttrs(expert.text, "sip")).not.toBeNull();
    expect(brandOf(expert.text, "sip")).toBeNull();
  });
});
