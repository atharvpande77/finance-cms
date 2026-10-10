/**
 * Loads the demo world. Safe to run repeatedly: existing rows (matched by slug, email or name)
 * are left alone and only missing parts are added (doc 07.4).
 */
import "dotenv/config";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/server/db/client";
import { hashPassword } from "@/server/auth/password";
import * as data from "./data";
import { articles as seedArticles } from "./articles";
import { releasedArticles, SEED_WINDOW_HOURS, workflowArticles } from "./workflow";

async function main() {
  const d = db();

  // Organisations
  await d
    .insert(schema.organisations)
    .values(
      data.organisations.map((o) => ({
        slug: o.slug,
        type: o.type,
        name: o.name,
        blurb: "blurb" in o ? o.blurb : {},
        leadRetentionDays: "leadRetentionDays" in o ? o.leadRetentionDays : undefined,
      })),
    )
    .onConflictDoNothing({ target: schema.organisations.slug });
  const orgRows = await d.select().from(schema.organisations);
  const orgId = (slug: string) => {
    const row = orgRows.find((o) => o.slug === slug);
    if (!row) throw new Error(`Unknown organisation ${slug}`);
    return row.id;
  };

  // Newspapers
  await d
    .insert(schema.tenants)
    .values(data.tenants.map(({ publisher, ...t }) => ({ ...t, publisherOrgId: orgId(publisher) })))
    .onConflictDoNothing({ target: schema.tenants.slug });
  const tenantRows = await d.select().from(schema.tenants);
  const tenantId = (slug: string) => {
    const row = tenantRows.find((t) => t.slug === slug);
    if (!row) throw new Error(`Unknown tenant ${slug}`);
    return row.id;
  };

  // Content reference data
  await d.insert(schema.disclaimerTemplates).values(data.disclaimers).onConflictDoNothing();
  await d
    .insert(schema.sections)
    .values(data.sections.map((s, i) => ({ ...s, sortOrder: i + 1 })))
    .onConflictDoNothing({ target: schema.sections.slug });
  await d
    .insert(schema.glossaryTerms)
    .values(data.glossary)
    .onConflictDoNothing({ target: schema.glossaryTerms.slug });
  await d
    .insert(schema.authors)
    .values(
      data.authors.map(({ org, user: _user, ...a }) => ({
        ...a,
        organisationId: org ? orgId(org) : null,
      })),
    )
    .onConflictDoNothing({ target: schema.authors.slug });

  // Users and their roles. One hash for every demo account keeps the seed fast.
  const passwordHash = await hashPassword(data.DEMO_PASSWORD);
  await d
    .insert(schema.users)
    .values(
      data.users.map((u) => ({
        name: u.name,
        email: `${u.handle}@${data.DEMO_EMAIL_DOMAIN}`,
        passwordHash,
      })),
    )
    .onConflictDoNothing({ target: schema.users.email });
  const userRows = await d
    .select({ id: schema.users.id, email: schema.users.email })
    .from(schema.users)
    .where(
      inArray(
        schema.users.email,
        data.users.map((u) => `${u.handle}@${data.DEMO_EMAIL_DOMAIN}`),
      ),
    );
  const userId = (handle: string) =>
    userRows.find((u) => u.email === `${handle}@${data.DEMO_EMAIL_DOMAIN}`)!.id;
  await d
    .insert(schema.memberships)
    .values(
      data.users.flatMap((u) =>
        u.roles.map((role) => ({ userId: userId(u.handle), organisationId: orgId(u.org), role })),
      ),
    )
    .onConflictDoNothing();

  // Each linked byline is that demo writer's own profile (D42).
  for (const a of data.authors) {
    if (!a.user) continue;
    await d
      .update(schema.authors)
      .set({ userId: userId(a.user) })
      .where(eq(schema.authors.slug, a.slug));
  }

  // Commercial set-up: sponsorships, plans, contracts (matched on their natural keys).
  for (const s of data.sponsorships) {
    const existing = await d
      .select({ id: schema.sponsorships.id })
      .from(schema.sponsorships)
      .where(eq(schema.sponsorships.sponsorOrgId, orgId(s.sponsor)));
    if (existing.length === 0) {
      await d.insert(schema.sponsorships).values({
        sponsorOrgId: orgId(s.sponsor),
        sectionSlugs: s.sectionSlugs,
        exclusive: s.exclusive,
        startsOn: s.startsOn,
      });
    }
  }
  for (const { sponsor, tenants, ...p } of data.plans) {
    const [existing] = await d
      .select({ id: schema.plans.id })
      .from(schema.plans)
      .where(and(eq(schema.plans.sponsorOrgId, orgId(sponsor)), eq(schema.plans.name, p.name)));
    const planId =
      existing?.id ??
      (
        await d
          .insert(schema.plans)
          .values({ ...p, sponsorOrgId: orgId(sponsor) })
          .returning()
      )[0]!.id;
    await d
      .insert(schema.planTenants)
      .values(tenants.map((t) => ({ planId, tenantId: tenantId(t) })))
      .onConflictDoNothing();
  }
  for (const c of data.contracts) {
    const existing = await d
      .select({ id: schema.contracts.id })
      .from(schema.contracts)
      .where(eq(schema.contracts.tenantId, tenantId(c.tenant)));
    if (existing.length === 0) {
      await d.insert(schema.contracts).values({
        publisherOrgId: orgId(c.publisher),
        tenantId: tenantId(c.tenant),
        startsOn: c.startsOn,
        endsOn: c.endsOn,
        minimumGuaranteeRupees: c.minimumGuaranteeRupees,
        tenureShareSteps: { perYearPct: c.perYearPct },
        exclusivityScope: "finance section",
        rightToMatch: true,
      });
    }
  }

  // Published demo articles: a released master per language plus the newspapers' copies.
  const sectionRows = await d
    .select({ id: schema.sections.id, slug: schema.sections.slug })
    .from(schema.sections);
  const authorRows = await d
    .select({ id: schema.authors.id, slug: schema.authors.slug })
    .from(schema.authors);
  for (const a of seedArticles) {
    const [existing] = await d
      .select({ id: schema.articles.id })
      .from(schema.articles)
      .where(eq(schema.articles.slug, a.slug));
    if (existing) continue;
    const created = new Date(a.createdAt);
    const reviewBy = new Date(created);
    reviewBy.setUTCMonth(reviewBy.getUTCMonth() + 6);
    await d.transaction(async (tx) => {
      const [article] = await tx
        .insert(schema.articles)
        .values({
          slug: a.slug,
          type: a.type,
          masterLanguage: a.masterLanguage,
          organisationId: orgId(a.org),
          authorId: authorRows.find((r) => r.slug === a.author)!.id,
          sectionId: sectionRows.find((r) => r.slug === a.section)!.id,
          reviewBy: reviewBy.toISOString().slice(0, 10),
          createdAt: created,
        })
        .returning();
      const tenantSlugs = [...new Set(a.copies.map((c) => c.tenant))];
      await tx
        .insert(schema.articleTargets)
        .values(tenantSlugs.map((t) => ({ articleId: article!.id, tenantId: tenantId(t) })));
      for (const [lang, text] of Object.entries(a.versions)) {
        await tx.insert(schema.articleVersions).values({
          articleId: article!.id,
          tenantId: null,
          language: lang,
          ...text!,
          state: "with_publisher",
          createdAt: created,
        });
      }
      for (const copy of a.copies) {
        const text = a.versions[copy.lang]!;
        const publishedAt = new Date(copy.publishedAt);
        const [version] = await tx
          .insert(schema.articleVersions)
          .values({
            articleId: article!.id,
            tenantId: tenantId(copy.tenant),
            language: copy.lang,
            ...text,
            state: "published",
            approvalType: copy.approval,
            publishedAt,
            lastReviewedAt: publishedAt,
            createdAt: created,
          })
          .returning();
        await tx.insert(schema.workflowEvents).values({
          versionId: version!.id,
          fromState: "with_publisher",
          toState: "published",
          actorLabel: "seed",
          action: copy.approval === "explicit" ? "approve" : "deemed_approve",
          createdAt: publishedAt,
        });
      }
    });
  }

  // Articles part-way through the workflow (M3a): one master version each, with its history.
  const now = Date.now();
  for (const a of workflowArticles) {
    const [existing] = await d
      .select({ id: schema.articles.id })
      .from(schema.articles)
      .where(eq(schema.articles.slug, a.slug));
    if (existing) continue;
    const at = (hoursAgo: number) => new Date(now - hoursAgo * 3600_000);
    const created = at(a.steps[0]!.hoursAgo);
    const reviewBy = new Date(created);
    reviewBy.setUTCMonth(reviewBy.getUTCMonth() + 6);
    await d.transaction(async (tx) => {
      const [article] = await tx
        .insert(schema.articles)
        .values({
          slug: a.slug,
          type: a.type,
          masterLanguage: a.language,
          organisationId: orgId(a.org),
          authorId: authorRows.find((r) => r.slug === a.author)!.id,
          sectionId: sectionRows.find((r) => r.slug === a.section)!.id,
          reviewBy: reviewBy.toISOString().slice(0, 10),
          createdById: a.steps[0]!.by ? userId(a.steps[0]!.by) : null,
          createdAt: created,
        })
        .returning();
      await tx
        .insert(schema.articleTargets)
        .values(a.targets.map((t) => ({ articleId: article!.id, tenantId: tenantId(t) })));
      const [version] = await tx
        .insert(schema.articleVersions)
        .values({
          articleId: article!.id,
          language: a.language,
          headline: a.headline,
          summary: a.summary,
          body: a.body,
          state: a.state,
          rev: a.steps.length - 1,
          createdAt: created,
          updatedAt: at(a.steps.at(-1)!.hoursAgo),
        })
        .returning();
      await tx.insert(schema.workflowEvents).values(
        a.steps.map((step) => ({
          versionId: version!.id,
          fromState: step.from,
          toState: step.to,
          userId: step.by ? userId(step.by) : null,
          actorLabel: step.by ? null : "seed (no demo account)",
          action: step.action,
          comment: step.comment ?? null,
          createdAt: at(step.hoursAgo),
        })),
      );
    });
  }

  // Articles already with the newspapers (M3b): masters "With publisher" and waiting copies whose
  // windows are set from seed time, so a reset re-arms them.
  for (const a of releasedArticles) {
    const [existing] = await d
      .select({ id: schema.articles.id })
      .from(schema.articles)
      .where(eq(schema.articles.slug, a.slug));
    if (existing) continue;
    const at = (ms: number) => new Date(ms);
    const releasedAt = (lang: string) =>
      Math.min(
        ...a.copies
          .filter((c) => c.language === lang)
          .map((c) =>
            c.dueInHours !== undefined
              ? now + (c.dueInHours - SEED_WINDOW_HOURS) * 3600_000
              : now - c.releasedHoursAgo! * 3600_000,
          ),
      );
    const first = Math.min(...a.masters.map((m) => releasedAt(m.language))) - 72 * 3600_000;
    const reviewBy = at(first);
    reviewBy.setUTCMonth(reviewBy.getUTCMonth() + 6);
    await d.transaction(async (tx) => {
      const [article] = await tx
        .insert(schema.articles)
        .values({
          slug: a.slug,
          type: a.type,
          masterLanguage: a.masters[0]!.language,
          organisationId: orgId(a.org),
          authorId: authorRows.find((r) => r.slug === a.author)!.id,
          sectionId: sectionRows.find((r) => r.slug === a.section)!.id,
          reviewBy: reviewBy.toISOString().slice(0, 10),
          createdById: userId(a.writer),
          createdAt: at(first),
        })
        .returning();
      await tx.insert(schema.articleTargets).values(
        [...new Set(a.copies.map((c) => c.tenant))].map((t) => ({
          articleId: article!.id,
          tenantId: tenantId(t),
        })),
      );
      for (const [i, m] of a.masters.entries()) {
        const released = releasedAt(m.language);
        const started = first + i * 3600_000;
        const [master] = await tx
          .insert(schema.articleVersions)
          .values({
            articleId: article!.id,
            language: m.language,
            headline: m.headline,
            summary: m.summary,
            body: m.body,
            state: "with_publisher",
            rev: a.path.length + 1,
            createdAt: at(started),
            updatedAt: at(released),
          })
          .returning();
        // Create (or add the language), each approval step a few hours apart, then release.
        let from: "draft" | "in_approval" | "compliance_review" | "editing" = "draft";
        const events: (typeof schema.workflowEvents.$inferInsert)[] = [
          {
            versionId: master!.id,
            fromState: null,
            toState: "draft",
            userId: userId(a.writer),
            action: i === 0 ? "create" : "add_language",
            createdAt: at(started),
          },
        ];
        for (const [j, step] of a.path.entries()) {
          events.push({
            versionId: master!.id,
            fromState: from,
            toState: step.to,
            userId: userId(step.by),
            action: step.action,
            createdAt: at(started + (j + 1) * 6 * 3600_000),
          });
          from = step.to;
        }
        events.push({
          versionId: master!.id,
          fromState: "editing",
          toState: "with_publisher",
          userId: userId("editor.abc"),
          action: "release",
          comment: a.copies.find((c) => c.language === m.language)?.note ?? null,
          createdAt: at(released),
        });
        await tx.insert(schema.workflowEvents).values(events);

        for (const c of a.copies.filter((x) => x.language === m.language)) {
          const deemed = c.dueInHours !== undefined;
          const [copy] = await tx
            .insert(schema.articleVersions)
            .values({
              articleId: article!.id,
              tenantId: tenantId(c.tenant),
              language: m.language,
              headline: m.headline,
              summary: m.summary,
              body: m.body,
              state: "with_publisher",
              requiresExplicit: !deemed,
              explicitReasons: c.explicitReasons ?? [],
              autoApproveAt: deemed ? at(now + c.dueInHours! * 3600_000) : null,
              createdAt: at(released),
              updatedAt: at(released),
            })
            .returning();
          await tx.insert(schema.workflowEvents).values({
            versionId: copy!.id,
            fromState: null,
            toState: "with_publisher",
            userId: userId("editor.abc"),
            action: "release",
            comment: c.note ?? null,
            createdAt: at(released),
          });
        }
      }
    });
  }

  const count = async (table: Parameters<typeof d.$count>[0]) => d.$count(table);
  console.log(
    `Seeded: ${await count(schema.organisations)} organisations, ${await count(schema.tenants)} newspapers, ` +
      `${await count(schema.sections)} sections, ${await count(schema.users)} users, ` +
      `${await count(schema.plans)} plans, ${await count(schema.contracts)} contracts, ` +
      `${await count(schema.articles)} articles, ${await count(schema.articleVersions)} versions.`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
