/**
 * Development helper: prints the current two-step code for a local account, so demo users can
 * sign in without an authenticator app. Reads the encrypted secret with this machine's
 * APP_SECRET; refuses to run against production.
 *
 *   npx tsx scripts/totp.ts approver.amc            (or a full email address)
 */
import "dotenv/config";
import postgres from "postgres";
import { open } from "@/server/crypto/secret-box";
import { stepAt, totpAt } from "@/domain/totp";

if (process.env.NODE_ENV === "production") throw new Error("Not for production");
const arg = process.argv[2];
if (!arg) throw new Error("Usage: npx tsx scripts/totp.ts <name or email>");
const email = arg.includes("@") ? arg.toLowerCase() : `${arg}@demo.abcfinance.test`;

const sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
const [user] = await sql<{ totp_secret_enc: string | null; totp_enabled: boolean }[]>`
  SELECT totp_secret_enc, totp_enabled FROM users WHERE email = ${email}`;
await sql.end();
if (!user?.totp_secret_enc) {
  console.error(`${email} has not opened the two-step set-up page yet.`);
  process.exit(1);
}
const now = Date.now();
const secondsLeft = 30 - (Math.floor(now / 1000) % 30);
console.log(
  `${totpAt(open(user.totp_secret_enc), stepAt(now))}  (${email}, valid ${secondsLeft}s more)`,
);
