/**
 * The demo world from docs/TESTING.md. Everything here is fictional except the launch partner's
 * name (Tarun Bharat). Marathi copy is a first draft and needs native and legal review (09.4).
 * Figures not given by the docs (plan prices, contract terms) are invented; see README.md.
 */
import type { LocalizedText, TenantTheme } from "@/server/db/schema";
import type { Role } from "@/domain/roles";

export const DEMO_PASSWORD = "Demo-Pass-2026";
export const DEMO_EMAIL_DOMAIN = "demo.abcfinance.test";

export const organisations = [
  { slug: "abcfinance", type: "abcfinance", name: "abcfinance" },
  {
    slug: "sample-amc",
    type: "institution",
    name: "Sample AMC",
    blurb: {
      en: "Sample AMC is a fictional asset management company used for demonstrations.",
      mr: "सॅम्पल एएमसी ही प्रात्यक्षिकासाठी वापरलेली काल्पनिक मालमत्ता व्यवस्थापन कंपनी आहे.",
    },
  },
  {
    slug: "sample-general-insurer",
    type: "institution",
    name: "Sample General Insurer",
    blurb: {
      en: "Sample General Insurer is a fictional health and motor insurer used for demonstrations.",
      mr: "सॅम्पल जनरल इन्शुरर ही प्रात्यक्षिकासाठी वापरलेली काल्पनिक आरोग्य व वाहन विमा कंपनी आहे.",
    },
  },
  {
    slug: "sample-life-insurer",
    type: "institution",
    name: "Sample Life Insurer",
    blurb: {
      en: "Sample Life Insurer is a fictional life insurer used for demonstrations.",
      mr: "सॅम्पल लाइफ इन्शुरर ही प्रात्यक्षिकासाठी वापरलेली काल्पनिक जीवन विमा कंपनी आहे.",
    },
  },
  { slug: "tarun-bharat", type: "publisher", name: "Tarun Bharat" },
  { slug: "paper-b", type: "publisher", name: "Paper B" },
  { slug: "paper-c", type: "publisher", name: "Paper C" },
] as const satisfies ReadonlyArray<{
  slug: string;
  type: "institution" | "publisher" | "abcfinance";
  name: string;
  blurb?: LocalizedText;
}>;

export type OrgSlug = (typeof organisations)[number]["slug"];

export const tenants: Array<{
  slug: string;
  publisher: OrgSlug;
  name: LocalizedText;
  menuLabel: LocalizedText;
  mainSiteUrl: string;
  hosts: string[];
  theme: TenantTheme;
  languages: string[];
  defaultLanguage: string;
  status: "staging" | "live";
  autoApproveHours: number;
}> = [
  {
    slug: "tarunbharat",
    publisher: "tarun-bharat",
    name: { mr: "तरुण भारत", en: "Tarun Bharat" },
    menuLabel: { mr: "अर्थविश्व", en: "Money" },
    mainSiteUrl: "https://www.tarunbharat.net",
    hosts: ["tarunbharat.localhost"],
    // Follows tarunbharat.net: cream page, black utility strip, red wordmark with navy
    // accents, Karma for the masthead and menu, Noto Sans for text.
    theme: {
      primary: "#c8102e",
      accent: "#303090",
      bg: "#fffbf4",
      surface: "#ffffff",
      ink: "#212529",
      muted: "#5f6368",
      rule: "#000000",
      bar: "#000000",
      displayFont: "karma",
      headingFont: "noto-sans",
      bodyFont: "noto-sans",
    },
    languages: ["mr"],
    defaultLanguage: "mr",
    status: "live",
    autoApproveHours: 24,
  },
  {
    slug: "paperb",
    publisher: "paper-b",
    name: { en: "Paper B", mr: "पेपर बी" },
    menuLabel: { en: "Money", mr: "अर्थविश्व" },
    mainSiteUrl: "https://www.paperb.example",
    hosts: ["paperb.localhost"],
    theme: {
      primary: "#1546a0",
      accent: "#0e7c86",
      bg: "#f7f9fc",
      surface: "#ffffff",
      ink: "#111827",
      muted: "#4b5563",
      rule: "#1546a0",
      bar: "#0b2552",
      displayFont: "open-sans",
      headingFont: "open-sans",
      bodyFont: "open-sans",
    },
    languages: ["en", "mr"],
    defaultLanguage: "en",
    status: "staging",
    autoApproveHours: 24,
  },
  {
    slug: "paperc",
    publisher: "paper-c",
    name: { mr: "पेपर सी" },
    menuLabel: { mr: "पैसा" },
    mainSiteUrl: "https://www.paperc.example",
    hosts: ["paperc.localhost"],
    theme: {
      primary: "#17703a",
      accent: "#7a5c00",
      bg: "#f8faf5",
      surface: "#ffffff",
      ink: "#14281d",
      muted: "#53625a",
      rule: "#17703a",
      bar: "#0f3d22",
      displayFont: "mukta",
      headingFont: "mukta",
      bodyFont: "mukta",
    },
    languages: ["mr"],
    defaultLanguage: "mr",
    status: "staging",
    autoApproveHours: 24,
  },
];

