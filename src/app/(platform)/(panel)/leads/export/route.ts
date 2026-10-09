import { forbidden } from "next/navigation";
import { assertSameOrigin, requestIp, requireUser } from "@/server/auth/current";
import { exportCsv } from "@/server/leads/inbox";
import { indianDate } from "@/domain/time";

export const dynamic = "force-dynamic";

/**
 * The sponsor's CSV export (04.6, 05.2). A POST from the panel's own form, so a link on another
 * site can't start downloads or write audit rows in someone's name.
 */
export async function POST(request: Request) {
  await assertSameOrigin();
  const s = await requireUser();
  const form = await request.formData();
  const result = await exportCsv(s, String(form.get("org") ?? ""), await requestIp());
  if (!result) forbidden();
  return new Response(result.csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="leads-${indianDate(new Date())}.csv"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
