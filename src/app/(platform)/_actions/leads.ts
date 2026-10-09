"use server";

import { redirect } from "next/navigation";
import { assertSameOrigin, requestIp, requireArea } from "@/server/auth/current";
import { eraseLead, setStatus } from "@/server/leads/inbox";

/** The sponsor's lead commands (05.3): status and note, and erasure on request. */

export type LeadActionState = { error?: string; values?: Record<string, string> };

const text = (form: FormData, key: string) => String(form.get(key) ?? "");

function back(form: FormData, done: string) {
  const status = text(form, "filter");
  return `/leads?org=${text(form, "org")}${status ? `&status=${status}` : ""}&done=${done}#lead-${text(form, "leadId")}`;
}

export async function setLeadStatusAction(
  _prev: LeadActionState,
  form: FormData,
): Promise<LeadActionState> {
  await assertSameOrigin();
  const s = await requireArea("leads");
  const values = { status: text(form, "status"), note: text(form, "note") };
  const result = await setStatus(
    s,
    text(form, "leadId"),
    values.status,
    values.note,
    await requestIp(),
  );
  if (!result.ok) return { error: result.error, values };
  redirect(back(form, "status"));
}

export async function eraseLeadAction(
  _prev: LeadActionState,
  form: FormData,
): Promise<LeadActionState> {
  await assertSameOrigin();
  const s = await requireArea("leads");
  const result = await eraseLead(s, text(form, "leadId"), await requestIp());
  if (!result.ok) return { error: result.error };
  redirect(back(form, "erase"));
}
