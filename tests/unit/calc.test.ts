import { describe, expect, it } from "vitest";
import {
  emiPayment,
  goldLoan,
  healthCover,
  homeLoanEligibility,
  loanFromEmi,
  motorPremium,
  ncbFor,
  sip,
  termCover,
  termIncomeShare,
  THIRD_PARTY_KEYS,
  ENGINE_BANDS,
  NCB_SLABS,
  type CityTier,
} from "@/domain/calc/formulas";
import { computeResult } from "@/domain/calc/compute";
import { DEFINITIONS, defaultRates, initialValues, readerInputs } from "@/domain/calc/fields";
import { asOfProblem, mergeRates, validateRates } from "@/domain/calc/rates";
import { CALCULATOR_SLUGS } from "@/domain/calc/catalog";

const close = (a: number, b: number, digits = 2) => expect(a).toBeCloseTo(b, digits);
const motorRates = defaultRates("motor-premium");
const healthRates = defaultRates("health-cover");
const termRates = defaultRates("term-cover");
const car = { kind: "car" as const, band: "1000to1500", vehicleAge: 3, idv: 500_000 };

describe("EMI", () => {
  it("[U-CALC-01] clears the loan exactly when paid for the full tenure (checked by amortising month by month)", () => {
    for (const [P, rate, months] of [
      [2_000_000, 8.75, 240],
      [350_000, 13.5, 36],
      [10_000, 1, 1],
    ] as const) {
      const payment = emiPayment(P, rate, months);
      let balance: number = P;
      for (let m = 0; m < months; m++) balance = balance * (1 + rate / 1200) - payment;
      expect(Math.abs(balance)).toBeLessThan(1e-6 * P);
    }
    close(emiPayment(2_000_000, 8.75, 240), 17_674.21);
  });

  it("[U-CALC-02] handles a zero rate", () => {
    expect(emiPayment(120_000, 0, 12)).toBe(10_000);
    expect(loanFromEmi(10_000, 0, 12)).toBe(120_000);
  });

  it("[U-CALC-03] loanFromEmi is the inverse of emiPayment", () => {
    for (const [P, rate, months] of [
      [4_526_368, 8.75, 240],
      [75_000, 18, 24],
    ] as const) {
      close(loanFromEmi(emiPayment(P, rate, months), rate, months), P, 4);
    }
  });
});

describe("SIP", () => {
  it("[U-CALC-04] matches the annuity-due formula", () => {
    const r = sip(5_000, 12, 10);
    close(r.futureValue, 1_161_695.38);
    expect(r.invested).toBe(600_000);
    close(r.gains, 561_695.38);
    // Month by month: each instalment goes in at the start of the month, then grows.
    let value = 0;
    for (let m = 0; m < 120; m++) value = (value + 5_000) * 1.01;
    close(r.futureValue, value, 4);
  });

  it("[U-CALC-05] is just the sum paid in at a zero return", () => {
    expect(sip(2_500, 0, 3)).toEqual({ futureValue: 90_000, invested: 90_000, gains: 0 });
  });
});

describe("home loan eligibility", () => {
  const base = { income: 100_000, existingEmis: 10_000, years: 20, rate: 8.75, foirPct: 50 };

  it("[U-CALC-06] keeps total EMIs inside the allowed share of income", () => {
    const r = homeLoanEligibility(base);
    expect(r.maxEmi).toBe(40_000);
    close(r.loan, 4_526_368.14);
    expect(emiPayment(r.loan, 8.75, 240) + base.existingEmis).toBeLessThanOrEqual(50_000 + 1e-6);
  });

  it("[U-CALC-07] gives nothing when existing EMIs already use the limit", () => {
    expect(homeLoanEligibility({ ...base, existingEmis: 50_000 })).toEqual({ maxEmi: 0, loan: 0 });
    expect(homeLoanEligibility({ ...base, existingEmis: 70_000 })).toEqual({ maxEmi: 0, loan: 0 });
  });

  it("[U-CALC-08] rises with a longer tenure and with income", () => {
    const loan = (o: Partial<typeof base>) => homeLoanEligibility({ ...base, ...o }).loan;
    expect(loan({ years: 25 })).toBeGreaterThan(loan({ years: 20 }));
    expect(loan({ income: 120_000 })).toBeGreaterThan(loan({}));
  });
});