export const disclaimers: Array<{ key: string; text: LocalizedText }> = [
  {
    key: "mf",
    text: {
      en: "Mutual fund investments are subject to market risks. Read all scheme-related documents carefully before investing. Past performance is not an indicator of future returns.",
      mr: "म्युच्युअल फंडातील गुंतवणूक बाजारातील जोखमींच्या अधीन असते. गुंतवणूक करण्यापूर्वी योजनेशी संबंधित सर्व कागदपत्रे काळजीपूर्वक वाचा. मागील कामगिरी भविष्यातील परताव्याचे निदर्शक नाही.",
    },
  },
  {
    key: "insurance",
    text: {
      en: "Insurance is the subject matter of solicitation. For details on risk factors, terms, conditions and exclusions, read the policy wording carefully before concluding a sale.",
      mr: "विमा हा विनंतीचा विषय आहे. जोखीम घटक, अटी, शर्ती आणि अपवाद यांच्या तपशीलासाठी विक्री पूर्ण करण्यापूर्वी पॉलिसीचे शब्दांकन काळजीपूर्वक वाचा.",
    },
  },
  {
    key: "loan",
    text: {
      en: "Loan approval, amount and interest rate are at the sole discretion of the lender. This article is for information only and is not an offer of credit.",
      mr: "कर्ज मंजुरी, रक्कम आणि व्याजदर हे पूर्णपणे कर्जदात्याच्या निर्णयावर अवलंबून असतात. हा लेख केवळ माहितीसाठी आहे; हा कर्जाचा प्रस्ताव नाही.",
    },
  },
  {
    key: "gold",
    text: {
      en: "Loan approval, amount and interest rate are at the sole discretion of the lender. If a gold loan is not repaid, the lender may auction the pledged gold after due notice. This article is for information only.",
      mr: "कर्ज मंजुरी, रक्कम आणि व्याजदर हे पूर्णपणे कर्जदात्याच्या निर्णयावर अवलंबून असतात. सोने तारण कर्जाची परतफेड न झाल्यास, योग्य सूचनेनंतर कर्जदाता तारण ठेवलेल्या सोन्याचा लिलाव करू शकतो. हा लेख केवळ माहितीसाठी आहे.",
    },
  },
  {
    key: "card",
    text: {
      en: "Fees, charges and interest rates on credit cards are set by the issuer and may change. Read the most important terms and conditions before applying.",
      mr: "क्रेडिट कार्डवरील शुल्क, आकार आणि व्याजदर जारीकर्त्याकडून ठरवले जातात आणि बदलू शकतात. अर्ज करण्यापूर्वी महत्त्वाच्या अटी व शर्ती वाचा.",
    },
  },
];

