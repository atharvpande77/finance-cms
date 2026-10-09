import { tenantByHost } from "@/server/tenants";
import { buildSitemap } from "@/server/content/sitemap";

export async function GET(_request: Request, ctx: { params: Promise<{ host: string }> }) {
  const tenant = await tenantByHost(decodeURIComponent((await ctx.params).host));
  if (!tenant) return new Response("Not found", { status: 404 });
  return new Response(await buildSitemap(tenant), {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, max-age=300",
    },
  });
}
