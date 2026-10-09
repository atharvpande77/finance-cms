"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { MenuItem } from "@/domain/panel-menu";
import { PanelNav } from "./PanelNav";
import { Wordmark } from "./Wordmark";

export function MobileMenu({ items, footer }: { items: MenuItem[]; footer: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Open menu" static>
          <Menu strokeWidth={1.75} />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="p-3">
        <SheetTitle className="flex h-10 items-center px-3">
          <Wordmark />
        </SheetTitle>
        <div className="flex-1 overflow-y-auto">
          <PanelNav items={items} onNavigate={() => setOpen(false)} />
        </div>
        {footer}
      </SheetContent>
    </Sheet>
  );
}
