import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");

const client = postgres(url, { max: 1, onnotice: () => {} });
await migrate(drizzle(client), { migrationsFolder: "db/migrations" });
await client.end();
console.log("Migrations applied.");
