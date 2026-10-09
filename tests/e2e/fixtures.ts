/**
 * Test-only content written straight into the test database: things readers must never see,
 * and an article whose links exercise every link rule. Not part of the demo seed.
 */
import { eq } from "drizzle-orm";
import { db, schema } from "@/server/db/client";

async function ids() {
  const tenants = await db().select().from(schema.tenants);
  const [amc] = await db()
    .select()
    .from(schema.organisations)
    .where(eq(schema.organisations.slug, "sample-amc"));
  const [section] = await db()
    .select()
    .from(schema.sections)
    .where(eq(schema.sections.slug, "mutual-funds"));
  const tenant = (slug: string) => tenants.find((t) => t.slug === slug)!.id;
  return { tenant, amcId: amc!.id, sectionId: section!.id };
}

async function article(
  slug: string,
  versions: Array<{
    tenant: string | null;
    state: "draft" | "with_publisher" | "published" | "unpublished";
  }>,
  body = "A test article body that is long enough to read.",
) {
  const { tenant, amcId, sectionId } = await ids();
  const [existing] = await db()
    .select()
    .from(schema.articles)
    .where(eq(schema.articles.slug, slug));
  if (existing) return;
  const [a] = await db()
    .insert(schema.articles)
    .values({
      slug,
      type: "institution",
      masterLanguage: "en",
      organisationId: amcId,
      sectionId,
      reviewBy: "2027-04-01",
    })
    .returning();
  for (const v of versions) {
    await db()
      .insert(schema.articleVersions)
      .values({
        articleId: a!.id,
        tenantId: v.tenant ? tenant(v.tenant) : null,
        language: "en",
        headline: `Fixture ${slug}`,
        summary: "Fixture",
        body,
        state: v.state,
        ...(v.state === "published"
          ? { publishedAt: new Date(), approvalType: "explicit" as const }
          : {}),
      });
  }
}

export const LINK_FIXTURE_BODY = `An outbound link to [the regulator](https://www.sebi.gov.in/) and a [site link](/en/glossary/sip).

Unsafe ones: [run code](javascript:alert(1)) and [elsewhere](//evil.example/path) and [backslash](/\\evil.example).`;

export async function insertReaderFixtures() {
  await article("fixture-draft-only", [{ tenant: null, state: "draft" }]);
  await article("fixture-waiting", [{ tenant: "tarunbharat", state: "with_publisher" }]);
  await article("fixture-taken-down", [{ tenant: "tarunbharat", state: "unpublished" }]);
  await article("fixture-other-paper", [{ tenant: "paperb", state: "published" }]);
  await article(
    "fixture-links",
    [{ tenant: "tarunbharat", state: "published" }],
    LINK_FIXTURE_BODY,
  );
}
