# Demo data

`pnpm db:seed` loads the fictional demo world from `docs/TESTING.md`. It can be run any number of
times: rows that already exist (matched by slug, email or name) are left alone.

## From the docs

- **Newspapers:**
  - Tarun Bharat: live, red, Marathi only (D14; the handover demo also had English).
  - Paper B: staging, blue, English then Marathi.
  - Paper C: staging, green, Marathi only.
- **Institutions:** Sample AMC, Sample General Insurer, and Sample Life Insurer (no users; holds the
  life-insurance category exclusively).
- **Sections:** the 8 sections with their disclaimer keys (04.5).
- **Users:** the 15 accounts `<name>@demo.abcfinance.test`, password `Demo-Pass-2026`.
- **Sponsorships:**
  - SIP (mutual funds): AMC.
  - Health and motor: General Insurer.
  - Term (life): Life Insurer.
  - EMI and gold loan: unsponsored.

## Invented here, because the docs don't give them

| Item                  | Value                                                                                                             |
| --------------------- | ----------------------------------------------------------------------------------------------------------------- |
| AMC plan              | monthly, ₹1,00,000, Tarun Bharat + Paper B                                                                        |
| General Insurer plan  | annual prepaid, ₹12,00,000, all three papers                                                                      |
| Life Insurer plan     | monthly, ₹75,000, Tarun Bharat                                                                                    |
| Tarun Bharat contract | from 2026-04-01, year-1 guarantee ₹25,000/month, tenure step 2%/year                                              |
| Paper B contract      | from 2025-10-01, no guarantee, step 2%/year                                                                       |
| Paper C contract      | from 2026-07-01, no guarantee, step 2%/year                                                                       |
| Authors               | Anita Kulkarni (AMC), Rahul Deshmukh (GI), Meera Joshi (Life), abcfinance desk, Suresh Patil (independent expert) |
| Glossary              | EMI, SIP, CIBIL score, NCB, IDV, LTV, FOIR                                                                        |

**Marathi copy is a first draft.** Disclaimers, glossary, consent wording and labels need review by a
native editor and by compliance before launch (09.4).

## Published articles (M1): `articles.ts`

Seven articles with their published paper copies.

| Article                            | Type and section                                    | Copies                                                                            |
| ---------------------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------- |
| `sip-basics` (TESTING.md)          | AMC, mutual funds                                   | Tarun Bharat mr (editor-approved); Paper B en                                     |
| `home-loan-checklist` (TESTING.md) | abcfinance, home loan                               | Tarun Bharat mr; Paper C mr two days later (canonical → Tarun Bharat); Paper B en |
| `emergency-fund-first`             | independent expert Suresh Patil, mutual funds       | Tarun Bharat mr; Paper B en and mr                                                |
| `elss-tax-saving`                  | AMC, mutual funds                                   | Paper B en                                                                        |
| `health-cover-for-parents`         | General Insurer, health insurance                   | Tarun Bharat mr; Paper B en                                                       |
| `how-much-term-cover`              | abcfinance, life insurance (the exclusive category) | Tarun Bharat mr; Paper B en                                                       |
| `gold-loan-before-you-pledge`      | abcfinance, gold loans                              | Tarun Bharat mr; Paper C mr                                                       |

Tarun Bharat publishes only Marathi (decision D14).

The content is fictional and is not financial advice.

**Changed seed data needs a reset.** The seed only adds missing rows, so after pulling changes to
themes or articles, run `corepack pnpm db:reset`.

## Articles in the workflow (M3a): `workflow.ts`

Five of the seven workflow-state articles TESTING.md names, each with a master version and its
history. Their text is invented.

| Article                        | Where it is                                                 |
| ------------------------------ | ----------------------------------------------------------- |
| `debt-funds-vs-equity-funds`   | AMC draft by `writer.amc`                                   |
| `cashless-or-reimbursement`    | General Insurer, in approval (for `approver.gi`)            |
| `fixed-deposit-or-mutual-fund` | AMC, editing; says "assured returns", so the check flags it |
| `education-loan-moratorium`    | abcfinance, editing                                         |
| `riders-on-a-term-plan`        | Life Insurer, compliance review (no demo users there)       |

Steps by people without demo accounts are recorded with the actor label "seed (no demo account)".

## Still to add

- **M3b:** the two articles already with the newspapers ("Home loan balance transfer", "Index
  funds in plain words").
- **M5:** 45 days of traffic.
- **M7:** past statements.
- **M8:** widget cards.
