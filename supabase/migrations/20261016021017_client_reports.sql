CREATE TYPE "app"."client_report_kind" AS ENUM('monthly', 'qbr');--> statement-breakpoint
CREATE TYPE "app"."client_report_status" AS ENUM('draft', 'shared');--> statement-breakpoint
CREATE TABLE "client_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"kind" "app"."client_report_kind" NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"status" "app"."client_report_status" DEFAULT 'draft' NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"highlights" text DEFAULT '' NOT NULL,
	"next_steps" text DEFAULT '' NOT NULL,
	"priorities" text DEFAULT '' NOT NULL,
	"data" jsonb,
	"document_id" uuid,
	"created_by" uuid,
	"shared_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_reports_client_period_key" UNIQUE("client_id","kind","period_start"),
	CONSTRAINT "client_reports_period" CHECK (extract(day from "client_reports"."period_start") = 1 and "client_reports"."period_end" = case "client_reports"."kind"
        when 'monthly' then ("client_reports"."period_start" + interval '1 month' - interval '1 day')::date
        else ("client_reports"."period_start" + interval '3 months' - interval '1 day')::date end
        and ("client_reports"."kind" = 'monthly' or extract(month from "client_reports"."period_start") in (1, 4, 7, 10))),
	CONSTRAINT "client_reports_texts_length" CHECK (char_length("client_reports"."summary") <= 2000 and char_length("client_reports"."highlights") <= 2000
        and char_length("client_reports"."next_steps") <= 2000 and char_length("client_reports"."priorities") <= 2000),
	CONSTRAINT "client_reports_priorities_qbr" CHECK ("client_reports"."kind" = 'qbr' or "client_reports"."priorities" = ''),
	CONSTRAINT "client_reports_shared_complete" CHECK ("client_reports"."status" = 'draft' or ("client_reports"."shared_at" is not null and "client_reports"."data" is not null))
);
--> statement-breakpoint
ALTER TABLE "client_reports" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "client_reports" ADD CONSTRAINT "client_reports_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_reports" ADD CONSTRAINT "client_reports_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_reports" ADD CONSTRAINT "client_reports_client_organization_fk" FOREIGN KEY ("client_id","organization_id") REFERENCES "public"."clients"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_reports" ADD CONSTRAINT "client_reports_project_client_fk" FOREIGN KEY ("project_id","client_id") REFERENCES "public"."projects"("id","client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "client_reports_project_idx" ON "client_reports" USING btree ("project_id");--> statement-breakpoint
-- Removing the room document clears the link and keeps the report, which can be shared again.
ALTER TABLE "client_reports" ADD CONSTRAINT "client_reports_document_fk" FOREIGN KEY ("document_id","project_id") REFERENCES "public"."project_documents"("id","project_id") ON DELETE SET NULL ("document_id") ON UPDATE no action;--> statement-breakpoint
revoke all on table public.client_reports from anon, authenticated, service_role;--> statement-breakpoint
grant select on table public.client_reports to authenticated;--> statement-breakpoint
alter table public.client_reports force row level security;--> statement-breakpoint
-- The client sees the shared PDF through the room documents, never the report rows.
create policy client_reports_select on public.client_reports
  for select to authenticated
  using (app.can_read_rooms(organization_id, client_id));
