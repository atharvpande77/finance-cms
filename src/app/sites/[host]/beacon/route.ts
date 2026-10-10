import { recordHit } from "@/server/analytics/track";
import { ANALYTICS } from "@/domain/analytics";

export const dynamic = "force-dynamic";

/**
 * `POST /_a/h` on newspaper hosts (05.1; the proxy rewrites it here). Always a quiet 204 with
 * no cookies: other origins, bots, malformed or oversize bodies, repeats and over-limit
 * visitors are ignored without telling the sender.
 */
export async function POST(request: Request) {
  try {
    const body = await readCapped(request, ANALYTICS.maxBodyBytes);
    if (body !== null) await recordHit({ headers: request.headers, body });
  } catch (error) {
    console.error("beacon:", error);
  }
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}

/** The body as text, or null when it is longer than `max` bytes (not read past the cap). */
async function readCapped(request: Request, max: number): Promise<string | null> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > max) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}
