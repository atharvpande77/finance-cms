import { env } from "@/server/env";

/**
 * The client's address. Behind nginx (TRUST_PROXY=1) it comes from X-Real-IP, which nginx
 * overwrites with the connecting address. Without a proxy there is no trustworthy header,
 * so every request shares one bucket.
 */
export function clientIp(headers: Headers): string {
  if (env().TRUST_PROXY) {
    const real = headers.get("x-real-ip")?.trim();
    if (real) return real;
  }
  return "local";
}
