/**
 * Database schema (doc 03). Column names are camelCase here and snake_case in Postgres
 * (drizzle `casing: "snake_case"`). Money is whole rupees (integers). Per-language text is
 * stored as JSON `{ "mr": "...", "en": "..." }`.
 *
 * Invariants that span tables (role matches organisation type, a published copy's tenant
 * publishes its language) are enforced by triggers in a hand-written migration.
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export type LocalizedText = Partial<Record<"mr" | "en" | "hi", string>>;

const id = () => uuid().primaryKey().defaultRandom();
const createdAt = () => timestamp({ withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
const localized = () => jsonb().$type<LocalizedText>().notNull().default({});

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const organisationType = pgEnum("organisation_type", [
  "institution",
  "publisher",
  "abcfinance",
]);

/** Each role belongs to exactly one organisation type: the prefix before the first "_". */
export const role = pgEnum("role", [
  "institution_writer",
  "institution_approver",
  "institution_compliance",
  "institution_account_admin",
  "abcfinance_writer",
  "abcfinance_editor",
  "abcfinance_desk_manager",
  "abcfinance_super_admin",
  "publisher_editor",
  "publisher_admin",
]);

export const tenantStatus = pgEnum("tenant_status", ["staging", "live"]);
export const billing = pgEnum("billing", ["annual_prepaid", "monthly"]);
export const contributorType = pgEnum("contributor_type", ["staff", "institution", "independent"]);
export const articleType = pgEnum("article_type", ["institution", "abcfinance", "independent"]);
export const versionState = pgEnum("version_state", [
  "draft",
  "in_approval",
  "compliance_review",
  "editing",
  "with_publisher",
  "published",
  "review_due",
  "unpublished",
]);
export const approvalType = pgEnum("approval_type", ["explicit", "deemed"]);
export const leadStatus = pgEnum("lead_status", ["new", "contacted", "qualified", "junk"]);
export const outboxStatus = pgEnum("outbox_status", ["queued", "sent", "failed"]);
export const widgetPlacement = pgEnum("widget_placement", ["end", "sidebar", "inline"]);
export const widgetStatPlacement = pgEnum("widget_stat_placement", [
  "end",
  "sidebar",
  "inline",
  "menu",
]);
export const widgetMode = pgEnum("widget_mode", ["static", "latest"]);
export const payoutStatus = pgEnum("payout_status", ["draft", "issued", "paid"]);

export type Role = (typeof role.enumValues)[number];
export type OrganisationType = (typeof organisationType.enumValues)[number];
export type VersionState = (typeof versionState.enumValues)[number];

// ---------------------------------------------------------------------------
// 3.1 Identity and access
// ---------------------------------------------------------------------------

export const organisations = pgTable("organisations", {
  id: id(),
  type: organisationType().notNull(),
  name: text().notNull(),
  slug: text().notNull().unique(),
  logoUrl: text(),
  blurb: localized(),
  leadRetentionDays: integer().notNull().default(365),
  createdAt: createdAt(),
});

export const users = pgTable(
  "users",
  {
    id: id(),
    name: text().notNull(),
    email: text().notNull().unique(),
    phone: text(),
    passwordHash: text().notNull(),
    totpSecretEnc: text(),
    totpEnabled: boolean().notNull().default(false),
    /** Last accepted TOTP time step, so a code cannot be replayed. */
    totpLastStep: bigint({ mode: "number" }),
    failedLogins: integer().notNull().default(0),
    lockedUntil: timestamp({ withTimezone: true }),
    disabledAt: timestamp({ withTimezone: true }),
    lastSignInAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [check("users_email_lower", sql`${t.email} = lower(${t.email})`)],
);

export const memberships = pgTable(
  "memberships",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    organisationId: uuid()
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    role: role().notNull(),
    createdAt: createdAt(),
  },
  (t) => [unique().on(t.userId, t.organisationId, t.role), index().on(t.organisationId)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text().notNull().unique(),
    mfaVerified: boolean().notNull().default(false),
    createdAt: createdAt(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
  },
  (t) => [index().on(t.userId)],
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: bigserial({ mode: "number" }).primaryKey(),
    userId: uuid().references(() => users.id, { onDelete: "set null" }),
    action: text().notNull(),
    detail: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    ip: text(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.createdAt), index().on(t.userId), index().on(t.action)],
);

