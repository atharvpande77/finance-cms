import { and, desc, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, schema } from "@/server/db/client";
import { sip } from "@/domain/calc/formulas";
import { pageText, siteOrigin, type HttpClient } from "../http-client";
import { demoEmail, menuLinks, person, signInFully, userByEmail } from "./auth-helpers";
import { calcAttrs, clearRates, daysAgo, rateOf, resultOf } from "./calc-helpers";

const pb = siteOrigin("paperb");
const tb = siteOrigin("tarunbharat");

async function orgId(slug: string) {
  const [org] = await db()
    .select()
    .from(schema.organisations)
    .where(eq(schema.organisations.slug, slug));
  return org!.id;
}

async function savedRow(org: string, slug: string) {
  const [row] = await db()
    .select()
    .from(schema.calculatorRates)
    .where(
      and(
        eq(schema.calculatorRates.organisationId, await orgId(org)),
        eq(schema.calculatorRates.calculatorSlug, slug),
      ),
    );
  return row;
}

describe("sponsor-editable calculator rates", () => {
  let adminAmc: HttpClient;
  let adminGi: HttpClient;
  let sup: HttpClient;
  const reader = person();
  const asOf = daysAgo(10);

  beforeAll(async () => {
    await clearRates();
    [adminAmc, adminGi, sup] = (await Promise.all(
      ["admin.amc", "admin.gi", "super.abc"].map(signInFully),
    )) as [HttpClient, HttpClient, HttpClient];
  });

  afterAll(clearRates);

  it("[E2E-CALC-17] a writer cannot open the rates page", async () => {
    const writer = await signInFully("writer.amc");
    expect((await writer.get("/calculators")).status).toBe(403);
  });

  it("[E2E-CALC-18] abcfinance editors (not super admins) cannot open it", async () => {
    const editor = await signInFully("editor.abc");
    expect((await editor.get("/calculators")).status).toBe(403);
    expect((await sup.get("/calculators")).status).toBe(200);
  });

  it("[E2E-CALC-19] an account admin sees every calculator's fields for their own organisation", async () => {
    const res = await adminAmc.get("/calculators");
    expect(res.status).toBe(200);
    expect(res.text).toContain(`data-rates-org="${await orgId("sample-amc")}"`);
    for (const slug of [
      "emi",
      "sip",
      "home-loan-eligibility",
      "gold-loan",
      "motor-premium",
      "health-cover",
      "term-cover",
    ]) {
      expect(res.text, slug).toContain(`data-form="rates-save-${slug}"`);
    }
    // Every motor field is there.
    for (const key of ["tpCarUpto1000", "tpTwOver350", "odCarLt5", "odTwGt10"]) {
      expect(res.text, key).toContain(`name="${key}"`);
    }
    expect(pageText(res.text)).not.toContain("Sample General Insurer");
  });

  it("[E2E-CALC-20] the panel menu links to it", async () => {
    expect(menuLinks(await adminAmc.get("/dashboard"))).toContain("/calculators");
    expect(menuLinks(await adminGi.get("/dashboard"))).toContain("/calculators");
  });

  it("[E2E-CALC-21] saving valid rates is confirmed", async () => {
    const res = await adminAmc.submitForm("/calculators", "rates-save-sip", {
      expectedReturn: "10",
      asOf,
    });
    expect(res.status).toBe(303);
    expect(res.location).toMatch(/\/calculators\?org=[0-9a-f-]+&calc=sip&done=save$/);
    const page = await adminAmc.get(res.location!);
    expect(pageText(page.text)).toContain("Rates saved. Readers see them now.");
    expect(await savedRow("sample-amc", "sip")).toMatchObject({
      rates: { expectedReturn: 10 },
      ratesAsOf: asOf,
    });
  });

  it("[E2E-CALC-22] readers see the sponsor's rates straight away", async () => {
    const res = await reader.get(`${pb}/calculators/sip`);
    expect(rateOf(res.text, "sip", "expected-return")).toBe(10);
    expect(resultOf(res.text, "sip", "future-value")).toBeCloseTo(
      sip(5_000, 10, 10).futureValue,
      4,
    );
  });

  it("[E2E-CALC-23] the 'rates as of' date is the one the sponsor entered", async () => {
    const res = await reader.get(`${pb}/calculators/sip`);
    expect(calcAttrs(res.text, "sip")!["data-as-of"]).toBe(asOf);
    const shown = new Intl.DateTimeFormat("en-IN", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "Asia/Kolkata",
    }).format(new Date(`${asOf}T00:00:00+05:30`));
    expect(pageText(res.text)).toContain(`Rates as of ${shown}`);
  });

  it("[E2E-CALC-24] another sponsor's calculators are unaffected", async () => {
    const res = await reader.get(`${pb}/calculators/health-cover`);
    expect(rateOf(res.text, "health-cover", "base-large")).toBe(750_000);
    expect(calcAttrs(res.text, "health-cover")!["data-as-of"]).toBe("2026-10-01");
  });

  it("[E2E-CALC-25] an out-of-range value is refused and nothing changes", async () => {
    const res = await adminAmc.submitForm("/calculators", "rates-save-sip", {
      expectedReturn: "99",
      asOf,
    });
    expect(res.status).toBe(200);
    expect(pageText(res.text)).toContain("Expected return (% a year) must be between 1 and 30.");
    expect((await savedRow("sample-amc", "sip"))!.rates).toEqual({ expectedReturn: 10 });
  });

  it("[E2E-CALC-26] a future 'as of' date is refused", async () => {
    const res = await adminAmc.submitForm("/calculators", "rates-save-sip", {
      expectedReturn: "11",
      asOf: daysAgo(-3),
    });
    expect(pageText(res.text)).toContain("can't be in the future");
    expect((await savedRow("sample-amc", "sip"))!.rates).toEqual({ expectedReturn: 10 });
  });

  it("[E2E-CALC-27] an admin cannot change another organisation's rates", async () => {
    // The General Insurer's admin replays the AMC's form.
    const amcPage = await adminAmc.get("/calculators");
    const res = await adminGi.submitForm(
      "/calculators",
      "rates-save-sip",
      { expectedReturn: "5", asOf },
      { page: amcPage },
    );
    expect(pageText(res.text)).toContain("You can't change these rates.");
    expect((await savedRow("sample-amc", "sip"))!.rates).toEqual({ expectedReturn: 10 });
  });

  it("[E2E-CALC-28] an institution's article uses its own rates for the embedded calculator", async () => {
    const res = await reader.get(`${tb}/mutual-funds/sip-basics`);
    expect(rateOf(res.text, "sip", "expected-return")).toBe(10);
  });

  it("[E2E-CALC-29] the standalone sponsored calculator uses them too", async () => {
    const res = await reader.get(`${tb}/calculators/sip`);
    expect(rateOf(res.text, "sip", "expected-return")).toBe(10);
    // An independent expert's article shows no sponsor, so not the sponsor's rates either (D33).
    const expert = await reader.get(`${pb}/mutual-funds/emergency-fund-first`);
    expect(rateOf(expert.text, "sip", "expected-return")).toBe(12);
  });

  it("[E2E-CALC-30] abcfinance's rates apply to calculators with no sponsor", async () => {
    const res = await sup.submitForm("/calculators", "rates-save-gold-loan", {
      goldPrice: "10500",
      ltvPct: "75",
      rate: "11.5",
      asOf,
    });
    expect(res.status).toBe(303);
    const page = await reader.get(`${pb}/calculators/gold-loan`);
    expect(rateOf(page.text, "gold-loan", "gold-price")).toBe(10_500);
    expect(resultOf(page.text, "gold-loan", "loan")).toBeCloseTo(50 * (22 / 24) * 10_500 * 0.75, 4);
    // A sponsored calculator keeps the built-in figure when its sponsor saved nothing.
    const motor = await reader.get(`${pb}/calculators/motor-premium`);
    expect(rateOf(motor.text, "motor-premium", "tp-car1000to1500")).toBe(3_416);
  });

  it("[E2E-CALC-31] resetting returns the calculator to the standard defaults", async () => {
    expect(
      (
        await adminGi.submitForm("/calculators", "rates-save-motor-premium", {
          tpCarUpto1000: "2094",
          tpCar1000to1500: "4000",
          tpCarOver1500: "7897",
          tpTwUpto75: "538",
          tpTw75to150: "714",
          tpTw150to350: "1366",
          tpTwOver350: "2804",
          odCarLt5: "3.1",
          odCar5to10: "3.3",
          odCarGt10: "3.4",
          odTwLt5: "1.7",
          odTw5to10: "1.8",
          odTwGt10: "1.9",
          asOf,
        })
      ).status,
    ).toBe(303);
    let motor = await reader.get(`${pb}/calculators/motor-premium`);
    expect(rateOf(motor.text, "motor-premium", "tp-car1000to1500")).toBe(4_000);
    const res = await adminGi.submitForm("/calculators", "rates-reset-motor-premium");
    expect(res.location).toMatch(/calc=motor-premium&done=reset$/);
    motor = await reader.get(`${pb}/calculators/motor-premium`);
    expect(rateOf(motor.text, "motor-premium", "tp-car1000to1500")).toBe(3_416);
    expect(calcAttrs(motor.text, "motor-premium")!["data-as-of"]).toBe("2026-10-01");
    expect(await savedRow("sample-general-insurer", "motor-premium")).toBeUndefined();
  });

  it("[E2E-CALC-32] resetting the AMC's SIP rate restores 12%", async () => {
    const res = await adminAmc.submitForm("/calculators", "rates-reset-sip");
    expect(res.status).toBe(303);
    const page = await reader.get(`${pb}/calculators/sip`);
    expect(rateOf(page.text, "sip", "expected-return")).toBe(12);
  });

  it("[E2E-CALC-33] rate changes and resets are in the audit trail", async () => {
    const who = new Map(
      await Promise.all(
        ["admin.amc", "admin.gi", "super.abc"].map(
          async (h) => [(await userByEmail(demoEmail(h))).id, h] as const,
        ),
      ),
    );
    const rows = await db()
      .select()
      .from(schema.auditEvents)
      .where(inArray(schema.auditEvents.action, ["rates.save", "rates.reset"]))
      .orderBy(desc(schema.auditEvents.id))
      .limit(5);
    const trail = rows
      .reverse()
      .map((r) => `${r.action}:${r.detail.calculator}:${who.get(r.userId!)}`);
    expect(trail).toEqual([
      "rates.save:sip:admin.amc",
      "rates.save:gold-loan:super.abc",
      "rates.save:motor-premium:admin.gi",
      "rates.reset:motor-premium:admin.gi",
      "rates.reset:sip:admin.amc",
    ]);
    const reset = rows.find((r) => r.action === "rates.reset" && r.detail.calculator === "sip")!;
    expect(reset.detail).toMatchObject({ before: { rates: { expectedReturn: 10 }, asOf } });
  });
});
