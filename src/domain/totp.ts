import { createHmac, randomBytes } from "node:crypto";

/** Time-based one-time codes (RFC 6238): SHA-1, 6 digits, 30-second steps, ±1 step (06.1). */
export const TOTP_STEP_SECONDS = 30;
export const TOTP_DIGITS = 6;
const DRIFT_STEPS = 1;

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

/** Accepts lower case, spaces and padding, as people type keys from authenticator apps. */
export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[\s=]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const index = ALPHABET.indexOf(char);
    if (index < 0) throw new Error("Invalid base32");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** A new 160-bit secret, base32-encoded. */
export function newTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

/** HOTP (RFC 4226) with dynamic truncation. `digits` is 6 in the product, 8 for the RFC vectors. */
export function hotp(key: Buffer, counter: number, digits = TOTP_DIGITS): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const mac = createHmac("sha1", key).update(message).digest();
  const offset = mac[mac.length - 1]! & 0x0f;
  const binary = mac.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 10 ** digits).padStart(digits, "0");
}

export function stepAt(nowMs: number): number {
  return Math.floor(nowMs / 1000 / TOTP_STEP_SECONDS);
}

export function totpAt(secret: string, step: number): string {
  return hotp(base32Decode(secret), step);
}

/**
 * The time step a code matches, within ±1 step of `nowMs`, or null. The caller must still
 * refuse a step that was already used (see `isFreshStep`).
 */
export function verifyTotp(secret: string, code: string, nowMs: number): number | null {
  const clean = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(clean)) return null;
  const key = base32Decode(secret);
  const now = stepAt(nowMs);
  for (let delta = -DRIFT_STEPS; delta <= DRIFT_STEPS; delta++) {
    if (hotp(key, now + delta) === clean) return now + delta;
  }
  return null;
}

/** A step can be used once: it must be later than the last one accepted. */
export function isFreshStep(step: number, lastStep: number | null): boolean {
  return lastStep === null || step > lastStep;
}

export function otpauthUri(opts: { issuer: string; account: string; secret: string }): string {
  const label = encodeURIComponent(`${opts.issuer}:${opts.account}`);
  const params = new URLSearchParams({
    secret: opts.secret,
    issuer: opts.issuer,
    algorithm: "SHA1",
    digits: String(TOTP_DIGITS),
    period: String(TOTP_STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params}`;
}
