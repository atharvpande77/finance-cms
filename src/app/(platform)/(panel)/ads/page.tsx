import type { Metadata } from "next";
import { AreaStub } from "@/components/panel/AreaStub";

export const metadata: Metadata = { title: "Ads" };

export default function Page() {
  return (
    <AreaStub area="ads" purpose="Google Ad Manager go-live steps, ads.txt and the rules tester." />
  );
}