export const sections: Array<{
  slug: string;
  name: LocalizedText;
  blurb: LocalizedText;
  disclaimerKey: string;
  calculatorSlugs: string[];
}> = [
  {
    slug: "mutual-funds",
    name: { en: "Mutual funds", mr: "म्युच्युअल फंड" },
    blurb: {
      en: "SIPs, fund types and how to start investing.",
      mr: "एसआयपी, फंडांचे प्रकार आणि गुंतवणुकीची सुरुवात.",
    },
    disclaimerKey: "mf",
    calculatorSlugs: ["sip"],
  },
  {
    slug: "health-insurance",
    name: { en: "Health insurance", mr: "आरोग्य विमा" },
    blurb: {
      en: "Choosing cover for yourself, your family and your parents.",
      mr: "स्वतःसाठी, कुटुंबासाठी आणि पालकांसाठी योग्य विमा कसा निवडावा.",
    },
    disclaimerKey: "insurance",
    calculatorSlugs: ["health-cover"],
  },
  {
    slug: "life-insurance",
    name: { en: "Life insurance", mr: "जीवन विमा" },
    blurb: {
      en: "Term plans, riders and how much cover you need.",
      mr: "टर्म प्लॅन, रायडर्स आणि किती विमा आवश्यक आहे.",
    },
    disclaimerKey: "insurance",
    calculatorSlugs: ["term-cover"],
  },
  {
    slug: "motor-insurance",
    name: { en: "Motor insurance", mr: "वाहन विमा" },
    blurb: {
      en: "Car and two-wheeler cover, No Claim Bonus and renewals.",
      mr: "कार व दुचाकी विमा, नो क्लेम बोनस आणि नूतनीकरण.",
    },
    disclaimerKey: "insurance",
    calculatorSlugs: ["motor-premium"],
  },
  {
    slug: "home-loan",
    name: { en: "Home loan", mr: "गृहकर्ज" },
    blurb: {
      en: "Eligibility, EMIs, balance transfers and paperwork.",
      mr: "पात्रता, ईएमआय, बॅलन्स ट्रान्सफर आणि कागदपत्रे.",
    },
    disclaimerKey: "loan",
    calculatorSlugs: ["emi", "home-loan-eligibility"],
  },
  {
    slug: "education-loan",
    name: { en: "Education loan", mr: "शैक्षणिक कर्ज" },
    blurb: {
      en: "Studying in India or abroad: costs, moratorium and repayment.",
      mr: "भारतात किंवा परदेशात शिक्षण: खर्च, मोरेटोरियम आणि परतफेड.",
    },
    disclaimerKey: "loan",
    calculatorSlugs: ["emi"],
  },
  {
    slug: "gold-loans",
    name: { en: "Gold loans", mr: "सोने तारण कर्ज" },
    blurb: {
      en: "How much you can borrow against gold, and the risks.",
      mr: "सोन्यावर किती कर्ज मिळू शकते आणि त्यातील जोखीम.",
    },
    disclaimerKey: "gold",
    calculatorSlugs: ["gold-loan"],
  },
  {
    slug: "credit-cards",
    name: { en: "Credit cards", mr: "क्रेडिट कार्ड" },
    blurb: {
      en: "Picking a card, fees, rewards and avoiding debt.",
      mr: "कार्ड निवड, शुल्क, रिवॉर्ड्स आणि कर्जाचा सापळा टाळणे.",
    },
    disclaimerKey: "card",
    calculatorSlugs: [],
  },
];

