import type { Metadata } from "next";
import { AreaStub } from "@/components/panel/AreaStub";

export const metadata: Metadata = { title: "Articles" };

export default function Page() {
  return (
    <AreaStub
      area="articles"
      purpose="Write, approve and release articles, with your turn marked."
    />
  );
}
