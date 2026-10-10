import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { readOutbox } from "@/server/mail/outbox";

export const metadata: Metadata = { title: "Outbox (development)" };
export const dynamic = "force-dynamic";

const time = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "medium",
  timeZone: "Asia/Kolkata",
});

/** Links in a plain-text body, made clickable; everything else stays text. */
function Body({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return (
    <pre className="overflow-x-auto font-sans text-sm whitespace-pre-wrap">
      {parts.map((part, i) =>
        /^https?:\/\//.test(part) ? (
          <a key={i} href={part} className="text-primary underline">
            {part}
          </a>
        ) : (
          part
        ),
      )}
    </pre>
  );
}

/**
 * Every queued email, decrypted, so links can be followed without an email service (07.2).
 * Development only: it doesn't exist in production (E2E-USR-99).
 */
export default async function DevOutboxPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  const emails = await readOutbox(50);
  return (
    <main className="mx-auto grid max-w-3xl gap-6 px-4 py-10">
      <header className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Outbox</h1>
        <p className="text-sm text-muted-foreground">
          The 50 newest emails, decrypted. Development only.
        </p>
      </header>
      {emails.length === 0 ? <p className="text-muted-foreground">No email yet.</p> : null}
      {emails.map((e) => (
        <article
          key={e.id}
          className="grid gap-2 rounded-xl bg-card p-4 shadow-[0_0_0_1px_oklch(0_0_0/0.08)]"
          data-email={e.kind}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
            <span className="font-medium">{e.to}</span>
            <span className="text-muted-foreground tabular-nums">
              {time.format(e.createdAt)} · {e.kind} · {e.status}
            </span>
          </div>
          <h2 className="font-semibold text-pretty">{e.subject}</h2>
          <Body text={e.body} />
        </article>
      ))}
    </main>
  );
}
