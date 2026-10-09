import { headers } from "next/headers";
import { t } from "@/domain/i18n";
import { localePath, PAGE_LANG_HEADER } from "@/domain/urls";
import { tenantByHost } from "@/server/tenants";

/** A clean "not found" in the page's language, inside the paper's chrome (05 §5.1). */
export default async function NotFound() {
  const h = await headers();
  const tenant = await tenantByHost(h.get("host"));
  const lang = h.get(PAGE_LANG_HEADER) ?? tenant?.defaultLanguage ?? "en";
  const home = tenant ? localePath(tenant, lang, "/") : "/";
  return (
    <div className="mx-auto max-w-[42rem] py-16 text-center">
      <p className="font-display text-6xl font-bold text-primary">404</p>
      <h1 className="mt-4 font-heading text-3xl font-bold">{t(lang, "notFoundTitle")}</h1>
      <p className="mt-3 text-pretty text-muted">{t(lang, "notFoundBody")}</p>
      <a
        href={home}
        className="mt-8 inline-flex min-h-11 items-center rounded-lg bg-primary px-5 font-semibold text-white transition-[filter] duration-150 hover:brightness-110"
      >
        {t(lang, "goHome")}
      </a>
    </div>
  );
}
