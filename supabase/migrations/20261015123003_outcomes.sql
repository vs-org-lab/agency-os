CREATE TYPE "app"."guarantee_reason" AS ENUM('target_met', 'conditions_failed', 'months_used');--> statement-breakpoint
CREATE TYPE "app"."guarantee_status" AS ENUM('pending', 'not_activated', 'active', 'closed');--> statement-breakpoint
CREATE TYPE "app"."outcome_condition_kind" AS ENUM('access', 'approvals', 'media_budget', 'other');--> statement-breakpoint
CREATE TYPE "app"."outcome_condition_status" AS ENUM('pending', 'met', 'failed');--> statement-breakpoint
CREATE TABLE "outcome_conditions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"outcome_id" uuid NOT NULL,
	"kind" "app"."outcome_condition_kind" NOT NULL,
	"description" text NOT NULL,
	"status" "app"."outcome_condition_status" DEFAULT 'pending' NOT NULL,
	"recorded_on" date,
	"note" text,
	"recorded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outcome_conditions_description_length" CHECK (char_length("outcome_conditions"."description") between 1 and 200),
	CONSTRAINT "outcome_conditions_note_length" CHECK ("outcome_conditions"."note" is null or char_length("outcome_conditions"."note") <= 500),
	CONSTRAINT "outcome_conditions_failed_note" CHECK ("outcome_conditions"."status" <> 'failed' or char_length(coalesce("outcome_conditions"."note", '')) > 0),
	CONSTRAINT "outcome_conditions_recorded" CHECK (("outcome_conditions"."status" = 'pending') = ("outcome_conditions"."recorded_on" is null))
);
--> statement-breakpoint
ALTER TABLE "outcome_conditions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "outcome_measurements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"outcome_id" uuid NOT NULL,
	"measured_on" date NOT NULL,
	"value" numeric(14, 2) NOT NULL,
	"note" text,
	"recorded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outcome_measurements_outcome_date_key" UNIQUE("outcome_id","measured_on"),
	CONSTRAINT "outcome_measurements_note_length" CHECK ("outcome_measurements"."note" is null or char_length("outcome_measurements"."note") <= 500)
);
--> statement-breakpoint
ALTER TABLE "outcome_measurements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "project_outcomes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"metric" text NOT NULL,
	"unit" text DEFAULT '' NOT NULL,
	"baseline" numeric(14, 2) NOT NULL,
	"target" numeric(14, 2) NOT NULL,
	"deadline" date NOT NULL,
	"data_source" text NOT NULL,
	"guarantee_status" "app"."guarantee_status" DEFAULT 'pending' NOT NULL,
	"guarantee_reason" "app"."guarantee_reason",
	"activated_on" date,
	"months_used" integer DEFAULT 0 NOT NULL,
	"conditions_task_for" date,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_outcomes_project_key" UNIQUE("project_id"),
	CONSTRAINT "project_outcomes_id_client_key" UNIQUE("id","client_id"),
	CONSTRAINT "project_outcomes_metric_length" CHECK (char_length("project_outcomes"."metric") between 1 and 80),
	CONSTRAINT "project_outcomes_unit_length" CHECK (char_length("project_outcomes"."unit") <= 20),
	CONSTRAINT "project_outcomes_source_length" CHECK (char_length("project_outcomes"."data_source") between 1 and 120),
	CONSTRAINT "project_outcomes_target_differs" CHECK ("project_outcomes"."baseline" <> "project_outcomes"."target"),
	CONSTRAINT "project_outcomes_reason" CHECK (case "project_outcomes"."guarantee_status"
            when 'pending' then "project_outcomes"."guarantee_reason" is null
            when 'active' then "project_outcomes"."guarantee_reason" is null
            when 'not_activated' then "project_outcomes"."guarantee_reason" in ('target_met', 'conditions_failed')
            else "project_outcomes"."guarantee_reason" in ('target_met', 'months_used')
          end),
	CONSTRAINT "project_outcomes_activation" CHECK (("project_outcomes"."activated_on" is not null) = ("project_outcomes"."guarantee_status" in ('active', 'closed'))),
	CONSTRAINT "project_outcomes_months" CHECK ("project_outcomes"."months_used" between 0 and 3
          and ("project_outcomes"."guarantee_reason" is distinct from 'months_used' or "project_outcomes"."months_used" = 3))
);
--> statement-breakpoint
ALTER TABLE "project_outcomes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "outcome_conditions" ADD CONSTRAINT "outcome_conditions_recorded_by_profiles_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outcome_conditions" ADD CONSTRAINT "outcome_conditions_outcome_client_fk" FOREIGN KEY ("outcome_id","client_id") REFERENCES "public"."project_outcomes"("id","client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outcome_measurements" ADD CONSTRAINT "outcome_measurements_recorded_by_profiles_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outcome_measurements" ADD CONSTRAINT "outcome_measurements_outcome_client_fk" FOREIGN KEY ("outcome_id","client_id") REFERENCES "public"."project_outcomes"("id","client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_outcomes" ADD CONSTRAINT "project_outcomes_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_outcomes" ADD CONSTRAINT "project_outcomes_client_organization_fk" FOREIGN KEY ("client_id","organization_id") REFERENCES "public"."clients"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_outcomes" ADD CONSTRAINT "project_outcomes_project_client_fk" FOREIGN KEY ("project_id","client_id") REFERENCES "public"."projects"("id","client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "outcome_conditions_outcome_idx" ON "outcome_conditions" USING btree ("outcome_id");--> statement-breakpoint
CREATE INDEX "project_outcomes_client_idx" ON "project_outcomes" USING btree ("client_id");--> statement-breakpoint
revoke all on table public.project_outcomes, public.outcome_conditions,
  public.outcome_measurements
from anon, authenticated, service_role;--> statement-breakpoint
grant select on table public.project_outcomes, public.outcome_conditions,
  public.outcome_measurements
to authenticated;--> statement-breakpoint
alter table public.project_outcomes force row level security;--> statement-breakpoint
alter table public.outcome_conditions force row level security;--> statement-breakpoint
alter table public.outcome_measurements force row level security;--> statement-breakpoint
create policy project_outcomes_select on public.project_outcomes
  for select to authenticated using (app.can_read_rooms(organization_id, client_id));--> statement-breakpoint
create policy outcome_conditions_select on public.outcome_conditions
  for select to authenticated using (app.can_read_rooms(organization_id, client_id));--> statement-breakpoint
create policy outcome_measurements_select on public.outcome_measurements
  for select to authenticated using (app.can_read_rooms(organization_id, client_id));--> statement-breakpoint
-- P-10: the client's decision maker and operational users see the agreed outcome, its values,
-- the client conditions and the guarantee, without internal notes or who recorded them.
create view public.portal_project_outcomes with (security_barrier = true) as
  select o.id, o.client_id, o.project_id, o.metric, o.unit, o.baseline, o.target, o.deadline,
         o.data_source, o.guarantee_status, o.guarantee_reason, o.activated_on, o.months_used
  from public.project_outcomes o
  where app.is_client_member(
    o.client_id, array['decision_maker', 'operational']::app.client_role[]
  );--> statement-breakpoint
create view public.portal_outcome_conditions with (security_barrier = true) as
  select c.id, c.outcome_id, c.client_id, c.kind, c.description, c.status, c.recorded_on
  from public.outcome_conditions c
  where app.is_client_member(
    c.client_id, array['decision_maker', 'operational']::app.client_role[]
  );--> statement-breakpoint
create view public.portal_outcome_measurements with (security_barrier = true) as
  select m.id, m.outcome_id, m.client_id, m.measured_on, m.value
  from public.outcome_measurements m
  where app.is_client_member(
    m.client_id, array['decision_maker', 'operational']::app.client_role[]
  );--> statement-breakpoint
revoke all on public.portal_project_outcomes, public.portal_outcome_conditions,
  public.portal_outcome_measurements
from anon, service_role;--> statement-breakpoint
grant select on public.portal_project_outcomes, public.portal_outcome_conditions,
  public.portal_outcome_measurements
to authenticated;
