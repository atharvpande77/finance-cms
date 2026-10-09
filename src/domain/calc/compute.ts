/**
 * One calculator's result for given inputs and rates: a main figure and a breakdown, each with
 * its own labels. The reader component renders it as is, and tests read the raw values.
 */
import type { Lang } from "@/domain/i18n";
import {
  emi,
  goldLoan,
  healthCover,
  homeLoanEligibility,
  motorPremium,
  sip,
  termCover,
  type CityTier,
  type Repayment,
  type VehicleKind,
} from "./formulas";

type L = Record<Lang, string>;

export type ResultUnit = "rupees" | "percent" | "multiple" | "years";
export type ResultItem = { key: string; label: L; value: number; unit: ResultUnit };
export type CalcResult = {
  main: ResultItem;
  items: ResultItem[];
  /** Worked steps, where the calculator shows them (motor premium). */
  steps?: ResultItem[];
};

type Values = Record<string, number | string>;
const num = (v: Values, key: string) => Number(v[key]);
const str = (v: Values, key: string) => String(v[key]);
const rupees = (key: string, en: string, mr: string, value: number): ResultItem => ({
  key,
  label: { en, mr },
  value,
  unit: "rupees",
});

export function computeResult(
  slug: string,
  values: Values,
  rates: Record<string, number>,
): CalcResult {
  switch (slug) {
    case "emi": {
      const r = emi(num(values, "amount"), num(values, "rate"), num(values, "years"));
      return {
        main: rupees("emi", "Monthly EMI", "मासिक ईएमआय", r.emi),
        items: [
          rupees("interest", "Total interest", "एकूण व्याज", r.interest),
          rupees("total", "Total payment", "एकूण परतफेड", r.total),
        ],
      };
    }
    case "sip": {
      const r = sip(num(values, "monthly"), num(values, "expectedReturn"), num(values, "years"));
      return {
        main: rupees("futureValue", "Estimated value", "अंदाजे मूल्य", r.futureValue),
        items: [
          rupees("invested", "You invest", "तुमची गुंतवणूक", r.invested),
          rupees("gains", "Estimated gains", "अंदाजे वाढ", r.gains),
        ],
      };
    }
    case "home-loan-eligibility": {
      const r = homeLoanEligibility({
        income: num(values, "income"),
        existingEmis: num(values, "existingEmis"),
        years: num(values, "years"),
        rate: num(values, "rate"),
        foirPct: rates.foirPct!,
      });
      return {
        main: rupees(
          "loan",
          "You could borrow about",
          "तुम्हाला सुमारे इतके कर्ज मिळू शकते",
          r.loan,
        ),
        items: [
          rupees("maxEmi", "Affordable EMI", "परवडणारा ईएमआय", r.maxEmi),
          {
            key: "foirPct",
            label: { en: "Share of income for EMIs", mr: "ईएमआयसाठी उत्पन्नाचा हिस्सा" },
            value: rates.foirPct!,
            unit: "percent",
          },
        ],
      };
    }
    case "gold-loan": {
      const repayment = str(values, "repayment") as Repayment;
      const r = goldLoan({
        grams: num(values, "grams"),
        karat: num(values, "karat"),
        goldPrice: num(values, "goldPrice"),
        ltvPct: num(values, "ltvPct"),
        rate: num(values, "rate"),
        months: num(values, "months"),
        repayment,
      });
      const items = [rupees("value", "Value of your gold", "तुमच्या सोन्याचे मूल्य", r.value)];
      if (repayment !== "at_end") {
        items.push(
          rupees(
            "monthly",
            repayment === "emi" ? "Monthly EMI" : "Monthly interest",
            repayment === "emi" ? "मासिक ईएमआय" : "मासिक व्याज",
            r.monthly,
          ),
        );
      }
      items.push(
        rupees("interest", "Total interest", "एकूण व्याज", r.interest),
        rupees("totalRepay", "Total repayment", "एकूण परतफेड", r.totalRepay),
      );
      return { main: rupees("loan", "Loan you can get", "मिळू शकणारे कर्ज", r.loan), items };
    }
    case "motor-premium": {
      const r = motorPremium(
        {
          kind: str(values, "kind") as VehicleKind,
          band: str(values, "band"),
          vehicleAge: num(values, "vehicleAge"),
          idv: num(values, "idv"),
          claimFreeYears: num(values, "claimFreeYears"),
        },
        rates,
      );
      return {
        main: rupees("total", "Estimated premium with GST", "जीएसटीसह अंदाजे प्रीमियम", r.total),
        items: [
          rupees("ncbSaving", "Your No Claim Bonus saves", "नो क्लेम बोनसमुळे बचत", r.ncbSaving),
          {
            key: "nextNcbPct",
            label: {
              en: "Next year's NCB if you make no claim",
              mr: "दावा न केल्यास पुढील वर्षीचा एनसीबी",
            },
            value: r.nextNcbPct,
            unit: "percent",
          },
        ],
        steps: [
          rupees("ownDamage", "Own damage (IDV × rate)", "स्वतःचे नुकसान (IDV × दर)", r.ownDamage),
          {
            key: "ncbPct",
            label: { en: "No Claim Bonus", mr: "नो क्लेम बोनस" },
            value: r.ncbPct,
            unit: "percent",
          },
          rupees(
            "netOwnDamage",
            "Own damage after NCB",
            "एनसीबीनंतर स्वतःचे नुकसान",
            r.netOwnDamage,
          ),
          rupees("thirdParty", "Third-party premium", "थर्ड-पार्टी प्रीमियम", r.thirdParty),
          rupees("gst", "GST (18%)", "जीएसटी (18%)", r.gst),
          rupees("withoutNcb", "Premium without NCB", "एनसीबीशिवाय प्रीमियम", r.withoutNcb),
        ],
      };
    }
    case "health-cover": {
      const r = healthCover(
        {
          eldestAge: num(values, "eldestAge"),
          cityTier: str(values, "cityTier") as CityTier,
          adults: num(values, "adults"),
          children: num(values, "children"),
          existingCover: num(values, "existingCover"),
        },
        rates,
      );
      return {
        main: rupees("suggested", "Suggested cover", "सुचवलेले विमा संरक्षण", r.suggested),
        items: [rupees("gap", "Gap in your cover", "तुमच्या संरक्षणातील तूट", r.gap)],
      };
    }
    case "term-cover": {
      const r = termCover(
        {
          annualIncome: num(values, "annualIncome"),
          age: num(values, "age"),
          liabilities: num(values, "liabilities"),
          dependants: num(values, "dependants"),
          existingCover: num(values, "existingCover"),
        },
        rates,
      );
      return {
        main: rupees("suggested", "Suggested life cover", "सुचवलेला जीवन विमा", r.suggested),
        items: [
          {
            key: "multiple",
            label: { en: "Times your yearly income", mr: "वार्षिक उत्पन्नाच्या पट" },
            value: r.multiple,
            unit: "multiple",
          },
          {
            key: "years",
            label: { en: "Years of income protected", mr: "उत्पन्न सुरक्षित वर्षे" },
            value: r.years,
            unit: "years",
          },
          rupees("need", "Total need", "एकूण गरज", r.need),
        ],
      };
    }
    default:
      throw new Error(`Unknown calculator: ${slug}`);
  }
}
