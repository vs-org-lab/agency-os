CREATE TYPE "app"."milestone_trigger" AS ENUM('signature', 'phase_approval', 'delivery');--> statement-breakpoint
ALTER TYPE "app"."approval_subject" ADD VALUE 'project';--> statement-breakpoint
ALTER TYPE "app"."project_status" ADD VALUE 'delivered' BEFORE 'cancelled';--> statement-breakpoint
ALTER TYPE "app"."update_kind" ADD VALUE 'project_delivered';--> statement-breakpoint
CREATE TABLE "testimonials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"author_id" uuid,
	"body" text NOT NULL,
	"author_name" text NOT NULL,
	"author_role" text NOT NULL,
	"consent_publish" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "testimonials_project_key" UNIQUE("project_id"),
	CONSTRAINT "testimonials_body_length" CHECK (char_length("testimonials"."body") between 1 and 1000),
	CONSTRAINT "testimonials_author_name_length" CHECK (char_length("testimonials"."author_name") between 1 and 120),
	CONSTRAINT "testimonials_author_role_length" CHECK (char_length("testimonials"."author_role") between 0 and 120)
);
--> statement-breakpoint
ALTER TABLE "testimonials" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "billing_milestones" ADD COLUMN "trigger" "app"."milestone_trigger";--> statement-breakpoint
-- Existing plans: the first milestone at signature, the last of several at delivery, the rest on
-- phase approvals (spec 2D.2, decision 1).
UPDATE "billing_milestones" m SET "trigger" = CASE
  WHEN m."position" = 1 THEN 'signature'::"app"."milestone_trigger"
  WHEN m."position" = (
    SELECT max(other."position") FROM "billing_milestones" other WHERE other."contract_id" = m."contract_id"
  ) THEN 'delivery'::"app"."milestone_trigger"
  ELSE 'phase_approval'::"app"."milestone_trigger"
END;--> statement-breakpoint
ALTER TABLE "billing_milestones" ALTER COLUMN "trigger" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "billing_milestones" ADD COLUMN "phase_id" uuid;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "delivered_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "testimonials" ADD CONSTRAINT "testimonials_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "testimonials" ADD CONSTRAINT "testimonials_author_id_profiles_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "testimonials" ADD CONSTRAINT "testimonials_client_organization_fk" FOREIGN KEY ("client_id","organization_id") REFERENCES "public"."clients"("id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "testimonials" ADD CONSTRAINT "testimonials_project_client_fk" FOREIGN KEY ("project_id","client_id") REFERENCES "public"."projects"("id","client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_milestones" ADD CONSTRAINT "billing_milestones_phase_client_fk" FOREIGN KEY ("phase_id","client_id") REFERENCES "public"."project_phases"("id","client_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_milestones" ADD CONSTRAINT "billing_milestones_phase_only_on_phase_approval" CHECK ("billing_milestones"."phase_id" is null or "billing_milestones"."trigger" = 'phase_approval');