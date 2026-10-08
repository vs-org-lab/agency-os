CREATE TYPE "app"."recording_source" AS ENUM('call', 'upload');--> statement-breakpoint
CREATE TYPE "app"."recording_status" AS ENUM('pending_upload', 'uploaded', 'transcribing', 'done', 'failed');--> statement-breakpoint
CREATE TABLE "core_recordings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"engagement_id" uuid NOT NULL,
	"source" "app"."recording_source" NOT NULL,
	"status" "app"."recording_status" DEFAULT 'pending_upload' NOT NULL,
	"client_track_path" text NOT NULL,
	"studio_track_path" text,
	"language" text NOT NULL,
	"consent_by" uuid NOT NULL,
	"consent_at" timestamp with time zone NOT NULL,
	"error" text,
	"transcribed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "core_recordings_language" CHECK ("core_recordings"."language" in ('pt', 'en')),
	CONSTRAINT "core_recordings_tracks" CHECK (("core_recordings"."source" = 'call' and "core_recordings"."studio_track_path" is not null)
        or ("core_recordings"."source" = 'upload' and "core_recordings"."studio_track_path" is null))
);
--> statement-breakpoint
ALTER TABLE "core_recordings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "core_recordings" ADD CONSTRAINT "core_recordings_consent_by_profiles_id_fk" FOREIGN KEY ("consent_by") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core_recordings" ADD CONSTRAINT "core_recordings_engagement_client_fk" FOREIGN KEY ("engagement_id","client_id") REFERENCES "public"."core_engagements"("id","client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core_recordings" ADD CONSTRAINT "core_recordings_client_organization_fk" FOREIGN KEY ("client_id","organization_id") REFERENCES "public"."clients"("id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "core_recordings_engagement_idx" ON "core_recordings" USING btree ("engagement_id","created_at");--> statement-breakpoint
CREATE INDEX "core_recordings_status_idx" ON "core_recordings" USING btree ("status","created_at");