describe("gold loan", () => {
  const base = {
    grams: 50,
    karat: 22,
    goldPrice: 11_000,
    ltvPct: 75,
    rate: 11.5,
    months: 12,
    repayment: "interest_monthly" as const,
  };

  it("[U-CALC-09] values gold by weight and purity, and lends a share of that value", () => {
    const r = goldLoan(base);
    close(r.value, 504_166.67);
    close(r.loan, 378_125);
  });

  it("[U-CALC-10] monthly-interest option: interest each month, principal untouched", () => {
    const r = goldLoan(base);
    close(r.monthly, 3_623.7);
    close(r.interest, 43_484.38);
    close(r.totalRepay, r.loan + r.interest, 6);
  });

  it("[U-CALC-11] pay-at-the-end compounds monthly", () => {
    const r = goldLoan({ ...base, repayment: "at_end" });
    close(r.totalRepay, 378_125 * (1 + 11.5 / 1200) ** 12, 6);
    close(r.interest, 45_851.18);
    expect(r.interest).toBeGreaterThan(goldLoan(base).interest);
  });

  it("[U-CALC-12] EMI option repays principal plus interest", () => {
    const r = goldLoan({ ...base, repayment: "emi" });
    close(r.monthly, emiPayment(378_125, 11.5, 12), 6);
    close(r.totalRepay, r.loan + r.interest, 6);
    expect(r.interest).toBeGreaterThan(0);
  });

  it("[U-CALC-13] lower purity means a smaller loan", () => {
    const loans = [24, 22, 21, 20, 18, 14].map((karat) => goldLoan({ ...base, karat }).loan);
    expect([...loans].sort((a, b) => b - a)).toEqual(loans);
    expect(new Set(loans).size).toBe(loans.length);
  });
});

describe("motor premium and NCB", () => {
  it("[U-CALC-14] uses IRDAI's NCB slabs and caps at 50%", () => {
    expect([0, 1, 2, 3, 4, 5].map(ncbFor)).toEqual([0, 20, 25, 35, 45, 50]);
    expect(ncbFor(9)).toBe(50);
    expect(Math.max(...NCB_SLABS)).toBe(50);
  });

  it("[U-CALC-15] works out a car premium step by step", () => {
    const r = motorPremium({ ...car, claimFreeYears: 3 }, motorRates);
    expect(r.ownDamage).toBe(15_500);
    expect(r.ncbPct).toBe(35);
    expect(r.ncbSaving).toBe(5_425);
    expect(r.netOwnDamage).toBe(10_075);
    expect(r.thirdParty).toBe(3_416);
    close(r.gst, 2_428.38);
    close(r.total, 15_919.38);
    expect(r.nextNcbPct).toBe(45);
    close(r.withoutNcb, 22_320.88);
  });

  it("[U-CALC-16] older vehicles use a higher own-damage rate", () => {
    for (const kind of ["car", "two_wheeler"] as const) {
      const band = ENGINE_BANDS[kind][0]!;
      const od = (vehicleAge: number) =>
        motorPremium({ kind, band, vehicleAge, idv: 100_000, claimFreeYears: 0 }, motorRates)
          .ownDamage;
      expect(od(6)).toBeGreaterThan(od(4));
      expect(od(11)).toBeGreaterThan(od(6));
    }
  });

  it("[U-CALC-17] more claim-free years never raise the premium", () => {
    const totals = [0, 1, 2, 3, 4, 5, 6].map(
      (claimFreeYears) => motorPremium({ ...car, claimFreeYears }, motorRates).total,
    );
    for (let i = 1; i < totals.length; i++) expect(totals[i]).toBeLessThanOrEqual(totals[i - 1]!);
  });

  it("[U-CALC-18] has a third-party rate for every engine band", () => {
    for (const band of [...ENGINE_BANDS.car, ...ENGINE_BANDS.two_wheeler]) {
      const key = THIRD_PARTY_KEYS[band];
      expect(key, band).toBeDefined();
      expect(motorRates[key!], band).toBeGreaterThan(0);
    }
  });
});

