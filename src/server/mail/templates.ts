import { env } from "@/server/env";

/** Links in email come from the configured public URL, never the request's Host (04.12, 06.2). */
export function publicUrl(path: string): string {
  const base = env().APP_URL;
  if (!base) {
    if (env().NODE_ENV === "production") throw new Error("APP_URL is required to build links");
    return new URL(path, "http://localhost:3000").toString();
  }
  return new URL(path, base).toString();
}

function indianTime(at: Date): string {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(at);
}

/** "Password changed" (05.4). */
export function passwordChangedEmail(person: { name: string }, at: Date) {
  return {
    subject: "Your abcfinance password was changed",
    body: [
      `Hello ${person.name},`,
      "",
      `The password for your abcfinance account was changed on ${indianTime(at)} (India time).`,
      "You have been signed out everywhere else.",
      "",
      "If you did not make this change, contact your administrator straight away.",
      "",
      `Sign in: ${publicUrl("/login")}`,
    ].join("\n"),
  };
}

/**
 * "New lead" to a sponsor's account admins (04.6, 05.4). Deliberately without the reader's name,
 * number or city (D36): those are seen in the Leads inbox, after signing in.
 */
export function newLeadEmail(lead: {
  sponsor: string;
  paper: string;
  interest: string;
  sourceUrl: string;
  at: Date;
}) {
  return {
    subject: `New enquiry from ${lead.paper}: ${lead.interest}`,
    body: [
      `A reader asked ${lead.sponsor} to contact them.`,
      "",
      `Newspaper: ${lead.paper}`,
      `Interested in: ${lead.interest}`,
      `Page: ${lead.sourceUrl}`,
      `Received: ${indianTime(lead.at)} (India time)`,
      "",
      `See their details in your Leads inbox: ${publicUrl("/leads")}`,
      "",
      "For their privacy, this email doesn't include their name or number.",
    ].join("\n"),
  };
}
