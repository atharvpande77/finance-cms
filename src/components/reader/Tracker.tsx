"use client";

import { useEffect, useRef } from "react";
import { ANALYTICS, CALC_USE_EVENT, type PageKind } from "@/domain/analytics";

/**
 * The first-party tracker (04.8, 05.1): one view per page view, one engaged read once the page
 * has been visible 20 seconds and scrolled halfway (short pages need no scrolling), and one
 * calculator use per calculator. Cookie-free: nothing is stored in the browser, and the page
 * view id lives only in memory.
 */
export function Tracker({
  kind,
  versionId,
  lang,
}: {
  kind: PageKind;
  versionId?: string;
  lang: string;
}) {
  // Kept across React's development double-mount, so the server sees the same view twice
  // and counts it once.
  const pvRef = useRef<string | null>(null);

  useEffect(() => {
    pvRef.current ??= newPageViewId();
    const base = {
      pv: pvRef.current,
      p: location.pathname,
      k: kind,
      l: lang,
      ...(versionId ? { v: versionId } : {}),
    };
    send({ t: "v", ...base, ...referrer() });

    let visibleMs = 0;
    let visibleSince = document.visibilityState === "visible" ? performance.now() : null;
    let deepest = 0;
    let engaged = false;
    const calculators = new Set<string>();

    const measure = () => {
      const height = document.documentElement.scrollHeight;
      const short = height < innerHeight * ANALYTICS.shortPageScreens;
      deepest = Math.max(deepest, short ? 1 : (scrollY + innerHeight) / height);
    };
    const visible = () =>
      visibleMs + (visibleSince === null ? 0 : performance.now() - visibleSince);
    const check = () => {
      if (engaged) return;
      measure();
      if (visible() >= ANALYTICS.engagedVisibleMs && deepest >= ANALYTICS.engagedScroll) {
        engaged = true;
        clearInterval(timer);
        send({ t: "e", ...base });
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        visibleSince ??= performance.now();
      } else if (visibleSince !== null) {
        visibleMs += performance.now() - visibleSince;
        visibleSince = null;
      }
    };
    const onCalculator = (event: Event) => {
      const slug = (event as CustomEvent<unknown>).detail;
      if (typeof slug !== "string" || calculators.has(slug)) return;
      calculators.add(slug);
      send({ t: "c", ...base, calc: slug });
    };

    const timer = setInterval(check, 1000);
    addEventListener("scroll", measure, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    addEventListener(CALC_USE_EVENT, onCalculator);
    return () => {
      clearInterval(timer);
      removeEventListener("scroll", measure);
      document.removeEventListener("visibilitychange", onVisibility);
      removeEventListener(CALC_USE_EVENT, onCalculator);
    };
  }, [kind, versionId, lang]);

  return <span hidden data-tracker data-kind={kind} data-version={versionId} />;
}

/** 16 random bytes, base64url: 22 characters. */
function newPageViewId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** The referrer's host name only (D48). */
function referrer(): { r?: string } {
  try {
    return document.referrer ? { r: new URL(document.referrer).hostname } : {};
  } catch {
    return {};
  }
}

/** `text/plain`, so the browser sends it without a preflight (05.1); never throws. */
function send(body: Record<string, unknown>) {
  const json = JSON.stringify(body);
  try {
    if (navigator.sendBeacon?.("/_a/h", new Blob([json], { type: "text/plain" }))) return;
  } catch {
    // fall through to fetch
  }
  fetch("/_a/h", {
    method: "POST",
    body: json,
    keepalive: true,
    headers: { "Content-Type": "text/plain" },
  }).catch(() => {});
}
