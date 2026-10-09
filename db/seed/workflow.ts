/**
 * Articles part-way through the workflow (TESTING.md §2B): five before release, and two already
 * with the newspapers. All content is fictional and is not financial advice.
 */
import type { OrgSlug } from "./data";

type Step = {
  action: "create" | "submit" | "approve";
  from: "draft" | "in_approval" | "compliance_review" | null;
  to: "draft" | "in_approval" | "compliance_review" | "editing";
  /** A demo user handle, or null for a step by someone with no demo account. */
  by: string | null;
  hoursAgo: number;
  comment?: string;
};

export type WorkflowArticle = {
  slug: string;
  type: "institution" | "abcfinance";
  section: string;
  org: OrgSlug;
  author: string;
  language: "en";
  targets: string[];
  headline: string;
  summary: string;
  body: string;
  state: "draft" | "in_approval" | "compliance_review" | "editing";
  steps: Step[];
};

export const workflowArticles: WorkflowArticle[] = [
  {
    slug: "debt-funds-vs-equity-funds",
    type: "institution",
    section: "mutual-funds",
    org: "sample-amc",
    author: "anita-kulkarni",
    language: "en",
    targets: ["paperb"],
    headline: "Debt funds vs equity funds: which suits your goal?",
    summary:
      "How the two main kinds of mutual fund differ, and how to match them to a time horizon.",
    body: `Equity funds invest in shares; debt funds lend to governments and companies. They behave very differently, so the right one depends on when you need the money.

## Time decides

- **Under three years:** debt funds usually swing less.
- **Five years or more:** equity funds have more room to recover from bad years.

Write the rest of this draft before submitting.`,
    state: "draft",
    steps: [{ action: "create", from: null, to: "draft", by: "writer.amc", hoursAgo: 30 }],
  },
  {
    slug: "cashless-or-reimbursement",
    type: "institution",
    section: "health-insurance",
    org: "sample-general-insurer",
    author: "rahul-deshmukh",
    language: "en",
    targets: ["paperb"],
    headline: "Cashless or reimbursement: how a health claim is paid",
    summary: "The two ways a hospital bill is settled, and what to keep ready for each.",
    body: `A health insurance claim is settled in one of two ways. In a cashless claim the insurer pays a network hospital directly; in a reimbursement claim you pay first and claim the money back.

## Before you are admitted

- Check whether the hospital is in your insurer's network.
- Keep your policy number and photo ID with you.
- For a planned admission, ask the hospital desk to request pre-authorisation.

## Keep every paper

For reimbursement, the insurer needs original bills, discharge summary, prescriptions and test reports. Submit them within the time your policy allows.`,
    state: "in_approval",
    steps: [
      { action: "create", from: null, to: "draft", by: "writer.gi", hoursAgo: 52 },
      { action: "submit", from: "draft", to: "in_approval", by: "writer.gi", hoursAgo: 26 },
    ],
  },
  {
    slug: "fixed-deposit-or-mutual-fund",
    type: "institution",
    section: "mutual-funds",
    org: "sample-amc",
    author: "anita-kulkarni",
    language: "en",
    targets: ["paperb"],
    headline: "Fixed deposit or mutual fund for a three-year goal?",
    summary: "Comparing a bank deposit with a debt fund for money you need in about three years.",
    body: `A fixed deposit offers assured returns for its term, which is why many savers start there. A debt mutual fund's value moves with interest rates, but it can be more tax-efficient for some investors.

## Questions to ask

- Do you need the money on a fixed date?
- Which tax slab are you in?
- Could you leave the money untouched if rates move against you?

{{calc:sip}}

Read the scheme documents carefully before investing.`,
    state: "editing",
    steps: [
      { action: "create", from: null, to: "draft", by: "writer.amc", hoursAgo: 96 },
      { action: "submit", from: "draft", to: "in_approval", by: "writer.amc", hoursAgo: 72 },
      {
        action: "approve",
        from: "in_approval",
        to: "compliance_review",
        by: "approver.amc",
        hoursAgo: 50,
      },
      {
        action: "approve",
        from: "compliance_review",
        to: "editing",
        by: "compliance.amc",
        hoursAgo: 28,
        comment: "Approved for English.",
      },
    ],
  },
  {
    slug: "education-loan-moratorium",
    type: "abcfinance",
    section: "education-loan",
    org: "abcfinance",
    author: "abcfinance-desk",
    language: "en",
    targets: ["paperb"],
    headline: "Education loan: what the moratorium really means",
    summary: "Repayment can wait until after the course, but interest usually does not.",
    body: `Most education loans let you start repaying after the course ends, often with six months to a year of extra time. This pause is the moratorium.

## Interest keeps running

During the moratorium, simple interest is usually added to the loan. Paying that interest while you study keeps the loan from growing.

{{calc:emi}}

Ask your lender how interest is charged during the moratorium before you sign.`,
    state: "editing",
    steps: [
      { action: "create", from: null, to: "draft", by: "writer.abc", hoursAgo: 40 },
      { action: "submit", from: "draft", to: "editing", by: "writer.abc", hoursAgo: 20 },
    ],
  },
  {
    slug: "riders-on-a-term-plan",
    type: "institution",
    section: "life-insurance",
    org: "sample-life-insurer",
    author: "meera-joshi",
    language: "en",
    targets: ["paperb"],
    headline: "Riders on a term plan: which ones are worth it?",
    summary: "Accidental death, critical illness and waiver of premium, explained.",
    body: `A rider is an add-on to a term insurance policy that extends its cover for an extra premium.

## Common riders

- **Accidental death benefit:** pays an extra sum if death is caused by an accident.
- **Critical illness:** pays a lump sum on diagnosis of a listed illness.
- **Waiver of premium:** future premiums are waived if you become disabled.

Compare the rider's cost with a separate policy before you add it.`,
    state: "compliance_review",
    steps: [
      { action: "create", from: null, to: "draft", by: null, hoursAgo: 70 },
      { action: "submit", from: "draft", to: "in_approval", by: null, hoursAgo: 60 },
      { action: "approve", from: "in_approval", to: "compliance_review", by: null, hoursAgo: 30 },
    ],
  },
];

