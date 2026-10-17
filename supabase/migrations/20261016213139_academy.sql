CREATE TYPE "app"."academy_item_kind" AS ENUM('tutorial', 'manual', 'checklist');--> statement-breakpoint
CREATE TYPE "app"."academy_item_status" AS ENUM('draft', 'published');--> statement-breakpoint
CREATE TABLE "academy_checklist_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"text" text NOT NULL,
	CONSTRAINT "academy_checklist_steps_id_client_key" UNIQUE("id","client_id"),
	CONSTRAINT "academy_checklist_steps_item_position_key" UNIQUE("item_id","position"),
	CONSTRAINT "academy_checklist_steps_text_length" CHECK (char_length("academy_checklist_steps"."text") between 1 and 200)
);
--> statement-breakpoint
ALTER TABLE "academy_checklist_steps" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "academy_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"kind" "app"."academy_item_kind" NOT NULL,
	"status" "app"."academy_item_status" DEFAULT 'draft' NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"position" integer NOT NULL,
	"library_file_id" uuid,
	"url" text,
	"published_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "academy_items_id_client_key" UNIQUE("id","client_id"),
	CONSTRAINT "academy_items_title_length" CHECK (char_length("academy_items"."title") between 1 and 120),
	CONSTRAINT "academy_items_description_length" CHECK (char_length("academy_items"."description") <= 1000),
	CONSTRAINT "academy_items_url_https" CHECK ("academy_items"."url" is null or "academy_items"."url" like 'https://%'),
	CONSTRAINT "academy_items_content" CHECK (case when "academy_items"."kind" = 'checklist'
        then "academy_items"."library_file_id" is null and "academy_items"."url" is null
        else not ("academy_items"."library_file_id" is not null and "academy_items"."url" is not null) end),
	CONSTRAINT "academy_items_published_at" CHECK ("academy_items"."status" = 'draft' or "academy_items"."published_at" is not null)
);
--> statement-breakpoint
ALTER TABLE "academy_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "academy_step_checks" (
	"step_id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"checked_by" uuid,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "academy_step_checks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "training_session_materials" (
	"organization_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	CONSTRAINT "training_session_materials_pkey" PRIMARY KEY("session_id","item_id")
);
--> statement-breakpoint
ALTER TABLE "training_session_materials" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "training_session_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"user_id" uuid,
	"guest_name" text,
	CONSTRAINT "training_session_participants_user_key" UNIQUE("session_id","user_id"),
	CONSTRAINT "training_session_participants_who" CHECK (("training_session_participants"."user_id" is null) <> ("training_session_participants"."guest_name" is null)),
	CONSTRAINT "training_session_participants_guest_length" CHECK ("training_session_participants"."guest_name" is null or char_length("training_session_participants"."guest_name") between 1 and 80)
);
--> statement-breakpoint
ALTER TABLE "training_session_participants" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "training_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"held_on" date NOT NULL,
	"title" text NOT NULL,
	"duration_minutes" integer,
	"summary" text DEFAULT '' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "training_sessions_id_client_key" UNIQUE("id","client_id"),
	CONSTRAINT "training_sessions_title_length" CHECK (char_length("training_sessions"."title") between 1 and 120),
	CONSTRAINT "training_sessions_summary_length" CHECK (char_length("training_sessions"."summary") <= 2000),
	CONSTRAINT "training_sessions_duration" CHECK ("training_sessions"."duration_minutes" is null or "training_sessions"."duration_minutes" between 1 and 600)
);
--> statement-breakpoint
ALTER TABLE "training_sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "academy_checklist_steps" ADD CONSTRAINT "academy_checklist_steps_item_fk" FOREIGN KEY ("item_id","client_id") REFERENCES "public"."academy_items"("id","client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_items" ADD CONSTRAINT "academy_items_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_items" ADD CONSTRAINT "academy_items_library_file_id_library_files_id_fk" FOREIGN KEY ("library_file_id") REFERENCES "public"."library_files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_items" ADD CONSTRAINT "academy_items_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_items" ADD CONSTRAINT "academy_items_client_organization_fk" FOREIGN KEY ("client_id","organization_id") REFERENCES "public"."clients"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_step_checks" ADD CONSTRAINT "academy_step_checks_checked_by_profiles_id_fk" FOREIGN KEY ("checked_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_step_checks" ADD CONSTRAINT "academy_step_checks_step_fk" FOREIGN KEY ("step_id","client_id") REFERENCES "public"."academy_checklist_steps"("id","client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_session_materials" ADD CONSTRAINT "training_session_materials_session_fk" FOREIGN KEY ("session_id","client_id") REFERENCES "public"."training_sessions"("id","client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_session_materials" ADD CONSTRAINT "training_session_materials_item_fk" FOREIGN KEY ("item_id","client_id") REFERENCES "public"."academy_items"("id","client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_session_participants" ADD CONSTRAINT "training_session_participants_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_session_participants" ADD CONSTRAINT "training_session_participants_session_fk" FOREIGN KEY ("session_id","client_id") REFERENCES "public"."training_sessions"("id","client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_sessions" ADD CONSTRAINT "training_sessions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_sessions" ADD CONSTRAINT "training_sessions_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_sessions" ADD CONSTRAINT "training_sessions_client_organization_fk" FOREIGN KEY ("client_id","organization_id") REFERENCES "public"."clients"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "academy_items_client_idx" ON "academy_items" USING btree ("client_id","position");--> statement-breakpoint
CREATE INDEX "training_sessions_client_idx" ON "training_sessions" USING btree ("client_id","held_on");--> statement-breakpoint
revoke all on table public.academy_items, public.academy_checklist_steps, public.academy_step_checks,
  public.training_sessions, public.training_session_participants, public.training_session_materials
  from anon, authenticated, service_role;--> statement-breakpoint
grant select on table public.academy_items, public.academy_checklist_steps,
  public.academy_step_checks, public.training_sessions, public.training_session_participants,
  public.training_session_materials to authenticated;--> statement-breakpoint
alter table public.academy_items force row level security;--> statement-breakpoint
alter table public.academy_checklist_steps force row level security;--> statement-breakpoint
alter table public.academy_step_checks force row level security;--> statement-breakpoint
alter table public.training_sessions force row level security;--> statement-breakpoint
alter table public.training_session_participants force row level security;--> statement-breakpoint
alter table public.training_session_materials force row level security;--> statement-breakpoint
create policy academy_items_select on public.academy_items for select to authenticated
  using (app.can_read_rooms(organization_id, client_id));--> statement-breakpoint
create policy academy_checklist_steps_select on public.academy_checklist_steps for select
  to authenticated using (app.can_read_rooms(organization_id, client_id));--> statement-breakpoint
create policy academy_step_checks_select on public.academy_step_checks for select
  to authenticated using (app.can_read_rooms(organization_id, client_id));--> statement-breakpoint
create policy training_sessions_select on public.training_sessions for select to authenticated
  using (app.can_read_rooms(organization_id, client_id));--> statement-breakpoint
create policy training_session_participants_select on public.training_session_participants
  for select to authenticated
  using (app.can_read_rooms(organization_id, client_id));--> statement-breakpoint
create policy training_session_materials_select on public.training_session_materials
  for select to authenticated
  using (app.can_read_rooms(organization_id, client_id));--> statement-breakpoint
-- The client's room members (decision makers and operational) read the published academy and
-- the training sessions; drafts and who created what stay with the team.
create view public.portal_academy_items with (security_barrier = true) as
  select i.id, i.client_id, i.kind, i.title, i.description, i.position, i.library_file_id,
         i.url, i.published_at
  from public.academy_items i
  where i.status = 'published'
    and app.is_client_member(
      i.client_id, array['decision_maker', 'operational']::app.client_role[]
    );--> statement-breakpoint
create view public.portal_academy_steps with (security_barrier = true) as
  select s.id, s.client_id, s.item_id, s.position, s.text
  from public.academy_checklist_steps s
  join public.academy_items i on i.id = s.item_id
  where i.status = 'published'
    and app.is_client_member(
      s.client_id, array['decision_maker', 'operational']::app.client_role[]
    );--> statement-breakpoint
create view public.portal_academy_checks with (security_barrier = true) as
  select c.step_id, c.client_id, s.item_id, c.checked_at, p.full_name as checked_by_name
  from public.academy_step_checks c
  join public.academy_checklist_steps s on s.id = c.step_id
  join public.academy_items i on i.id = s.item_id
  left join public.profiles p on p.id = c.checked_by
  where i.status = 'published'
    and app.is_client_member(
      c.client_id, array['decision_maker', 'operational']::app.client_role[]
    );--> statement-breakpoint
create view public.portal_training_sessions with (security_barrier = true) as
  select t.id, t.client_id, t.held_on, t.title, t.duration_minutes, t.summary
  from public.training_sessions t
  where app.is_client_member(
      t.client_id, array['decision_maker', 'operational']::app.client_role[]
    );--> statement-breakpoint
create view public.portal_training_participants with (security_barrier = true) as
  select tp.id, tp.session_id, tp.client_id, coalesce(p.full_name, tp.guest_name) as name
  from public.training_session_participants tp
  left join public.profiles p on p.id = tp.user_id
  where app.is_client_member(
      tp.client_id, array['decision_maker', 'operational']::app.client_role[]
    );--> statement-breakpoint
create view public.portal_training_materials with (security_barrier = true) as
  select m.session_id, m.client_id, m.item_id, i.title, i.kind
  from public.training_session_materials m
  join public.academy_items i on i.id = m.item_id
  where i.status = 'published'
    and app.is_client_member(
      m.client_id, array['decision_maker', 'operational']::app.client_role[]
    );--> statement-breakpoint
revoke all on table public.portal_academy_items, public.portal_academy_steps,
  public.portal_academy_checks, public.portal_training_sessions,
  public.portal_training_participants, public.portal_training_materials
  from anon, authenticated, service_role;--> statement-breakpoint
grant select on table public.portal_academy_items, public.portal_academy_steps,
  public.portal_academy_checks, public.portal_training_sessions,
  public.portal_training_participants, public.portal_training_materials to authenticated;
