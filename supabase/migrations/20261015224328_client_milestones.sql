CREATE TYPE "app"."client_milestone_kind" AS ENUM('renewal_anniversary');--> statement-breakpoint
CREATE TABLE "client_milestones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"kind" "app"."client_milestone_kind" NOT NULL,
	"year" integer NOT NULL,
	"task_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_milestones_client_kind_year_key" UNIQUE("client_id","kind","year"),
	CONSTRAINT "client_milestones_year_positive" CHECK ("client_milestones"."year" >= 1)
);
--> statement-breakpoint
ALTER TABLE "client_milestones" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "client_milestones" ADD CONSTRAINT "client_milestones_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_milestones" ADD CONSTRAINT "client_milestones_client_organization_fk" FOREIGN KEY ("client_id","organization_id") REFERENCES "public"."clients"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
revoke all on table public.client_milestones from anon, authenticated, service_role;--> statement-breakpoint
grant select on table public.client_milestones to authenticated;--> statement-breakpoint
alter table public.client_milestones force row level security;--> statement-breakpoint
create policy client_milestones_select on public.client_milestones
  for select to authenticated using (app.can_read_rooms(organization_id, client_id));
