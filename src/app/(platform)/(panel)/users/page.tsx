import type { Metadata } from "next";
import { AreaStub } from "@/components/panel/AreaStub";

export const metadata: Metadata = { title: "Users" };

export default function Page() {
  return (
    <AreaStub
      area="users"
      purpose="Invite people, change roles, reset two-step and deactivate accounts."
    />
  );
}
