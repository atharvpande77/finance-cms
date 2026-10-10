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
export function passwordChangedEmail(
  person: { name: string },
  at: Date,
  how: "changed" | "reset" = "changed",
) {
  return {
    subject: "Your abcfinance password was changed",
    body: [
      `Hello ${person.name},`,
      "",
      `The password for your abcfinance account was changed on ${indianTime(at)} (India time).`,
      how === "reset"
        ? "It was reset with an emailed link, and you have been signed out everywhere."
        : "You have been signed out everywhere else.",
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

/** "Invitation" (05.4): who invited you, to which organisation and roles, the link, its expiry. */
export function invitationEmail(input: {
  inviter: string;
  organisation: string;
  roles: readonly string[];
  link: string;
  expiresAt: Date;
}) {
  return {
    subject: `${input.inviter} invited you to abcfinance`,
    body: [
      "Hello,",
      "",
      `${input.inviter} invited you to join ${input.organisation} on abcfinance as: ${input.roles.join(", ")}.`,
      "",
      `Accept the invitation: ${input.link}`,
      "",
      `The link works once, until ${indianTime(input.expiresAt)} (India time).`,
      "If you weren't expecting this, you can ignore this email.",
    ].join("\n"),
  };
}

/** "Password reset" (05.4), with a variant when an administrator sent it. */
export function passwordResetEmail(person: { name: string }, link: string, byAdmin?: string) {
  return {
    subject: "Reset your abcfinance password",
    body: [
      `Hello ${person.name},`,
      "",
      byAdmin
        ? `${byAdmin}, an administrator, sent you a link to choose a new password.`
        : "Someone asked to reset the password for your abcfinance account.",
      "",
      `Choose a new password: ${link}`,
      "",
      "The link works once, for 60 minutes. Only the newest link you were sent works.",
      byAdmin
        ? "If you didn't expect this, ignore this email; your password stays as it is."
        : "If you didn't ask for this, ignore this email; your password stays as it is.",
    ].join("\n"),
  };
}

/** "Two-step reset" (05.4): who reset it and when. */
export function twoStepResetEmail(person: { name: string }, admin: string, at: Date) {
  return {
    subject: "Your abcfinance two-step verification was reset",
    body: [
      `Hello ${person.name},`,
      "",
      `${admin} reset two-step verification on your abcfinance account on ${indianTime(at)} (India time).`,
      "You have been signed out everywhere. The next time you sign in, you'll set it up again with your authenticator app.",
      "",
      "If you didn't ask for this, contact your administrator straight away.",
      "",
      `Sign in: ${publicUrl("/login")}`,
    ].join("\n"),
  };
}
