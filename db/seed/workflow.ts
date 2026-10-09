/**
 * Articles part-way through the workflow (TESTING.md §2B), before release. The two that are
 * already with the newspapers arrive with release in M3b. All content is fictional and is not
 * financial advice.
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
