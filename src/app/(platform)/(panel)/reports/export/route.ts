import { forbidden } from "next/navigation";
import { assertSameOrigin, requestIp, requireUser } from "@/server/auth/current";
import { exportReport } from "@/server/reports";

export const dynamic = "force-dynamic";

/**
 * A report as CSV (05.2), audited. A POST from the panel's own form, like the leads export, so
 * a link on another site can't start downloads or write audit rows in someone's name (D47).
 */
export async function POST(request: Request) {
  await assertSameOrigin();
  const s = await requireUser();
  const form = await request.formData();
  const field = (name: string) => {
    const value = form.get(name);
    return typeof value === "string" && value !== "" ? value : null;
  };
  const result = await exportReport(
    s,
    { key: field("report"), scope: field("scope"), month: field("month") },
    await requestIp(),
  );
  if (!result) forbidden();
  return new Response(result.csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${result.filename}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
