/**
 * The one end-to-end check in a real browser: a calculator hydrates without errors and its
 * result follows the inputs. HTTP tests can see neither. Uses Playwright's headless shell
 * (`E2E_CHROMIUM` points at a local one when the installed version differs).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser } from "@playwright/test";
import { E2E_PORT } from "../http-client";

describe("a calculator in the browser", () => {
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

  it("hydrates cleanly and updates as the reader types and drags", async () => {
    const page = await browser.newPage({ viewport: { width: 375, height: 800 } });
    const problems: string[] = [];
    page.on("pageerror", (e) => problems.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") problems.push(m.text());
    });
    await page.goto(`http://tarunbharat.localhost:${E2E_PORT}/calculators/emi`, {
      waitUntil: "networkidle",
    });
    const calc = page.locator('[data-calc="emi"]');
    const emi = () => calc.getAttribute("data-result-emi").then(Number);
    expect(await emi()).toBeCloseTo(17_674.21, 1);

    // Typed in Devanagari digits, as a Marathi keyboard would.
    const amount = calc.locator('[data-input="amount"] input[type="text"]');
    await amount.fill("३०,००,०००");
    await amount.blur();
    await expect.poll(emi).toBeCloseTo(26_511.32, 1);
    expect(await amount.inputValue()).toBe("३०,००,०००");

    // The tenure slider: one step right is 21 years.
    const tenure = calc.locator('[data-input="years"] input[type="range"]');
    await tenure.focus();
    await page.keyboard.press("ArrowRight");
    await expect.poll(emi).toBeLessThan(26_511.32);

    expect(problems).toEqual([]);
    await page.close();
  });
});
