CREATE TYPE "app"."health_level" AS ENUM('healthy', 'attention', 'at_risk');--> statement-breakpoint
CREATE TABLE "client_health_snapshots" (
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"day" date NOT NULL,
	"score" integer,
	"level" "app"."health_level",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_health_snapshots_pkey" PRIMARY KEY("client_id","day"),
	CONSTRAINT "client_health_snapshots_score_range" CHECK ("client_health_snapshots"."score" is null or "client_health_snapshots"."score" between 0 and 100),
	CONSTRAINT "client_health_snapshots_level_with_score" CHECK (("client_health_snapshots"."score" is null) = ("client_health_snapshots"."level" is null))
);
--> statement-breakpoint
ALTER TABLE "client_health_snapshots" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "client_health_snapshots" ADD CONSTRAINT "client_health_snapshots_client_organization_fk" FOREIGN KEY ("client_id","organization_id") REFERENCES "public"."clients"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
revoke all on table public.client_health_snapshots from anon, authenticated, service_role;--> statement-breakpoint
grant select on table public.client_health_snapshots to authenticated;--> statement-breakpoint
alter table public.client_health_snapshots force row level security;--> statement-breakpoint
-- The health uses payment requests, which the access matrix keeps from freelancers (08).
create policy client_health_snapshots_select on public.client_health_snapshots
  for select to authenticated
  using (app.can_read_rooms(organization_id, client_id) and app.can_read_billing(organization_id));
