import { cn } from "@/components/ui/utils";

export function PageHeader({
  title,
  description,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-8 grid gap-1.5", className)}>
      <h1 className="text-2xl font-semibold tracking-tight text-balance">{title}</h1>
      {description ? <p className="text-pretty text-muted-foreground">{description}</p> : null}
    </div>
  );
}
