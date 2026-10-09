/** Shared by integration and e2e tests: the test database URL and helpers to reset it. */
import { execFileSync } from "node:child_process";
import { config } from "dotenv";

config({ quiet: true });

export function testDatabaseUrl(): string {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  const base = process.env.DATABASE_URL;
  if (!base) throw new Error("Set TEST_DATABASE_URL or DATABASE_URL");
  const url = new URL(base);
  url.pathname = "/abcfinance_test";
  return url.toString();
}

/** Drops everything in the test database, applies migrations and (optionally) loads the demo world. */
export function resetTestDatabase({ seed }: { seed: boolean }): void {
  const env = { ...process.env, DATABASE_URL: testDatabaseUrl(), NODE_ENV: "test" as const };
  const run = (script: string) => execFileSync("npx", ["tsx", script], { env, stdio: "pipe" });
  run("scripts/reset-db.ts");
  run("scripts/migrate.ts");
  if (seed) run("db/seed/index.ts");
}
