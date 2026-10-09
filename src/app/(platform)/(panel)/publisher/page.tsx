import type { Metadata } from "next";
import { AreaStub } from "@/components/panel/AreaStub";

export const metadata: Metadata = { title: "Publisher queue" };

export default function Page() {
  return (
    <AreaStub
      area="publisher"
      purpose="Approve, hold or take down articles waiting for your paper."
    />
  );
}
