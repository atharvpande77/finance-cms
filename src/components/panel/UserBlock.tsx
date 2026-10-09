import Link from "next/link";
import { KeyRound, ShieldCheck } from "lucide-react";
import { SignOutButton } from "./SignOutButton";

/** Who is signed in, plus their own account links and sign-out. */
export function UserBlock({ name, email }: { name: string; email: string }) {
  const link =
    "flex h-10 items-center gap-3 rounded-md px-3 text-sm text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-accent-foreground";
  return (
    <div className="grid gap-1 border-t pt-3">
      <div className="px-3 pb-1">
        <p className="truncate text-sm font-medium" data-user-name>
          {name}
        </p>
        <p className="truncate text-xs text-muted-foreground">{email}</p>
      </div>
      <Link href="/account/password" className={link}>
        <KeyRound className="size-4" strokeWidth={1.75} aria-hidden />
        Change password
      </Link>
      <Link href="/account/security" className={link}>
        <ShieldCheck className="size-4" strokeWidth={1.75} aria-hidden />
        Two-step verification
      </Link>
      <SignOutButton className="h-10 w-full justify-start gap-3 px-3 font-normal text-muted-foreground has-[>svg]:px-3 active:scale-100" />
    </div>
  );
}
