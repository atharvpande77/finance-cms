/**
 * Each calculator's definition, kept in code (03.5 allows it): the reader's inputs, the rates a
 * sponsor may edit, and the "how this is worked out" note. The handover gives the defaults but no
 * ranges, so the ranges and reader defaults are ours (D32). Every rate is a placeholder until the
 * sponsors confirm their own figures (09.3 #13). Marathi labels are a first draft (D10).
 */
import type { Lang } from "@/domain/i18n";

type L = Record<Lang, string>;

export type Unit = "rupees" | "percent" | "years" | "months" | "grams" | "count";

/** A number the reader sets with a slider and a typed box. */
export type NumberInput = {
  kind: "number";
  key: string;
  label: L;
  unit: Unit;
  min: number;
  max: number;
  step: number;
  default: number;
  /** Money ranges spanning several orders of magnitude move on a log scale. */
  scale?: "log";
  hint?: L;
};

export type Choice = { value: string; label: L };

export type ChoiceInput = {
  kind: "choice";
  key: string;
  label: L;
  options: readonly Choice[];
  default: string;
  /** Options that depend on another choice (engine bands per vehicle kind). */
  dependsOn?: { key: string; options: Record<string, readonly Choice[]> };
};

/** A reader input whose starting value (and range) is one of the calculator's rates. */
export type RateInput = { kind: "rate"; key: string; step: number };

/** A figure a sponsor may edit in the rates panel. */
export type RateField = {
  key: string;
  label: L;
  unit: Unit;
  min: number;
  max: number;
  default: number;
};

export type CalculatorDefinition = {
  slug: string;
  inputs: readonly (NumberInput | ChoiceInput | RateInput)[];
  rates: readonly RateField[];
  explain: L;
};

/** The "rates as of" date shown while a calculator uses the built-in defaults. */
export const BUILTIN_RATES_AS_OF = "2026-10-01";

const YEARS: L = { en: "Tenure", mr: "मुदत" };
const RATE: L = { en: "Interest rate (% a year)", mr: "व्याजदर (% वार्षिक)" };

const CAR_BANDS: readonly Choice[] = [
  { value: "upto1000", label: { en: "Up to 1000 cc", mr: "1000 सीसीपर्यंत" } },
  { value: "1000to1500", label: { en: "1000 to 1500 cc", mr: "1000 ते 1500 सीसी" } },
  { value: "over1500", label: { en: "Over 1500 cc", mr: "1500 सीसीपेक्षा जास्त" } },
];
const TWO_WHEELER_BANDS: readonly Choice[] = [
  { value: "upto75", label: { en: "Up to 75 cc", mr: "75 सीसीपर्यंत" } },
  { value: "75to150", label: { en: "75 to 150 cc", mr: "75 ते 150 सीसी" } },
  { value: "150to350", label: { en: "150 to 350 cc", mr: "150 ते 350 सीसी" } },
  { value: "over350", label: { en: "Over 350 cc", mr: "350 सीसीपेक्षा जास्त" } },
];

const tp = (key: string, en: string, mr: string, value: number): RateField => ({
  key,
  label: { en: `Third-party premium: ${en}`, mr: `थर्ड-पार्टी प्रीमियम: ${mr}` },
  unit: "rupees",
  min: 100,
  max: 50_000,
  default: value,
});
const od = (key: string, en: string, mr: string, value: number): RateField => ({
  key,
  label: { en: `Own-damage rate: ${en}`, mr: `स्वतःच्या नुकसानीचा दर: ${mr}` },
  unit: "percent",
  min: 0.5,
  max: 10,
  default: value,
});
const healthBase = (key: string, en: string, mr: string, value: number): RateField => ({
  key,
  label: { en: `Base cover per adult: ${en}`, mr: `प्रति प्रौढ मूळ संरक्षण: ${mr}` },
  unit: "rupees",
  min: 100_000,
  max: 5_000_000,
  default: value,
});

