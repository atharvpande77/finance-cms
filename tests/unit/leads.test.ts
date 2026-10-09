import { describe, expect, it } from "vitest";
import {
  consentText,
  INTERESTS,
  normalizeIndianMobile,
  qualityReport,
  validateLead,
} from "@/domain/leads";
import { csvCell, toCsv } from "@/domain/csv";

const good = {
  name: "  Asha   Patil ",
  phone: "+91 98765-43210",
  city: "Kolhapur",
  interest: "sip",
  consent: true,
};

describe("phone numbers", () => {
  it("[U-LEAD-01] accepts Indian mobiles in common formats", () => {
    for (const raw of [
      "9876543210",
      "98765 43210",
      "98765-43210",
      "+91 98765 43210",
      "+919876543210",
      "919876543210",
      "09876543210",
      "९८७६५४३२१०",
    ]) {
      expect(normalizeIndianMobile(raw), raw).toBe("9876543210");
    }
    // A number that merely starts with 91 or 9 isn't trimmed.
    expect(normalizeIndianMobile("9123456789")).toBe("9123456789");
    expect(normalizeIndianMobile("6000000000")).toBe("6000000000");
  });

  it("[U-LEAD-02] rejects numbers that cannot be mobiles", () => {
    for (const raw of [
      "",
      "12345",
      "5876543210",
      "98765432101",
      "+1 9876543210",
      "+44 7911 123456",
      "022 2345 6789",
      "98765abc10",
      "9876543210; DROP",
    ]) {
      expect(normalizeIndianMobile(raw), raw).toBeNull();
    }
  });
});

describe("consent text", () => {
  it("[U-LEAD-03] names the sponsor in both languages and says who sees the data", () => {
    const en = consentText("Sample AMC", "en");
    expect(en).toBe(
      "I agree that Sample AMC may contact me by phone about my enquiry. My name, mobile number, city and interest will be shared only with Sample AMC and used only to respond to this request. I can ask Sample AMC to delete my details at any time.",
    );
    const mr = consentText("Sample AMC", "mr");
    expect(mr.split("Sample AMC")).toHaveLength(4);
    expect(mr).toContain("फक्त Sample AMC सोबत शेअर");
    expect(mr).toContain("हटवण्यास");
  });

  it("[U-LEAD-04] is deterministic, so what is stored equals what was shown", () => {
    expect(consentText("Sample General Insurer", "mr")).toBe(
      consentText("Sample General Insurer", "mr"),
    );
    expect(consentText("A", "en")).not.toBe(consentText("B", "en"));
  });
});

describe("lead validation", () => {
  it("[U-LEAD-05] accepts a complete, consented lead and normalises it", () => {
    expect(validateLead(good, "mutual-funds", "en")).toEqual({
      ok: true,
      lead: {
        name: "Asha Patil",
        phone: "9876543210",
        city: "Kolhapur",
        interestKey: "sip",
        interestLabel: "Start a SIP",
      },
    });
    const mr = validateLead(good, "mutual-funds", "mr");
    expect(mr.ok && mr.lead.interestLabel).toBe("एसआयपी सुरू करणे");
  });

  it("[U-LEAD-06] will not accept a lead without consent", () => {
    const r = validateLead({ ...good, consent: false }, "mutual-funds", "en");
    expect(r).toEqual({
      ok: false,
      errors: { consent: "Tick the box to agree to be contacted." },
    });
  });

  it("[U-LEAD-07] rejects bad fields with a message in the reader's language", () => {
    const bad = { name: "A", phone: "123", city: "", interest: "sip", consent: true };
    const en = validateLead(bad, "mutual-funds", "en");
    expect(en).toEqual({
      ok: false,
      errors: {
        name: "Enter your name (2 to 80 characters).",
        phone: "Enter a 10-digit Indian mobile number.",
        city: "Enter your city (2 to 60 characters).",
      },
    });
    const mr = validateLead(bad, "mutual-funds", "mr");
    expect(!mr.ok && mr.errors.phone).toBe("10 अंकी भारतीय मोबाइल क्रमांक लिहा.");
    expect(validateLead({ ...good, name: "x".repeat(81) }, "mutual-funds", "en").ok).toBe(false);
    // Devanagari names count characters, not bytes.
    expect(validateLead({ ...good, name: "आशा" }, "mutual-funds", "mr").ok).toBe(true);
  });

  it("[U-LEAD-08] only accepts interests that belong to the section", () => {
    expect(validateLead({ ...good, interest: "term" }, "mutual-funds", "en").ok).toBe(false);
    expect(validateLead({ ...good, interest: "term" }, "life-insurance", "en").ok).toBe(true);
    expect(validateLead({ ...good, interest: "" }, "mutual-funds", "en").ok).toBe(false);
  });

  it("[U-LEAD-09] refuses markup in free text fields", () => {
    const r = validateLead(
      { ...good, name: "<script>x</script>", city: "Pune<b>" },
      "mutual-funds",
      "en",
    );
    expect(r).toEqual({
      ok: false,
      errors: { name: "Please don't use < or > here.", city: "Please don't use < or > here." },
    });
  });

  it("[U-LEAD-10] every section has interest options with both languages", () => {
    const sections = [
      "mutual-funds",
      "health-insurance",
      "life-insurance",
      "motor-insurance",
      "home-loan",
      "education-loan",
      "gold-loans",
      "credit-cards",
    ];
    expect(Object.keys(INTERESTS).sort()).toEqual([...sections].sort());
    for (const slug of sections) {
      const options = INTERESTS[slug]!;
      expect(options.length, slug).toBeGreaterThanOrEqual(3);
      expect(options.at(-1)!.key, slug).toBe("not_sure");
      expect(new Set(options.map((o) => o.key)).size, slug).toBe(options.length);
      for (const o of options) {
        expect(o.label.en.trim(), `${slug}.${o.key}`).not.toBe("");
        expect(o.label.mr, `${slug}.${o.key}`).toMatch(/[ऀ-ॿ]/);
      }
    }
  });
});

describe("lead quality report", () => {
  it("[U-LEAD-11] counts worked, qualified and junk shares", () => {
    const r = qualityReport({ new: 4, contacted: 2, qualified: 3, junk: 1 });
    expect(r.total).toBe(10);
    expect(r.worked).toBe(6);
    expect(r.workedShare).toBeCloseTo(0.6);
    // Qualified of worked leads that aren't junk: 3 of 5.
    expect(r.qualifiedShare).toBeCloseTo(0.6);
    expect(r.junkShare).toBeCloseTo(0.1);
  });

  it("[U-LEAD-12] handles an empty inbox", () => {
    expect(qualityReport({})).toEqual({
      total: 0,
      worked: 0,
      workedShare: 0,
      qualifiedShare: 0,
      junkShare: 0,
    });
    expect(qualityReport({ junk: 2 }).qualifiedShare).toBe(0);
  });
});

describe("CSV", () => {
  it("quotes every cell, neutralises formulas, and uses a BOM and CRLF", () => {
    expect(csvCell("=HYPERLINK(1)")).toBe(`"'=HYPERLINK(1)"`);
    for (const start of ["+", "-", "@", "\t", "\r"])
      expect(csvCell(`${start}x`)).toBe(`"'${start}x"`);
    expect(csvCell('say "hi"')).toBe(`"say ""hi"""`);
    expect(csvCell(null)).toBe(`""`);
    expect(
      toCsv([
        ["a", 1],
        ["आशा", null],
      ]),
    ).toBe(`﻿"a","1"\r\n"आशा",""\r\n`);
  });
});
