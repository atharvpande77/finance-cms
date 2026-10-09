"use client";

import { useFormStatus } from "react-dom";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/utils";

/** A submit button that shows progress while its form posts, without changing size. */
export function SubmitButton({
  children,
  className,
  ...props
}: React.ComponentProps<typeof Button>) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className={cn("relative", className)} {...props}>
      <span className={cn("transition-opacity duration-150", pending && "opacity-0")}>
        {children}
      </span>
      <LoaderCircle
        aria-hidden
        className={cn(
          "absolute animate-spin opacity-0 transition-opacity duration-150",
          pending && "opacity-100",
        )}
      />
      {pending ? <span className="sr-only">Working…</span> : null}
    </Button>
  );
}
