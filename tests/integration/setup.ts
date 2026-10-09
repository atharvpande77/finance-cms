import { testDatabaseUrl } from "../test-db";

process.env.DATABASE_URL = testDatabaseUrl();
process.env.APP_SECRET ??= Buffer.alloc(32, 7).toString("base64");
