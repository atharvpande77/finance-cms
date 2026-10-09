# Demo data

`pnpm db:seed` loads the fictional demo world from `docs/TESTING.md`. It can be run any number of
times: rows that already exist (matched by slug, email or name) are left alone.

## From the docs

- **Newspapers:**
  - Tarun Bharat: live, red, Marathi then English.
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

## Still to add

- **M1:** articles.
- **M3:** articles in workflow states. TESTING.md names 9 of the 14; the remaining 5 will be invented.
- **M5:** 45 days of traffic.
- **M7:** past statements.
- **M8:** widget cards.
