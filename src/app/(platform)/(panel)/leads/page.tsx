import type { Metadata } from "next";
import { AreaStub } from "@/components/panel/AreaStub";

export const metadata: Metadata = { title: "Leads" };

export default function Page() {
  return <AreaStub area="leads" purpose="Readers who asked your institution to contact them." />;
}
