import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/server/env";
import * as schema from "./schema";

function connect() {
  const client = postgres(env().DATABASE_URL, { max: 10, onnotice: () => {} });
  return drizzle(client, { schema, casing: "snake_case" });
}

export type Db = ReturnType<typeof connect>;
/** A transaction handle has the same query API as the pool. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

// One pool per process; survives Next.js dev hot reloads.
const globalForDb = globalThis as unknown as { __abcDb?: Db };

export function db(): Db {
  globalForDb.__abcDb ??= connect();
  return globalForDb.__abcDb;
}

export { schema };