export const glossary: Array<{ slug: string; term: LocalizedText; definition: LocalizedText }> = [
  {
    slug: "emi",
    term: { en: "EMI", mr: "ईएमआय" },
    definition: {
      en: "Equated monthly instalment: the fixed amount you pay every month to repay a loan with interest.",
      mr: "समान मासिक हप्ता: व्याजासह कर्ज फेडण्यासाठी दरमहा भरावी लागणारी ठरावीक रक्कम.",
    },
  },
  {
    slug: "sip",
    term: { en: "SIP", mr: "एसआयपी" },
    definition: {
      en: "Systematic investment plan: investing a fixed amount in a mutual fund at regular intervals.",
      mr: "सिस्टिमॅटिक इन्व्हेस्टमेंट प्लॅन: म्युच्युअल फंडात ठरावीक अंतराने ठरावीक रक्कम गुंतवणे.",
    },
  },
  {
    slug: "cibil-score",
    term: { en: "CIBIL score", mr: "सिबिल स्कोअर" },
    definition: {
      en: "A three-digit credit score (300 to 900) that lenders use to judge how reliably you repay.",
      mr: "३०० ते ९०० दरम्यानचा क्रेडिट स्कोअर, ज्यावरून कर्जदाते तुमची परतफेडीची विश्वासार्हता ठरवतात.",
    },
  },
  {
    slug: "no-claim-bonus",
    term: { en: "No Claim Bonus (NCB)", mr: "नो क्लेम बोनस (एनसीबी)" },
    definition: {
      en: "A discount on the own-damage premium for each claim-free year, up to 50%.",
      mr: "प्रत्येक दावा-मुक्त वर्षासाठी ओन-डॅमेज प्रीमियमवर मिळणारी सूट, कमाल ५०%.",
    },
  },
  {
    slug: "idv",
    term: { en: "IDV", mr: "आयडीव्ही" },
    definition: {
      en: "Insured declared value: the most the insurer pays if your vehicle is stolen or written off.",
      mr: "इन्शुअर्ड डिक्लेअर्ड व्हॅल्यू: वाहन चोरीला गेल्यास किंवा पूर्ण नुकसान झाल्यास विमा कंपनी देणारी कमाल रक्कम.",
    },
  },
  {
    slug: "ltv",
    term: { en: "Loan-to-value (LTV)", mr: "लोन-टू-व्हॅल्यू (एलटीव्ही)" },
    definition: {
      en: "The share of the pledged asset's value a lender will lend, for example 75% of your gold's value.",
      mr: "तारण मालमत्तेच्या मूल्याचा किती टक्के भाग कर्ज म्हणून मिळतो ते, उदा. सोन्याच्या मूल्याच्या ७५%.",
    },
  },
  {
    slug: "foir",
    term: { en: "FOIR", mr: "एफओआयआर" },
    definition: {
      en: "Fixed obligations to income ratio: the share of your income lenders allow to go to EMIs.",
      mr: "फिक्स्ड ऑब्लिगेशन्स टू इन्कम रेशो: तुमच्या उत्पन्नापैकी किती भाग ईएमआयसाठी जाऊ शकतो ते प्रमाण.",
    },
  },
];

