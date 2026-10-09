import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { themeVariables } from "@/domain/theme";
import { fontClasses } from "@/app/sites/fonts";
import { getSite } from "@/app/sites/site";
import "./site.css";

type Props = { children: React.ReactNode; params: Promise<{ host: string; lang: string }> };

export async function generateMetadata({ params }: Omit<Props, "children">): Promise<Metadata> {
  const { host, lang } = await params;
  const site = await getSite(host, lang);
  return {
    metadataBase: new URL(site.origin),
    title: {
      default: `${site.sectionLabel} · ${site.paperName}`,
      template: `%s · ${site.sectionLabel} · ${site.paperName}`,
    },
  };
}

/**
 * Root layout of every newspaper's reader site: only the document, the paper's theme variables
 * and its fonts. The chrome lives in (site)/layout.tsx so the "not found" page can render
 * inside it.
 */
export default async function SiteRootLayout({ children, params }: Props) {
  const { host, lang } = await params;
  const { tenant } = await getSite(host, lang);
  const theme = tenant.theme;
  return (
    <html
      lang={lang}
      className={fontClasses([theme.displayFont, theme.headingFont, theme.bodyFont])}
      style={themeVariables(theme) as CSSProperties}
    >
      {/* Extensions such as Grammarly add attributes to <body> before React hydrates. */}
      <body suppressHydrationWarning className="min-h-dvh bg-page font-body text-ink">
        {children}
      </body>
    </html>
  );
}
