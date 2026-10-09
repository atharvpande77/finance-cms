import { and, eq, gte, inArray } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { db, schema } from "@/server/db/client";
import { readOutbox, sendQueued, type Mailer } from "@/server/mail/outbox";
import { person } from "./auth-helpers";
import { PAGES, details, freshPhone, submitLead } from "./lead-helpers";

/** New-lead emails (04.6, 05.4), without personal details (D36). */
describe("new-lead emails", () => {
  const start = new Date();
  const amcPhone = freshPhone();
  const giPhone = freshPhone();

  async function mine() {
    const rows = await db()
      .select({ id: schema.emailOutbox.id })
      .from(schema.emailOutbox)
      .where(
        and(
          eq(schema.emailOutbox.kind, "lead.new"),
          gte(schema.emailOutbox.createdAt, new Date(start.getTime() - 1000)),
        ),
      );
    return readOutbox(
      500,
      rows.map((r) => r.id),
    );
  }

  beforeAll(async () => {
    const reader = person();
    const amcPage = await reader.get(PAGES.amcArticle);
    await submitLead(person(), PAGES.amcArticle, details(amcPhone), amcPage);
    const giPage = await reader.get(PAGES.giArticle);
    await submitLead(person(), PAGES.giArticle, details(giPhone, "myself"), giPage);
  });

  it("[E2E-LEAD-29] each lead queued an email to the sponsor's account admin", async () => {
    const mail = await mine();
    const amc = mail.filter((m) => m.to === "admin.amc@demo.abcfinance.test");
    expect(amc.length).toBeGreaterThanOrEqual(1);
    const email = amc.at(-1)!;
    expect(email.subject).toBe("New enquiry from Paper B: Start a SIP");
    expect(email.body).toContain("A reader asked Sample AMC to contact them.");
    expect(email.body).toContain("http://paperb.localhost:3100/mutual-funds/sip-basics");
    expect(email.body).toMatch(/http:\/\/localhost:3100\/leads/);
    // No personal details in email (D36).
    expect(email.body).not.toContain("Asha");
    expect(email.body).not.toContain(amcPhone);
    expect(email.body).not.toContain("Kolhapur");
  });

  it("[E2E-LEAD-30] email bodies are encrypted in the outbox", async () => {
    const ids = (await mine()).map((m) => m.id);
    const rows = await db()
      .select()
      .from(schema.emailOutbox)
      .where(inArray(schema.emailOutbox.id, ids));
    for (const row of rows) {
      expect(row.bodyEnc).toMatch(/^v1:/);
      expect(row.bodyEnc).not.toContain("Sample");
    }
  });

  it("[E2E-LEAD-31] emails to a sponsor never go to another sponsor's admin", async () => {
    const mail = await mine();
    for (const m of mail) {
      if (m.body.includes("asked Sample AMC")) expect(m.to).toBe("admin.amc@demo.abcfinance.test");
      if (m.body.includes("asked Sample General Insurer")) {
        expect(m.to).toBe("admin.gi@demo.abcfinance.test");
      }
    }
    expect(mail.some((m) => m.to === "admin.gi@demo.abcfinance.test")).toBe(true);
  });

  it("[E2E-LEAD-32] queued email is delivered through the transport and marked sent", async () => {
    const delivered: string[] = [];
    // A transport that accepts everything but the General Insurer's mail (see the next check).
    const mailer: Mailer = async (msg) => {
      if (msg.to.startsWith("admin.gi@")) throw new Error("550 mailbox unavailable");
      delivered.push(msg.to);
    };
    await sendQueued(1000, mailer);
    const amc = (await mine()).filter((m) => m.to === "admin.amc@demo.abcfinance.test");
    expect(delivered).toContain("admin.amc@demo.abcfinance.test");
    for (const m of amc) {
      expect(m.status).toBe("sent");
      expect(m.sentAt).not.toBeNull();
    }
  });

  it("[E2E-LEAD-33] a failed send is kept for retry with the error recorded", async () => {
    const gi = (await mine()).filter((m) => m.to === "admin.gi@demo.abcfinance.test");
    expect(gi.length).toBeGreaterThanOrEqual(1);
    for (const m of gi) {
      expect(m.status).toBe("failed");
      expect(m.attempts).toBeGreaterThanOrEqual(1);
      expect(m.lastError).toContain("550 mailbox unavailable");
    }
    // A later run retries and delivers it.
    await sendQueued(1000, async () => {});
    for (const m of (await mine()).filter((x) => x.to === "admin.gi@demo.abcfinance.test")) {
      expect(m.status).toBe("sent");
    }
  });
});
