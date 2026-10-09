/**
 * The seven calculators' formulas (04.7). Plain numbers in, plain numbers out: rounding is for
 * display only. Rates are annual percentages; `r` is the monthly rate (annual% / 12 / 100).
 * These are estimates, not advice.
 */

const monthly = (annualPct: number) => annualPct / 12 / 100;

/** The monthly instalment that repays `principal` over `months` (P/n at a zero rate). */
export function emiPayment(principal: number, annualPct: number, months: number): number {
  if (months <= 0) return 0;
  const r = monthly(annualPct);
  if (r === 0) return principal / months;
  const f = (1 + r) ** months;
  return (principal * r * f) / (f - 1);
}

/** The loan a monthly instalment repays: the inverse of `emiPayment`. */
export function loanFromEmi(emi: number, annualPct: number, months: number): number {
  if (months <= 0 || emi <= 0) return 0;
  const r = monthly(annualPct);
  if (r === 0) return emi * months;
  return (emi * (1 - (1 + r) ** -months)) / r;
}

export function emi(amount: number, annualPct: number, years: number) {
  const months = Math.round(years * 12);
  const payment = emiPayment(amount, annualPct, months);
  const total = payment * months;
  return { emi: payment, total, interest: total - amount };
}

/** Future value of a monthly SIP, paid at the start of each month (an annuity due). */
export function sip(monthlyAmount: number, annualPct: number, years: number) {
  const n = Math.round(years * 12);
  const i = monthly(annualPct);
  const invested = monthlyAmount * n;
  const futureValue = i === 0 ? invested : monthlyAmount * (((1 + i) ** n - 1) / i) * (1 + i);
  return { futureValue, invested, gains: futureValue - invested };
}

/** The largest loan whose EMI, with existing EMIs, stays within FOIR% of take-home income. */
export function homeLoanEligibility(input: {
  income: number;
  existingEmis: number;
  years: number;
  rate: number;
  foirPct: number;
}) {
  const maxEmi = Math.max(0, (input.income * input.foirPct) / 100 - input.existingEmis);
  const loan = loanFromEmi(maxEmi, input.rate, Math.round(input.years * 12));
  return { maxEmi, loan };
}

export const KARATS = [24, 22, 21, 20, 18, 14] as const;
export type Repayment = "interest_monthly" | "emi" | "at_end";

export function goldLoan(input: {
  grams: number;
  karat: number;
  goldPrice: number;
  ltvPct: number;
  rate: number;
  months: number;
  repayment: Repayment;
}) {
  const value = input.grams * (input.karat / 24) * input.goldPrice;
  const loan = (value * input.ltvPct) / 100;
  const r = monthly(input.rate);
  const n = input.months;
  if (input.repayment === "interest_monthly") {
    // Interest every month; the principal is repaid at the end.
    const each = loan * r;
    return { value, loan, monthly: each, interest: each * n, totalRepay: loan + each * n };
  }
  if (input.repayment === "emi") {
    const each = emiPayment(loan, input.rate, n);
    return { value, loan, monthly: each, interest: each * n - loan, totalRepay: each * n };
  }
  // Everything at the end: interest compounds monthly.
  const totalRepay = loan * (1 + r) ** n;
  return { value, loan, monthly: 0, interest: totalRepay - loan, totalRepay };
}

/** IRDAI's No Claim Bonus slabs for 0, 1, 2, 3, 4 and 5+ claim-free years. */
export const NCB_SLABS = [0, 20, 25, 35, 45, 50] as const;
export const GST_PCT = 18;

export function ncbFor(claimFreeYears: number): number {
  return NCB_SLABS[Math.min(Math.max(Math.floor(claimFreeYears), 0), NCB_SLABS.length - 1)]!;
}

export type VehicleKind = "car" | "two_wheeler";
export const ENGINE_BANDS: Record<VehicleKind, readonly string[]> = {
  car: ["upto1000", "1000to1500", "over1500"],
  two_wheeler: ["upto75", "75to150", "150to350", "over350"],
};