export const authors: Array<{
  slug: string;
  name: string;
  org: OrgSlug | null;
  contributorType: "staff" | "institution" | "independent";
  credentials: LocalizedText;
  bio: LocalizedText;
  disclosedAffiliations?: string[];
  city?: string;
  licenceType?: string;
  licenceNumber?: string;
}> = [
  {
    slug: "anita-kulkarni",
    name: "Anita Kulkarni",
    org: "sample-amc",
    contributorType: "institution",
    credentials: {
      en: "Head of investor education, Sample AMC",
      mr: "गुंतवणूकदार शिक्षण प्रमुख, सॅम्पल एएमसी",
    },
    bio: {
      en: "Anita explains mutual funds to first-time investors.",
      mr: "अनिता नवीन गुंतवणूकदारांना म्युच्युअल फंड समजावून सांगतात.",
    },
  },
  {
    slug: "rahul-deshmukh",
    name: "Rahul Deshmukh",
    org: "sample-general-insurer",
    contributorType: "institution",
    credentials: {
      en: "Claims specialist, Sample General Insurer",
      mr: "दावा तज्ज्ञ, सॅम्पल जनरल इन्शुरर",
    },
    bio: {
      en: "Rahul has handled health and motor claims for twelve years.",
      mr: "राहुल यांना आरोग्य व वाहन दाव्यांचा बारा वर्षांचा अनुभव आहे.",
    },
  },
  {
    slug: "meera-joshi",
    name: "Meera Joshi",
    org: "sample-life-insurer",
    contributorType: "institution",
    credentials: {
      en: "Product manager, Sample Life Insurer",
      mr: "प्रॉडक्ट मॅनेजर, सॅम्पल लाइफ इन्शुरर",
    },
    bio: {
      en: "Meera designs term plans and riders.",
      mr: "मीरा टर्म प्लॅन आणि रायडर्सची रचना करतात.",
    },
  },
  {
    slug: "abcfinance-desk",
    name: "abcfinance desk",
    org: "abcfinance",
    contributorType: "staff",
    credentials: { en: "Personal finance editors", mr: "वैयक्तिक अर्थविषयक संपादक" },
    bio: {
      en: "The abcfinance desk writes plain-language guides to money.",
      mr: "एबीसी फायनान्स डेस्क पैशाविषयी सोप्या भाषेत मार्गदर्शक लेख लिहिते.",
    },
  },
  {
    slug: "suresh-patil",
    name: "Suresh Patil",
    org: null,
    contributorType: "independent",
    credentials: {
      en: "SEBI-registered investment adviser",
      mr: "सेबी-नोंदणीकृत गुंतवणूक सल्लागार",
    },
    bio: {
      en: "Suresh advises families in Kolhapur on saving and investing.",
      mr: "सुरेश कोल्हापुरातील कुटुंबांना बचत व गुंतवणुकीबाबत सल्ला देतात.",
    },
    disclosedAffiliations: ["Distributor of mutual funds for several AMCs (fictional)"],
    city: "Kolhapur",
    licenceType: "SEBI RIA",
    licenceNumber: "INA000000000",
  },
];

/** The 15 demo accounts: `<name>@demo.abcfinance.test`, password Demo-Pass-2026. */
export const users: Array<{ handle: string; name: string; org: OrgSlug; roles: Role[] }> = [
  {
    handle: "writer.amc",
    name: "Wanda Writer (AMC)",
    org: "sample-amc",
    roles: ["institution_writer"],
  },
  {
    handle: "approver.amc",
    name: "Arjun Approver (AMC)",
    org: "sample-amc",
    roles: ["institution_approver"],
  },
  {
    handle: "compliance.amc",
    name: "Kavita Compliance (AMC)",
    org: "sample-amc",
    roles: ["institution_compliance"],
  },
  {
    handle: "admin.amc",
    name: "Aditya Admin (AMC)",
    org: "sample-amc",
    roles: ["institution_account_admin"],
  },
  {
    handle: "writer.gi",
    name: "Gauri Writer (GI)",
    org: "sample-general-insurer",
    roles: ["institution_writer"],
  },
  {
    handle: "approver.gi",
    name: "Ganesh Approver (GI)",
    org: "sample-general-insurer",
    roles: ["institution_approver"],
  },
  {
    handle: "compliance.gi",
    name: "Geeta Compliance (GI)",
    org: "sample-general-insurer",
    roles: ["institution_compliance"],
  },
  {
    handle: "admin.gi",
    name: "Girish Admin (GI)",
    org: "sample-general-insurer",
    roles: ["institution_account_admin"],
  },
  {
    // Not in TESTING.md: the Life Insurer's leads and rates need someone to see them (M4).
    handle: "admin.li",
    name: "Lena Admin (Life Insurer)",
    org: "sample-life-insurer",
    roles: ["institution_account_admin"],
  },
  {
    handle: "writer.abc",
    name: "Bina Writer (abcfinance)",
    org: "abcfinance",
    roles: ["abcfinance_writer"],
  },
  {
    handle: "editor.abc",
    name: "Eshan Editor (abcfinance)",
    org: "abcfinance",
    roles: ["abcfinance_editor"],
  },
  {
    handle: "desk.abc",
    name: "Deepa Desk (abcfinance)",
    org: "abcfinance",
    roles: ["abcfinance_desk_manager"],
  },
  {
    handle: "super.abc",
    name: "Sanjay Super (abcfinance)",
    org: "abcfinance",
    roles: ["abcfinance_super_admin"],
  },
  {
    handle: "editor.tb",
    name: "Tushar Editor (Tarun Bharat)",
    org: "tarun-bharat",
    roles: ["publisher_editor"],
  },
  {
    handle: "admin.tb",
    name: "Tanvi Admin (Tarun Bharat)",
    org: "tarun-bharat",
    roles: ["publisher_admin"],
  },
  {
    handle: "editor.b",
    name: "Bhavna Editor (Paper B)",
    org: "paper-b",
    roles: ["publisher_editor"],
  },
];