export const invitations = pgTable(
  "invitations",
  {
    id: id(),
    email: text().notNull(),
    nameHint: text(),
    organisationId: uuid()
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    roles: role().array().notNull(),
    tokenHash: text().notNull().unique(),
    invitedById: uuid().references(() => users.id, { onDelete: "set null" }),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    acceptedAt: timestamp({ withTimezone: true }),
    revokedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.email, t.organisationId)],
);

export const passwordResets = pgTable(
  "password_resets",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text().notNull().unique(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    usedAt: timestamp({ withTimezone: true }),
    /** The admin who sent the link, or null when the person asked for it. */
    requestedById: uuid().references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.userId)],
);

// ---------------------------------------------------------------------------
// 3.2 Newspapers and plans
// ---------------------------------------------------------------------------

export type TenantTheme = {
  primary: string;
  accent: string;
  bg: string;
  ink: string;
  muted: string;
  headingFont: string;
  bodyFont: string;
};

export const tenants = pgTable(
  "tenants",
  {
    id: id(),
    slug: text().notNull().unique(),
    publisherOrgId: uuid()
      .notNull()
      .references(() => organisations.id),
    name: localized(),
    menuLabel: localized(),
    mainSiteUrl: text().notNull(),
    /** Finance subdomains served for this paper. A host belongs to at most one tenant. */
    hosts: text().array().notNull(),
    theme: jsonb().$type<TenantTheme>().notNull(),
    languages: text().array().notNull(),
    defaultLanguage: text().notNull(),
    toneGuide: localized(),
    autoApproveHours: integer().notNull().default(24),
    heldSectionSlugs: text()
      .array()
      .notNull()
      .default(sql`'{}'`),
    status: tenantStatus().notNull().default("staging"),
    adConfig: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    widgetConfig: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [
    check("tenants_default_language_listed", sql`${t.defaultLanguage} = ANY(${t.languages})`),
    check("tenants_auto_approve_positive", sql`${t.autoApproveHours} > 0`),
    index("tenants_hosts_gin").using("gin", t.hosts),
  ],
);

export const plans = pgTable("plans", {
  id: id(),
  sponsorOrgId: uuid()
    .notNull()
    .references(() => organisations.id),
  name: text().notNull(),
  priceRupees: integer().notNull(),
  billing: billing().notNull(),
  newspapersAllowed: integer().notNull(),
  articlesPerMonth: integer().notNull(),
  rolloverCredits: integer().notNull().default(0),
  languages: text().array().notNull(),
  startsOn: date().notNull(),
  endsOn: date(),
  createdAt: createdAt(),
});

/** The newspapers on a plan; the sponsor's pool is split among these only. */
export const planTenants = pgTable(
  "plan_tenants",
  {
    planId: uuid()
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id),
  },
  (t) => [primaryKey({ columns: [t.planId, t.tenantId] })],
);

export const sponsorships = pgTable("sponsorships", {
  id: id(),
  sponsorOrgId: uuid()
    .notNull()
    .references(() => organisations.id),
  sectionSlugs: text().array().notNull(),
  startsOn: date().notNull(),
  endsOn: date(),
  exclusive: boolean().notNull().default(false),
  createdAt: createdAt(),
});

export const contracts = pgTable("contracts", {
  id: id(),
  publisherOrgId: uuid()
    .notNull()
    .references(() => organisations.id),
  tenantId: uuid()
    .notNull()
    .references(() => tenants.id),
  startsOn: date().notNull(),
  endsOn: date(),
  exclusivityScope: text(),
  rightToMatch: boolean().notNull().default(false),
  /** Year-1 monthly minimum guarantee in rupees; 0 means none. */
  minimumGuaranteeRupees: integer().notNull().default(0),
  tenureShareSteps: jsonb().$type<{ perYearPct: number }>().notNull().default({ perYearPct: 0 }),
  exitTerms: text(),
  createdAt: createdAt(),
});

