import { describe, expect, it } from "vitest";
import { checkPassword } from "@/domain/password-policy";
import { isEmail, normaliseEmail } from "@/domain/email";

describe("password policy", () => {
  it("[U-AUTH-03] flags weak passwords", () => {
    expect(checkPassword("Demo-Pass-2026")).toEqual([]);
    expect(checkPassword("short1")).toContain("too_short");
    expect(checkPassword("password123")).toContain("too_common");
    expect(checkPassword("aaaaaaaaaa1")).toContain("too_few_distinct");
  });

  it("[U-USR-14] still needs length, letters and a number", () => {
    expect(checkPassword("abc12")).toContain("too_short");
    expect(checkPassword("1234567890123")).toContain("needs_letter");
    expect(checkPassword("onlyletterslong")).toContain("needs_digit");
    expect(checkPassword("मराठीपासवर्ड2026")).toEqual([]);
  });

  it("[U-USR-15] rejects very common passwords and repeated characters", () => {
    expect(checkPassword("Password123")).toContain("too_common");
    expect(checkPassword("QWERTY12345")).toContain("too_common");
    expect(checkPassword("1111111111a")).toContain("too_few_distinct");
    expect(checkPassword("ababababab12")).toEqual([]);
  });

  it("[U-USR-16] rejects a password that contains the person's email name or first name", () => {
    const person = { email: "priya.sharma@bank.test", name: "Priya Sharma" };
    expect(checkPassword("xx-priya.sharma-2026", person)).toContain("contains_email");
    expect(checkPassword("PriyaRocks2026", person)).toContain("contains_name");
    expect(checkPassword("Monsoon-Rain-77", person)).toEqual([]);
  });

  it("[U-USR-17] short names do not block ordinary passwords", () => {
    const person = { email: "raj@bank.test", name: "Raj K" };
    expect(checkPassword("Rajasthan-Trip-2026", person)).toEqual([]);
  });

  it("[U-USR-18] caps the length so hashing cannot be abused", () => {
    expect(checkPassword(`a1${"x".repeat(198)}`)).not.toContain("too_long");
    expect(checkPassword(`a1${"x".repeat(199)}`)).toContain("too_long");
  });
});

describe("email addresses", () => {
  it("[U-USR-01] accepts ordinary addresses and normalises case and spaces", () => {
    expect(normaliseEmail("  Writer.AMC@Demo.ABCfinance.test ")).toBe(
      "writer.amc@demo.abcfinance.test",
    );
    expect(isEmail("first.last+tag@bank.co.in")).toBe(true);
    expect(isEmail(" Admin@Paper.com ")).toBe(true);
  });

  it("[U-USR-02] rejects things that are not addresses", () => {
    for (const bad of [
      "",
      "plain",
      "a@b",
      "a b@c.test",
      "@c.test",
      "a@@c.test",
      "a@c..test",
      "<a>@c.test",
    ]) {
      expect(isEmail(bad), bad).toBe(false);
    }
    expect(isEmail(`${"a".repeat(250)}@c.test`)).toBe(false);
  });
});
