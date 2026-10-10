import { afterEach, describe, expect, it } from "vitest";
import { env, resetEnvCache } from "@/server/env";

const saved = { ...process.env };

afterEach(() => {
  process.env = { ...saved };
  resetEnvCache();
});

describe("environment", () => {
  it("refuses the development two-step bypass in production (D41)", () => {
    Object.assign(process.env, {
      NODE_ENV: "production",
      APP_URL: "https://money.example.in",
      DEV_TOTP_BYPASS: "1",
    });
    resetEnvCache();
    expect(() => env()).toThrow(/DEV_TOTP_BYPASS must not be set in production/);
  });

  it("is off unless set to 1", () => {
    Object.assign(process.env, { NODE_ENV: "development" });
    delete process.env.DEV_TOTP_BYPASS;
    resetEnvCache();
    expect(env().DEV_TOTP_BYPASS).toBe(false);
    process.env.DEV_TOTP_BYPASS = "1";
    resetEnvCache();
    expect(env().DEV_TOTP_BYPASS).toBe(true);
  });
});
