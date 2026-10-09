import { describe, expect, it } from "vitest";
import { parse } from "node-html-parser";
import { open } from "@/server/crypto/secret-box";
import { tenantByHost } from "@/server/tenants";
import { pageText, type HttpResponse } from "../http-client";
import { person } from "./auth-helpers";
import { brandOf } from "./calc-helpers";
import {
  PAGES,
  details,
  doneOf,
  freshPhone,
  leadsByPhone,
  orgId,
  submitLead,
  versionOf,
} from "./lead-helpers";

const leadForm = (res: HttpResponse) => parse(res.text).querySelector('form[data-form="lead"]');

describe("lead capture on the reader site", () => {
  const reader = person();
  let amcPage: HttpResponse;
  const phone = freshPhone();

  it("[E2E-LEAD-01] an institution article shows a lead form for that institution", async () => {
    amcPage = await reader.get(PAGES.amcArticle);
    const form = leadForm(amcPage);
    expect(form).not.toBeNull();
    expect(form!.textContent).toContain("Talk to Sample AMC");
    expect(amcPage.text).toContain('id="lead-form"');
  });

  it("[E2E-LEAD-02] the consent text names the institution", () => {
    const consent = leadForm(amcPage)!.querySelector("[data-consent]")!.textContent;
    expect(consent).toContain("I agree that Sample AMC may contact me by phone");
    expect(consent).toContain("shared only with Sample AMC");
  });

  it("[E2E-LEAD-03] the form asks for name, mobile, city and interest", () => {
    const form = leadForm(amcPage)!;
    for (const name of ["name", "phone", "city", "interest", "consent"]) {
      expect(form.querySelector(`[name="${name}"]`), name).not.toBeNull();
    }
    expect(form.querySelector('[name="phone"]')!.getAttribute("type")).toBe("tel");
  });

  it("[E2E-LEAD-04] interests are specific to the section", async () => {
    const options = (res: HttpResponse) =>
      leadForm(res)!
        .querySelectorAll('select[name="interest"] option')
        .map((o) => o.textContent.trim());
    expect(options(amcPage)).toEqual([
      "Choose one",
      "Start a SIP",
      "Lump sum",
      "Tax saving",
      "Not sure yet",
    ]);
    const gi = await reader.get(PAGES.giArticle);
    expect(options(gi)).toEqual([
      "Choose one",
      "For myself",
      "Family floater",
      "Parents or seniors",
      "Not sure yet",
    ]);
  });

  it("[E2E-LEAD-05] the SIP calculator is branded as sponsored and offers a call-to-action", async () => {
    const res = await reader.get(PAGES.sipCalculator);
    expect(brandOf(res.text, "sip")).toBe("Sponsored by Sample AMC");
    const cta = parse(res.text).querySelector('[data-calc="sip"] [data-lead-cta]');
    expect(cta?.textContent).toContain("Talk to Sample AMC");
    expect(cta!.querySelector('form[data-form="lead"]')).not.toBeNull();
  });

  it("[E2E-CALC-15] sponsored calculators offer a lead call-to-action", async () => {
    for (const [url, slug, sponsor] of [
      [PAGES.sipCalculator, "sip", "Sample AMC"],
      [PAGES.motorCalculator, "motor-premium", "Sample General Insurer"],
    ] as const) {
      const cta = parse((await reader.get(url)).text).querySelector(
        `[data-calc="${slug}"] [data-lead-cta]`,
      );
      expect(cta?.textContent, slug).toContain(`Talk to ${sponsor}`);
    }
    // On an institution's own article the call-to-action points at the article's form.
    const own = parse(amcPage.text).querySelector('[data-calc="sip"] a[data-lead-cta]');
    expect(own?.getAttribute("href")).toBe("#lead-form");
  });

  it("[E2E-LEAD-06] a calculator with no sponsor has no sponsor line or call-to-action", async () => {
    const res = await reader.get(PAGES.emiCalculator);
    expect(brandOf(res.text, "emi")).toBeNull();
    expect(res.text).not.toContain("data-lead-cta");
    expect(leadForm(res)).toBeNull();
  });

  it("[E2E-LEAD-07] an abcfinance article without a sponsor has no lead form", async () => {
    const res = await reader.get(PAGES.abcArticle);
    expect(res.status).toBe(200);
    expect(leadForm(res)).toBeNull();
    expect(res.text).not.toContain('id="lead-form"');
  });

  it("[E2E-LEAD-08] a different institution's article shows only its own brand", async () => {
    const res = await reader.get(PAGES.giArticle);
    const text = pageText(res.text);
    expect(leadForm(res)!.textContent).toContain("Talk to Sample General Insurer");
    expect(brandOf(res.text, "health-cover")).toBe("Calculator by Sample General Insurer");
    expect(text).not.toContain("Sample AMC");
  });

  it("[E2E-LEAD-09] a valid, consented submission shows a thank-you", async () => {
    const res = await submitLead(reader, PAGES.amcArticle, details(phone), amcPage);
    expect(res.status).toBe(200);
    expect(doneOf(res)).toBe("thanks");
    expect(pageText(res.text)).toContain("Thank you. Sample AMC has your request");
  });

  it("[E2E-LEAD-10] without consent the form is refused", async () => {
    const other = freshPhone();
    const { consent: _c, ...noConsent } = details(other);
    const res = await submitLead(person(), PAGES.amcArticle, noConsent, amcPage);
    expect(doneOf(res)).toBeUndefined();
    expect(pageText(res.text)).toContain("Tick the box to agree to be contacted.");
    expect(await leadsByPhone(other)).toHaveLength(0);
  });

  it("[E2E-LEAD-11] a bad phone number is refused with a message", async () => {
    const res = await submitLead(person(), PAGES.amcArticle, details("12345"), amcPage);
    expect(pageText(res.text)).toContain("Enter a 10-digit Indian mobile number.");
    // The reader's typing is kept.
    expect(res.text).toContain('value="Kolhapur"');
  });

  it("[E2E-LEAD-12] a filled honeypot looks like success", async () => {
    const bot = freshPhone();
    const res = await submitLead(
      person(),
      PAGES.amcArticle,
      { ...details(bot), website: "https://spam.example" },
      amcPage,
    );
    expect(doneOf(res)).toBe("thanks");
    expect(await leadsByPhone(bot)).toHaveLength(0);
  });

  it("[E2E-LEAD-13] only the one valid submission was stored", async () => {
    expect(await leadsByPhone(phone)).toHaveLength(1);
  });

  it("[E2E-LEAD-14] it is routed to the article's institution, paper and version", async () => {
    const [lead] = await leadsByPhone(phone);
    expect(lead!.sponsorOrgId).toBe(await orgId("sample-amc"));
    expect(lead!.sourceVersionId).toBe(await versionOf("sip-basics", "paperb", "en"));
    expect(lead!.sourceCalculator).toBeNull();
    expect(lead!.interestKey).toBe("sip");
    expect(lead!.language).toBe("en");
    expect(lead!.tenantId).toBe((await tenantByHost("paperb.localhost"))!.id);
  });

  it("[E2E-LEAD-15] name, phone and city are encrypted at rest", async () => {
    const [lead] = await leadsByPhone(phone);
    for (const field of ["nameEnc", "phoneEnc", "cityEnc"] as const) {
      expect(lead![field]).toMatch(/^v1:/);
    }
    expect(open(lead!.nameEnc!)).toBe("Asha Patil");
    expect(open(lead!.phoneEnc!)).toBe(phone);
    expect(open(lead!.cityEnc!)).toBe("Kolhapur");
  });

  it("[E2E-LEAD-16] consent text, time and source page are stored", async () => {
    const [lead] = await leadsByPhone(phone);
    expect(lead!.consentText).toBe(leadForm(amcPage)!.querySelector("[data-consent]")!.textContent);
    expect(lead!.consentVersion).toBe("v1");
    expect(Date.now() - lead!.consentAt.getTime()).toBeLessThan(120_000);
    expect(lead!.sourcePage).toBe("/mutual-funds/sip-basics");
  });

  it("[E2E-LEAD-17] a retention date is set from the sponsor's contract", async () => {
    // The sponsor's retention period (365 days for the AMC, 180 for the General Insurer; D37).
    const [lead] = await leadsByPhone(phone);
    const days = (lead!.deleteAfter.getTime() - lead!.createdAt.getTime()) / 86_400_000;
    expect(Math.round(days)).toBe(365);
    const giPhone = freshPhone();
    const giPage = await reader.get(PAGES.giArticle);
    await submitLead(person(), PAGES.giArticle, details(giPhone, "myself"), giPage);
    const [gi] = await leadsByPhone(giPhone);
    expect(Math.round((gi!.deleteAfter.getTime() - gi!.createdAt.getTime()) / 86_400_000)).toBe(
      180,
    );
  });

  it("[E2E-LEAD-18] the phone number is not kept in clear anywhere on the row", async () => {
    const [lead] = await leadsByPhone(phone);
    expect(JSON.stringify(lead)).not.toContain(phone);
    expect(JSON.stringify(lead)).not.toContain(phone.slice(-6));
  });

  it("[E2E-LEAD-19] a repeat enquiry from the same number is not duplicated", async () => {
    const res = await submitLead(person(), PAGES.amcArticle, details(phone), amcPage);
    expect(doneOf(res)).toBe("repeat");
    expect(pageText(res.text)).toContain("We already have your request.");
    expect(await leadsByPhone(phone)).toHaveLength(1);
  });

  it("[E2E-LEAD-20] a Marathi submission stores the Marathi consent text", async () => {
    const mrPhone = freshPhone();
    const page = await reader.get(PAGES.amcArticleMr);
    const res = await submitLead(person(), PAGES.amcArticleMr, details(mrPhone), page);
    expect(pageText(res.text)).toContain("धन्यवाद");
    const [lead] = await leadsByPhone(mrPhone);
    expect(lead!.language).toBe("mr");
    expect(lead!.consentText).toContain("याला माझी संमती आहे");
    expect(lead!.interestLabel).toBe("एसआयपी सुरू करणे");
    expect(lead!.sourcePage).toBe("/mutual-funds/sip-basics");
  });

  it("[E2E-LEAD-21] a calculator lead goes to the calculator's sponsor", async () => {
    const calcPhone = freshPhone();
    const page = await reader.get(PAGES.motorCalculator);
    const res = await submitLead(person(), PAGES.motorCalculator, details(calcPhone, "car"), page);
    expect(doneOf(res)).toBe("thanks");
    const [lead] = await leadsByPhone(calcPhone);
    expect(lead!.sponsorOrgId).toBe(await orgId("sample-general-insurer"));
    expect(lead!.sourceCalculator).toBe("motor-premium");
    expect(lead!.sourcePage).toBe("/calculators/motor-premium");
  });

  it("[E2E-LEAD-22] a General Insurer article's lead goes to the General Insurer", async () => {
    const giPhone = freshPhone();
    const page = await reader.get(PAGES.giArticle);
    await submitLead(person(), PAGES.giArticle, details(giPhone, "parents"), page);
    const [lead] = await leadsByPhone(giPhone);
    expect(lead!.sponsorOrgId).toBe(await orgId("sample-general-insurer"));
    expect(lead!.sourceVersionId).toBe(await versionOf("health-cover-for-parents", "paperb", "en"));
  });

  // Tampered forms: the AMC article's form, pointed somewhere else.
  const tampered: string[] = [];
  async function tamper(fields: Record<string, string>) {
    const p = freshPhone();
    tampered.push(p);
    const res = await submitLead(person(), PAGES.amcArticle, { ...details(p), ...fields }, amcPage);
    expect(doneOf(res)).toBeUndefined();
    expect(pageText(res.text)).toContain("This form can't be used here.");
  }

  it("[E2E-LEAD-23] a form cannot be pointed at an abcfinance article", async () => {
    await tamper({ versionId: await versionOf("home-loan-checklist", "paperb", "en") });
  });

  it("[E2E-LEAD-24] a form cannot be pointed at an unpublished draft", async () => {
    await tamper({ versionId: await versionOf("debt-funds-vs-equity-funds", null, "en") });
  });

  it("[E2E-LEAD-25] a form cannot be pointed at a calculator with no sponsor", async () => {
    await tamper({ source: "calculator", calculator: "emi", place: "calculator_page" });
  });

  it("[E2E-LEAD-26] a version from another paper cannot be used on this paper", async () => {
    await tamper({ versionId: await versionOf("sip-basics", "tarunbharat", "mr") });
  });

  it("[E2E-LEAD-27] none of those attempts stored a lead", async () => {
    expect(tampered).toHaveLength(4);
    for (const p of tampered) expect(await leadsByPhone(p)).toHaveLength(0);
  });

  it("[E2E-LEAD-28] the sixth request from one address in an hour is refused", async () => {
    const one = person();
    const phones = Array.from({ length: 6 }, () => freshPhone());
    const results = [];
    for (const p of phones) {
      results.push(await submitLead(one, PAGES.amcArticle, details(p), amcPage));
    }
    expect(results.slice(0, 5).map(doneOf)).toEqual(Array(5).fill("thanks"));
    expect(doneOf(results[5]!)).toBeUndefined();
    expect(pageText(results[5]!.text)).toContain("Too many requests from your connection.");
    expect(await leadsByPhone(phones[5]!)).toHaveLength(0);
  });
});
