import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/utils";
import { signOutAction } from "@/app/(platform)/_actions/auth";

export function SignOutButton({
  label = "Sign out",
  className,
  variant = "ghost",
}: {
  label?: string;
  className?: string;
  variant?: "ghost" | "outline" | "link";
}) {
  return (
    <form action={signOutAction} data-form="signout">
      <Button type="submit" variant={variant} size="sm" className={cn(className)}>
        {variant !== "link" ? <LogOut strokeWidth={1.75} /> : null}
        {label}
      </Button>
    </form>
  );
}
