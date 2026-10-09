import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Forbidden() {
  return (
    <main className="mx-auto grid min-h-[60vh] max-w-md place-content-center gap-3 px-4 text-center">
      <p className="text-sm font-medium text-muted-foreground tabular-nums">403</p>
      <h1 className="text-2xl font-semibold text-balance">
        This area isn&apos;t part of your roles
      </h1>
      <p className="text-pretty text-muted-foreground">
        Ask your organisation&apos;s administrator if you think you should have access.
      </p>
      <div className="mt-2">
        <Button asChild variant="outline">
          <Link href="/dashboard">Back to dashboard</Link>
        </Button>
      </div>
    </main>
  );
}