export const platformSettings = pgTable("platform_settings", {
  key: text().primaryKey(),
  value: jsonb().$type<Record<string, unknown>>().notNull(),
  updatedAt: updatedAt(),
});

// ---------------------------------------------------------------------------
// 3.3 Content
// ---------------------------------------------------------------------------

export const disclaimerTemplates = pgTable("disclaimer_templates", {
  key: text().primaryKey(),
  text: localized(),
});

export const sections = pgTable("sections", {
  id: id(),
  slug: text().notNull().unique(),
  name: localized(),
  blurb: localized(),
  sortOrder: integer().notNull().default(0),
  disclaimerKey: text()
    .notNull()
    .references(() => disclaimerTemplates.key),
  calculatorSlugs: text()
    .array()
    .notNull()
    .default(sql`'{}'`),
});

export const glossaryTerms = pgTable("glossary_terms", {
  id: id(),
  slug: text().notNull().unique(),
  term: localized(),
  definition: localized(),
});

export const authors = pgTable("authors", {
  id: id(),
  slug: text().notNull().unique(),
  userId: uuid().references(() => users.id, { onDelete: "set null" }),
  name: text().notNull(),
  credentials: localized(),
  bio: localized(),
  organisationId: uuid().references(() => organisations.id),
  contributorType: contributorType().notNull(),
  disclosedAffiliations: text()
    .array()
    .notNull()
    .default(sql`'{}'`),
  city: text(),
  licenceType: text(),
  licenceNumber: text(),
});

export const articles = pgTable(
  "articles",
  {
    id: id(),
    slug: text().notNull().unique(),
    type: articleType().notNull(),
    masterLanguage: text().notNull(),
    /** The institution for institution articles; abcfinance for its own and independent ones. */
    organisationId: uuid()
      .notNull()
      .references(() => organisations.id),
    authorId: uuid().references(() => authors.id),
    sectionId: uuid()
      .notNull()
      .references(() => sections.id),
    reviewBy: date().notNull(),
    createdById: uuid().references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.organisationId), index().on(t.sectionId)],
);

/** Newspapers the author intends the article for (pre-ticked on the release form). */
export const articleTargets = pgTable(
  "article_targets",
  {
    articleId: uuid()
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id),
  },
  (t) => [primaryKey({ columns: [t.articleId, t.tenantId] })],
);

/**
 * Two kinds of version: a master draft (tenantId null) moving through the institution and
 * editing states, and a paper copy (tenantId set) created at release.
 */
export const articleVersions = pgTable(
  "article_versions",
  {
    id: id(),
    articleId: uuid()
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    tenantId: uuid().references(() => tenants.id),
    language: text().notNull(),
    headline: text().notNull(),
    summary: text().notNull().default(""),
    body: text().notNull().default(""),
    state: versionState().notNull(),
    approvalType: approvalType(),
    publishedAt: timestamp({ withTimezone: true }),
    lastReviewedAt: timestamp({ withTimezone: true }),
    autoApproveAt: timestamp({ withTimezone: true }),
    heldAt: timestamp({ withTimezone: true }),
    requiresExplicit: boolean().notNull().default(false),
    explicitReasons: text()
      .array()
      .notNull()
      .default(sql`'{}'`),
    /** Optimistic-concurrency counter: every state change or save increments it. */
    rev: integer().notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // One master draft per (article, language); NULL tenant is not unique on its own.
    uniqueIndex("article_versions_one_master")
      .on(t.articleId, t.language)
      .where(sql`${t.tenantId} IS NULL`),
    uniqueIndex("article_versions_one_copy")
      .on(t.articleId, t.tenantId, t.language)
      .where(sql`${t.tenantId} IS NOT NULL`),
    index().on(t.tenantId, t.state),
    index().on(t.state, t.autoApproveAt),
  ],
);

