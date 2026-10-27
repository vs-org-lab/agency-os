CREATE TYPE "app"."kpi_aggregation" AS ENUM('sum', 'average', 'last');--> statement-breakpoint
CREATE TYPE "app"."kpi_format" AS ENUM('number', 'percent', 'currency', 'ratio');--> statement-breakpoint
CREATE TYPE "app"."kpi_value_origin" AS ENUM('manual', 'csv');--> statement-breakpoint
CREATE TABLE "client_kpi_values" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"kpi_id" uuid NOT NULL,
	"month" date NOT NULL,
	"value" numeric(16, 4) NOT NULL,
	"origin" "app"."kpi_value_origin" DEFAULT 'manual' NOT NULL,
	"recorded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_kpi_values_kpi_month_key" UNIQUE("kpi_id","month"),
	CONSTRAINT "client_kpi_values_first_day" CHECK (extract(day from "client_kpi_values"."month") = 1)
);
--> statement-breakpoint
ALTER TABLE "client_kpi_values" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "client_kpis" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"name" text NOT NULL,
	"format" "app"."kpi_format" DEFAULT 'number' NOT NULL,
	"aggregation" "app"."kpi_aggregation" DEFAULT 'sum' NOT NULL,
	"source" text DEFAULT '' NOT NULL,
	"target" numeric(16, 4),
	"client_visible" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_kpis_id_client_key" UNIQUE("id","client_id"),
	CONSTRAINT "client_kpis_name_length" CHECK (char_length("client_kpis"."name") between 1 and 60),
	CONSTRAINT "client_kpis_source_length" CHECK (char_length("client_kpis"."source") <= 40)
);
--> statement-breakpoint
ALTER TABLE "client_kpis" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "client_kpi_values" ADD CONSTRAINT "client_kpi_values_recorded_by_profiles_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_kpi_values" ADD CONSTRAINT "client_kpi_values_kpi_client_fk" FOREIGN KEY ("kpi_id","client_id") REFERENCES "public"."client_kpis"("id","client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_kpis" ADD CONSTRAINT "client_kpis_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_kpis" ADD CONSTRAINT "client_kpis_client_organization_fk" FOREIGN KEY ("client_id","organization_id") REFERENCES "public"."clients"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "client_kpi_values_client_month_idx" ON "client_kpi_values" USING btree ("client_id","month");--> statement-breakpoint
CREATE UNIQUE INDEX "client_kpis_client_name_key" ON "client_kpis" USING btree ("client_id",lower("name")) WHERE "client_kpis"."archived_at" is null;--> statement-breakpoint
CREATE INDEX "client_kpis_client_idx" ON "client_kpis" USING btree ("client_id","position");