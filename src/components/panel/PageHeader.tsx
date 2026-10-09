export function PageHeader({
  title,
  description,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
}) {
  return (
    <div className="mb-8 grid gap-1.5">
      <h1 className="text-2xl font-semibold tracking-tight text-balance">{title}</h1>
      {description ? <p className="text-pretty text-muted-foreground">{description}</p> : null}
    </div>
  );
}
