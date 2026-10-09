"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Calculator,
  FileText,
  IndianRupee,
  LayoutDashboard,
  Megaphone,
  Newspaper,
  PanelsTopLeft,
  UserRoundSearch,
  Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/components/ui/utils";
import type { MenuItem, PanelArea } from "@/domain/panel-menu";

const ICONS: Record<PanelArea, LucideIcon> = {
  dashboard: LayoutDashboard,
  articles: FileText,
  publisher: Newspaper,
  leads: UserRoundSearch,
  calculators: Calculator,
  reports: BarChart3,
  finance: IndianRupee,
  widgets: PanelsTopLeft,
  ads: Megaphone,
  users: Users,
};

/** The role-aware menu. The current area is marked for sighted and screen-reader users alike. */
export function PanelNav({ items, onNavigate }: { items: MenuItem[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Panel" data-panel-menu>
      <ul className="grid gap-0.5">
        {items.map((item) => {
          const Icon = ICONS[item.area];
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-10 items-center gap-3 rounded-md px-3 text-sm text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
                  active && "bg-accent font-medium text-foreground",
                )}
              >
                <Icon className="size-4 shrink-0" strokeWidth={active ? 2 : 1.75} aria-hidden />
                <span className="truncate">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
