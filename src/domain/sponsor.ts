/**
 * Who a calculator is branded for, whose rates it uses and whether it offers a lead
 * call-to-action (04.7 branding, 04.6 lead forms, D34). One function decides it for every
 * surface: the reader pages, the lead form's server-side check and, later, ads (04.11).
 */

export type Sponsorship = {
  id: string;
  sponsorOrgId: string;
  sectionSlugs: readonly string[];
  /** "YYYY-MM-DD" (Indian calendar days). */
  startsOn: string;
  endsOn: string | null;
  exclusive: boolean;
};

export type SectionCalculators = { slug: string; calculatorSlugs: readonly string[] };

export type BrandContext =
  | { kind: "institution_article"; orgId: string; sectionSlug: string }
  | { kind: "independent_article" }
  | { kind: "abcfinance_article"; sectionSlug: string }
  | { kind: "section_page"; sectionSlug: string }
  | { kind: "calculator_page" };

export type Branding = {
  brand: { orgId: string; label: "calculator_by" | "sponsored_by" } | null;
  /** Whose saved rates apply first; always the brand's organisation (D33). */
  ratesOrgId: string | null;
  /** Whether a lead call-to-action goes with the calculator. */
  leadCta: boolean;
};

const NONE: Branding = { brand: null, ratesOrgId: null, leadCta: false };

/** Started and not ended on `today`. */
export function isActive(s: Sponsorship, today: string): boolean {
  return s.startsOn <= today && (s.endsOn === null || today <= s.endsOn);
}

function byPrecedence(a: Sponsorship, b: Sponsorship): number {
  return (
    Number(b.exclusive) - Number(a.exclusive) ||
    a.startsOn.localeCompare(b.startsOn) ||
    a.id.localeCompare(b.id)
  );
}

/** The active exclusive sponsorship of a section, if any. */
export function exclusiveSponsor(
  sectionSlug: string,
  sponsorships: readonly Sponsorship[],
  today: string,
): Sponsorship | null {
  return (
    sponsorships
      .filter((s) => s.exclusive && isActive(s, today) && s.sectionSlugs.includes(sectionSlug))
      .sort(byPrecedence)[0] ?? null
  );
}

/**
 * The sponsor of a calculator: an active sponsorship of a section listing it. The context's own
 * section comes first when it lists the calculator; then exclusive, earliest start, id.
 */
export function calculatorSponsor(
  calculatorSlug: string,
  sponsorships: readonly Sponsorship[],
  sections: readonly SectionCalculators[],
  today: string,
  sectionSlug?: string,
): Sponsorship | null {
  const listing = sections
    .filter((s) => s.calculatorSlugs.includes(calculatorSlug))
    .map((s) => s.slug);
  const active = sponsorships.filter((s) => isActive(s, today));
  const pick = (slugs: string[]) =>
    active.filter((s) => s.sectionSlugs.some((x) => slugs.includes(x))).sort(byPrecedence)[0];
  if (sectionSlug && listing.includes(sectionSlug)) {
    const own = pick([sectionSlug]);
    if (own) return own;
  }
  return pick(listing) ?? null;
}

export function brandingFor(input: {
  context: BrandContext;
  calculatorSlug: string;
  sponsorships: readonly Sponsorship[];
  sections: readonly SectionCalculators[];
  today: string;
}): Branding {
  const { context, calculatorSlug, sponsorships, sections, today } = input;
  if (context.kind === "independent_article") return NONE;
  const sectionSlug = "sectionSlug" in context ? context.sectionSlug : undefined;
  const exclusive = sectionSlug ? exclusiveSponsor(sectionSlug, sponsorships, today) : null;

  if (context.kind === "institution_article") {
    // Only the author's brand on its own article, unless another sponsor holds the category.
    if (exclusive && exclusive.sponsorOrgId !== context.orgId) return NONE;
    return {
      brand: { orgId: context.orgId, label: "calculator_by" },
      ratesOrgId: context.orgId,
      leadCta: true,
    };
  }

  const sponsor = calculatorSponsor(calculatorSlug, sponsorships, sections, today, sectionSlug);
  if (!sponsor) return NONE;
  if (exclusive && exclusive.sponsorOrgId !== sponsor.sponsorOrgId) return NONE;
  return {
    brand: { orgId: sponsor.sponsorOrgId, label: "sponsored_by" },
    ratesOrgId: sponsor.sponsorOrgId,
    leadCta: true,
  };
}
