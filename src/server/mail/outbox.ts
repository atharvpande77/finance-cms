import { and, asc, desc, eq, inArray, lt, or } from "drizzle-orm";
import nodemailer from "nodemailer";
import { db, schema, type Db, type Tx } from "@/server/db/client";
import { env } from "@/server/env";
import { open, seal } from "@/server/crypto/secret-box";

export type QueuedEmail = {
  to: string;
  subject: string;
  body: string;
  kind: string;
  createdById?: string | null;
};

const MAX_ATTEMPTS = 5;

/** Queues an email. The body is encrypted at rest (it can hold lead details and one-time links). */
export async function queueEmail(email: QueuedEmail, conn: Db | Tx = db()): Promise<void> {
  await conn.insert(schema.emailOutbox).values({
    to: email.to,
    subject: email.subject,
    bodyEnc: seal(email.body),
    kind: email.kind,
    createdById: email.createdById ?? null,
  });
}

export type Mailer = (msg: { to: string; subject: string; text: string }) => Promise<void>;

function smtpMailer(): Mailer | null {
  const { SMTP_URL, MAIL_FROM } = env();
  if (!SMTP_URL) return null;
  const transport = nodemailer.createTransport(SMTP_URL);
  return async (msg) => {
    await transport.sendMail({ from: MAIL_FROM, ...msg });
  };
}

/**
 * Sends queued mail, and retries failed mail up to MAX_ATTEMPTS. Without SMTP_URL mail stays
 * queued (doc 07.1).
 */
export async function sendQueued(
  limit = 50,
  mailer: Mailer | null = smtpMailer(),
): Promise<{ sent: number; failed: number }> {
  if (!mailer) return { sent: 0, failed: 0 };
  const t = schema.emailOutbox;
  const batch = await db()
    .select()
    .from(t)
    .where(or(eq(t.status, "queued"), and(eq(t.status, "failed"), lt(t.attempts, MAX_ATTEMPTS))))
    .orderBy(asc(t.createdAt))
    .limit(limit);

  let sent = 0;
  let failed = 0;
  for (const row of batch) {
    try {
      await mailer({ to: row.to, subject: row.subject, text: open(row.bodyEnc) });
      await db()
        .update(t)
        .set({ status: "sent", sentAt: new Date(), attempts: row.attempts + 1, lastError: null })
        .where(eq(t.id, row.id));
      sent++;
    } catch (err) {
      await db()
        .update(t)
        .set({ status: "failed", attempts: row.attempts + 1, lastError: String(err).slice(0, 500) })
        .where(eq(t.id, row.id));
      failed++;
    }
  }
  return { sent, failed };
}

/** Decrypted outbox rows, newest first. Development viewer and tests only. */
export async function readOutbox(limit = 50, ids?: string[]) {
  const t = schema.emailOutbox;
  const rows = await db()
    .select()
    .from(t)
    .where(ids ? inArray(t.id, ids) : undefined)
    .orderBy(desc(t.createdAt), desc(t.id))
    .limit(limit);
  return rows.map(({ bodyEnc, ...rest }) => ({ ...rest, body: open(bodyEnc) }));
}
