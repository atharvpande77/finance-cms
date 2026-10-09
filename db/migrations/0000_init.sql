CREATE TYPE "public"."approval_type" AS ENUM('explicit', 'deemed');--> statement-breakpoint
CREATE TYPE "public"."article_type" AS ENUM('institution', 'abcfinance', 'independent');--> statement-breakpoint
CREATE TYPE "public"."billing" AS ENUM('annual_prepaid', 'monthly');--> statement-breakpoint
CREATE TYPE "public"."contributor_type" AS ENUM('staff', 'institution', 'independent');--> statement-breakpoint
CREATE TYPE "public"."lead_status" AS ENUM('new', 'contacted', 'qualified', 'junk');--> statement-breakpoint
CREATE TYPE "public"."organisation_type" AS ENUM('institution', 'publisher', 'abcfinance');--> statement-breakpoint
CREATE TYPE "public"."outbox_status" AS ENUM('queued', 'sent', 'failed');--> statement-breakpoint
CREATE TYPE "public"."payout_status" AS ENUM('draft', 'issued', 'paid');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('institution_writer', 'institution_approver', 'institution_compliance', 'institution_account_admin', 'abcfinance_writer', 'abcfinance_editor', 'abcfinance_desk_manager', 'abcfinance_super_admin', 'publisher_editor', 'publisher_admin');--> statement-breakpoint
CREATE TYPE "public"."tenant_status" AS ENUM('staging', 'live');--> statement-breakpoint
CREATE TYPE "public"."version_state" AS ENUM('draft', 'in_approval', 'compliance_review', 'editing', 'with_publisher', 'published', 'review_due', 'unpublished');--> statement-breakpoint
CREATE TYPE "public"."widget_mode" AS ENUM('static', 'latest');--> statement-breakpoint
CREATE TYPE "public"."widget_placement" AS ENUM('end', 'sidebar', 'inline');--> statement-breakpoint
CREATE TYPE "public"."widget_stat_placement" AS ENUM('end', 'sidebar', 'inline', 'menu');--> statement-breakpoint
CREATE TABLE "adsense_earnings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"month" date NOT NULL,
	"gross_rupees" integer NOT NULL,
	"entered_by_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "adsense_earnings_tenantId_month_unique" UNIQUE("tenant_id","month"),
	CONSTRAINT "adsense_non_negative" CHECK ("adsense_earnings"."gross_rupees" >= 0)
);
--> statement-breakpoint
CREATE TABLE "article_targets" (
	"article_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	CONSTRAINT "article_targets_article_id_tenant_id_pk" PRIMARY KEY("article_id","tenant_id")
);
--> statement-breakpoint
CREATE TABLE "article_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"article_id" uuid NOT NULL,
	"tenant_id" uuid,
	"language" text NOT NULL,
	"headline" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"state" "version_state" NOT NULL,
	"approval_type" "approval_type",
	"published_at" timestamp with time zone,
	"last_reviewed_at" timestamp with time zone,
	"auto_approve_at" timestamp with time zone,
	"held_at" timestamp with time zone,
	"requires_explicit" boolean DEFAULT false NOT NULL,
	"explicit_reasons" text[] DEFAULT '{}' NOT NULL,
	"rev" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "articles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"type" "article_type" NOT NULL,
	"master_language" text NOT NULL,
	"organisation_id" uuid NOT NULL,
	"author_id" uuid,
	"section_id" uuid NOT NULL,
	"review_by" date NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "articles_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"action" text NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "authors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"user_id" uuid,
	"name" text NOT NULL,
	"credentials" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"bio" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"organisation_id" uuid,
	"contributor_type" "contributor_type" NOT NULL,
	"disclosed_affiliations" text[] DEFAULT '{}' NOT NULL,
	"city" text,
	"licence_type" text,
	"licence_number" text,
	CONSTRAINT "authors_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "calculator_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"calculator_slug" text NOT NULL,
	"rates" jsonb NOT NULL,
	"rates_as_of" date NOT NULL,
	"updated_by_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calculator_rates_organisationId_calculatorSlug_unique" UNIQUE("organisation_id","calculator_slug")
);
--> statement-breakpoint
CREATE TABLE "calculator_uses" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"calculator_slug" text NOT NULL,
	"sponsor_org_id" uuid,
	"date" date NOT NULL,
	"uses" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "calculator_uses_tenantId_calculatorSlug_sponsorOrgId_date_unique" UNIQUE NULLS NOT DISTINCT("tenant_id","calculator_slug","sponsor_org_id","date")
);
--> statement-breakpoint
CREATE TABLE "contracts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"publisher_org_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date,
	"exclusivity_scope" text,
	"right_to_match" boolean DEFAULT false NOT NULL,
	"minimum_guarantee_rupees" integer DEFAULT 0 NOT NULL,
	"tenure_share_steps" jsonb DEFAULT '{"perYearPct":0}'::jsonb NOT NULL,
	"exit_terms" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "disclaimer_templates" (
	"key" text PRIMARY KEY NOT NULL,
	"text" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"to" text NOT NULL,
	"subject" text NOT NULL,
	"body_enc" text NOT NULL,
	"status" "outbox_status" DEFAULT 'queued' NOT NULL,
	"kind" text NOT NULL,
	"created_by_id" uuid,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "glossary_terms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"term" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"definition" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "glossary_terms_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name_hint" text,
	"organisation_id" uuid NOT NULL,
	"roles" "role"[] NOT NULL,
	"token_hash" text NOT NULL,
	"invited_by_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitations_tokenHash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sponsor_org_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"language" text NOT NULL,
	"name_enc" text,
	"phone_enc" text,
	"city_enc" text,
	"phone_hash" text,
	"ip_hash" text,
	"interest_key" text NOT NULL,
	"interest_label" text NOT NULL,
	"consent_text" text NOT NULL,
	"consent_version" text NOT NULL,
	"consent_at" timestamp with time zone NOT NULL,
	"source_page" text NOT NULL,
	"source_version_id" uuid,
	"source_calculator" text,
	"status" "lead_status" DEFAULT 'new' NOT NULL,
	"note" text,
	"contacted_at" timestamp with time zone,
	"delete_after" timestamp with time zone NOT NULL,
	"erased_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"organisation_id" uuid NOT NULL,
	"role" "role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memberships_userId_organisationId_role_unique" UNIQUE("user_id","organisation_id","role")
);
--> statement-breakpoint
CREATE TABLE "organisations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "organisation_type" NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo_url" text,
	"blurb" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"lead_retention_days" integer DEFAULT 365 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organisations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "page_stats" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"version_id" uuid,
	"page_path" text NOT NULL,
	"language" text NOT NULL,
	"kind" text NOT NULL,
	"date" date NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	"engaged_reads" integer DEFAULT 0 NOT NULL,
	"search_views" integer DEFAULT 0 NOT NULL,
	"mobile_views" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "page_stats_tenantId_pagePath_date_unique" UNIQUE("tenant_id","page_path","date")
);
--> statement-breakpoint
CREATE TABLE "page_views" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"page_path" text NOT NULL,
	"version_id" uuid,
	"kind" text NOT NULL,
	"language" text NOT NULL,
	"viewed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"engaged_at" timestamp with time zone,
	"calculators_used" text[] DEFAULT '{}' NOT NULL,
	"visitor_hash" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "password_resets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"requested_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "password_resets_tokenHash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "payouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"pool_share_rupees" integer NOT NULL,
	"tenure_step_pct" integer DEFAULT 0 NOT NULL,
	"adsense_share_rupees" integer NOT NULL,
	"guarantee_advanced_rupees" integer DEFAULT 0 NOT NULL,
	"guarantee_recovered_rupees" integer DEFAULT 0 NOT NULL,
	"payable_rupees" integer NOT NULL,
	"sponsor_breakdown" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "payout_status" DEFAULT 'draft' NOT NULL,
	"issued_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payouts_tenantId_periodStart_unique" UNIQUE("tenant_id","period_start")
);
--> statement-breakpoint
CREATE TABLE "plan_tenants" (
	"plan_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	CONSTRAINT "plan_tenants_plan_id_tenant_id_pk" PRIMARY KEY("plan_id","tenant_id")
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sponsor_org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"price_rupees" integer NOT NULL,
	"billing" "billing" NOT NULL,
	"newspapers_allowed" integer NOT NULL,
	"articles_per_month" integer NOT NULL,
	"rollover_credits" integer DEFAULT 0 NOT NULL,
	"languages" text[] NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"blurb" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"disclaimer_key" text NOT NULL,
	"calculator_slugs" text[] DEFAULT '{}' NOT NULL,
	CONSTRAINT "sections_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"mfa_verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "sessions_tokenHash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "sponsorships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sponsor_org_id" uuid NOT NULL,
	"section_slugs" text[] NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date,
	"exclusive" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"publisher_org_id" uuid NOT NULL,
	"name" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"menu_label" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"main_site_url" text NOT NULL,
	"hosts" text[] NOT NULL,
	"theme" jsonb NOT NULL,
	"languages" text[] NOT NULL,
	"default_language" text NOT NULL,
	"tone_guide" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"auto_approve_hours" integer DEFAULT 24 NOT NULL,
	"held_section_slugs" text[] DEFAULT '{}' NOT NULL,
	"status" "tenant_status" DEFAULT 'staging' NOT NULL,
	"ad_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"widget_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_slug_unique" UNIQUE("slug"),
	CONSTRAINT "tenants_default_language_listed" CHECK ("tenants"."default_language" = ANY("tenants"."languages")),
	CONSTRAINT "tenants_auto_approve_positive" CHECK ("tenants"."auto_approve_hours" > 0)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"password_hash" text NOT NULL,
	"totp_secret_enc" text,
	"totp_enabled" boolean DEFAULT false NOT NULL,
	"totp_last_step" bigint,
	"failed_logins" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"disabled_at" timestamp with time zone,
	"last_sign_in_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_email_lower" CHECK ("users"."email" = lower("users"."email"))
);
--> statement-breakpoint
CREATE TABLE "widget_cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"placement" "widget_placement" NOT NULL,
	"mode" "widget_mode" NOT NULL,
	"section_id" uuid,
	"target_path" text,
	"headline" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"text" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"button" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"keywords" text[] DEFAULT '{}' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "widget_stats" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"date" date NOT NULL,
	"placement" "widget_stat_placement" NOT NULL,
	"card_id" text DEFAULT '' NOT NULL,
	"source_path" text NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "widget_stats_tenantId_date_placement_cardId_sourcePath_unique" UNIQUE("tenant_id","date","placement","card_id","source_path")
);
--> statement-breakpoint
CREATE TABLE "workflow_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"version_id" uuid NOT NULL,
	"from_state" "version_state",
	"to_state" "version_state" NOT NULL,
	"user_id" uuid,
	"actor_label" text,
	"action" text NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "adsense_earnings" ADD CONSTRAINT "adsense_earnings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adsense_earnings" ADD CONSTRAINT "adsense_earnings_entered_by_id_users_id_fk" FOREIGN KEY ("entered_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_targets" ADD CONSTRAINT "article_targets_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_targets" ADD CONSTRAINT "article_targets_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_versions" ADD CONSTRAINT "article_versions_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_versions" ADD CONSTRAINT "article_versions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_author_id_authors_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."authors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "authors" ADD CONSTRAINT "authors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "authors" ADD CONSTRAINT "authors_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calculator_rates" ADD CONSTRAINT "calculator_rates_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calculator_rates" ADD CONSTRAINT "calculator_rates_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calculator_uses" ADD CONSTRAINT "calculator_uses_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calculator_uses" ADD CONSTRAINT "calculator_uses_sponsor_org_id_organisations_id_fk" FOREIGN KEY ("sponsor_org_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_publisher_org_id_organisations_id_fk" FOREIGN KEY ("publisher_org_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_id_users_id_fk" FOREIGN KEY ("invited_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_sponsor_org_id_organisations_id_fk" FOREIGN KEY ("sponsor_org_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_source_version_id_article_versions_id_fk" FOREIGN KEY ("source_version_id") REFERENCES "public"."article_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_stats" ADD CONSTRAINT "page_stats_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_stats" ADD CONSTRAINT "page_stats_version_id_article_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."article_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_views" ADD CONSTRAINT "page_views_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_views" ADD CONSTRAINT "page_views_version_id_article_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."article_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_requested_by_id_users_id_fk" FOREIGN KEY ("requested_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_tenants" ADD CONSTRAINT "plan_tenants_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_tenants" ADD CONSTRAINT "plan_tenants_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_sponsor_org_id_organisations_id_fk" FOREIGN KEY ("sponsor_org_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sections" ADD CONSTRAINT "sections_disclaimer_key_disclaimer_templates_key_fk" FOREIGN KEY ("disclaimer_key") REFERENCES "public"."disclaimer_templates"("key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsorships" ADD CONSTRAINT "sponsorships_sponsor_org_id_organisations_id_fk" FOREIGN KEY ("sponsor_org_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_publisher_org_id_organisations_id_fk" FOREIGN KEY ("publisher_org_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "widget_cards" ADD CONSTRAINT "widget_cards_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "widget_cards" ADD CONSTRAINT "widget_cards_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "widget_stats" ADD CONSTRAINT "widget_stats_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_events" ADD CONSTRAINT "workflow_events_version_id_article_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."article_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_events" ADD CONSTRAINT "workflow_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "article_versions_one_master" ON "article_versions" USING btree ("article_id","language") WHERE "article_versions"."tenant_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "article_versions_one_copy" ON "article_versions" USING btree ("article_id","tenant_id","language") WHERE "article_versions"."tenant_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "article_versions_tenant_id_state_index" ON "article_versions" USING btree ("tenant_id","state");--> statement-breakpoint
CREATE INDEX "article_versions_state_auto_approve_at_index" ON "article_versions" USING btree ("state","auto_approve_at");--> statement-breakpoint
CREATE INDEX "articles_organisation_id_index" ON "articles" USING btree ("organisation_id");--> statement-breakpoint
CREATE INDEX "articles_section_id_index" ON "articles" USING btree ("section_id");--> statement-breakpoint
CREATE INDEX "audit_events_created_at_index" ON "audit_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_events_user_id_index" ON "audit_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "audit_events_action_index" ON "audit_events" USING btree ("action");--> statement-breakpoint
CREATE INDEX "email_outbox_status_created_at_index" ON "email_outbox" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "invitations_email_organisation_id_index" ON "invitations" USING btree ("email","organisation_id");--> statement-breakpoint
CREATE INDEX "leads_sponsor_org_id_created_at_index" ON "leads" USING btree ("sponsor_org_id","created_at");--> statement-breakpoint
CREATE INDEX "leads_phone_hash_index" ON "leads" USING btree ("phone_hash");--> statement-breakpoint
CREATE INDEX "leads_delete_after_index" ON "leads" USING btree ("delete_after");--> statement-breakpoint
CREATE INDEX "memberships_organisation_id_index" ON "memberships" USING btree ("organisation_id");--> statement-breakpoint
CREATE INDEX "page_stats_tenant_id_date_index" ON "page_stats" USING btree ("tenant_id","date");--> statement-breakpoint
CREATE INDEX "page_views_viewed_at_index" ON "page_views" USING btree ("viewed_at");--> statement-breakpoint
CREATE INDEX "password_resets_user_id_index" ON "password_resets" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "rate_limits_window_start_index" ON "rate_limits" USING btree ("window_start");--> statement-breakpoint
CREATE INDEX "sessions_user_id_index" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "tenants_hosts_gin" ON "tenants" USING gin ("hosts");--> statement-breakpoint
CREATE INDEX "widget_cards_tenant_id_placement_index" ON "widget_cards" USING btree ("tenant_id","placement");--> statement-breakpoint
CREATE INDEX "workflow_events_version_id_index" ON "workflow_events" USING btree ("version_id");