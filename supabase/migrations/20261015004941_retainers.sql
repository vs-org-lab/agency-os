CREATE TYPE "app"."retainer_extra_status" AS ENUM('requested', 'quoted', 'approved', 'declined');--> statement-breakpoint
CREATE TYPE "app"."retainer_limit_kind" AS ENUM('content_pieces', 'campaigns', 'maintenance_hours', 'automations');--> statement-breakpoint
CREATE TYPE "app"."retainer_status" AS ENUM('active', 'ended');--> statement-breakpoint
ALTER TYPE "app"."approval_subject" ADD VALUE 'retainer_extra';--> statement-breakpoint
CREATE TABLE "retainer_alerts" (
	"retainer_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"kind" "app"."retainer_limit_kind" NOT NULL,
	"month" date NOT NULL,
	"threshold" integer NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "retainer_alerts_retainer_id_kind_month_threshold_pk" PRIMARY KEY("retainer_id","kind","month","threshold"),
	CONSTRAINT "retainer_alerts_threshold" CHECK ("retainer_alerts"."threshold" in (80, 100))
);
--> statement-breakpoint
ALTER TABLE "retainer_alerts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "retainer_extra_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"retainer_id" uuid NOT NULL,
	"kind" "app"."retainer_limit_kind" NOT NULL,
	"description" text NOT NULL,
	"quantity" numeric(6, 1) NOT NULL,
	"quote_amount" numeric(12, 2),
	"currency" "app"."currency",
	"status" "app"."retainer_extra_status" DEFAULT 'requested' NOT NULL,
	"requested_by" uuid,
	"approval_id" uuid,
	"task_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "retainer_extra_requests_description_length" CHECK (char_length("retainer_extra_requests"."description") between 1 and 500),
	CONSTRAINT "retainer_extra_requests_quantity_positive" CHECK ("retainer_extra_requests"."quantity" > 0),
	CONSTRAINT "retainer_extra_requests_quote" CHECK (("retainer_extra_requests"."quote_amount" is null) = ("retainer_extra_requests"."currency" is null)
          and ("retainer_extra_requests"."quote_amount" is null or "retainer_extra_requests"."quote_amount" > 0)
          and ("retainer_extra_requests"."status" = 'requested' or "retainer_extra_requests"."quote_amount" is not null))
);
--> statement-breakpoint
ALTER TABLE "retainer_extra_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "retainer_limits" (
	"retainer_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"kind" "app"."retainer_limit_kind" NOT NULL,
	"monthly_limit" numeric(6, 1) NOT NULL,
	CONSTRAINT "retainer_limits_retainer_id_kind_pk" PRIMARY KEY("retainer_id","kind"),
	CONSTRAINT "retainer_limits_positive" CHECK ("retainer_limits"."monthly_limit" > 0)
);
--> statement-breakpoint
ALTER TABLE "retainer_limits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "retainer_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"retainer_id" uuid NOT NULL,
	"kind" "app"."retainer_limit_kind" NOT NULL,
	"month" date NOT NULL,
	"quantity" numeric(6, 1) NOT NULL,
	"description" text NOT NULL,
	"task_id" uuid,
	"extra_request_id" uuid,
	"recorded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "retainer_usage_month_first_day" CHECK (extract(day from "retainer_usage"."month") = 1),
	CONSTRAINT "retainer_usage_quantity_positive" CHECK ("retainer_usage"."quantity" > 0),
	CONSTRAINT "retainer_usage_description_length" CHECK (char_length("retainer_usage"."description") between 1 and 500)
);
--> statement-breakpoint
ALTER TABLE "retainer_usage" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "retainers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"tier" text NOT NULL,
	"monthly_fee" numeric(12, 2) NOT NULL,
	"currency" "app"."currency" NOT NULL,
	"starts_on" date NOT NULL,
	"review_on" date NOT NULL,
	"status" "app"."retainer_status" DEFAULT 'active' NOT NULL,
	"review_alerted_for" date,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "retainers_project_key" UNIQUE("project_id"),
	CONSTRAINT "retainers_id_client_key" UNIQUE("id","client_id"),
	CONSTRAINT "retainers_tier_length" CHECK (char_length("retainers"."tier") between 1 and 40),
	CONSTRAINT "retainers_fee_not_negative" CHECK ("retainers"."monthly_fee" >= 0),
	CONSTRAINT "retainers_starts_first_day" CHECK (extract(day from "retainers"."starts_on") = 1)
);
--> statement-breakpoint
ALTER TABLE "retainers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "retainer_alerts" ADD CONSTRAINT "retainer_alerts_retainer_client_fk" FOREIGN KEY ("retainer_id","client_id") REFERENCES "public"."retainers"("id","client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retainer_extra_requests" ADD CONSTRAINT "retainer_extra_requests_requested_by_profiles_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retainer_extra_requests" ADD CONSTRAINT "retainer_extra_requests_approval_id_approvals_id_fk" FOREIGN KEY ("approval_id") REFERENCES "public"."approvals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retainer_extra_requests" ADD CONSTRAINT "retainer_extra_requests_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retainer_extra_requests" ADD CONSTRAINT "retainer_extra_requests_retainer_client_fk" FOREIGN KEY ("retainer_id","client_id") REFERENCES "public"."retainers"("id","client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retainer_limits" ADD CONSTRAINT "retainer_limits_retainer_client_fk" FOREIGN KEY ("retainer_id","client_id") REFERENCES "public"."retainers"("id","client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retainer_usage" ADD CONSTRAINT "retainer_usage_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retainer_usage" ADD CONSTRAINT "retainer_usage_extra_request_id_retainer_extra_requests_id_fk" FOREIGN KEY ("extra_request_id") REFERENCES "public"."retainer_extra_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retainer_usage" ADD CONSTRAINT "retainer_usage_recorded_by_profiles_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retainer_usage" ADD CONSTRAINT "retainer_usage_retainer_client_fk" FOREIGN KEY ("retainer_id","client_id") REFERENCES "public"."retainers"("id","client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retainers" ADD CONSTRAINT "retainers_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retainers" ADD CONSTRAINT "retainers_client_organization_fk" FOREIGN KEY ("client_id","organization_id") REFERENCES "public"."clients"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retainers" ADD CONSTRAINT "retainers_project_client_fk" FOREIGN KEY ("project_id","client_id") REFERENCES "public"."projects"("id","client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "retainer_extra_requests_retainer_idx" ON "retainer_extra_requests" USING btree ("retainer_id","created_at");--> statement-breakpoint
CREATE INDEX "retainer_usage_retainer_month_idx" ON "retainer_usage" USING btree ("retainer_id","month");--> statement-breakpoint
revoke all on table public.retainers, public.retainer_limits, public.retainer_usage,
  public.retainer_extra_requests, public.retainer_alerts
from anon, authenticated, service_role;--> statement-breakpoint
-- The monthly fee is a value the access matrix keeps from freelancers; staff read it through the
-- service after authorisation, so the column has no grant.
grant select (id, organization_id, client_id, project_id, tier, currency, starts_on, review_on,
  status, review_alerted_for, created_by, created_at, updated_at)
on table public.retainers to authenticated;--> statement-breakpoint
grant select on table public.retainer_limits, public.retainer_usage,
  public.retainer_extra_requests, public.retainer_alerts
to authenticated;--> statement-breakpoint
alter table public.retainers force row level security;--> statement-breakpoint
alter table public.retainer_limits force row level security;--> statement-breakpoint
alter table public.retainer_usage force row level security;--> statement-breakpoint
alter table public.retainer_extra_requests force row level security;--> statement-breakpoint
alter table public.retainer_alerts force row level security;--> statement-breakpoint
create policy retainers_select on public.retainers
  for select to authenticated using (app.can_read_rooms(organization_id, client_id));--> statement-breakpoint
create policy retainer_limits_select on public.retainer_limits
  for select to authenticated using (app.can_read_rooms(organization_id, client_id));--> statement-breakpoint
create policy retainer_usage_select on public.retainer_usage
  for select to authenticated using (app.can_read_rooms(organization_id, client_id));--> statement-breakpoint
create policy retainer_extra_requests_select on public.retainer_extra_requests
  for select to authenticated using (app.can_read_rooms(organization_id, client_id));--> statement-breakpoint
create policy retainer_alerts_select on public.retainer_alerts
  for select to authenticated using (app.can_read_rooms(organization_id, client_id));--> statement-breakpoint
-- P-10: the client's decision maker and operational users see the retainer, its limits, the
-- month's usage and the extra requests, without the monthly fee or who recorded the usage.
create view public.portal_retainers with (security_barrier = true) as
  select r.id, r.client_id, r.project_id, r.tier, r.starts_on, r.status
  from public.retainers r
  where app.is_client_member(
    r.client_id, array['decision_maker', 'operational']::app.client_role[]
  );--> statement-breakpoint
create view public.portal_retainer_limits with (security_barrier = true) as
  select l.retainer_id, l.client_id, l.kind, l.monthly_limit
  from public.retainer_limits l
  where app.is_client_member(
    l.client_id, array['decision_maker', 'operational']::app.client_role[]
  );--> statement-breakpoint
create view public.portal_retainer_usage with (security_barrier = true) as
  select u.id, u.retainer_id, u.client_id, u.kind, u.month, u.quantity, u.description,
         u.extra_request_id, u.created_at
  from public.retainer_usage u
  where app.is_client_member(
    u.client_id, array['decision_maker', 'operational']::app.client_role[]
  );--> statement-breakpoint
create view public.portal_retainer_extra_requests with (security_barrier = true) as
  select e.id, e.retainer_id, e.client_id, e.kind, e.description, e.quantity, e.quote_amount,
         e.currency, e.status, e.created_at, e.updated_at
  from public.retainer_extra_requests e
  where app.is_client_member(
    e.client_id, array['decision_maker', 'operational']::app.client_role[]
  );--> statement-breakpoint
revoke all on public.portal_retainers, public.portal_retainer_limits,
  public.portal_retainer_usage, public.portal_retainer_extra_requests
from anon, service_role;--> statement-breakpoint
grant select on public.portal_retainers, public.portal_retainer_limits,
  public.portal_retainer_usage, public.portal_retainer_extra_requests
to authenticated;