export const DEFINITIONS: readonly CalculatorDefinition[] = [
  {
    slug: "emi",
    inputs: [
      {
        kind: "number",
        key: "amount",
        label: { en: "Loan amount", mr: "कर्जाची रक्कम" },
        unit: "rupees",
        min: 10_000,
        max: 100_000_000,
        step: 10_000,
        default: 2_000_000,
        scale: "log",
      },
      { kind: "rate", key: "rate", step: 0.05 },
      {
        kind: "number",
        key: "years",
        label: YEARS,
        unit: "years",
        min: 1,
        max: 30,
        step: 1,
        default: 20,
      },
    ],
    rates: [{ key: "rate", label: RATE, unit: "percent", min: 1, max: 30, default: 8.75 }],
    explain: {
      en: "EMI = P × r × (1 + r)ⁿ ÷ ((1 + r)ⁿ − 1), where P is the loan, r the monthly rate (the yearly rate ÷ 12 ÷ 100) and n the number of months. Total payment is EMI × n, and interest is the total payment minus the loan.",
      mr: "ईएमआय = P × r × (1 + r)ⁿ ÷ ((1 + r)ⁿ − 1). यात P म्हणजे कर्ज, r म्हणजे मासिक व्याजदर (वार्षिक दर ÷ 12 ÷ 100) आणि n म्हणजे महिन्यांची संख्या. एकूण परतफेड = ईएमआय × n, आणि व्याज = एकूण परतफेड वजा कर्ज.",
    },
  },
  {
    slug: "sip",
    inputs: [
      {
        kind: "number",
        key: "monthly",
        label: { en: "Monthly investment", mr: "मासिक गुंतवणूक" },
        unit: "rupees",
        min: 100,
        max: 1_000_000,
        step: 100,
        default: 5_000,
        scale: "log",
      },
      { kind: "rate", key: "expectedReturn", step: 0.5 },
      {
        kind: "number",
        key: "years",
        label: { en: "Period", mr: "कालावधी" },
        unit: "years",
        min: 1,
        max: 40,
        step: 1,
        default: 10,
      },
    ],
    rates: [
      {
        key: "expectedReturn",
        label: { en: "Expected return (% a year)", mr: "अपेक्षित परतावा (% वार्षिक)" },
        unit: "percent",
        min: 1,
        max: 30,
        default: 12,
      },
    ],
    explain: {
      en: "Each instalment is invested at the start of the month and grows at the monthly rate i (the yearly return ÷ 12 ÷ 100). Value = M × ((1 + i)ⁿ − 1) ÷ i × (1 + i), for n months. Returns are not guaranteed; the market can fall.",
      mr: "प्रत्येक हप्ता महिन्याच्या सुरुवातीला गुंतवला जातो आणि मासिक दर i (वार्षिक परतावा ÷ 12 ÷ 100) ने वाढतो. मूल्य = M × ((1 + i)ⁿ − 1) ÷ i × (1 + i), n महिन्यांसाठी. परतावा निश्चित नसतो; बाजार घसरू शकतो.",
    },
  },
  {
    slug: "home-loan-eligibility",
    inputs: [
      {
        kind: "number",
        key: "income",
        label: { en: "Monthly take-home income", mr: "मासिक हातात येणारे उत्पन्न" },
        unit: "rupees",
        min: 10_000,
        max: 10_000_000,
        step: 1_000,
        default: 100_000,
        scale: "log",
      },
      {
        kind: "number",
        key: "existingEmis",
        label: { en: "Existing EMIs a month", mr: "सध्याचे मासिक ईएमआय" },
        unit: "rupees",
        min: 0,
        max: 1_000_000,
        step: 500,
        default: 10_000,
      },
      {
        kind: "number",
        key: "years",
        label: YEARS,
        unit: "years",
        min: 1,
        max: 30,
        step: 1,
        default: 20,
      },
      { kind: "rate", key: "rate", step: 0.05 },
    ],
    rates: [
      { key: "rate", label: RATE, unit: "percent", min: 1, max: 30, default: 8.75 },
      {
        key: "foirPct",
        label: {
          en: "Share of income allowed for all EMIs (FOIR, %)",
          mr: "सर्व ईएमआयसाठी उत्पन्नाचा कमाल हिस्सा (FOIR, %)",
        },
        unit: "percent",
        min: 20,
        max: 70,
        default: 50,
      },
    ],
    explain: {
      en: "Lenders usually let all your EMIs together take up to a fixed share of take-home income (FOIR). Affordable EMI = income × FOIR − existing EMIs. The loan is the amount that EMI repays over the tenure at the rate shown: EMI × (1 − (1 + r)⁻ⁿ) ÷ r. Lenders also check your credit score, age and the property.",
      mr: "बँका सहसा सर्व ईएमआय मिळून हातात येणाऱ्या उत्पन्नाच्या ठरावीक हिश्शापर्यंत (FOIR) परवानगी देतात. परवडणारा ईएमआय = उत्पन्न × FOIR − सध्याचे ईएमआय. कर्ज म्हणजे तो ईएमआय दिलेल्या दराने मुदतीत फेडू शकेल अशी रक्कम: ईएमआय × (1 − (1 + r)⁻ⁿ) ÷ r. बँका क्रेडिट स्कोअर, वय आणि मालमत्ताही तपासतात.",
    },
  },
  {
    slug: "gold-loan",
    inputs: [
      {
        kind: "number",
        key: "grams",
        label: { en: "Gold", mr: "सोने" },
        unit: "grams",
        min: 1,
        max: 1_000,
        step: 1,
        default: 50,
      },
      {
        kind: "choice",
        key: "karat",
        label: { en: "Purity (karat)", mr: "शुद्धता (कॅरेट)" },
        options: ["24", "22", "21", "20", "18", "14"].map((k) => ({
          value: k,
          label: { en: `${k} K`, mr: `${k} कॅरेट` },
        })),
        default: "22",
      },
      { kind: "rate", key: "goldPrice", step: 100 },
      { kind: "rate", key: "ltvPct", step: 1 },
      { kind: "rate", key: "rate", step: 0.05 },
      {
        kind: "number",
        key: "months",
        label: { en: "Tenure", mr: "मुदत" },
        unit: "months",
        min: 1,
        max: 36,
        step: 1,
        default: 12,
      },
      {
        kind: "choice",
        key: "repayment",
        label: { en: "Repayment", mr: "परतफेडीची पद्धत" },
        options: [
          {
            value: "interest_monthly",
            label: {
              en: "Interest monthly, principal at the end",
              mr: "दरमहा व्याज, मुद्दल शेवटी",
            },
          },
          { value: "emi", label: { en: "EMI", mr: "ईएमआय" } },
          {
            value: "at_end",
            label: { en: "Everything at the end", mr: "सर्व रक्कम शेवटी" },
          },
        ],
        default: "interest_monthly",
      },
    ],
    rates: [
      {
        key: "goldPrice",
        label: { en: "Gold price per gram (24 K)", mr: "प्रति ग्रॅम सोन्याचा भाव (24 कॅरेट)" },
        unit: "rupees",
        min: 1_000,
        max: 50_000,
        default: 11_000,
      },
      {
        key: "ltvPct",
        label: { en: "Loan to value (%)", mr: "मूल्याच्या तुलनेत कर्ज (%)" },
        unit: "percent",
        min: 10,
        max: 85,
        default: 75,
      },
      { key: "rate", label: RATE, unit: "percent", min: 5, max: 36, default: 11.5 },
    ],
    explain: {
      en: "Gold value = grams × (karat ÷ 24) × the 24 K price per gram. The loan is that value × the loan-to-value share. Interest monthly: you pay loan × r each month and the loan at the end. EMI: a standard EMI. Everything at the end: interest compounds monthly, loan × ((1 + r)ⁿ − 1).",
      mr: "सोन्याचे मूल्य = ग्रॅम × (कॅरेट ÷ 24) × 24 कॅरेटचा प्रति ग्रॅम भाव. कर्ज = हे मूल्य × कर्जाचा हिस्सा (LTV). दरमहा व्याज: दर महिन्याला कर्ज × r आणि शेवटी मुद्दल. ईएमआय: नेहमीचा ईएमआय. सर्व रक्कम शेवटी: व्याज दरमहा चक्रवाढीने, कर्ज × ((1 + r)ⁿ − 1).",
    },
  },
  {
    slug: "motor-premium",
    inputs: [
      {
        kind: "choice",
        key: "kind",
        label: { en: "Vehicle", mr: "वाहन" },
        options: [
          { value: "car", label: { en: "Car", mr: "कार" } },
          { value: "two_wheeler", label: { en: "Two-wheeler", mr: "दुचाकी" } },
        ],
        default: "car",
      },
      {
        kind: "choice",
        key: "band",
        label: { en: "Engine", mr: "इंजिन" },
        options: CAR_BANDS,
        default: "1000to1500",
        dependsOn: { key: "kind", options: { car: CAR_BANDS, two_wheeler: TWO_WHEELER_BANDS } },
      },
      {
        kind: "number",
        key: "vehicleAge",
        label: { en: "Vehicle age", mr: "वाहनाचे वय" },
        unit: "years",
        min: 0,
        max: 20,
        step: 1,
        default: 3,
      },
      {
        kind: "number",
        key: "idv",
        label: { en: "Insured declared value (IDV)", mr: "विमा घोषित मूल्य (IDV)" },
        unit: "rupees",
        min: 10_000,
        max: 10_000_000,
        step: 1_000,
        default: 500_000,
        scale: "log",
      },
      {
        kind: "number",
        key: "claimFreeYears",
        label: { en: "Claim-free years", mr: "दावा न केलेली वर्षे" },
        unit: "count",
        min: 0,
        max: 5,
        step: 1,
        default: 3,
        hint: { en: "5 means 5 or more.", mr: "5 म्हणजे 5 किंवा जास्त." },
      },
    ],
    rates: [
      tp("tpCarUpto1000", "car up to 1000 cc", "कार 1000 सीसीपर्यंत", 2_094),
      tp("tpCar1000to1500", "car 1000 to 1500 cc", "कार 1000 ते 1500 सीसी", 3_416),
      tp("tpCarOver1500", "car over 1500 cc", "कार 1500 सीसीपेक्षा जास्त", 7_897),
      tp("tpTwUpto75", "two-wheeler up to 75 cc", "दुचाकी 75 सीसीपर्यंत", 538),
      tp("tpTw75to150", "two-wheeler 75 to 150 cc", "दुचाकी 75 ते 150 सीसी", 714),
      tp("tpTw150to350", "two-wheeler 150 to 350 cc", "दुचाकी 150 ते 350 सीसी", 1_366),
      tp("tpTwOver350", "two-wheeler over 350 cc", "दुचाकी 350 सीसीपेक्षा जास्त", 2_804),
      od("odCarLt5", "car under 5 years", "5 वर्षांखालील कार", 3.1),
      od("odCar5to10", "car 5 to 10 years", "5 ते 10 वर्षांची कार", 3.3),
      od("odCarGt10", "car over 10 years", "10 वर्षांपेक्षा जुनी कार", 3.4),
      od("odTwLt5", "two-wheeler under 5 years", "5 वर्षांखालील दुचाकी", 1.7),
      od("odTw5to10", "two-wheeler 5 to 10 years", "5 ते 10 वर्षांची दुचाकी", 1.8),
      od("odTwGt10", "two-wheeler over 10 years", "10 वर्षांपेक्षा जुनी दुचाकी", 1.9),
    ],
    explain: {
      en: "Own damage = IDV × the own-damage rate for the vehicle's kind and age. The No Claim Bonus (0, 20, 25, 35, 45, 50% for 0 to 5+ claim-free years) is taken off the own-damage part only. The third-party premium is fixed by engine size. GST of 18% is added to the total. Insurers' actual premiums vary with add-ons and discounts.",
      mr: "स्वतःचे नुकसान = IDV × वाहनाचा प्रकार आणि वयानुसार दर. नो क्लेम बोनस (0 ते 5+ दावा-मुक्त वर्षांसाठी 0, 20, 25, 35, 45, 50%) फक्त स्वतःच्या नुकसानीच्या भागावर मिळतो. थर्ड-पार्टी प्रीमियम इंजिनच्या क्षमतेनुसार ठरलेला असतो. एकूण रकमेवर 18% जीएसटी लागतो. विमा कंपन्यांचे प्रत्यक्ष प्रीमियम ॲड-ऑन आणि सवलतींनुसार बदलतात.",
    },
  },
  {
    slug: "health-cover",
    inputs: [
      {
        kind: "number",
        key: "eldestAge",
        label: { en: "Age of the eldest member", mr: "सर्वात ज्येष्ठ सदस्याचे वय" },
        unit: "years",
        min: 18,
        max: 99,
        step: 1,
        default: 35,
      },
      {
        kind: "choice",
        key: "cityTier",
        label: { en: "Where you live", mr: "तुम्ही कुठे राहता" },
        options: [
          { value: "metro", label: { en: "Metro city", mr: "महानगर" } },
          { value: "large", label: { en: "Large city", mr: "मोठे शहर" } },
          { value: "other", label: { en: "Smaller town", mr: "लहान शहर किंवा गाव" } },
        ],
        default: "large",
      },
      {
        kind: "number",
        key: "adults",
        label: { en: "Adults", mr: "प्रौढ" },
        unit: "count",
        min: 1,
        max: 6,
        step: 1,
        default: 2,
      },
      {
        kind: "number",
        key: "children",
        label: { en: "Children", mr: "मुले" },
        unit: "count",
        min: 0,
        max: 6,
        step: 1,
        default: 1,
      },
      {
        kind: "number",
        key: "existingCover",
        label: { en: "Existing cover", mr: "सध्याचे विमा संरक्षण" },
        unit: "rupees",
        min: 0,
        max: 10_000_000,
        step: 50_000,
        default: 500_000,
      },
    ],
    rates: [
      healthBase("baseMetro", "metro city", "महानगर", 1_000_000),
      healthBase("baseLarge", "large city", "मोठे शहर", 750_000),
      healthBase("baseOther", "smaller town", "लहान शहर", 500_000),
    ],
    explain: {
      en: "Base cover per adult by where you live × an age factor for the eldest member (under 30: 1, under 45: 1.25, under 60: 1.5, 60 and over: 2) × family size (1 + 0.5 for each extra adult + 0.25 for each child). Rounded to the nearest ₹2.5 lakh and kept between ₹5 lakh and ₹1 crore. A rule of thumb, not an insurer's quote.",
      mr: "राहण्याच्या ठिकाणानुसार प्रति प्रौढ मूळ संरक्षण × सर्वात ज्येष्ठ सदस्याच्या वयाचा घटक (30 खाली: 1, 45 खाली: 1.25, 60 खाली: 1.5, 60 व त्यावर: 2) × कुटुंबाचा आकार (1 + प्रत्येक जास्तीच्या प्रौढासाठी 0.5 + प्रत्येक मुलासाठी 0.25). जवळच्या ₹2.5 लाखांपर्यंत पूर्णांक, ₹5 लाख ते ₹1 कोटी दरम्यान. हा अंदाजाचा नियम आहे, विमा कंपनीचे कोटेशन नाही.",
    },
  },
  {
    slug: "term-cover",
    inputs: [
      {
        kind: "number",
        key: "annualIncome",
        label: { en: "Annual income", mr: "वार्षिक उत्पन्न" },
        unit: "rupees",
        min: 100_000,
        max: 100_000_000,
        step: 50_000,
        default: 1_000_000,
        scale: "log",
      },
      {
        kind: "number",
        key: "age",
        label: { en: "Your age", mr: "तुमचे वय" },
        unit: "years",
        min: 18,
        max: 65,
        step: 1,
        default: 35,
      },
      {
        kind: "number",
        key: "liabilities",
        label: { en: "Loans and liabilities", mr: "कर्जे आणि देणी" },
        unit: "rupees",
        min: 0,
        max: 100_000_000,
        step: 100_000,
        default: 2_000_000,
      },
      {
        kind: "number",
        key: "dependants",
        label: { en: "Dependants", mr: "अवलंबून असलेले" },
        unit: "count",
        min: 0,
        max: 10,
        step: 1,
        default: 2,
      },
      {
        kind: "number",
        key: "existingCover",
        label: { en: "Existing life cover", mr: "सध्याचा जीवन विमा" },
        unit: "rupees",
        min: 0,
        max: 500_000_000,
        step: 500_000,
        default: 2_500_000,
      },
    ],
    rates: [
      {
        key: "retirementAge",
        label: { en: "Retirement age", mr: "निवृत्तीचे वय" },
        unit: "years",
        min: 50,
        max: 70,
        default: 60,
      },
    ],
    explain: {
      en: "Years to protect = retirement age − your age, kept between 5 and 25. The share of income to replace is 0.3 with no dependants, otherwise 0.6 plus 0.05 for each dependant after the first (up to five). Need = income × share × years + liabilities. Suggested cover = need − existing cover, rounded up to the next ₹5 lakh. A rule of thumb, not an insurer's quote.",
      mr: "संरक्षणाची वर्षे = निवृत्तीचे वय − तुमचे वय, 5 ते 25 दरम्यान. बदली करायचा उत्पन्नाचा हिस्सा: कोणी अवलंबून नसल्यास 0.3, अन्यथा 0.6 अधिक पहिल्यानंतरच्या प्रत्येक अवलंबितासाठी 0.05 (पाचपर्यंत). गरज = उत्पन्न × हिस्सा × वर्षे + कर्जे. सुचवलेला विमा = गरज − सध्याचा विमा, पुढच्या ₹5 लाखांपर्यंत. हा अंदाजाचा नियम आहे, विमा कंपनीचे कोटेशन नाही.",
    },
  },
];

