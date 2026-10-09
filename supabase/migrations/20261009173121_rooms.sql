CREATE TYPE "app"."approval_status" AS ENUM('pending', 'approved', 'changes_requested', 'withdrawn');--> statement-breakpoint
CREATE TYPE "app"."approval_subject" AS ENUM('phase');--> statement-breakpoint
CREATE TYPE "app"."phase_status" AS ENUM('pending', 'in_progress', 'awaiting_approval', 'done');--> statement-breakpoint
CREATE TYPE "app"."project_status" AS ENUM('active', 'paused', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "app"."step_status" AS ENUM('todo', 'in_progress', 'done');--> statement-breakpoint
CREATE TYPE "app"."update_kind" AS ENUM('manual', 'project_started', 'step_shared', 'phase_done', 'approval_decided');--> statement-breakpoint
CREATE TYPE "app"."update_visibility" AS ENUM('internal', 'client');--> statement-breakpoint
CREATE TABLE "approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"subject_type" "app"."approval_subject" NOT NULL,
	"subject_id" uuid NOT NULL,
	"status" "app"."approval_status" DEFAULT 'pending' NOT NULL,
	"requested_by" uuid,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"comment" text,
	"reminded_at" timestamp with time zone,
	"alerted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "approvals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "process_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"version" integer NOT NULL,
	"definition" jsonb NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"published_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "process_templates_version_key" UNIQUE("organization_id","key","version"),
	CONSTRAINT "process_templates_key_shape" CHECK ("process_templates"."key" ~ '^[a-z0-9][a-z0-9-]{0,39}$')
);
--> statement-breakpoint
ALTER TABLE "process_templates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "project_phases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"name" text NOT NULL,
	"requires_approval" boolean DEFAULT false NOT NULL,
	"code_on_start" "app"."pipeline_code",
	"code_on_done" "app"."pipeline_code",
	"status" "app"."phase_status" DEFAULT 'pending' NOT NULL,
	"due_on" date,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_phases_position_key" UNIQUE("project_id","position"),
	CONSTRAINT "project_phases_id_client_id_key" UNIQUE("id","client_id")
);
--> statement-breakpoint
ALTER TABLE "project_phases" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "project_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"phase_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"name" text NOT NULL,
	"status" "app"."step_status" DEFAULT 'todo' NOT NULL,
	"assignee_id" uuid,
	"due_on" date,
	"visible_to_client" boolean DEFAULT false NOT NULL,
	"chained" boolean DEFAULT false NOT NULL,
	"shared_at" timestamp with time zone,
	"reopened_after_shared" boolean DEFAULT false NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_steps_position_key" UNIQUE("phase_id","position")
);
--> statement-breakpoint
ALTER TABLE "project_steps" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "project_updates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"author_id" uuid,
	"kind" "app"."update_kind" DEFAULT 'manual' NOT NULL,
	"body" text NOT NULL,
	"milestone" text,
	"visibility" "app"."update_visibility" DEFAULT 'internal' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_updates_body_length" CHECK (char_length("project_updates"."body") between 1 and 5000)
);
--> statement-breakpoint
ALTER TABLE "project_updates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"deal_id" uuid,
	"name" text NOT NULL,
	"status" "app"."project_status" DEFAULT 'active' NOT NULL,
	"template_key" text NOT NULL,
	"template_version" integer NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_id_client_id_key" UNIQUE("id","client_id")
);
--> statement-breakpoint
ALTER TABLE "projects" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_requested_by_profiles_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_decided_by_profiles_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_project_client_fk" FOREIGN KEY ("project_id","client_id") REFERENCES "public"."projects"("id","client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_client_organization_fk" FOREIGN KEY ("client_id","organization_id") REFERENCES "public"."clients"("id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "process_templates" ADD CONSTRAINT "process_templates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "process_templates" ADD CONSTRAINT "process_templates_published_by_profiles_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_phases" ADD CONSTRAINT "project_phases_project_client_fk" FOREIGN KEY ("project_id","client_id") REFERENCES "public"."projects"("id","client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_phases" ADD CONSTRAINT "project_phases_client_organization_fk" FOREIGN KEY ("client_id","organization_id") REFERENCES "public"."clients"("id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_steps" ADD CONSTRAINT "project_steps_assignee_id_profiles_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_steps" ADD CONSTRAINT "project_steps_phase_client_fk" FOREIGN KEY ("phase_id","client_id") REFERENCES "public"."project_phases"("id","client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_steps" ADD CONSTRAINT "project_steps_client_organization_fk" FOREIGN KEY ("client_id","organization_id") REFERENCES "public"."clients"("id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_updates" ADD CONSTRAINT "project_updates_author_id_profiles_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_updates" ADD CONSTRAINT "project_updates_project_client_fk" FOREIGN KEY ("project_id","client_id") REFERENCES "public"."projects"("id","client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_updates" ADD CONSTRAINT "project_updates_client_organization_fk" FOREIGN KEY ("client_id","organization_id") REFERENCES "public"."clients"("id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_client_organization_fk" FOREIGN KEY ("client_id","organization_id") REFERENCES "public"."clients"("id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_deal_client_fk" FOREIGN KEY ("deal_id","client_id") REFERENCES "public"."deals"("id","client_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "approvals_pending_per_subject_key" ON "approvals" USING btree ("subject_type","subject_id") WHERE "approvals"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "approvals_project_idx" ON "approvals" USING btree ("project_id","requested_at");--> statement-breakpoint
CREATE UNIQUE INDEX "process_templates_active_key" ON "process_templates" USING btree ("organization_id","key") WHERE "process_templates"."is_active";--> statement-breakpoint
CREATE UNIQUE INDEX "process_templates_default_key" ON "process_templates" USING btree ("organization_id") WHERE "process_templates"."is_active" and "process_templates"."is_default";--> statement-breakpoint
CREATE INDEX "project_steps_project_idx" ON "project_steps" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_steps_assignee_idx" ON "project_steps" USING btree ("assignee_id");--> statement-breakpoint
CREATE INDEX "project_updates_project_idx" ON "project_updates" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "projects_deal_key" ON "projects" USING btree ("deal_id") WHERE "projects"."deal_id" is not null;--> statement-breakpoint
CREATE INDEX "projects_client_idx" ON "projects" USING btree ("client_id","created_at");