describe("health cover", () => {
  const family = {
    eldestAge: 35,
    cityTier: "large" as CityTier,
    adults: 2,
    children: 1,
    existingCover: 500_000,
  };

  it("[U-CALC-19] scales with city, age and family size", () => {
    expect(healthCover(family, healthRates)).toEqual({ suggested: 1_750_000, gap: 1_250_000 });
    const s = (o: Partial<typeof family>) =>
      healthCover({ ...family, ...o }, healthRates).suggested;
    expect(s({ adults: 4 })).toBeGreaterThan(s({}));
    expect(s({ children: 3 })).toBeGreaterThan(s({}));
  });

  it("[U-CALC-20] suggests more in a metro than in a small town, and more for older families", () => {
    const s = (o: Partial<typeof family>) =>
      healthCover({ ...family, ...o }, healthRates).suggested;
    expect(s({ cityTier: "metro" })).toBeGreaterThan(s({ cityTier: "other" }));
    expect(s({ eldestAge: 62 })).toBeGreaterThan(s({ eldestAge: 28 }));
  });

  it("[U-CALC-21] stays within a sensible range and has no gap when covered", () => {
    const small = healthCover(
      { eldestAge: 20, cityTier: "other", adults: 1, children: 0, existingCover: 0 },
      healthRates,
    );
    expect(small.suggested).toBe(500_000);
    const big = healthCover(
      { eldestAge: 70, cityTier: "metro", adults: 6, children: 6, existingCover: 0 },
      healthRates,
    );
    expect(big.suggested).toBe(10_000_000);
    expect(healthCover({ ...family, existingCover: 5_000_000 }, healthRates).gap).toBe(0);
    expect(healthCover(family, healthRates).suggested % 250_000).toBe(0);
  });
});

describe("term cover", () => {
  const profile = {
    annualIncome: 1_000_000,
    age: 35,
    liabilities: 2_000_000,
    dependants: 2,
    existingCover: 2_500_000,
  };

  it("[U-CALC-22] protects income for the working years plus liabilities", () => {
    const r = termCover({ ...profile, existingCover: 0 }, termRates);
    expect(r.years).toBe(25);
    expect(r.need).toBe(1_000_000 * 0.65 * 25 + 2_000_000);
    expect(r.suggested).toBe(18_500_000);
    const d = termCover(profile, termRates);
    expect(d.suggested).toBe(16_000_000);
    expect(d.multiple).toBe(16);
  });

  it("[U-CALC-23] needs less with no dependants, and subtracts existing cover", () => {
    const none = termCover({ ...profile, dependants: 0 }, termRates).suggested;
    expect(none).toBeLessThan(termCover(profile, termRates).suggested);
    expect(termCover({ ...profile, existingCover: 50_000_000 }, termRates).suggested).toBe(0);
    expect(termCover({ ...profile, existingCover: 0 }, termRates).suggested).toBeGreaterThan(
      termCover(profile, termRates).suggested,
    );
  });

  it("[U-CALC-24] shortens the period near retirement but never below 5 years", () => {
    expect(termCover({ ...profile, age: 50 }, termRates).years).toBe(10);
    expect(termCover({ ...profile, age: 58 }, termRates).years).toBe(5);
    expect(termCover({ ...profile, age: 64 }, termRates).years).toBe(5);
    expect(termCover({ ...profile, age: 20 }, termRates).years).toBe(25);
  });

  it("[U-CALC-25] income share rises with dependants and levels off", () => {
    const shares = [0, 1, 2, 3, 4, 5, 6, 8].map(termIncomeShare);
    expect(shares.slice(0, 6)).toEqual([0.3, 0.6, 0.65, 0.7, 0.75, 0.8]);
    expect(shares[6]).toBe(0.8);
    expect(shares[7]).toBe(0.8);
  });
});

