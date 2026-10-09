import type { Metadata } from "next";
import { AreaStub } from "@/components/panel/AreaStub";

export const metadata: Metadata = { title: "Reports" };

export default function Page() {
  return <AreaStub area="reports" purpose="Monthly tables, each with a CSV export." />;
}
