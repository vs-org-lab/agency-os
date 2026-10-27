CREATE TYPE "app"."testimonial_video_status" AS ENUM('pending', 'ready');--> statement-breakpoint
CREATE TYPE "app"."voice_note_status" AS ENUM('pending', 'uploaded', 'transcribed', 'failed');--> statement-breakpoint
CREATE TYPE "app"."voice_note_target" AS ENUM('proof_comment', 'approval_change_request');--> statement-breakpoint
CREATE TABLE "voice_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"target_kind" "app"."voice_note_target" NOT NULL,
	"target_id" uuid NOT NULL,
	"author_id" uuid,
	"path" text NOT NULL,
	"content_type" text NOT NULL,
	"duration_seconds" integer NOT NULL,
	"status" "app"."voice_note_status" DEFAULT 'pending' NOT NULL,
	"transcript" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "voice_notes_duration" CHECK ("voice_notes"."duration_seconds" between 1 and 180),
	CONSTRAINT "voice_notes_content_type" CHECK ("voice_notes"."content_type" in ('audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg'))
);
--> statement-breakpoint
ALTER TABLE "voice_notes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "testimonials" DROP CONSTRAINT "testimonials_body_length";--> statement-breakpoint
ALTER TABLE "testimonials" ADD COLUMN "video_path" text;--> statement-breakpoint
ALTER TABLE "testimonials" ADD COLUMN "video_content_type" text;--> statement-breakpoint
ALTER TABLE "testimonials" ADD COLUMN "video_duration_seconds" integer;--> statement-breakpoint
ALTER TABLE "testimonials" ADD COLUMN "chapters" jsonb;--> statement-breakpoint
ALTER TABLE "testimonials" ADD COLUMN "video_status" "app"."testimonial_video_status";--> statement-breakpoint
ALTER TABLE "voice_notes" ADD CONSTRAINT "voice_notes_author_id_profiles_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_notes" ADD CONSTRAINT "voice_notes_project_client_fk" FOREIGN KEY ("project_id","client_id") REFERENCES "public"."projects"("id","client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_notes" ADD CONSTRAINT "voice_notes_client_organization_fk" FOREIGN KEY ("client_id","organization_id") REFERENCES "public"."clients"("id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "voice_notes_target_idx" ON "voice_notes" USING btree ("target_kind","target_id");--> statement-breakpoint
CREATE INDEX "voice_notes_project_idx" ON "voice_notes" USING btree ("project_id","created_at");--> statement-breakpoint
ALTER TABLE "testimonials" ADD CONSTRAINT "testimonials_video_columns" CHECK (("testimonials"."video_status" is null) = ("testimonials"."video_path" is null)
        and ("testimonials"."video_duration_seconds" is null or "testimonials"."video_duration_seconds" between 1 and 300));--> statement-breakpoint
ALTER TABLE "testimonials" ADD CONSTRAINT "testimonials_body_length" CHECK (char_length("testimonials"."body") between 1 and 1000
        or ("testimonials"."video_status" is not null and char_length("testimonials"."body") <= 1000));