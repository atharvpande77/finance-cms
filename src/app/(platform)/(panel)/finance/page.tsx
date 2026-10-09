import type { Metadata } from "next";
import { AreaStub } from "@/components/panel/AreaStub";

export const metadata: Metadata = { title: "Finance" };

export default function Page() {
  return (
    <AreaStub
      area="finance"
      purpose="Sponsor payments, AdSense entries and newspaper statements."
    />
  );
}
