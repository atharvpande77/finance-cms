import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db, schema } from "@/server/db/client";
import { membershipsOf } from "@/server/auth/sessions";
import { reportCsv, reportMonth, reportScopes, runReport } from "@/server/reports";
import { REPORTS } from "@/domain/reports";
import { indianMonth } from "@/domain/time";

async function actor(handle: string) {
  const [user] = await db()
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, `${handle}@demo.abcfinance.test`));
  return { user: { id: user!.id }, memberships: await membershipsOf(user!.id) };
}

describe("reports", () => {
  it("runs every report for the people who may open it", async () => {
    const amc = await actor("admin.amc");
    const tb = await actor("admin.tb");
    const superAdmin = await actor("super.abc");
    for (const def of REPORTS) {
      const who = def.set === "inst" ? amc : def.set === "pub" ? tb : superAdmin;
      const open = await runReport(who, { key: def.key, scope: null, month: null });
      expect(open, def.key).not.toBeNull();
      expect(open!.result.sections.length, def.key).toBeGreaterThan(0);
      for (const section of open!.result.sections) {
        for (const row of section.rows) {
          expect(Object.keys(row).sort(), def.key).toEqual(
            section.columns.map((c) => c.key).sort(),
          );
        }
      }
      expect(reportCsv(open!.result).charCodeAt(0)).toBe(0xfeff);
    }
  });

  it("keeps each set to its people and scopes", async () => {
    const amc = await actor("admin.amc");
    const gi = await actor("admin.gi");
    const writer = await actor("writer.amc");
    const editor = await actor("editor.abc");
    const desk = await actor("desk.abc");
    const tb = await actor("admin.tb");

    expect((await reportScopes(writer.memberships)).sets).toEqual([]);
    expect((await reportScopes(editor.memberships)).sets).toEqual([]);
    expect((await reportScopes(amc.memberships)).sets).toEqual(["inst"]);
    expect((await reportScopes(tb.memberships)).sets).toEqual(["pub"]);
    expect((await reportScopes(desk.memberships)).sets).toEqual(["inst", "pub", "abc"]);

    const gisOrg = (await reportScopes(gi.memberships)).institutions[0]!.id;
    expect(await runReport(amc, { key: "inst-articles", scope: gisOrg, month: null })).toBeNull();
    expect(await runReport(amc, { key: "pub-summary", scope: null, month: null })).toBeNull();
    expect(await runReport(tb, { key: "pub-summary", scope: "paperb", month: null })).toBeNull();
    expect(await runReport(tb, { key: "abc-seo", scope: null, month: null })).toBeNull();
    // Staff read an institution's reports (D49).
    expect(
      await runReport(desk, { key: "inst-articles", scope: gisOrg, month: null }),
    ).not.toBeNull();
  });

  it("falls back to this month for a bad or future month", () => {
    const now = new Date("2026-10-10T06:00:00Z");
    expect(reportMonth("2026-09", now)).toEqual({
      month: "2026-09",
      first: "2026-09-01",
      last: "2026-09-30",
    });
    expect(reportMonth("2027-01", now).month).toBe(indianMonth(now));
    expect(reportMonth("nonsense", now).month).toBe(indianMonth(now));
  });
});