export const workflowEvents = pgTable(
  "workflow_events",
  {
    id: bigserial({ mode: "number" }).primaryKey(),
    versionId: uuid()
      .notNull()
      .references(() => articleVersions.id, { onDelete: "cascade" }),
    fromState: versionState(),
    toState: versionState().notNull(),
    userId: uuid().references(() => users.id, { onDelete: "set null" }),
    /** Label for system actions (e.g. the deemed-approval job). */
    actorLabel: text(),
    action: text().notNull(),
    comment: text(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.versionId)],
);

// ---------------------------------------------------------------------------
// 3.4 Leads and communication
// ---------------------------------------------------------------------------

export const leads = pgTable(
  "leads",
  {
    id: id(),
    sponsorOrgId: uuid()
      .notNull()
      .references(() => organisations.id),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id),
    language: text().notNull(),
    nameEnc: text(),
    phoneEnc: text(),
    cityEnc: text(),
    /** Keyed hash for repeat detection; blanked on erasure. */
    phoneHash: text(),
    ipHash: text(),
    interestKey: text().notNull(),
    interestLabel: text().notNull(),
    consentText: text().notNull(),
    consentVersion: text().notNull(),
    consentAt: timestamp({ withTimezone: true }).notNull(),
    sourcePage: text().notNull(),
    sourceVersionId: uuid().references(() => articleVersions.id, { onDelete: "set null" }),
    sourceCalculator: text(),
    status: leadStatus().notNull().default("new"),
    note: text(),
    contactedAt: timestamp({ withTimezone: true }),
    deleteAfter: timestamp({ withTimezone: true }).notNull(),
    erasedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index().on(t.sponsorOrgId, t.createdAt),
    index().on(t.phoneHash),
    index().on(t.deleteAfter),
  ],
);

export const emailOutbox = pgTable(
  "email_outbox",
  {
    id: id(),
    to: text().notNull(),
    subject: text().notNull(),
    bodyEnc: text().notNull(),
    status: outboxStatus().notNull().default("queued"),
    kind: text().notNull(),
    createdById: uuid().references(() => users.id, { onDelete: "set null" }),
    attempts: integer().notNull().default(0),
    lastError: text(),
    createdAt: createdAt(),
    sentAt: timestamp({ withTimezone: true }),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.status, t.createdAt)],
);

// ---------------------------------------------------------------------------
// 3.5 Calculators and sponsor rates
// ---------------------------------------------------------------------------

export const calculatorRates = pgTable(
  "calculator_rates",
  {
    id: id(),
    organisationId: uuid()
      .notNull()
      .references(() => organisations.id),
    calculatorSlug: text().notNull(),
    rates: jsonb().$type<Record<string, number>>().notNull(),
    ratesAsOf: date().notNull(),
    updatedById: uuid().references(() => users.id, { onDelete: "set null" }),
    updatedAt: updatedAt(),
  },
  (t) => [unique().on(t.organisationId, t.calculatorSlug)],
);

// ---------------------------------------------------------------------------
// 3.6 Analytics, widgets and money
// ---------------------------------------------------------------------------

/** One row per (tenant, page, Indian calendar day). Increment-only. */
export const pageStats = pgTable(
  "page_stats",
  {
    id: bigserial({ mode: "number" }).primaryKey(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id),
    versionId: uuid().references(() => articleVersions.id, { onDelete: "set null" }),
    pagePath: text().notNull(),
    language: text().notNull(),
    kind: text().notNull(),
    date: date().notNull(),
    views: integer().notNull().default(0),
    engagedReads: integer().notNull().default(0),
    searchViews: integer().notNull().default(0),
    mobileViews: integer().notNull().default(0),
  },
  (t) => [unique().on(t.tenantId, t.pagePath, t.date), index().on(t.tenantId, t.date)],
);

