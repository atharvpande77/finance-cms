import { can, type Membership } from "./permissions";

export type PanelArea =
  | "dashboard"
  | "articles"
  | "publisher"
  | "leads"
  | "calculators"
  | "reports"
  | "finance"
  | "widgets"
  | "ads"
  | "users";

export type MenuItem = {
  area: PanelArea;
  href: `/${string}`;
  label: string;
  /** The milestone that builds the area, while it is still a placeholder. */
  arrives?: string;
};

/** Who may open each panel area (05.2), in menu order. */
const AREAS: readonly (MenuItem & { allowed: (ms: readonly Membership[]) => boolean })[] = [
  { area: "dashboard", href: "/dashboard", label: "Dashboard", allowed: () => true },
  {
    area: "articles",
    href: "/articles",
    label: "Articles",
    allowed: (ms) =>
      ms.some((m) => m.organisationType === "abcfinance") ||
      can(ms, "article.write.institution") ||
      can(ms, "article.approve") ||
      can(ms, "article.compliance"),
  },
  {
    area: "publisher",
    href: "/publisher",
    label: "Publisher queue",
    allowed: (ms) => can(ms, "copy.view") || can(ms, "copy.oversee"),
  },
  {
    area: "leads",
    href: "/leads",
    label: "Leads",
    arrives: "M4",
    allowed: (ms) => can(ms, "leads.view"),
  },
  {
    area: "calculators",
    href: "/calculators",
    label: "Calculator rates",
    allowed: (ms) => can(ms, "rates.edit") || can(ms, "rates.edit.defaults"),
  },
  {
    area: "reports",
    href: "/reports",
    label: "Reports",
    arrives: "M5",
    allowed: (ms) =>
      can(ms, "reports.institution") ||
      can(ms, "reports.publisher") ||
      can(ms, "reports.abcfinance"),
  },
  {
    area: "finance",
    href: "/finance",
    label: "Finance",
    arrives: "M7",
    allowed: (ms) => can(ms, "finance"),
  },
  {
    area: "widgets",
    href: "/widgets",
    label: "Widgets",
    arrives: "M8",
    allowed: (ms) => can(ms, "widgets.manage"),
  },
  { area: "ads", href: "/ads", label: "Ads", arrives: "M9", allowed: (ms) => can(ms, "ads.view") },
  {
    area: "users",
    href: "/users",
    label: "Users",
    arrives: "M5",
    allowed: (ms) => can(ms, "users.manage"),
  },
];

export function canOpenArea(ms: readonly Membership[], area: PanelArea): boolean {
  return AREAS.find((a) => a.area === area)?.allowed(ms) ?? false;
}

/** The panel menu for this person: only the areas their roles open. */
export function panelMenu(ms: readonly Membership[]): MenuItem[] {
  return AREAS.filter((a) => a.allowed(ms)).map(({ allowed: _allowed, ...item }) => item);
}

export function areaItem(area: PanelArea): MenuItem {
  const { allowed: _allowed, ...item } = AREAS.find((a) => a.area === area)!;
  return item;
}
