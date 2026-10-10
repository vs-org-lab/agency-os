CREATE TABLE "project_staff_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_staff_assignments_project_user_key" UNIQUE("project_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "project_staff_assignments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "team_member_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"hourly_cost" numeric(10, 2),
	"currency" "app"."currency" DEFAULT 'EUR' NOT NULL,
	"weekly_hours" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_member_rates_organization_user_key" UNIQUE("organization_id","user_id"),
	CONSTRAINT "team_member_rates_hourly_cost_positive" CHECK ("team_member_rates"."hourly_cost" is null or "team_member_rates"."hourly_cost" >= 0),
	CONSTRAINT "team_member_rates_weekly_hours_range" CHECK ("team_member_rates"."weekly_hours" is null or "team_member_rates"."weekly_hours" between 0 and 80)
);
--> statement-breakpoint
ALTER TABLE "team_member_rates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "project_staff_assignments" ADD CONSTRAINT "project_staff_assignments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_staff_assignments" ADD CONSTRAINT "project_staff_assignments_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_staff_assignments" ADD CONSTRAINT "project_staff_assignments_client_organization_fk" FOREIGN KEY ("client_id","organization_id") REFERENCES "public"."clients"("id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_staff_assignments" ADD CONSTRAINT "project_staff_assignments_project_client_fk" FOREIGN KEY ("project_id","client_id") REFERENCES "public"."projects"("id","client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_member_rates" ADD CONSTRAINT "team_member_rates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_member_rates" ADD CONSTRAINT "team_member_rates_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_staff_assignments_user_idx" ON "project_staff_assignments" USING btree ("user_id");