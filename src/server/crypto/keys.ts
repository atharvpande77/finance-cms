import { hkdfSync } from "node:crypto";
import { env } from "@/server/env";

type Purpose = "secret-box" | "hmac";

const cache = new Map<string, Buffer>();

/** Separate 32-byte keys per purpose, derived from APP_SECRET with HKDF-SHA-256. */
export function deriveKey(purpose: Purpose, secret = env().APP_SECRET): Buffer {
  const cacheKey = `${purpose}:${secret}`;
  let key = cache.get(cacheKey);
  if (!key) {
    key = Buffer.from(
      hkdfSync(
        "sha256",
        Buffer.from(secret, "base64"),
        Buffer.alloc(0),
        `abcfinance:${purpose}`,
        32,
      ),
    );
    cache.set(cacheKey, key);
  }
  return key;
}