describe("editable rates", () => {
  it("[U-CALC-26] every calculator has editable fields with defaults inside their own limits", () => {
    expect(DEFINITIONS.map((d) => d.slug).sort()).toEqual([...CALCULATOR_SLUGS].sort());
    for (const def of DEFINITIONS) {
      expect(def.rates.length, def.slug).toBeGreaterThan(0);
      for (const r of def.rates) {
        expect(r.default, `${def.slug}.${r.key}`).toBeGreaterThanOrEqual(r.min);
        expect(r.default, `${def.slug}.${r.key}`).toBeLessThanOrEqual(r.max);
      }
      for (const input of readerInputs(def, defaultRates(def.slug))) {
        if (input.kind === "number") {
          expect(input.default, `${def.slug}.${input.key}`).toBeGreaterThanOrEqual(input.min);
          expect(input.default, `${def.slug}.${input.key}`).toBeLessThanOrEqual(input.max);
        } else {
          expect(
            input.options.map((o) => o.value),
            input.key,
          ).toContain(input.default);
        }
      }
      // Every calculator gives a finite result with its defaults.
      const rates = defaultRates(def.slug);
      const result = computeResult(def.slug, initialValues(readerInputs(def, rates)), rates);
      expect(Number.isFinite(result.main.value), def.slug).toBe(true);
    }
  });

  it("[U-CALC-27] field keys are unique within a calculator", () => {
    for (const def of DEFINITIONS) {
      const rateKeys = def.rates.map((r) => r.key);
      expect(new Set(rateKeys).size, def.slug).toBe(rateKeys.length);
      const inputKeys = def.inputs.map((i) => i.key);
      expect(new Set(inputKeys).size, def.slug).toBe(inputKeys.length);
    }
  });

  it("[U-CALC-28] merging ignores unknown, non-numeric and out-of-range saved values", () => {
    expect(mergeRates("gold-loan", { goldPrice: 9_500, ltvPct: "80", rate: 99, bogus: 1 })).toEqual(
      { goldPrice: 9_500, ltvPct: 75, rate: 11.5 },
    );
    expect(mergeRates("sip", null)).toEqual({ expectedReturn: 12 });
    expect(mergeRates("sip", { expectedReturn: Number.NaN })).toEqual({ expectedReturn: 12 });
  });

  it("[U-CALC-29] validation accepts a full valid form and explains problems", () => {
    const ok = validateRates(
      "gold-loan",
      { goldPrice: "10,800", ltvPct: "70", rate: "12.25" },
      "2026-10-01",
      "2026-10-09",
    );
    expect(ok).toEqual({
      ok: true,
      rates: { goldPrice: 10_800, ltvPct: 70, rate: 12.25 },
      asOf: "2026-10-01",
    });
    const bad = validateRates(
      "gold-loan",
      { goldPrice: "", ltvPct: "95", rate: "abc" },
      "2026-10-01",
      "2026-10-09",
    );
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.errors.goldPrice).toMatch(/Enter gold price/);
      expect(bad.errors.ltvPct).toBe("Loan to value (%) must be between 10 and 85.");
      expect(bad.errors.rate).toMatch(/must be a number/);
    }
    const decimals = validateRates("sip", { expectedReturn: "12.345" }, "2026-10-01", "2026-10-09");
    expect(!decimals.ok && decimals.errors.expectedReturn).toMatch(/decimal places/);
  });

  it("[U-CALC-30] the as-of date must be a real, recent, non-future date", () => {
    const today = "2026-10-09";
    expect(asOfProblem("2026-10-09", today)).toBeNull();
    expect(asOfProblem("2021-10-09", today)).toBeNull();
    expect(asOfProblem("2021-10-08", today)).toMatch(/within the last 5 years/);
    expect(asOfProblem("2026-10-10", today)).toMatch(/future/);
    expect(asOfProblem("2026-02-30", today)).toMatch(/Enter the date/);
    expect(asOfProblem("09/10/2026", today)).toMatch(/Enter the date/);
    expect(asOfProblem("", today)).toMatch(/Enter the date/);
  });
});
