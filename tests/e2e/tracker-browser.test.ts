/**
 * The tracker in a real browser (04.8): opening an article sends one view tied to its version,
 * and the reader's first change to a calculator sends one calculator use. HTTP tests can't run
 * the script. Uses Playwright's headless shell with an ordinary browser's user agent (the
 * headless one is filtered out as a bot, as it should be).
 */
import { and, desc, eq, gte } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser } from "@playwright/test";
import { db, schema } from "@/server/db/client";
import { E2E_PORT } from "../http-client";
import { BROWSER_UA } from "./analytics-helpers";
import { versionOf } from "./lead-helpers";

describe("the tracker in the browser", () => {
  let browser: Browser;

  beforeAll(async () => {
    browser = await chromium.launch({
      executablePath: process.env.E2E_CHROMIUM || undefined,
      args: ["--host-resolver-rules=MAP *.localhost 127.0.0.1"],
    });
  });

  afterAll(async () => {
    await browser?.close();
  });

  it("sends a view for the article, and one calculator use on the first change", async () => {
    // An article no other suite sends hits for, so the newest view is this one.
    const versionId = await versionOf("emergency-fund-first", "paperb", "en");
    const started = new Date(Date.now() - 1000);
    const newestView = async () => {
      const [row] = await db()
        .select()
        .from(schema.pageViews)
        .where(
          and(eq(schema.pageViews.versionId, versionId), gte(schema.pageViews.viewedAt, started)),
        )
        .orderBy(desc(schema.pageViews.viewedAt))
        .limit(1);
      return row;
    };

    const page = await browser.newPage({
      userAgent: BROWSER_UA,
      viewport: { width: 375, height: 800 },
    });
    const problems: string[] = [];
    page.on("pageerror", (e) => problems.push(e.message));
    await page.goto(`http://paperb.localhost:${E2E_PORT}/mutual-funds/emergency-fund-first`, {
      waitUntil: "networkidle",
    });

    await expect.poll(newestView, { timeout: 10_000 }).toMatchObject({
      pagePath: "/mutual-funds/emergency-fund-first",
      kind: "article",
      language: "en",
      calculatorsUsed: [],
    });
    const viewId = (await newestView())!.id;
    expect(viewId).toMatch(/^[A-Za-z0-9_-]{22}$/);

    const slider = page.locator('[data-calc="sip"] input[type="range"]').first();
    await slider.focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await expect
      .poll(async () => (await newestView())?.calculatorsUsed, { timeout: 10_000 })
      .toEqual(["sip"]);
    // Still one view, and no engaged read after a few seconds.
    expect((await newestView())!.id).toBe(viewId);
    expect((await newestView())!.engagedAt).toBeNull();
    // The page sets no cookies and stores nothing.
    expect(await page.context().cookies()).toEqual([]);
    expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);

    expect(problems).toEqual([]);
    await page.close();
  });
});
