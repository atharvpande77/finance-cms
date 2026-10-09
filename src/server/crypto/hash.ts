import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { deriveKey } from "./keys";

/** Keyed hash (HMAC-SHA-256) for repeat detection, rate-limit ids and visitor hashes. */
export function keyedHash(...parts: string[]): string {
  return createHmac("sha256", deriveKey("hmac")).update(parts.join("\u0000")).digest("base64url");
}

/** 256-bit random token for sessions, invitations and reset links. Only its hash is stored. */
export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
