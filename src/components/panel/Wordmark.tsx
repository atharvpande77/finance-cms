import { cn } from "@/components/ui/utils";

/** Placeholder identity until abcfinance's logo and palette are chosen (11.4). */
export function Wordmark({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span
        aria-hidden
        className="grid size-7 place-items-center rounded-md bg-primary text-sm font-bold text-primary-foreground"
      >
        ₹
      </span>
      <span className="text-[15px] font-semibold tracking-tight">abcfinance</span>
    </div>
  );
}