export function definitionFor(slug: string): CalculatorDefinition | undefined {
  return DEFINITIONS.find((d) => d.slug === slug);
}

/** The built-in rates of a calculator. */
export function defaultRates(slug: string): Record<string, number> {
  return Object.fromEntries((definitionFor(slug)?.rates ?? []).map((r) => [r.key, r.default]));
}

export type ReaderInput = NumberInput | ChoiceInput;

/** The reader's inputs with rate inputs resolved: the sponsor's figure is where they start. */
export function readerInputs(
  def: CalculatorDefinition,
  rates: Record<string, number>,
): ReaderInput[] {
  return def.inputs.map((input) => {
    if (input.kind !== "rate") return input;
    const rate = def.rates.find((r) => r.key === input.key)!;
    return {
      kind: "number",
      key: rate.key,
      label: rate.label,
      unit: rate.unit,
      min: rate.min,
      max: rate.max,
      step: input.step,
      default: rates[rate.key] ?? rate.default,
    };
  });
}

/** Options of a choice given the other values (engine bands follow the vehicle kind). */
export function choiceOptions(
  input: ChoiceInput,
  values: Record<string, number | string>,
): readonly Choice[] {
  if (!input.dependsOn) return input.options;
  return input.dependsOn.options[String(values[input.dependsOn.key])] ?? input.options;
}

/** Starting values for the reader's inputs. */
export function initialValues(inputs: readonly ReaderInput[]): Record<string, number | string> {
  return Object.fromEntries(inputs.map((i) => [i.key, i.default]));
}
