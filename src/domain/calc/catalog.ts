/** The seven phase-1 calculators (04.7). Formulas arrive in M4; this is the catalogue. */
import type { Lang } from "@/domain/i18n";

export type CalculatorInfo = {
  slug: string;
  name: Record<Lang, string>;
  description: Record<Lang, string>;
};

export const CALCULATORS: readonly CalculatorInfo[] = [
  {
    slug: "emi",
    name: { en: "EMI calculator", mr: "ईएमआय कॅल्क्युलेटर" },
    description: {
      en: "Your monthly instalment, total interest and total payment for a loan.",
      mr: "कर्जाचा मासिक हप्ता, एकूण व्याज आणि एकूण परतफेड.",
    },
  },
  {
    slug: "sip",
    name: { en: "SIP calculator", mr: "एसआयपी कॅल्क्युलेटर" },
    description: {
      en: "What a monthly investment could grow to over time.",
      mr: "दरमहा गुंतवणुकीतून कालांतराने किती रक्कम जमू शकते.",
    },
  },
  {
    slug: "home-loan-eligibility",
    name: { en: "Home loan eligibility", mr: "गृहकर्ज पात्रता" },
    description: {
      en: "How much you could borrow from your income and existing EMIs.",
      mr: "उत्पन्न आणि सध्याच्या ईएमआयवरून तुम्हाला किती कर्ज मिळू शकते.",
    },
  },
  {
    slug: "gold-loan",
    name: { en: "Gold loan calculator", mr: "सोने तारण कर्ज कॅल्क्युलेटर" },
    description: {
      en: "The loan your gold can secure, and what you will repay.",
      mr: "तुमच्या सोन्यावर किती कर्ज मिळू शकते आणि किती परतफेड करावी लागेल.",
    },
  },
  {
    slug: "motor-premium",
    name: { en: "Motor premium and No Claim Bonus", mr: "वाहन विमा प्रीमियम आणि नो क्लेम बोनस" },
    description: {
      en: "An estimate of your car or two-wheeler premium, and what your NCB saves.",
      mr: "कार किंवा दुचाकीच्या प्रीमियमचा अंदाज आणि एनसीबीमुळे होणारी बचत.",
    },
  },
  {
    slug: "health-cover",
    name: { en: "Health cover needed", mr: "किती आरोग्य विमा हवा" },
    description: {
      en: "A suggested family health cover, and the gap in your current policy.",
      mr: "कुटुंबासाठी सुचवलेले आरोग्य विमा संरक्षण आणि सध्याच्या पॉलिसीतील तूट.",
    },
  },
  {
    slug: "term-cover",
    name: { en: "Term cover needed", mr: "किती टर्म विमा हवा" },
    description: {
      en: "How much life cover would protect your family's income.",
      mr: "कुटुंबाचे उत्पन्न सुरक्षित ठेवण्यासाठी किती जीवन विमा लागेल.",
    },
  },
];

export const CALCULATOR_SLUGS = CALCULATORS.map((c) => c.slug);

export function calculatorBySlug(slug: string): CalculatorInfo | undefined {
  return CALCULATORS.find((c) => c.slug === slug);
}