/** The editable third-party premium for each engine band. */
export const THIRD_PARTY_KEYS: Record<string, string> = {
  upto1000: "tpCarUpto1000",
  "1000to1500": "tpCar1000to1500",
  over1500: "tpCarOver1500",
  upto75: "tpTwUpto75",
  "75to150": "tpTw75to150",
  "150to350": "tpTw150to350",
  over350: "tpTwOver350",
};

/** The editable own-damage rate for a vehicle kind and age (under 5, 5 to 10, over 10 years). */
export function ownDamageKey(kind: VehicleKind, vehicleAge: number): string {
  const band = vehicleAge < 5 ? "Lt5" : vehicleAge <= 10 ? "5to10" : "Gt10";
  return `${kind === "car" ? "odCar" : "odTw"}${band}`;
}

export function motorPremium(
  input: {
    kind: VehicleKind;
    band: string;
    vehicleAge: number;
    idv: number;
    claimFreeYears: number;
  },
  rates: Record<string, number>,
) {
  const odRate = rates[ownDamageKey(input.kind, input.vehicleAge)]!;
  const thirdParty = rates[THIRD_PARTY_KEYS[input.band]!]!;
  const ownDamage = (input.idv * odRate) / 100;
  const ncbPct = ncbFor(input.claimFreeYears);
  const ncbSaving = (ownDamage * ncbPct) / 100;
  const netOwnDamage = ownDamage - ncbSaving;
  const beforeGst = netOwnDamage + thirdParty;
  const gst = (beforeGst * GST_PCT) / 100;
  return {
    odRate,
    ownDamage,
    ncbPct,
    ncbSaving,
    netOwnDamage,
    thirdParty,
    beforeGst,
    gst,
    total: beforeGst + gst,
    // With the bonus saving included again, GST and all.
    withoutNcb: (ownDamage + thirdParty) * (1 + GST_PCT / 100),
    nextNcbPct: ncbFor(input.claimFreeYears + 1),
  };
}

export type CityTier = "metro" | "large" | "other";
const HEALTH_STEP = 250_000;
const HEALTH_MIN = 500_000;
const HEALTH_MAX = 10_000_000;

export function healthAgeFactor(age: number): number {
  if (age < 30) return 1;
  if (age < 45) return 1.25;
  if (age < 60) return 1.5;
  return 2;
}

export function healthCover(
  input: {
    eldestAge: number;
    cityTier: CityTier;
    adults: number;
    children: number;
    existingCover: number;
  },
  rates: Record<string, number>,
) {
  const base =
    rates[
      input.cityTier === "metro"
        ? "baseMetro"
        : input.cityTier === "large"
          ? "baseLarge"
          : "baseOther"
    ]!;
  const members = 1 + 0.5 * (Math.max(input.adults, 1) - 1) + 0.25 * input.children;
  const raw = base * healthAgeFactor(input.eldestAge) * members;
  const rounded = Math.round(raw / HEALTH_STEP) * HEALTH_STEP;
  const suggested = Math.min(Math.max(rounded, HEALTH_MIN), HEALTH_MAX);
  return { suggested, gap: Math.max(0, suggested - input.existingCover) };
}

const TERM_STEP = 500_000;

/** The share of income to replace: 0.3 with no dependants, rising 0.05 each up to five. */
export function termIncomeShare(dependants: number): number {
  return dependants <= 0 ? 0.3 : 0.6 + 0.05 * (Math.min(dependants, 5) - 1);
}

export function termCover(
  input: {
    annualIncome: number;
    age: number;
    liabilities: number;
    dependants: number;
    existingCover: number;
  },
  rates: Record<string, number>,
) {
  const years = Math.min(Math.max(rates.retirementAge! - input.age, 5), 25);
  const share = termIncomeShare(input.dependants);
  const need = input.annualIncome * share * years + input.liabilities;
  const suggested = Math.max(0, Math.ceil((need - input.existingCover) / TERM_STEP) * TERM_STEP);
  return {
    years,
    share,
    need,
    suggested,
    multiple: input.annualIncome > 0 ? suggested / input.annualIncome : 0,
  };
}
