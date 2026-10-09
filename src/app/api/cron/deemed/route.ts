import { NextResponse } from "next/server";
import { env } from "@/server/env";
import { constantTimeEqual } from "@/server/crypto/hash";
import { runScheduledJob } from "@/server/jobs";

export const dynamic = "force-dynamic";

/** POST /api/cron/deemed with `Authorization: Bearer <CRON_SECRET>` every 5 to 15 minutes. */
export async function POST(request: Request) {
  const secret = env().CRON_SECRET;
  const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secret || !constantTimeEqual(given, secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await runScheduledJob());
}