type Master = { language: "en" | "mr"; headline: string; summary: string; body: string };

/** A copy waiting for a paper: deemed (due in some hours) or needing an explicit approval. */
type WaitingCopy = {
  tenant: string;
  language: "en" | "mr";
  /** Deemed approval: the window ends this many hours after seeding. */
  dueInHours?: number;
  explicitReasons?: Array<"first_articles" | "flagged" | "held_section">;
  /** For explicit copies: when it was released. */
  releasedHoursAgo?: number;
  note?: string;
};

export type ReleasedArticle = {
  slug: string;
  type: "institution" | "abcfinance";
  section: string;
  org: OrgSlug;
  author: string;
  /** The approval steps every master went through before release, by demo user. */
  path: Array<{
    action: "submit" | "approve";
    by: string;
    to: "in_approval" | "compliance_review" | "editing";
  }>;
  writer: string;
  masters: Master[];
  copies: WaitingCopy[];
};

/** Hours in each paper's veto window in the seed (all three use the default). */
export const SEED_WINDOW_HOURS = 24;

export const releasedArticles: ReleasedArticle[] = [
  {
    slug: "home-loan-balance-transfer",
    type: "abcfinance",
    section: "home-loan",
    org: "abcfinance",
    author: "abcfinance-desk",
    writer: "writer.abc",
    path: [{ action: "submit", by: "writer.abc", to: "editing" }],
    masters: [
      {
        language: "mr",
        headline: "गृहकर्ज बॅलन्स ट्रान्सफर: कर्ज बदलणे कधी फायद्याचे?",
        summary:
          "कमी व्याजदराच्या बँकेकडे कर्ज नेल्यास पैसे वाचू शकतात, पण शुल्क आणि वेळ महत्त्वाची आहे.",
        body: `बॅलन्स ट्रान्सफर म्हणजे तुमचे उरलेले गृहकर्ज दुसऱ्या बँकेकडे नेणे, सहसा कमी व्याजदरासाठी. किती बचत होईल हे उरलेली रक्कम आणि उरलेल्या वर्षांवर अवलंबून असते.

## कर्ज बदलण्यापूर्वी

- नवा व्याजदर आणि सध्याचा व्याजदर यांची तुलना करा.
- प्रक्रिया शुल्क, कायदेशीर खर्च आणि मुद्रांक शुल्क यांची बेरीज करा.
- सध्याची बँक विचारल्यास व्याजदर कमी करते का, ते तपासा.

{{calc:emi}}

कर्जाच्या सुरुवातीच्या वर्षांत बदल केल्यास जास्त बचत होते, कारण बहुतेक व्याज पहिल्या काही वर्षांत भरले जाते.`,
      },
      {
        language: "en",
        headline: "Home loan balance transfer: when does switching pay?",
        summary:
          "Moving your loan to a lender with a lower rate can save money, but fees and timing matter.",
        body: `A balance transfer moves your outstanding home loan to another lender, usually for a lower interest rate. The saving depends on how much is left to repay and how many years remain.

## Before you switch

- Compare the new rate with your current one.
- Add up processing fees, legal charges and stamp duty.
- Ask whether your current lender will lower the rate if you ask.

{{calc:emi}}

Switching early in the loan usually saves more, because most of the interest is paid in the first years.`,
      },
    ],
    copies: [
      { tenant: "tarunbharat", language: "mr", dueInHours: 20 },
      {
        tenant: "paperb",
        language: "en",
        dueInHours: 3,
        note: "Timed for the RBI policy week.",
      },
    ],
  },
  {
    slug: "index-funds-in-plain-words",
    type: "institution",
    section: "mutual-funds",
    org: "sample-amc",
    author: "anita-kulkarni",
    writer: "writer.amc",
    path: [
      { action: "submit", by: "writer.amc", to: "in_approval" },
      { action: "approve", by: "approver.amc", to: "compliance_review" },
      { action: "approve", by: "compliance.amc", to: "editing" },
    ],
    masters: [
      {
        language: "mr",
        headline: "इंडेक्स फंड सोप्या शब्दांत",
        summary: "इंडेक्स फंड काय करतो, त्याचा खर्च किती आणि तो कोणासाठी योग्य ठरू शकतो.",
        body: `इंडेक्स फंड निफ्टी ५० सारख्या बाजार निर्देशांकातील शेअर्स त्याच प्रमाणात खरेदी करतो. तो निर्देशांकाला मागे टाकण्याचा प्रयत्न करत नाही; तो निर्देशांकाइतकाच परतावा मिळवण्याचा प्रयत्न करतो.

## लोक हा पर्याय का निवडतात

- **कमी खर्च:** शेअर्स निवडणारी टीम नसल्याने खर्चाचे प्रमाण सहसा कमी असते.
- **समजायला सोपा:** फंडाचे मूल्य निर्देशांकासोबत बदलते.
- **विविधता:** एकाच फंडात अनेक कंपन्या असतात.

## लक्षात ठेवा

बाजार घसरला की फंडही घसरतो. एकाच निर्देशांकाचा मागोवा घेणाऱ्या फंडांमध्ये ट्रॅकिंग एरर आणि खर्चाचे प्रमाण यांची तुलना करा.`,
      },
      {
        language: "en",
        headline: "Index funds in plain words",
        summary: "What an index fund does, what it costs, and who it may suit.",
        body: `An index fund buys the shares of a market index, such as the Nifty 50, in the same proportions. It does not try to beat the index; it tries to match it.

## Why people choose them

- **Low cost:** no team is picking stocks, so the expense ratio is usually lower.
- **Easy to follow:** the fund's value moves with the index.
- **Broad spread:** one fund holds many companies.

## What to keep in mind

The fund falls when the market falls. Compare tracking error and expense ratio between funds that follow the same index.`,
      },
    ],
    // Sample AMC has fewer than three articles live on each paper, so both papers must approve.
    copies: [
      {
        tenant: "tarunbharat",
        language: "mr",
        explicitReasons: ["first_articles"],
        releasedHoursAgo: 5,
      },
      {
        tenant: "paperb",
        language: "en",
        explicitReasons: ["first_articles"],
        releasedHoursAgo: 5,
      },
    ],
  },
];
