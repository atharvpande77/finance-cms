import { Hammer } from "lucide-react";
import { requireArea } from "@/server/auth/current";
import { areaItem, type PanelArea } from "@/domain/panel-menu";
import { PageHeader } from "./PageHeader";

/** A guarded placeholder for a panel area that a later milestone builds. */
export async function AreaStub({ area, purpose }: { area: PanelArea; purpose: string }) {
  await requireArea(area);
  const item = areaItem(area);
  return (
    <>
      <PageHeader title={item.label} description={purpose} />
      <div
        data-area-stub={area}
        className="grid place-items-center gap-2 rounded-xl border border-dashed px-6 py-16 text-center"
      >
        <Hammer className="size-5 text-muted-foreground" strokeWidth={1.75} aria-hidden />
        <p className="font-medium">Not built yet</p>
        <p className="text-sm text-muted-foreground">
          This area arrives in milestone {item.arrives}.
        </p>
      </div>
    </>
  );
}
