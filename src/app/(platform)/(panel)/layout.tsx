import { requireUser } from "@/server/auth/current";
import { panelMenu } from "@/domain/panel-menu";
import { MobileMenu } from "@/components/panel/MobileMenu";
import { PanelNav } from "@/components/panel/PanelNav";
import { UserBlock } from "@/components/panel/UserBlock";
import { Wordmark } from "@/components/panel/Wordmark";

/**
 * The signed-in shell. Its guard keeps the menu from rendering for anyone not fully signed in;
 * every page and action still runs its own (`requireUser` / `requireArea`), because layouts
 * don't re-run on navigation.
 */
export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const s = await requireUser();
  const items = panelMenu(s.memberships);
  const user = <UserBlock name={s.user.name} email={s.user.email} />;
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[15rem_1fr]">
      <aside className="sticky top-0 hidden h-dvh flex-col gap-4 border-r bg-sidebar p-3 lg:flex">
        <div className="flex h-10 items-center px-3">
          <Wordmark />
        </div>
        <div className="flex-1 overflow-y-auto">
          <PanelNav items={items} />
        </div>
        {user}
      </aside>
      <div className="min-w-0">
        <header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b bg-background/90 px-2 backdrop-blur lg:hidden">
          <MobileMenu items={items} footer={user} />
          <Wordmark />
        </header>
        <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
          {children}
        </main>
      </div>
    </div>
  );
}
