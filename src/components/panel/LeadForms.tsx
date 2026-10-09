"use client";

import { useActionState } from "react";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import {
  eraseLeadAction,
  setLeadStatusAction,
  type LeadActionState,
} from "@/app/(platform)/_actions/leads";
import { FormError } from "./FormError";
import { SubmitButton } from "./SubmitButton";

const STATUS_LABELS = { new: "New", contacted: "Contacted", qualified: "Qualified", junk: "Junk" };

type Ids = { leadId: string; org: string; filter?: string };

function Hidden({ ids }: { ids: Ids }) {
  return (
    <>
      <input type="hidden" name="leadId" value={ids.leadId} />
      <input type="hidden" name="org" value={ids.org} />
      <input type="hidden" name="filter" value={ids.filter ?? ""} />
    </>
  );
}

/** Mark a lead contacted, qualified or junk, with a note. */
export function LeadStatusForm({
  ids,
  status,
  note,
  erased,
}: {
  ids: Ids;
  status: string;
  note: string | null;
  erased: boolean;
}) {
  const [state, action] = useActionState<LeadActionState, FormData>(setLeadStatusAction, {});
  return (
    <form action={action} data-form={`lead-status-${ids.leadId}`} className="grid gap-3">
      <Hidden ids={ids} />
      <FormError message={state.error} />
      <div className="grid gap-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
        <div className="grid content-start gap-1.5">
          <Label htmlFor={`status-${ids.leadId}`}>Status</Label>
          <NativeSelect
            id={`status-${ids.leadId}`}
            name="status"
            defaultValue={state.values?.status ?? status}
          >
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </NativeSelect>
        </div>
        {erased ? null : (
          <div className="grid gap-1.5">
            <Label htmlFor={`note-${ids.leadId}`}>Note</Label>
            <Textarea
              id={`note-${ids.leadId}`}
              name="note"
              rows={2}
              maxLength={2000}
              defaultValue={state.values?.note ?? note ?? ""}
              placeholder="What happened when you called"
            />
          </div>
        )}
      </div>
      <SubmitButton variant="outline" size="sm" className="w-full sm:w-fit">
        Save
      </SubmitButton>
    </form>
  );
}

/** Deletes the person's details on request; the consent record stays (04.6). */
export function LeadEraseForm({ ids }: { ids: Ids }) {
  const [state, action] = useActionState<LeadActionState, FormData>(eraseLeadAction, {});
  return (
    <form action={action} data-form={`lead-erase-${ids.leadId}`} className="grid gap-2">
      <Hidden ids={ids} />
      <FormError message={state.error} />
      <p className="text-sm text-pretty text-muted-foreground">
        Their name, number, city and your note are removed for good. The consent record and status
        stay, so your reports still add up.
      </p>
      <SubmitButton variant="destructive" size="sm" className="w-full sm:w-fit">
        Delete their details
      </SubmitButton>
    </form>
  );
}
