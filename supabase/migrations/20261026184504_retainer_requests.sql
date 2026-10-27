ALTER TYPE "app"."seen_area" ADD VALUE 'portal_onboarding';--> statement-breakpoint
CREATE TABLE "retainer_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"retainer_id" uuid NOT NULL,
	"task_id" uuid,
	"description" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "retainer_requests_description_length" CHECK (char_length("retainer_requests"."description") between 1 and 2000)
);
--> statement-breakpoint
ALTER TABLE "retainer_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "retainer_requests" ADD CONSTRAINT "retainer_requests_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retainer_requests" ADD CONSTRAINT "retainer_requests_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retainer_requests" ADD CONSTRAINT "retainer_requests_retainer_client_fk" FOREIGN KEY ("retainer_id","client_id") REFERENCES "public"."retainers"("id","client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "retainer_requests_client_idx" ON "retainer_requests" USING btree ("client_id","created_at");