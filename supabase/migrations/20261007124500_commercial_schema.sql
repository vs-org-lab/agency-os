CREATE TYPE "app"."acquisition_status" AS ENUM('to_contact', 'contacted', 'replied', 'converted', 'discarded');--> statement-breakpoint
CREATE TYPE "app"."application_path" AS ENUM('a', 'b', 'c');--> statement-breakpoint
CREATE TYPE "app"."calendar_connection_status" AS ENUM('active', 'revoked', 'error');--> statement-breakpoint
CREATE TYPE "app"."call_outcome" AS ENUM('advance', 'decline', 'follow_up');--> statement-breakpoint
CREATE TYPE "app"."call_status" AS ENUM('scheduled', 'cancelled', 'completed', 'no_show');--> statement-breakpoint
CREATE TYPE "app"."call_sync_status" AS ENUM('pending', 'synced', 'failed');--> statement-breakpoint
CREATE TYPE "app"."client_lifecycle" AS ENUM('prospect', 'active', 'former');--> statement-breakpoint
CREATE TYPE "app"."deal_source" AS ENUM('application', 'acquisition', 'referral', 'client_request');--> statement-breakpoint
CREATE TYPE "app"."follow_up_status" AS ENUM('open', 'done', 'dismissed');--> statement-breakpoint
CREATE TYPE "app"."message_template_kind" AS ENUM('follow_up', 'acquisition', 'email');--> statement-breakpoint
CREATE TYPE "app"."next_step_owner_kind" AS ENUM('staff', 'client');--> statement-breakpoint
CREATE TYPE "app"."pipeline_code" AS ENUM('0.1', '0.2', '0.3', '0.4', '1.1', '1.2', '1.3', '1.4', '1.5', '1.6', '2.1', '2.2', '2.3', '2.4', '2.5', '2.6', '2.7', '2.8', '2.9', '2.10', '3.1', '3.2', '3.3', '3.4', '3.5', '3.6', '4.1', '4.2', '4.3', '4.4', 'X.1', 'X.2', 'X.3', 'X.4');--> statement-breakpoint
CREATE TYPE "app"."throttle_kind" AS ENUM('application_ip', 'application_email', 'booking_ip');--> statement-breakpoint
CREATE TYPE "app"."timeline_kind" AS ENUM('application_submitted', 'application_reviewed', 'stage_changed', 'call_booked', 'call_rescheduled', 'call_cancelled', 'call_completed', 'follow_up_created', 'follow_up_completed');--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"full_name" text NOT NULL,
	"email" text,
	"phone" text,
	"job_title" text,
	"role" "app"."client_role" NOT NULL,
	"portal_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "contacts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"deal_id" uuid NOT NULL,
	"contact_id" uuid,
	"host_user_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"lead_time_zone" text,
	"status" "app"."call_status" DEFAULT 'scheduled' NOT NULL,
	"sync_status" "app"."call_sync_status" DEFAULT 'pending' NOT NULL,
	"external_event_id" text,
	"meet_url" text,
	"outcome" "app"."call_outcome",
	"outcome_reason" text,
	"notes" text,
	"manage_token_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calls_manage_token_hash_unique" UNIQUE("manage_token_hash"),
	CONSTRAINT "calls_id_client_id_key" UNIQUE("id","client_id"),
	CONSTRAINT "calls_ends_after_start" CHECK ("calls"."ends_at" > "calls"."starts_at")
);
--> statement-breakpoint
ALTER TABLE "calls" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "deal_stage_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"deal_id" uuid NOT NULL,
	"from_code" "app"."pipeline_code",
	"to_code" "app"."pipeline_code" NOT NULL,
	"reason" text,
	"actor_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "deal_stage_changes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "deals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"title" text NOT NULL,
	"pipeline_code" "app"."pipeline_code" DEFAULT '0.1' NOT NULL,
	"next_step" text,
	"next_step_owner_kind" "app"."next_step_owner_kind",
	"next_step_owner_user_id" uuid,
	"next_step_due_on" date,
	"estimated_value" numeric(12, 2),
	"currency" "app"."currency" DEFAULT 'EUR' NOT NULL,
	"source" "app"."deal_source" NOT NULL,
	"lost_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "deals_id_client_id_key" UNIQUE("id","client_id")
);
--> statement-breakpoint
ALTER TABLE "deals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "follow_ups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"deal_id" uuid NOT NULL,
	"call_id" uuid NOT NULL,
	"due_on" date NOT NULL,
	"sequence_day" integer NOT NULL,
	"suggested_message" text NOT NULL,
	"status" "app"."follow_up_status" DEFAULT 'open' NOT NULL,
	"assigned_to" uuid,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "follow_ups_deal_call_day_key" UNIQUE("deal_id","call_id","sequence_day"),
	CONSTRAINT "follow_ups_sequence_day" CHECK ("follow_ups"."sequence_day" in (3, 7, 14, 30))
);
--> statement-breakpoint
ALTER TABLE "follow_ups" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "timeline_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"deal_id" uuid,
	"kind" "app"."timeline_kind" NOT NULL,
	"summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"item_type" text,
	"item_id" uuid,
	"actor_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "timeline_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "application_forms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"definition" jsonb NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "application_forms_organization_version_key" UNIQUE("organization_id","version")
);
--> statement-breakpoint
ALTER TABLE "application_forms" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"deal_id" uuid NOT NULL,
	"form_id" uuid NOT NULL,
	"answers" jsonb NOT NULL,
	"score" integer NOT NULL,
	"path" "app"."application_path" NOT NULL,
	"knockouts" text[] DEFAULT '{}'::text[] NOT NULL,
	"source" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"consent_at" timestamp with time zone NOT NULL,
	"consent_text_version" text NOT NULL,
	"review_decision" "app"."application_path",
	"reviewed_at" timestamp with time zone,
	"reviewed_by" uuid,
	"anonymized_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "applications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "submission_throttle" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"kind" "app"."throttle_kind" NOT NULL,
	"key_hash" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "submission_throttle_window_key" UNIQUE("organization_id","kind","key_hash","window_start")
);
--> statement-breakpoint
ALTER TABLE "submission_throttle" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "acquisition_targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"company_name" text NOT NULL,
	"sector" text NOT NULL,
	"website" text,
	"notes" text,
	"status" "app"."acquisition_status" DEFAULT 'to_contact' NOT NULL,
	"converted_client_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "acquisition_targets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "calendar_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text DEFAULT 'google' NOT NULL,
	"account_email" text NOT NULL,
	"calendar_id" text DEFAULT 'primary' NOT NULL,
	"vault_secret_id" uuid,
	"status" "app"."calendar_connection_status" DEFAULT 'active' NOT NULL,
	"last_checked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calendar_connections_user_provider_key" UNIQUE("user_id","provider")
);
--> statement-breakpoint
ALTER TABLE "calendar_connections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "captured_emails" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"recipient" text NOT NULL,
	"template" text NOT NULL,
	"subject" text NOT NULL,
	"html" text NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "captured_emails" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "commercial_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"time_zone" text DEFAULT 'Europe/Lisbon' NOT NULL,
	"weekly_hours" jsonb DEFAULT '{"mon":[{"start":"10:00","end":"18:00"}],"tue":[{"start":"10:00","end":"18:00"}],"wed":[{"start":"10:00","end":"18:00"}],"thu":[{"start":"10:00","end":"18:00"}],"fri":[{"start":"10:00","end":"18:00"}],"sat":[],"sun":[]}'::jsonb NOT NULL,
	"duration_minutes" integer DEFAULT 45 NOT NULL,
	"buffer_minutes" integer DEFAULT 15 NOT NULL,
	"minimum_notice_hours" integer DEFAULT 24 NOT NULL,
	"horizon_days" integer DEFAULT 14 NOT NULL,
	"host_user_id" uuid,
	"self_diagnosis_url" text,
	"anonymize_after_months" integer DEFAULT 12 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "commercial_settings_organization_id_unique" UNIQUE("organization_id"),
	CONSTRAINT "commercial_settings_duration" CHECK ("commercial_settings"."duration_minutes" between 15 and 120),
	CONSTRAINT "commercial_settings_buffer" CHECK ("commercial_settings"."buffer_minutes" between 0 and 60),
	CONSTRAINT "commercial_settings_notice" CHECK ("commercial_settings"."minimum_notice_hours" between 0 and 168),
	CONSTRAINT "commercial_settings_horizon" CHECK ("commercial_settings"."horizon_days" between 1 and 60),
	CONSTRAINT "commercial_settings_retention" CHECK ("commercial_settings"."anonymize_after_months" between 1 and 60)
);
--> statement-breakpoint
ALTER TABLE "commercial_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "message_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"kind" "app"."message_template_kind" NOT NULL,
	"sector" text,
	"sequence_day" integer,
	"locale" "app"."locale" NOT NULL,
	"name" text NOT NULL,
	"subject" text,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "message_templates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "website" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "revenue_band" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "lifecycle" "app"."client_lifecycle" DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_portal_user_id_profiles_id_fk" FOREIGN KEY ("portal_user_id") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_client_organization_fk" FOREIGN KEY ("client_id","organization_id") REFERENCES "public"."clients"("id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_host_user_id_profiles_id_fk" FOREIGN KEY ("host_user_id") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_deal_client_fk" FOREIGN KEY ("deal_id","client_id") REFERENCES "public"."deals"("id","client_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_client_organization_fk" FOREIGN KEY ("client_id","organization_id") REFERENCES "public"."clients"("id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_stage_changes" ADD CONSTRAINT "deal_stage_changes_deal_client_fk" FOREIGN KEY ("deal_id","client_id") REFERENCES "public"."deals"("id","client_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_stage_changes" ADD CONSTRAINT "deal_stage_changes_client_organization_fk" FOREIGN KEY ("client_id","organization_id") REFERENCES "public"."clients"("id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_next_step_owner_user_id_profiles_id_fk" FOREIGN KEY ("next_step_owner_user_id") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_client_organization_fk" FOREIGN KEY ("client_id","organization_id") REFERENCES "public"."clients"("id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_assigned_to_profiles_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_deal_client_fk" FOREIGN KEY ("deal_id","client_id") REFERENCES "public"."deals"("id","client_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_call_client_fk" FOREIGN KEY ("call_id","client_id") REFERENCES "public"."calls"("id","client_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_client_organization_fk" FOREIGN KEY ("client_id","organization_id") REFERENCES "public"."clients"("id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timeline_entries" ADD CONSTRAINT "timeline_entries_client_organization_fk" FOREIGN KEY ("client_id","organization_id") REFERENCES "public"."clients"("id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timeline_entries" ADD CONSTRAINT "timeline_entries_deal_client_fk" FOREIGN KEY ("deal_id","client_id") REFERENCES "public"."deals"("id","client_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_forms" ADD CONSTRAINT "application_forms_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_forms" ADD CONSTRAINT "application_forms_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_form_id_application_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."application_forms"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_reviewed_by_profiles_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_client_organization_fk" FOREIGN KEY ("client_id","organization_id") REFERENCES "public"."clients"("id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_deal_client_fk" FOREIGN KEY ("deal_id","client_id") REFERENCES "public"."deals"("id","client_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_throttle" ADD CONSTRAINT "submission_throttle_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acquisition_targets" ADD CONSTRAINT "acquisition_targets_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acquisition_targets" ADD CONSTRAINT "acquisition_targets_converted_client_id_clients_id_fk" FOREIGN KEY ("converted_client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_connections" ADD CONSTRAINT "calendar_connections_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_connections" ADD CONSTRAINT "calendar_connections_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "captured_emails" ADD CONSTRAINT "captured_emails_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_settings" ADD CONSTRAINT "commercial_settings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_settings" ADD CONSTRAINT "commercial_settings_host_user_id_profiles_id_fk" FOREIGN KEY ("host_user_id") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_templates" ADD CONSTRAINT "message_templates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_client_email_key" ON "contacts" USING btree ("client_id",lower("email")) WHERE "contacts"."email" is not null;--> statement-breakpoint
CREATE INDEX "contacts_organization_email_idx" ON "contacts" USING btree ("organization_id",lower("email"));--> statement-breakpoint
CREATE UNIQUE INDEX "calls_scheduled_per_deal_key" ON "calls" USING btree ("deal_id") WHERE "calls"."status" = 'scheduled';--> statement-breakpoint
CREATE INDEX "calls_host_starts_idx" ON "calls" USING btree ("host_user_id","starts_at");--> statement-breakpoint
CREATE INDEX "deal_stage_changes_deal_created_idx" ON "deal_stage_changes" USING btree ("deal_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "deals_open_per_client_key" ON "deals" USING btree ("client_id") WHERE "deals"."pipeline_code" not in ('X.3', 'X.4') and "deals"."archived_at" is null;--> statement-breakpoint
CREATE INDEX "deals_organization_code_idx" ON "deals" USING btree ("organization_id","pipeline_code");--> statement-breakpoint
CREATE INDEX "follow_ups_status_due_idx" ON "follow_ups" USING btree ("status","due_on");--> statement-breakpoint
CREATE INDEX "timeline_entries_deal_created_idx" ON "timeline_entries" USING btree ("deal_id","created_at");--> statement-breakpoint
CREATE INDEX "timeline_entries_client_created_idx" ON "timeline_entries" USING btree ("client_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "application_forms_active_key" ON "application_forms" USING btree ("organization_id") WHERE "application_forms"."is_active";--> statement-breakpoint
CREATE INDEX "applications_organization_created_idx" ON "applications" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "applications_deal_id_idx" ON "applications" USING btree ("deal_id");--> statement-breakpoint
CREATE INDEX "acquisition_targets_organization_sector_idx" ON "acquisition_targets" USING btree ("organization_id","sector");--> statement-breakpoint
CREATE INDEX "message_templates_organization_kind_idx" ON "message_templates" USING btree ("organization_id","kind");