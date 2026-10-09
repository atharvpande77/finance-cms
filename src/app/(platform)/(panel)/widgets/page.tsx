import type { Metadata } from "next";
import { AreaStub } from "@/components/panel/AreaStub";

export const metadata: Metadata = { title: "Widgets" };

export default function Page() {
  return (
    <AreaStub area="widgets" purpose="Cards placed on newspapers' own sites, with a preview." />
  );
}
