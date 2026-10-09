import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { open, seal } from "@/server/crypto/secret-box";
import { constantTimeEqual, keyedHash, newToken, sha256 } from "@/server/crypto/hash";

describe("secret box", () => {
  it("[U-AUTH-08] round-trips and does not leak plaintext", () => {
    const text = "Ramesh Pawar, 9876543210, पुणे";
    const sealed = seal(text);
    expect(sealed.startsWith("v1:")).toBe(true);
    expect(sealed).not.toContain("9876543210");
    expect(Buffer.from(sealed.slice(3), "base64").toString("utf8")).not.toContain("Ramesh");
    expect(open(sealed)).toBe(text);
    // A fresh IV every time: the same plaintext never seals to the same value.
    expect(seal(text)).not.toBe(sealed);
  });

  it("[U-AUTH-09] detects tampering", () => {
    const sealed = seal("secret");
    const raw = Buffer.from(sealed.slice(3), "base64");
    raw[raw.length - 1]! ^= 1;
    expect(() => open(`v1:${raw.toString("base64")}`)).toThrow();
    expect(() => open("v2:abc")).toThrow();
    expect(() => open(sealed, randomBytes(32))).toThrow();
  });
});

describe("hashes and tokens", () => {
  it("keyed hash is stable, keyed and separates its parts", () => {
    expect(keyedHash("a", "b")).toBe(keyedHash("a", "b"));
    expect(keyedHash("ab")).not.toBe(keyedHash("a", "b"));
    expect(keyedHash("9876543210")).not.toBe(sha256("9876543210"));
  });

  it("tokens are 256-bit and url-safe", () => {
    const t = newToken();
    expect(Buffer.from(t, "base64url")).toHaveLength(32);
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(newToken()).not.toBe(t);
  });

  it("constant-time comparison handles different lengths", () => {
    expect(constantTimeEqual("abc", "abc")).toBe(true);
    expect(constantTimeEqual("abc", "abd")).toBe(false);
    expect(constantTimeEqual("abc", "abcd")).toBe(false);
  });
});
