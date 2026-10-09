/**
 * Published demo articles for the reader site (M1). Two are named in TESTING.md (sip-basics,
 * home-loan-checklist); the rest are invented so every page type has content. The seven
 * workflow-state articles TESTING.md names arrive with M3. All content is fictional and is not
 * financial advice; Marathi text needs native review.
 */
import type { OrgSlug } from "./data";

type Copy = {
  tenant: string;
  lang: "en" | "mr";
  publishedAt: string;
  approval: "explicit" | "deemed";
};

export type SeedArticle = {
  slug: string;
  type: "institution" | "abcfinance" | "independent";
  section: string;
  org: OrgSlug;
  author: string;
  masterLanguage: "en" | "mr";
  createdAt: string;
  versions: Partial<Record<"en" | "mr", { headline: string; summary: string; body: string }>>;
  copies: Copy[];
};

export const articles: SeedArticle[] = [
  {
    slug: "sip-basics",
    type: "institution",
    section: "mutual-funds",
    org: "sample-amc",
    author: "anita-kulkarni",
    masterLanguage: "en",
    createdAt: "2026-09-08T05:30:00Z",
    versions: {
      mr: {
        headline: "एसआयपीची ओळख: दरमहा छोटी गुंतवणूक कशी वाढते",
        summary:
          "सिस्टिमॅटिक इन्व्हेस्टमेंट प्लॅनमध्ये दरमहा ठरावीक रक्कम म्युच्युअल फंडात गुंतवली जाते. ती कशी काम करते आणि सुरुवात करण्यापूर्वी काय तपासावे ते पाहा.",
        body: `सिस्टिमॅटिक इन्व्हेस्टमेंट प्लॅन, म्हणजेच एसआयपी, दरमहा एकाच तारखेला ठरावीक रक्कम म्युच्युअल फंड योजनेत गुंतवते. फक्त ₹५०० पासून सुरुवात करता येते.

## गुंतवणूकदारांना एसआयपी का आवडते

- **सवय:** रक्कम आपोआप खात्यातून जाते, त्यामुळे खर्च करण्यापूर्वीच गुंतवणूक होते.
- **सरासरी:** भाव कमी असताना जास्त युनिट्स आणि भाव जास्त असताना कमी युनिट्स मिळतात.
- **लवचिकता:** एसआयपीची रक्कम कधीही वाढवता, थांबवता किंवा बंद करता येते.

{{calc:sip}}

## सुरुवात करण्यापूर्वी

तुम्ही किती काळ गुंतवणूक ठेवू शकता त्यानुसार योजना निवडा. पाच वर्षांहून दूरच्या उद्दिष्टांसाठी इक्विटी फंड योग्य ठरतात; कमी कालावधीसाठी डेट किंवा हायब्रिड फंड पाहा.

योजनेचे माहितीपत्रक वाचा आणि फंडाचा प्रकार व खर्च [एएमएफआयच्या संकेतस्थळावर](https://www.amfiindia.com/) तपासा. संज्ञा नव्या आहेत? आमच्या [शब्दकोशात](/glossary/sip) एसआयपी आणि इतर संज्ञांचे अर्थ आहेत.`,
      },
      en: {
        headline: "SIP basics: how a small monthly investment adds up",
        summary:
          "A systematic investment plan puts a fixed amount into a mutual fund every month. Here is how it works and what to check before you start.",
        body: `A systematic investment plan, or SIP, invests a fixed amount in a mutual fund scheme on the same date every month. You can start with as little as ₹500.

## Why investors like SIPs

- **Habit:** the amount leaves your account automatically, so you invest before you spend.
- **Averaging:** you buy more units when prices are low and fewer when they are high.
- **Flexibility:** you can increase, pause or stop a SIP at any time.

{{calc:sip}}

## Before you start

Pick a scheme that matches how long you can stay invested. Equity funds suit goals five or more years away; for shorter goals, look at debt or hybrid funds.

Read the scheme information document, and check a fund's category and costs on the [AMFI website](https://www.amfiindia.com/). New to the terms? Our [glossary](/glossary/sip) explains SIP and more.`,
      },
    },
    copies: [
      { tenant: "tarunbharat", lang: "mr", publishedAt: "2026-09-14T05:30:00Z", approval: "explicit" },
      { tenant: "paperb", lang: "en", publishedAt: "2026-09-17T06:00:00Z", approval: "explicit" },
    ],
  },
  {
    slug: "elss-tax-saving",
    type: "institution",
    section: "mutual-funds",
    org: "sample-amc",
    author: "anita-kulkarni",
    masterLanguage: "en",
    createdAt: "2026-09-15T05:30:00Z",
    versions: {
      en: {
        headline: "ELSS funds: saving tax with a three-year lock-in",
        summary:
          "Equity-linked savings schemes qualify for a deduction under the old tax regime. The catch is a three-year lock-in and equity-market risk.",
        body: `An equity-linked savings scheme (ELSS) is a mutual fund that invests mainly in shares and qualifies for a deduction under Section 80C of the old tax regime.

## What to know

- Each investment is locked in for three years from the date you make it.
- Returns are not guaranteed; the fund's value moves with the stock market.
- Under the new tax regime there is no 80C deduction, so check which regime you use.

If you invest through a SIP, remember that every monthly instalment has its own three-year lock-in.`,
      },
    },
    copies: [
      { tenant: "paperb", lang: "en", publishedAt: "2026-09-21T05:30:00Z", approval: "explicit" },
    ],
  },
  {
    slug: "emergency-fund-first",
    type: "independent",
    section: "mutual-funds",
    org: "abcfinance",
    author: "suresh-patil",
    masterLanguage: "en",
    createdAt: "2026-09-18T05:30:00Z",
    versions: {
      en: {
        headline: "Build an emergency fund before you invest",
        summary:
          "Six months of expenses, kept somewhere safe and easy to reach, stops a job loss or hospital bill from forcing you to sell investments at a bad time.",
        body: `Before your first SIP, set aside money for emergencies: a job loss, a medical bill, an urgent repair.

## How much

Aim for six months of essential expenses: rent or EMI, food, school fees, insurance premiums and utilities. Families with one earner may want more.

## Where to keep it

- A savings account or sweep-in fixed deposit for the first month or two.
- A liquid or overnight fund for the rest, which you can usually redeem within a working day.

Once the fund is in place, start investing for longer goals.

{{calc:sip}}

The Reserve Bank's [financial education pages](https://www.rbi.org.in/financialeducation/) cover saving basics in several languages.`,
      },
      mr: {
        headline: "गुंतवणुकीपूर्वी आपत्कालीन निधी उभारा",
        summary:
          "सहा महिन्यांचा खर्च सुरक्षित आणि सहज मिळेल अशा ठिकाणी ठेवल्यास नोकरी गेली किंवा रुग्णालयाचा खर्च आला तरी गुंतवणूक चुकीच्या वेळी विकावी लागत नाही.",
        body: `पहिली एसआयपी सुरू करण्यापूर्वी आपत्कालीन खर्चासाठी पैसे बाजूला ठेवा: नोकरी जाणे, वैद्यकीय खर्च किंवा तातडीची दुरुस्ती.

## किती रक्कम

किमान सहा महिन्यांचा आवश्यक खर्च बाजूला ठेवा: भाडे किंवा ईएमआय, अन्न, शाळेची फी, विमा हप्ते आणि वीज-पाणी बिल. घरात एकच कमावती व्यक्ती असेल तर अधिक रक्कम ठेवा.

## कुठे ठेवावी

- पहिल्या एक-दोन महिन्यांची रक्कम बचत खात्यात किंवा स्वीप-इन मुदत ठेवीत.
- उरलेली रक्कम लिक्विड किंवा ओव्हरनाईट फंडात, जी साधारणपणे एका कामकाजाच्या दिवसात काढता येते.

हा निधी तयार झाल्यावर दीर्घकालीन उद्दिष्टांसाठी गुंतवणूक सुरू करा.

{{calc:sip}}`,
      },
    },
    copies: [
      { tenant: "tarunbharat", lang: "mr", publishedAt: "2026-09-24T05:45:00Z", approval: "deemed" },
      { tenant: "paperb", lang: "en", publishedAt: "2026-09-26T05:30:00Z", approval: "deemed" },
      { tenant: "paperb", lang: "mr", publishedAt: "2026-09-26T05:45:00Z", approval: "deemed" },
    ],
  },
  {
    slug: "home-loan-checklist",
    type: "abcfinance",
    section: "home-loan",
    org: "abcfinance",
    author: "abcfinance-desk",
    masterLanguage: "mr",
    createdAt: "2026-09-03T05:30:00Z",
    versions: {
      mr: {
        headline: "गृहकर्जाची तयारी: अर्ज करण्यापूर्वी तपासण्याच्या गोष्टी",
        summary:
          "उत्पन्न, क्रेडिट स्कोअर, कागदपत्रे आणि विविध बँकांचे प्रस्ताव आधीच तपासले तर गृहकर्ज लवकर आणि स्वस्तात मिळू शकते.",
        body: `घर घेणे हा बहुतेक कुटुंबांसाठी आयुष्यातील सर्वात मोठा आर्थिक निर्णय असतो. अर्ज करण्यापूर्वी थोडी तयारी केली तर कर्ज लवकर मंजूर होते आणि व्याजही कमी लागू शकते.

## आपले आकडे जाणून घ्या

बहुतेक बँका तुमच्या मासिक उत्पन्नाच्या साधारण निम्म्यापर्यंतच एकूण ईएमआय मान्य करतात. सध्याचे सर्व हप्ते त्यात मोजले जातात.

{{calc:emi}}

डाउन पेमेंटसाठी घराच्या किमतीच्या किमान १० ते २५ टक्के रक्कम तयार ठेवा. नोंदणी, मुद्रांक शुल्क आणि अंतर्गत कामांचा खर्च वेगळा असतो.

## कागदपत्रे

- ओळख आणि पत्त्याचा पुरावा
- मागील सहा महिन्यांच्या पगार पावत्या किंवा व्यवसायाचे विवरण
- दोन वर्षांचे आयकर विवरणपत्र
- सहा महिन्यांचे बँक खाते विवरण
- मालमत्तेची कागदपत्रे आणि मंजूर नकाशा

## प्रस्तावांची तुलना करा

फक्त व्याजदर नाही तर प्रक्रिया शुल्क, मुदतपूर्व परतफेडीचे नियम आणि व्याजदर कोणत्या बेंचमार्कशी जोडलेला आहे हेही पाहा. रिझर्व्ह बँकेच्या [संकेतस्थळावर](https://www.rbi.org.in/) कर्जदारांच्या हक्कांविषयी माहिती आहे.

## मंजुरीनंतर

कर्ज करार काळजीपूर्वक वाचा आणि ईएमआयची तारीख पगाराच्या तारखेनंतर ठेवा. हप्ता चुकल्यास क्रेडिट स्कोअरवर परिणाम होतो.`,
      },
      en: {
        headline: "Home loan checklist: what to sort out before you apply",
        summary:
          "Checking your income, credit score, documents and competing offers in advance can get your home loan approved faster and cheaper.",
        body: `Buying a home is the biggest financial decision most families make. A little preparation before you apply can speed up approval and lower what you pay in interest.

## Know your numbers

Most lenders cap your total EMIs at around half your monthly income, and every existing instalment counts towards that limit.

{{calc:emi}}

Keep at least 10 to 25 per cent of the property price ready as a down payment. Registration, stamp duty and interiors cost extra.

## Documents

- Proof of identity and address
- Salary slips for the last six months, or business statements
- Income tax returns for two years
- Bank statements for six months
- Property papers and the approved plan

## Compare offers

Look beyond the interest rate: processing fees, prepayment rules and the benchmark your rate is linked to all matter. The Reserve Bank's [website](https://www.rbi.org.in/) explains borrowers' rights.

## After approval

Read the loan agreement carefully and set the EMI date after your salary date. A missed instalment hurts your credit score.`,
      },
    },
    copies: [
      { tenant: "tarunbharat", lang: "mr", publishedAt: "2026-09-10T05:30:00Z", approval: "deemed" },
      { tenant: "paperc", lang: "mr", publishedAt: "2026-09-12T05:30:00Z", approval: "deemed" },
      { tenant: "paperb", lang: "en", publishedAt: "2026-09-15T05:30:00Z", approval: "deemed" },
    ],
  },
  {
    slug: "health-cover-for-parents",
    type: "institution",
    section: "health-insurance",
    org: "sample-general-insurer",
    author: "rahul-deshmukh",
    masterLanguage: "en",
    createdAt: "2026-09-20T05:30:00Z",
    versions: {
      en: {
        headline: "Health cover for parents: what to check in a senior citizen policy",
        summary:
          "Waiting periods, co-payment and room-rent limits matter more than the premium when you buy health insurance for parents over 60.",
        body: `Buying health insurance for parents is harder after 60: premiums are higher and policies carry more conditions. Compare these before you choose.

## Read the fine print

- **Waiting periods** for illnesses they already have, often two to four years.
- **Co-payment:** the share of each claim you pay yourself, often 10 to 30 per cent.
- **Room-rent limits**, which can reduce the whole claim if you choose a costlier room.
- **Network hospitals** near where your parents live, for cashless treatment.

{{calc:health-cover}}

Disclose every existing illness on the proposal form. Hiding one is the most common reason claims are rejected.`,
      },
      mr: {
        headline: "पालकांसाठी आरोग्य विमा: ज्येष्ठ नागरिक पॉलिसीत काय तपासावे",
        summary:
          "६० वर्षांवरील पालकांसाठी आरोग्य विमा घेताना हप्त्यापेक्षा प्रतीक्षा कालावधी, को-पेमेंट आणि खोली भाड्याची मर्यादा जास्त महत्त्वाची असते.",
        body: `साठीनंतर पालकांसाठी आरोग्य विमा घेणे कठीण होते: हप्ते जास्त असतात आणि अटीही अधिक असतात. निवड करण्यापूर्वी या गोष्टींची तुलना करा.

## बारीक अटी वाचा

- आधीपासून असलेल्या आजारांसाठी **प्रतीक्षा कालावधी**, साधारणपणे दोन ते चार वर्षे.
- **को-पेमेंट:** प्रत्येक दाव्यातील तुम्ही स्वतः भरायचा वाटा, साधारणपणे १० ते ३० टक्के.
- **खोली भाड्याची मर्यादा:** महाग खोली घेतल्यास संपूर्ण दाव्याची रक्कम कमी होऊ शकते.
- पालक राहतात त्या भागातील **नेटवर्क रुग्णालये**, कॅशलेस उपचारासाठी.

{{calc:health-cover}}

प्रस्ताव अर्जात सर्व विद्यमान आजार नमूद करा. माहिती लपवणे हे दावा नाकारला जाण्याचे सर्वात सामान्य कारण आहे.`,
      },
    },
    copies: [
      { tenant: "tarunbharat", lang: "mr", publishedAt: "2026-09-28T05:45:00Z", approval: "explicit" },
      { tenant: "paperb", lang: "en", publishedAt: "2026-09-29T05:30:00Z", approval: "explicit" },
    ],
  },
  {
    slug: "how-much-term-cover",
    type: "abcfinance",
    section: "life-insurance",
    org: "abcfinance",
    author: "abcfinance-desk",
    masterLanguage: "en",
    createdAt: "2026-09-25T05:30:00Z",
    versions: {
      en: {
        headline: "How much term insurance do you need?",
        summary:
          "A term plan should replace the income your family would lose and clear your loans. Here is a simple way to estimate the cover.",
        body: `Term insurance pays your family a lump sum if you die during the policy term. It has no maturity value, which is why it is the cheapest way to buy a large cover.

## A simple estimate

Start with the share of your income your family depends on, multiply it by the years until you retire, and add your outstanding loans. Subtract any cover you already have.

{{calc:term-cover}}

## Choosing a policy

- Cover yourself until about the age your youngest child becomes independent.
- Compare claim settlement records, not just premiums.
- Buy riders only if you understand what they add.`,
      },
      mr: {
        headline: "तुम्हाला किती टर्म विमा हवा?",
        summary:
          "टर्म प्लॅनने कुटुंबाचे गमावले जाणारे उत्पन्न भरून निघायला हवे आणि कर्जेही फिटायला हवीत. विमा संरक्षणाचा अंदाज कसा काढावा ते पाहा.",
        body: `पॉलिसीच्या मुदतीत विमाधारकाचा मृत्यू झाल्यास टर्म विमा कुटुंबाला एकरकमी रक्कम देतो. यात मुदतपूर्तीनंतर काही परत मिळत नाही, म्हणूनच मोठे संरक्षण स्वस्तात मिळते.

## सोपा अंदाज

तुमच्या उत्पन्नापैकी कुटुंब किती भागावर अवलंबून आहे ते पाहा, त्याला निवृत्तीपर्यंतच्या वर्षांनी गुणा आणि थकीत कर्जे त्यात मिळवा. आधीपासून असलेले विमा संरक्षण वजा करा.

{{calc:term-cover}}

## पॉलिसी निवडताना

- सर्वात लहान मूल स्वावलंबी होईपर्यंतच्या वयापर्यंत संरक्षण घ्या.
- फक्त हप्ते नव्हे, तर दावा निकाली काढण्याचे प्रमाणही तुलना करा.
- रायडर्स काय देतात हे समजले तरच ते घ्या.`,
      },
    },
    copies: [
      { tenant: "tarunbharat", lang: "mr", publishedAt: "2026-10-02T05:45:00Z", approval: "deemed" },
      { tenant: "paperb", lang: "en", publishedAt: "2026-10-03T05:30:00Z", approval: "deemed" },
    ],
  },
  {
    slug: "gold-loan-before-you-pledge",
    type: "abcfinance",
    section: "gold-loans",
    org: "abcfinance",
    author: "abcfinance-desk",
    masterLanguage: "mr",
    createdAt: "2026-09-30T05:30:00Z",
    versions: {
      mr: {
        headline: "सोने तारण ठेवण्यापूर्वी या गोष्टी तपासा",
        summary:
          "सोने तारण कर्ज लवकर मिळते, पण व्याजदर, परतफेडीची पद्धत आणि लिलावाचे नियम आधी समजून घ्या.",
        body: `सोने तारण कर्ज काही तासांत मिळू शकते आणि क्रेडिट स्कोअरची फारशी अट नसते. तरीही कर्ज घेण्यापूर्वी अटी नीट समजून घ्या.

## किती कर्ज मिळते

कर्जदाता सोन्याच्या शुद्धतेनुसार त्याचे मूल्य ठरवतो आणि त्या मूल्याच्या कमाल ७५ टक्क्यांपर्यंत कर्ज देतो.

{{calc:gold-loan}}

## परतफेडीचे पर्याय

- दरमहा फक्त व्याज, आणि मुद्दल शेवटी
- नेहमीच्या ईएमआयप्रमाणे हप्ते
- संपूर्ण रक्कम मुदतीच्या शेवटी, चक्रवाढ व्याजासह

वेळेवर परतफेड न केल्यास, सूचना दिल्यानंतर कर्जदाता तारण सोन्याचा लिलाव करू शकतो. लिलावाची सूचना आणि त्यातून उरलेली रक्कम परत मिळण्याचे नियम करारात तपासा.`,
      },
    },
    copies: [
      { tenant: "tarunbharat", lang: "mr", publishedAt: "2026-10-05T05:30:00Z", approval: "deemed" },
      { tenant: "paperc", lang: "mr", publishedAt: "2026-10-06T05:30:00Z", approval: "deemed" },
    ],
  },
];
