CREATE TABLE "client_onboarding_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"engagement_id" uuid NOT NULL,
	"request_id" text NOT NULL,
	"response" text DEFAULT '' NOT NULL,
	"responded_by" uuid,
	"completed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_onboarding_responses_request_key" UNIQUE("engagement_id","request_id")
);
--> statement-breakpoint
ALTER TABLE "client_onboarding_responses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "core_briefing_notes" ADD COLUMN "answer" text;--> statement-breakpoint
ALTER TABLE "library_folders" ADD COLUMN "client_uploads" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "client_onboarding_responses" ADD CONSTRAINT "client_onboarding_responses_responded_by_profiles_id_fk" FOREIGN KEY ("responded_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_onboarding_responses" ADD CONSTRAINT "client_onboarding_responses_engagement_client_fk" FOREIGN KEY ("engagement_id","client_id") REFERENCES "public"."core_engagements"("id","client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_onboarding_responses" ADD CONSTRAINT "client_onboarding_responses_client_organization_fk" FOREIGN KEY ("client_id","organization_id") REFERENCES "public"."clients"("id","organization_id") ON DELETE restrict ON UPDATE no action;