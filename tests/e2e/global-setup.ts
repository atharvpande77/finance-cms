/**
 * Builds the app (unless E2E_SKIP_BUILD=1), resets and seeds the test database, and starts
 * `next start` on E2E_PORT with test settings (doc 07.5). Stops it afterwards.
 */
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { cpSync, existsSync } from "node:fs";
import { resetTestDatabase, testDatabaseUrl } from "../test-db";
import { E2E_PORT } from "../http-client";

let server: ChildProcess | undefined;

export const E2E_CRON_SECRET = "e2e-cron-secret";

export default async function setup() {
  resetTestDatabase({ seed: true });
  const env = {
    ...process.env,
    NODE_ENV: "production" as const,
    DATABASE_URL: testDatabaseUrl(),
    APP_URL: `http://localhost:${E2E_PORT}`,
    CRON_SECRET: E2E_CRON_SECRET,
    TENANT_CACHE_SECONDS: "0",
    WIDGET_CACHE_SECONDS: "0",
    TRUST_PROXY: "1",
    SMTP_URL: "",
  };
  if (process.env.E2E_SKIP_BUILD !== "1") {
    execFileSync("npx", ["next", "build"], { env, stdio: "inherit" });
    // The standalone server needs the static assets next to it, as in the Docker image.
    cpSync(".next/static", ".next/standalone/.next/static", { recursive: true });
    if (existsSync("public")) cpSync("public", ".next/standalone/public", { recursive: true });
  }
  server = spawn("node", [".next/standalone/server.js"], {
    // Not 127.0.0.1: Next normalises that to "localhost" in request URLs, so proxy rewrites
    // would no longer match the server origin and be treated as external.
    env: { ...env, PORT: String(E2E_PORT), HOSTNAME: "0.0.0.0" },
    stdio: ["ignore", "inherit", "inherit"],
    detached: true,
  });
  await waitForServer();
  return async () => {
    if (server?.pid) process.kill(-server.pid, "SIGTERM");
  };
}

async function waitForServer() {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${E2E_PORT}/`, { redirect: "manual" });
      if (res.status < 500) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Server did not start on port ${E2E_PORT}`);
}
