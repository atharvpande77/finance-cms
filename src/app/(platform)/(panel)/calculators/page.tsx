import type { Metadata } from "next";
import { AreaStub } from "@/components/panel/AreaStub";

export const metadata: Metadata = { title: "Calculator rates" };

export default function Page() {
  return <AreaStub area="calculators" purpose="Rates and the “as of” date your calculators use." />;
}
