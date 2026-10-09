// Fixed test secret so crypto helpers work without a .env file.
process.env.APP_SECRET ??= Buffer.alloc(32, 7).toString("base64");
process.env.DATABASE_URL ??= "postgres://unused";
