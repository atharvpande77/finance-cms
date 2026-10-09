import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "abcfinance", template: "%s · abcfinance" },
  robots: { index: false, follow: false },
};

/** Root layout for the abcfinance host: sign-in, account pages and the panels. */
export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