/** One row per page view, kept 30 days so each view and engaged read counts once. */
export const pageViews = pgTable(
  "page_views",
  {
    /** Random id made by the browser. */
    id: text().primaryKey(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id),
    pagePath: text().notNull(),
    versionId: uuid().references(() => articleVersions.id, { onDelete: "set null" }),
    kind: text().notNull(),
    language: text().notNull(),
    viewedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    engagedAt: timestamp({ withTimezone: true }),
    calculatorsUsed: text()
      .array()
      .notNull()
      .default(sql`'{}'`),
    visitorHash: text().notNull(),
  },
  (t) => [index().on(t.viewedAt)],
);

export const calculatorUses = pgTable(
  "calculator_uses",
  {
    id: bigserial({ mode: "number" }).primaryKey(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id),
    calculatorSlug: text().notNull(),
    /** The sponsor credited at the time of use; null when unsponsored. */
    sponsorOrgId: uuid().references(() => organisations.id),
    date: date().notNull(),
    uses: integer().notNull().default(0),
  },
  (t) => [unique().on(t.tenantId, t.calculatorSlug, t.sponsorOrgId, t.date).nullsNotDistinct()],
);

export const widgetCards = pgTable(
  "widget_cards",
  {
    id: id(),
    /** Null means the card is available to every newspaper. */
    tenantId: uuid().references(() => tenants.id),
    placement: widgetPlacement().notNull(),
    mode: widgetMode().notNull(),
    sectionId: uuid().references(() => sections.id),
    targetPath: text(),
    headline: localized(),
    text: localized(),
    button: localized(),
    keywords: text()
      .array()
      .notNull()
      .default(sql`'{}'`),
    isDefault: boolean().notNull().default(false),
    priority: integer().notNull().default(0),
    active: boolean().notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.tenantId, t.placement)],
);

export const widgetStats = pgTable(
  "widget_stats",
  {
    id: bigserial({ mode: "number" }).primaryKey(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id),
    date: date().notNull(),
    placement: widgetStatPlacement().notNull(),
    /** Card id, or "" for the menu link. Kept as text so stats survive card deletion. */
    cardId: text().notNull().default(""),
    /** The newspaper's own page, without query or fragment. */
    sourcePath: text().notNull(),
    clicks: integer().notNull().default(0),
  },
  (t) => [unique().on(t.tenantId, t.date, t.placement, t.cardId, t.sourcePath)],
);

export const adsenseEarnings = pgTable(
  "adsense_earnings",
  {
    id: id(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id),
    /** First day of the month. */
    month: date().notNull(),
    grossRupees: integer().notNull(),
    enteredById: uuid().references(() => users.id, { onDelete: "set null" }),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique().on(t.tenantId, t.month),
    check("adsense_non_negative", sql`${t.grossRupees} >= 0`),
  ],
);

export const payouts = pgTable(
  "payouts",
  {
    id: id(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id),
    periodStart: date().notNull(),
    periodEnd: date().notNull(),
    poolShareRupees: integer().notNull(),
    tenureStepPct: integer().notNull().default(0),
    adsenseShareRupees: integer().notNull(),
    guaranteeAdvancedRupees: integer().notNull().default(0),
    guaranteeRecoveredRupees: integer().notNull().default(0),
    payableRupees: integer().notNull(),
    sponsorBreakdown: jsonb().$type<Array<Record<string, unknown>>>().notNull().default([]),
    status: payoutStatus().notNull().default("draft"),
    issuedAt: timestamp({ withTimezone: true }),
    paidAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [unique().on(t.tenantId, t.periodStart)],
);

// ---------------------------------------------------------------------------
// Infrastructure
// ---------------------------------------------------------------------------

/** Fixed-window rate-limit counters (UNLOGGED: losing them on a crash is harmless). */
export const rateLimits = pgTable(
  "rate_limits",
  {
    key: text().primaryKey(),
    windowStart: timestamp({ withTimezone: true }).notNull(),
    count: integer().notNull(),
  },
  (t) => [index().on(t.windowStart)],
);