/** Which institution sponsors which sections. EMI and gold loan stay unsponsored. */
export const sponsorships: Array<{
  sponsor: OrgSlug;
  sectionSlugs: string[];
  exclusive: boolean;
  startsOn: string;
}> = [
  {
    sponsor: "sample-amc",
    sectionSlugs: ["mutual-funds"],
    exclusive: false,
    startsOn: "2026-04-01",
  },
  {
    sponsor: "sample-general-insurer",
    sectionSlugs: ["health-insurance", "motor-insurance"],
    exclusive: false,
    startsOn: "2026-04-01",
  },
  {
    sponsor: "sample-life-insurer",
    sectionSlugs: ["life-insurance"],
    exclusive: true,
    startsOn: "2026-04-01",
  },
];

export const plans: Array<{
  sponsor: OrgSlug;
  name: string;
  priceRupees: number;
  billing: "annual_prepaid" | "monthly";
  newspapersAllowed: number;
  articlesPerMonth: number;
  languages: string[];
  tenants: string[];
  startsOn: string;
}> = [
  {
    sponsor: "sample-amc",
    name: "AMC Starter (monthly)",
    priceRupees: 100_000,
    billing: "monthly",
    newspapersAllowed: 2,
    articlesPerMonth: 4,
    languages: ["mr", "en"],
    tenants: ["tarunbharat", "paperb"],
    startsOn: "2026-04-01",
  },
  {
    sponsor: "sample-general-insurer",
    name: "GI Regional (annual)",
    priceRupees: 1_200_000,
    billing: "annual_prepaid",
    newspapersAllowed: 3,
    articlesPerMonth: 6,
    languages: ["mr", "en"],
    tenants: ["tarunbharat", "paperb", "paperc"],
    startsOn: "2026-04-01",
  },
  {
    sponsor: "sample-life-insurer",
    name: "Life Category (monthly)",
    priceRupees: 75_000,
    billing: "monthly",
    newspapersAllowed: 1,
    articlesPerMonth: 3,
    languages: ["mr", "en"],
    tenants: ["tarunbharat"],
    startsOn: "2026-04-01",
  },
];

export const contracts: Array<{
  publisher: OrgSlug;
  tenant: string;
  startsOn: string;
  endsOn: string;
  minimumGuaranteeRupees: number;
  perYearPct: number;
}> = [
  {
    publisher: "tarun-bharat",
    tenant: "tarunbharat",
    startsOn: "2026-04-01",
    endsOn: "2029-03-31",
    minimumGuaranteeRupees: 25_000,
    perYearPct: 2,
  },
  {
    publisher: "paper-b",
    tenant: "paperb",
    startsOn: "2025-10-01",
    endsOn: "2027-09-30",
    minimumGuaranteeRupees: 0,
    perYearPct: 2,
  },
  {
    publisher: "paper-c",
    tenant: "paperc",
    startsOn: "2026-07-01",
    endsOn: "2028-06-30",
    minimumGuaranteeRupees: 0,
    perYearPct: 2,
  },
];
