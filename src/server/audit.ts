import { db, schema, type Db, type Tx } from "@/server/db/client";

export type AuditInput = {
  userId?: string | null;
  action: string;
  detail?: Record<string, unknown>;
  ip?: string | null;
};

/** Appends an audit event (doc 06.6). Pass the transaction when the change it records is in one. */
export async function audit(input: AuditInput, conn: Db | Tx = db()): Promise<void> {
  await conn.insert(schema.auditEvents).values({
    userId: input.userId ?? null,
    action: input.action,
    detail: input.detail ?? {},
    ip: input.ip ?? null,
  });
}
