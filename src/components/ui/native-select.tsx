import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "./utils";

/** A styled native <select>: works without JavaScript and uses the phone's own picker. */
function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <div className="relative">
      <select
        data-slot="native-select"
        className={cn(
          "h-10 w-full appearance-none rounded-md border border-input bg-background py-1 pr-9 pl-3 text-base shadow-xs transition-[color,box-shadow] outline-none md:text-sm",
          "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
          className,
        )}
        {...props}
      />
      <ChevronDown
        aria-hidden
        strokeWidth={1.75}
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  );
}

export { NativeSelect };
