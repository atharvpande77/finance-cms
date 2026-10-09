/**
 * Fonts available to newspaper themes, self-hosted by next/font at build time (no requests to
 * Google from readers). Noto Sans Devanagari is every theme's Marathi fallback, so it is the only
 * one preloaded; the others load when a theme uses them.
 */
import { Karma, Mukta, Noto_Sans_Devanagari, Open_Sans } from "next/font/google";
import type { FontKey } from "@/domain/theme";

const notoSans = Noto_Sans_Devanagari({
  subsets: ["devanagari", "latin"],
  variable: "--font-noto-sans",
  display: "swap",
});
const karma = Karma({
  weight: ["400", "700"],
  subsets: ["devanagari", "latin"],
  variable: "--font-karma",
  display: "swap",
  preload: false,
});
const mukta = Mukta({
  weight: ["400", "600", "700"],
  subsets: ["devanagari", "latin"],
  variable: "--font-mukta",
  display: "swap",
  preload: false,
});
const openSans = Open_Sans({
  subsets: ["latin"],
  variable: "--font-open-sans",
  display: "swap",
  preload: false,
});

const FONTS: Record<FontKey, { variable: string }> = {
  "noto-sans": notoSans,
  karma,
  mukta,
  "open-sans": openSans,
};

/** Class names that define the font variables a theme needs (always including the fallback). */
export function fontClasses(keys: FontKey[]): string {
  return [...new Set<FontKey>(["noto-sans", ...keys])].map((k) => FONTS[k].variable).join(" ");
}
