CREATE TYPE "app"."agenda_event_kind" AS ENUM('kickoff', 'meeting', 'review', 'internal');--> statement-breakpoint
CREATE TYPE "app"."agenda_event_status" AS ENUM('scheduled', 'cancelled');--> statement-breakpoint
CREATE TABLE "agenda_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid,
	"project_id" uuid,
	"kind" "app"."agenda_event_kind" NOT NULL,
	"title" text NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"location" text DEFAULT '' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"invite_client" boolean DEFAULT false NOT NULL,
	"status" "app"."agenda_event_status" DEFAULT 'scheduled' NOT NULL,
	"sync_status" "app"."call_sync_status" DEFAULT 'pending' NOT NULL,
	"external_event_id" text,
	"meet_url" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agenda_events_client_by_kind" CHECK (("agenda_events"."kind" = 'internal') = ("agenda_events"."client_id" is null)),
	CONSTRAINT "agenda_events_kickoff_project" CHECK ("agenda_events"."kind" <> 'kickoff' or "agenda_events"."project_id" is not null),
	CONSTRAINT "agenda_events_duration" CHECK ("agenda_events"."ends_at" > "agenda_events"."starts_at" and "agenda_events"."ends_at" <= "agenda_events"."starts_at" + interval '12 hours'),
	CONSTRAINT "agenda_events_title_length" CHECK (char_length("agenda_events"."title") between 1 and 120),
	CONSTRAINT "agenda_events_notes_length" CHECK (char_length("agenda_events"."notes") <= 2000),
	CONSTRAINT "agenda_events_location_length" CHECK (char_length("agenda_events"."location") <= 500)
);
--> statement-breakpoint
ALTER TABLE "agenda_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "agenda_events" ADD CONSTRAINT "agenda_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda_events" ADD CONSTRAINT "agenda_events_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda_events" ADD CONSTRAINT "agenda_events_client_organization_fk" FOREIGN KEY ("client_id","organization_id") REFERENCES "public"."clients"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda_events" ADD CONSTRAINT "agenda_events_project_client_fk" FOREIGN KEY ("project_id","client_id") REFERENCES "public"."projects"("id","client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agenda_events_organization_starts_idx" ON "agenda_events" USING btree ("organization_id","starts_at");