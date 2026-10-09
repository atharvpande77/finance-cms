import { Wordmark } from "@/components/panel/Wordmark";

/** Sign-in and account set-up: one calm, centred column with no menu. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center px-4 py-10 sm:justify-center sm:py-16">
      <div className="w-full max-w-sm">
        <Wordmark className="mb-8 justify-center" />
        {children}
      </div>
      <p className="mt-10 text-center text-xs text-muted-foreground">
        abcfinance staff, partner institutions and newspaper desks
      </p>
    </div>
  );
}
