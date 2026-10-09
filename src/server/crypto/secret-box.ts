import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { deriveKey } from "./keys";

const VERSION = "v1";

/**
 * AES-256-GCM. Output: "v1:" + base64(iv[12] | tag[16] | ciphertext).
 * Used for lead personal data, two-step secrets and outgoing email bodies (doc 06.3).
 */
export function seal(plaintext: string, key = deriveKey("secret-box")): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return `${VERSION}:${Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64")}`;
}

/** Throws if the value was tampered with or sealed with another key. */
export function open(sealed: string, key = deriveKey("secret-box")): string {
  const [version, payload] = sealed.split(":", 2);
  if (version !== VERSION || !payload) throw new Error("Unrecognised sealed value");
  const raw = Buffer.from(payload, "base64");
  if (raw.length < 28) throw new Error("Sealed value too short");
  const decipher = createDecipheriv("aes-256-gcm", key, raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
}

export function sealOrNull(value: string | null | undefined): string | null {
  return value == null ? null : seal(value);
}

export function openOrNull(value: string | null | undefined): string | null {
  return value == null ? null : open(value);
}
