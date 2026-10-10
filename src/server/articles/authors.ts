import { and, eq, like } from "drizzle-orm";
import { schema, type Tx } from "@/server/db/client";
import { suggestSlug } from "@/domain/slug";

/**
 * A writer's own byline (D42): the author profile linked to their account for an organisation,
 * created from their name the first time they write for it.
 */
export async function ensureOwnProfile(
  tx: Tx,
  user: { id: string },
  organisationId: string,
  contributorType: "institution" | "staff",
): Promise<{ id: string }> {
  const a = schema.authors;
  const [existing] = await tx
    .select({ id: a.id })
    .from(a)
    .where(
      and(
        eq(a.userId, user.id),
        eq(a.organisationId, organisationId),
        eq(a.contributorType, contributorType),
      ),
    )
    .limit(1);
  if (existing) return existing;

  const [person] = await tx
    .select({ name: schema.users.name })
    .from(schema.users)
    .where(eq(schema.users.id, user.id));
  const base = suggestSlug(person!.name) || `author-${user.id.slice(0, 8)}`;
  const taken = new Set(
    (
      await tx
        .select({ slug: a.slug })
        .from(a)
        .where(like(a.slug, `${base}%`))
    ).map((r) => r.slug),
  );
  let slug = base;
  for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
  const [created] = await tx
    .insert(a)
    .values({ slug, name: person!.name, organisationId, contributorType, userId: user.id })
    .returning({ id: a.id });
  return created!;
}
