import { describe, expect, it } from "vitest";
import { isSlug, suggestSlug } from "@/domain/slug";

describe("article slugs", () => {
  it("suggests a slug from a Latin headline", () => {
    expect(suggestSlug("SIP basics: how a small monthly investment adds up")).toBe(
      "sip-basics-how-a-small-monthly-investment-adds-up",
    );
    expect(suggestSlug("Debt funds & equity funds — 2026")).toBe(
      "debt-funds-and-equity-funds-2026",
    );
    expect(suggestSlug("Café crème")).toBe("cafe-creme");
    expect(suggestSlug("x ".repeat(60)).length).toBeLessThanOrEqual(80);
  });

  it("leaves Marathi headlines for the writer", () => {
    expect(suggestSlug("एसआयपीची ओळख: दरमहा छोटी गुंतवणूक")).toBe("");
    expect(suggestSlug("")).toBe("");
  });

  it("validates slugs", () => {
    expect(isSlug("sip-basics")).toBe(true);
    expect(isSlug("a1")).toBe(false);
    expect(isSlug("SIP-basics")).toBe(false);
    expect(isSlug("sip--basics")).toBe(false);
    expect(isSlug("-sip")).toBe(false);
    expect(isSlug("एसआयपी")).toBe(false);
    expect(isSlug("a".repeat(81))).toBe(false);
  });
});
