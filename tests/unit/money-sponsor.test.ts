import { describe, expect, it } from "vitest";
import {
  formatAmount,
  formatNumber,
  formatRupees,
  localDigits,
  toAsciiDigits,
} from "@/domain/calc/money";
import { brandingFor, calculatorSponsor, type Sponsorship } from "@/domain/sponsor";

describe("Indian number formatting", () => {
  it("groups digits the Indian way, in both scripts", () => {
    expect(formatRupees(1_234_567, "en")).toBe("₹12,34,567");
    expect(formatRupees(999, "en")).toBe("₹999");
    expect(formatRupees(17_674.21, "mr")).toBe("₹१७,६७४");
    expect(formatNumber(12.5, "en", 2)).toBe("12.5");
    expect(formatNumber(3.1, "mr", 2)).toBe("३.१");
  });

  it("writes large amounts in lakh and crore", () => {
    expect(formatAmount(99_999, "en")).toBe("₹99,999");
    expect(formatAmount(4_526_368.14, "en")).toBe("₹45.26 lakh");
    expect(formatAmount(16_000_000, "en")).toBe("₹1.6 crore");
    expect(formatAmount(4_526_368.14, "mr")).toBe("₹४५.२६ लाख");
    expect(formatAmount(16_000_000, "mr")).toBe("₹१.६ कोटी");
    // The unit follows the rounded value.
    expect(formatAmount(9_999_999, "en")).toBe("₹1 crore");
    expect(formatAmount(150_000_000_0, "en")).toBe("₹150 crore");
  });

  it("converts digits both ways", () => {
    expect(localDigits("a 1000 cc", "mr")).toBe("a १००० cc");
    expect(localDigits("1000", "en")).toBe("1000");
    expect(toAsciiDigits("१२,५००")).toBe("12,500");
  });
});

const sections = [
  { slug: "mutual-funds", calculatorSlugs: ["sip"] },
  { slug: "health-insurance", calculatorSlugs: ["health-cover"] },
  { slug: "life-insurance", calculatorSlugs: ["term-cover"] },
  { slug: "home-loan", calculatorSlugs: ["emi", "home-loan-eligibility"] },
  { slug: "education-loan", calculatorSlugs: ["emi"] },
];
const s = (o: Partial<Sponsorship> & Pick<Sponsorship, "id" | "sponsorOrgId" | "sectionSlugs">) =>
  ({ startsOn: "2026-04-01", endsOn: null, exclusive: false, ...o }) as Sponsorship;
const sponsorships = [
  s({ id: "a", sponsorOrgId: "amc", sectionSlugs: ["mutual-funds"] }),
  s({ id: "b", sponsorOrgId: "gi", sectionSlugs: ["health-insurance"] }),
  s({ id: "c", sponsorOrgId: "life", sectionSlugs: ["life-insurance"], exclusive: true }),
];
const today = "2026-10-09";
const brand = (
  context: Parameters<typeof brandingFor>[0]["context"],
  calculatorSlug: string,
  list = sponsorships,
) => brandingFor({ context, calculatorSlug, sponsorships: list, sections, today });

describe("branding matrix (04.7, D34)", () => {
  it("brands a sponsored calculator on its own page, with a call-to-action", () => {
    expect(brand({ kind: "calculator_page" }, "sip")).toEqual({
      brand: { orgId: "amc", label: "sponsored_by" },
      ratesOrgId: "amc",
      leadCta: true,
    });
    expect(brand({ kind: "calculator_page" }, "emi")).toEqual({
      brand: null,
      ratesOrgId: null,
      leadCta: false,
    });
  });

  it("shows only the author's brand on an institution article", () => {
    const b = brand(
      { kind: "institution_article", orgId: "gi", sectionSlug: "mutual-funds" },
      "sip",
    );
    expect(b).toEqual({
      brand: { orgId: "gi", label: "calculator_by" },
      ratesOrgId: "gi",
      leadCta: true,
    });
  });

  it("shows no sponsor on an independent expert's article", () => {
    expect(brand({ kind: "independent_article" }, "sip").brand).toBeNull();
  });

  it("lets an exclusive sponsor suppress every other brand in its section", () => {
    // The General Insurer's calculator in the Life Insurer's exclusive category.
    expect(brand({ kind: "section_page", sectionSlug: "life-insurance" }, "health-cover")).toEqual({
      brand: null,
      ratesOrgId: null,
      leadCta: false,
    });
    expect(
      brand(
        { kind: "institution_article", orgId: "gi", sectionSlug: "life-insurance" },
        "health-cover",
      ).brand,
    ).toBeNull();
    expect(
      brand({ kind: "abcfinance_article", sectionSlug: "life-insurance" }, "term-cover").brand,
    ).toEqual({ orgId: "life", label: "sponsored_by" });
  });

  it("ignores sponsorships that haven't started or have ended", () => {
    const list = [
      s({ id: "x", sponsorOrgId: "amc", sectionSlugs: ["mutual-funds"], startsOn: "2026-11-01" }),
      s({ id: "y", sponsorOrgId: "gi", sectionSlugs: ["mutual-funds"], endsOn: "2026-10-08" }),
    ];
    expect(brand({ kind: "calculator_page" }, "sip", list).brand).toBeNull();
    const lastDay = [
      s({ id: "z", sponsorOrgId: "gi", sectionSlugs: ["mutual-funds"], endsOn: today }),
    ];
    expect(brand({ kind: "calculator_page" }, "sip", lastDay).brand?.orgId).toBe("gi");
  });

  it("prefers the context's section, then exclusive, then the earliest start", () => {
    const list = [
      s({ id: "1", sponsorOrgId: "bank1", sectionSlugs: ["home-loan"], startsOn: "2026-05-01" }),
      s({
        id: "2",
        sponsorOrgId: "bank2",
        sectionSlugs: ["education-loan"],
        startsOn: "2026-01-01",
      }),
    ];
    expect(calculatorSponsor("emi", list, sections, today)?.sponsorOrgId).toBe("bank2");
    expect(calculatorSponsor("emi", list, sections, today, "home-loan")?.sponsorOrgId).toBe(
      "bank1",
    );
    const withExclusive = [
      ...list,
      s({
        id: "3",
        sponsorOrgId: "bank3",
        sectionSlugs: ["home-loan"],
        startsOn: "2026-09-01",
        exclusive: true,
      }),
    ];
    expect(calculatorSponsor("emi", withExclusive, sections, today)?.sponsorOrgId).toBe("bank3");
  });
});
