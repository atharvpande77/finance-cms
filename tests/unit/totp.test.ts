import { describe, expect, it } from "vitest";
import {
  base32Decode,
  base32Encode,
  hotp,
  isFreshStep,
  newTotpSecret,
  otpauthUri,
  stepAt,
  totpAt,
  verifyTotp,
} from "@/domain/totp";

// RFC 6238 Appendix B, SHA-1, 8 digits; the product uses the same algorithm with 6 digits.
const RFC_KEY = Buffer.from("12345678901234567890", "ascii");
const RFC_VECTORS: [number, string][] = [
  [59, "94287082"],
  [1111111109, "07081804"],
  [1111111111, "14050471"],
  [1234567890, "89005924"],
  [2000000000, "69279037"],
  [20000000000, "65353130"],
];

describe("TOTP (RFC 6238)", () => {
  it("[U-AUTH-04] matches the RFC test vectors", () => {
    for (const [seconds, code] of RFC_VECTORS) {
      expect(hotp(RFC_KEY, stepAt(seconds * 1000), 8)).toBe(code);
      expect(hotp(RFC_KEY, stepAt(seconds * 1000))).toBe(code.slice(-6));
    }
  });

  it("[U-AUTH-05] round-trips base32", () => {
    expect(base32Encode(RFC_KEY)).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    expect(base32Decode("gezd gnbv gy3t qojq gezd gnbv gy3t qojq").equals(RFC_KEY)).toBe(true);
    const secret = newTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(base32Encode(base32Decode(secret))).toBe(secret);
    expect(() => base32Decode("not base32!")).toThrow();
  });

  it("[U-AUTH-06] accepts ±1 step of drift and rejects the rest", () => {
    const secret = newTotpSecret();
    const now = Date.UTC(2026, 9, 9, 10, 0, 15);
    const step = stepAt(now);
    expect(verifyTotp(secret, totpAt(secret, step), now)).toBe(step);
    expect(verifyTotp(secret, totpAt(secret, step - 1), now)).toBe(step - 1);
    expect(verifyTotp(secret, totpAt(secret, step + 1), now)).toBe(step + 1);
    expect(verifyTotp(secret, totpAt(secret, step - 2), now)).toBeNull();
    expect(verifyTotp(secret, totpAt(secret, step + 2), now)).toBeNull();
    expect(verifyTotp(secret, "12345", now)).toBeNull();
    expect(verifyTotp(secret, "abcdef", now)).toBeNull();
  });

  it("[U-AUTH-07] blocks replay of an already-used step", () => {
    expect(isFreshStep(100, null)).toBe(true);
    expect(isFreshStep(101, 100)).toBe(true);
    expect(isFreshStep(100, 100)).toBe(false);
    expect(isFreshStep(99, 100)).toBe(false);
  });

  it("builds an otpauth URI for authenticator apps", () => {
    const uri = otpauthUri({ issuer: "abcfinance", account: "a@b.test", secret: "ABC" });
    expect(uri).toBe(
      "otpauth://totp/abcfinance%3Aa%40b.test?secret=ABC&issuer=abcfinance&algorithm=SHA1&digits=6&period=30",
    );
  });
});
