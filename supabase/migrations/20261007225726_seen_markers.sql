-- Seen markers: per-user record of the last visit to an area, used for "new since your last visit" indicators.

CREATE TYPE "app"."seen_area" AS ENUM('applications');--> statement-breakpoint
CREATE TABLE "seen_markers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"area" "app"."seen_area" NOT NULL,
	"seen_at" timestamp with time zone NOT NULL,
	CONSTRAINT "seen_markers_user_area_key" UNIQUE("user_id","organization_id","area")
);
--> statement-breakpoint
ALTER TABLE "seen_markers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "seen_markers" ADD CONSTRAINT "seen_markers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seen_markers" ADD CONSTRAINT "seen_markers_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint

revoke all on table public.seen_markers from anon, authenticated, service_role;
grant select, insert on table public.seen_markers to authenticated;
grant update (seen_at) on table public.seen_markers to authenticated;
alter table public.seen_markers force row level security;

create policy seen_markers_select_own on public.seen_markers
  for select to authenticated using (user_id = (select auth.uid()));
create policy seen_markers_insert_own on public.seen_markers
  for insert to authenticated
  with check (user_id = (select auth.uid()) and app.is_org_member(organization_id));
create policy seen_markers_update_own on public.seen_markers
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
