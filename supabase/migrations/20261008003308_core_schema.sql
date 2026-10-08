CREATE TYPE "app"."call_kind" AS ENUM('discovery', 'proposal_session');--> statement-breakpoint
CREATE TYPE "app"."core_level" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "app"."core_template_kind" AS ENUM('briefing', 'orbit_grid');--> statement-breakpoint
CREATE TYPE "app"."document_kind" AS ENUM('figma_presentation');--> statement-breakpoint
CREATE TYPE "app"."document_status" AS ENUM('draft', 'with_client');--> statement-breakpoint
CREATE TYPE "app"."evidence_kind" AS ENUM('file', 'link', 'number', 'page');--> statement-breakpoint
CREATE TYPE "app"."finding_owner" AS ENUM('internal', 'aurion');--> statement-breakpoint
CREATE TYPE "app"."orbit_front" AS ENUM('core', 'orbit', 'gravity', 'constellation');--> statement-breakpoint
CREATE TYPE "app"."roadmap_lane" AS ENUM('days_30', 'days_90', 'months_12');--> statement-breakpoint
CREATE TABLE "core_briefing_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"engagement_id" uuid NOT NULL,
	"block_id" text NOT NULL,
	"question_id" text DEFAULT '' NOT NULL,
	"body" text NOT NULL,
	"author_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "core_briefing_notes_slot_key" UNIQUE("engagement_id","block_id","question_id")
);
--> statement-breakpoint
ALTER TABLE "core_briefing_notes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core_engagements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"deal_id" uuid NOT NULL,
	"briefing_template_id" uuid NOT NULL,
	"grid_template_id" uuid NOT NULL,
	"transcript" text,
	"buyer_test_url" text,
	"narrative" text,
	"briefing_shared_at" timestamp with time zone,
	"cross_review_by" uuid,
	"cross_review_at" timestamp with time zone,
	"cross_review_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "core_engagements_deal_id_unique" UNIQUE("deal_id"),
	CONSTRAINT "core_engagements_id_client_id_key" UNIQUE("id","client_id")
);
--> statement-breakpoint
ALTER TABLE "core_engagements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core_findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"engagement_id" uuid NOT NULL,
	"front" "app"."orbit_front" NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"evidence_kind" "app"."evidence_kind",
	"evidence_path" text,
	"evidence_value" text,
	"evidence_note" text,
	"impact" "app"."core_level" NOT NULL,
	"effort" "app"."core_level" NOT NULL,
	"lane" "app"."roadmap_lane" NOT NULL,
	"owner" "app"."finding_owner" NOT NULL,
	"bring_to_call" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"author_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "core_findings_evidence_shape" CHECK (("core_findings"."evidence_kind" is null and "core_findings"."evidence_path" is null and "core_findings"."evidence_value" is null)
        or ("core_findings"."evidence_kind" = 'file' and "core_findings"."evidence_path" is not null)
        or ("core_findings"."evidence_kind" <> 'file' and "core_findings"."evidence_value" is not null))
);
--> statement-breakpoint
ALTER TABLE "core_findings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"engagement_id" uuid NOT NULL,
	"front" "app"."orbit_front" NOT NULL,
	"criterion_id" text NOT NULL,
	"points" integer NOT NULL,
	"justification" text NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "core_scores_criterion_key" UNIQUE("engagement_id","front","criterion_id"),
	CONSTRAINT "core_scores_points_range" CHECK ("core_scores"."points" between 0 and 25)
);
--> statement-breakpoint
ALTER TABLE "core_scores" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"kind" "app"."core_template_kind" NOT NULL,
	"version" integer NOT NULL,
	"definition" jsonb NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"published_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "core_templates_version_key" UNIQUE("organization_id","kind","version")
);
--> statement-breakpoint
ALTER TABLE "core_templates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"deal_id" uuid,
	"kind" "app"."document_kind" NOT NULL,
	"title" text NOT NULL,
	"url" text NOT NULL,
	"status" "app"."document_status" DEFAULT 'draft' NOT NULL,
	"shared_at" timestamp with time zone,
	"author_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "documents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP INDEX "calls_scheduled_per_deal_key";--> statement-breakpoint
ALTER TABLE "calls" ADD COLUMN "kind" "app"."call_kind" DEFAULT 'discovery' NOT NULL;--> statement-breakpoint
ALTER TABLE "core_briefing_notes" ADD CONSTRAINT "core_briefing_notes_author_id_profiles_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core_briefing_notes" ADD CONSTRAINT "core_briefing_notes_engagement_client_fk" FOREIGN KEY ("engagement_id","client_id") REFERENCES "public"."core_engagements"("id","client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core_briefing_notes" ADD CONSTRAINT "core_briefing_notes_client_organization_fk" FOREIGN KEY ("client_id","organization_id") REFERENCES "public"."clients"("id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core_engagements" ADD CONSTRAINT "core_engagements_briefing_template_id_core_templates_id_fk" FOREIGN KEY ("briefing_template_id") REFERENCES "public"."core_templates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core_engagements" ADD CONSTRAINT "core_engagements_grid_template_id_core_templates_id_fk" FOREIGN KEY ("grid_template_id") REFERENCES "public"."core_templates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core_engagements" ADD CONSTRAINT "core_engagements_cross_review_by_profiles_id_fk" FOREIGN KEY ("cross_review_by") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core_engagements" ADD CONSTRAINT "core_engagements_deal_client_fk" FOREIGN KEY ("deal_id","client_id") REFERENCES "public"."deals"("id","client_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core_engagements" ADD CONSTRAINT "core_engagements_client_organization_fk" FOREIGN KEY ("client_id","organization_id") REFERENCES "public"."clients"("id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core_findings" ADD CONSTRAINT "core_findings_author_id_profiles_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core_findings" ADD CONSTRAINT "core_findings_engagement_client_fk" FOREIGN KEY ("engagement_id","client_id") REFERENCES "public"."core_engagements"("id","client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core_findings" ADD CONSTRAINT "core_findings_client_organization_fk" FOREIGN KEY ("client_id","organization_id") REFERENCES "public"."clients"("id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core_scores" ADD CONSTRAINT "core_scores_updated_by_profiles_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core_scores" ADD CONSTRAINT "core_scores_engagement_client_fk" FOREIGN KEY ("engagement_id","client_id") REFERENCES "public"."core_engagements"("id","client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core_scores" ADD CONSTRAINT "core_scores_client_organization_fk" FOREIGN KEY ("client_id","organization_id") REFERENCES "public"."clients"("id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core_templates" ADD CONSTRAINT "core_templates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core_templates" ADD CONSTRAINT "core_templates_published_by_profiles_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_author_id_profiles_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_deal_client_fk" FOREIGN KEY ("deal_id","client_id") REFERENCES "public"."deals"("id","client_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_client_organization_fk" FOREIGN KEY ("client_id","organization_id") REFERENCES "public"."clients"("id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "core_findings_engagement_idx" ON "core_findings" USING btree ("engagement_id","front");--> statement-breakpoint
CREATE UNIQUE INDEX "core_templates_active_key" ON "core_templates" USING btree ("organization_id","kind") WHERE "core_templates"."is_active";--> statement-breakpoint
CREATE INDEX "documents_client_status_idx" ON "documents" USING btree ("client_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "calls_scheduled_per_deal_kind_key" ON "calls" USING btree ("deal_id","kind") WHERE "calls"."status" = 'scheduled';