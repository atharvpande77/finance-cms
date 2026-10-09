import { and, desc, eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { db, schema } from "@/server/db/client";
import { membershipsOf } from "@/server/auth/sessions";
import {
  calculatorView,
  loadCalcContext,
  ratesPanel,
  resetRates,
  resolveRates,
  saveRates,
} from "@/server/calc/rates";
import { indianDate } from "@/domain/time";

const IP = "10.2.0.3";
const today = () => indianDate(new Date());

async function actor(handle: string) {
  const [user] = await db()
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, `${handle}@demo.abcfinance.test`));
  return { user: { id: user!.id }, memberships: await membershipsOf(user!.id) };
}

async function orgId(slug: string) {
  const [org] = await db()
    .select()
    .from(schema.organisations)
    .where(eq(schema.organisations.slug, slug));
  return org!.id;
}

async function lastAudit(action: string) {
  const [row] = await db()
    .select()
    .from(schema.auditEvents)
    .where(eq(schema.auditEvents.action, action))
    .orderBy(desc(schema.auditEvents.id))
    .limit(1);
  return row!;
}

afterEach(async () => {
  await db().delete(schema.calculatorRates);
});

describe("calculator rates", () => {
  it("resolves the brand's rates, then abcfinance's, then the built-in defaults", async () => {
    const amc = await orgId("sample-amc");
    const abc = await orgId("abcfinance");
    let ctx = await loadCalcContext();
    expect(resolveRates(ctx, "sip", amc)).toEqual({
      rates: { expectedReturn: 12 },
      asOf: "2026-10-01",
      source: "builtin",
    });
    await db()
      .insert(schema.calculatorRates)
      .values([
        {
          organisationId: abc,
          calculatorSlug: "sip",
          rates: { expectedReturn: 11 },
          ratesAsOf: "2026-09-01",
        },
        {
          organisationId: amc,
          calculatorSlug: "sip",
          rates: { expectedReturn: 10 },
          ratesAsOf: "2026-09-15",
        },
      ]);
    ctx = await loadCalcContext();
    expect(resolveRates(ctx, "sip", amc)).toMatchObject({
      rates: { expectedReturn: 10 },
      source: "sponsor",
    });
    expect(resolveRates(ctx, "sip", null)).toMatchObject({
      rates: { expectedReturn: 11 },
      source: "abcfinance",
    });
    // A saved value outside its range falls back to the default, field by field.
    await db()
      .update(schema.calculatorRates)
      .set({ rates: { expectedReturn: 99 } })
      .where(eq(schema.calculatorRates.organisationId, amc));
    ctx = await loadCalcContext();
    expect(resolveRates(ctx, "sip", amc).rates).toEqual({ expectedReturn: 12 });
  });

  it("brands and prices a calculator for where it appears", async () => {
    const view = await calculatorView({ kind: "calculator_page" }, "sip");
    expect(view).toMatchObject({
      brand: { label: "sponsored_by" },
      brandName: "Sample AMC",
      leadCta: true,
      rates: { expectedReturn: 12 },
    });
    expect((await calculatorView({ kind: "calculator_page" }, "emi")).brand).toBeNull();
  });

  it("saves an account admin's rates with an audit row, and resets them", async () => {
    const admin = await actor("admin.gi");
    const gi = await orgId("sample-general-insurer");
    const form = { baseMetro: "1200000", baseLarge: "800000", baseOther: "500000" };
    expect(await saveRates(admin, gi, "health-cover", form, today(), IP)).toEqual({ ok: true });
    const [row] = await db()
      .select()
      .from(schema.calculatorRates)
      .where(
        and(
          eq(schema.calculatorRates.organisationId, gi),
          eq(schema.calculatorRates.calculatorSlug, "health-cover"),
        ),
      );
    expect(row).toMatchObject({
      rates: { baseMetro: 1_200_000, baseLarge: 800_000, baseOther: 500_000 },
      ratesAsOf: today(),
    });
    const saved = await lastAudit("rates.save");
    expect(saved.detail).toMatchObject({
      calculator: "health-cover",
      before: null,
      after: { asOf: today() },
    });

    expect(await resetRates(admin, gi, "health-cover", IP)).toEqual({ ok: true });
    expect(await db().select().from(schema.calculatorRates)).toHaveLength(0);
    expect((await lastAudit("rates.reset")).detail).toMatchObject({
      calculator: "health-cover",
      before: { rates: { baseMetro: 1_200_000 } },
    });
  });

  it("refuses out-of-range values, future dates and other organisations", async () => {
    const admin = await actor("admin.gi");
    const gi = await orgId("sample-general-insurer");
    const amc = await orgId("sample-amc");
    const bad = await saveRates(
      admin,
      gi,
      "health-cover",
      { baseMetro: "1", baseLarge: "800000", baseOther: "500000" },
      today(),
      IP,
    );
    expect(bad).toMatchObject({
      ok: false,
      errors: { baseMetro: expect.stringMatching(/between/) },
    });
    const future = await saveRates(admin, gi, "sip", { expectedReturn: "10" }, "2999-01-01", IP);
    expect(future).toMatchObject({ ok: false, errors: { asOf: expect.stringMatching(/future/) } });
    expect(await saveRates(admin, amc, "sip", { expectedReturn: "10" }, today(), IP)).toMatchObject(
      {
        ok: false,
        code: "forbidden",
      },
    );
    expect(await db().select().from(schema.calculatorRates)).toHaveLength(0);
  });

  it("lets the super admin edit only abcfinance's defaults", async () => {
    const sup = await actor("super.abc");
    const panel = await ratesPanel(sup);
    expect(panel.map((o) => o.name)).toEqual(["abcfinance"]);
    expect(panel[0]!.calculators).toHaveLength(7);
    expect(
      await saveRates(
        sup,
        await orgId("abcfinance"),
        "gold-loan",
        { goldPrice: "10500", ltvPct: "75", rate: "11.5" },
        today(),
        IP,
      ),
    ).toEqual({ ok: true });
    expect(
      await saveRates(sup, await orgId("sample-amc"), "sip", { expectedReturn: "10" }, today(), IP),
    ).toMatchObject({ code: "forbidden" });
    expect((await ratesPanel(await actor("admin.amc"))).map((o) => o.name)).toEqual(["Sample AMC"]);
    expect(await ratesPanel(await actor("editor.abc"))).toEqual([]);
  });
});
