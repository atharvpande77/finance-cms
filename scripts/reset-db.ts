// Drops every table, type and migration record in the target database. Development and tests only.
import "dotenv/config";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");
if (process.env.NODE_ENV === "production")
  throw new Error("Refusing to reset a production database");

const sql = postgres(url, { max: 1, onnotice: () => {} });
await sql`DROP SCHEMA IF EXISTS public CASCADE`;
await sql`DROP SCHEMA IF EXISTS drizzle CASCADE`;
await sql`CREATE SCHEMA public`;
await sql.end();
console.log(`Reset ${new URL(url).pathname.slice(1)}.`);
