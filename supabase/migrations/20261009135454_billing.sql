CREATE TYPE "app"."billing_milestone_status" AS ENUM('pending', 'requested', 'paid');--> statement-breakpoint
CREATE TYPE "app"."invoice_issuer" AS ENUM('at_certified', 'agt_portal');--> statement-breakpoint
CREATE TYPE "app"."payment_method" AS ENUM('stripe', 'bank_transfer', 'multicaixa', 'other');--> statement-breakpoint
CREATE TYPE "app"."payment_request_status" AS ENUM('sent', 'paid', 'void');--> statement-breakpoint
CREATE TYPE "app"."payment_status" AS ENUM('reconciled', 'review');--> statement-breakpoint
CREATE TABLE "billing_counters" (
	"organization_id" uuid NOT NULL,
	"year" integer NOT NULL,
	"last_number" integer NOT NULL,
	CONSTRAINT "billing_counters_organization_id_year_pk" PRIMARY KEY("organization_id","year"),
	CONSTRAINT "billing_counters_last_number_positive" CHECK ("billing_counters"."last_number" > 0)
);
--> statement-breakpoint
ALTER TABLE "billing_counters" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "billing_milestones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"deal_id" uuid NOT NULL,
	"contract_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"label" text NOT NULL,
	"percent" integer NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"currency" "app"."currency" NOT NULL,
	"status" "app"."billing_milestone_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_milestones_position_key" UNIQUE("contract_id","position"),
	CONSTRAINT "billing_milestones_id_client_id_key" UNIQUE("id","client_id"),
	CONSTRAINT "billing_milestones_amount_positive" CHECK ("billing_milestones"."amount" > 0),
	CONSTRAINT "billing_milestones_percent_range" CHECK ("billing_milestones"."percent" between 1 and 100)
);
--> statement-breakpoint
ALTER TABLE "billing_milestones" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "legal_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"issuer" "app"."invoice_issuer" NOT NULL,
	"number" text NOT NULL,
	"issued_on" date NOT NULL,
	"pdf_path" text NOT NULL,
	"recorded_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "legal_invoices_request_key" UNIQUE("request_id")
);
--> statement-breakpoint
ALTER TABLE "legal_invoices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "payment_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"deal_id" uuid NOT NULL,
	"milestone_id" uuid NOT NULL,
	"number" text NOT NULL,
	"label" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"currency" "app"."currency" NOT NULL,
	"locale" "app"."locale" NOT NULL,
	"due_date" date NOT NULL,
	"status" "app"."payment_request_status" DEFAULT 'sent' NOT NULL,
	"issuer_details" jsonb NOT NULL,
	"client_details" jsonb NOT NULL,
	"pdf_path" text,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone,
	"voided_at" timestamp with time zone,
	"void_reason" text,
	"last_reminder_stage" integer DEFAULT 0 NOT NULL,
	"last_chased_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_requests_number_key" UNIQUE("organization_id","number"),
	CONSTRAINT "payment_requests_id_client_id_key" UNIQUE("id","client_id"),
	CONSTRAINT "payment_requests_amount_positive" CHECK ("payment_requests"."amount" > 0),
	CONSTRAINT "payment_requests_reminder_stage_range" CHECK ("payment_requests"."last_reminder_stage" between 0 and 5)
);
--> statement-breakpoint
ALTER TABLE "payment_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"currency" text NOT NULL,
	"method" "app"."payment_method" NOT NULL,
	"reference" text DEFAULT '' NOT NULL,
	"received_on" date NOT NULL,
	"status" "app"."payment_status" NOT NULL,
	"recorded_by" uuid,
	"provider_event_id" text,
	"reconciled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_amount_positive" CHECK ("payments"."amount" > 0),
	CONSTRAINT "payments_currency_shape" CHECK ("payments"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "legal_entities" ADD COLUMN "bank_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "legal_entities" ADD COLUMN "iban" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "legal_entities" ADD COLUMN "bic" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "legal_entities" ADD COLUMN "payment_instructions" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "billing_counters" ADD CONSTRAINT "billing_counters_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_milestones" ADD CONSTRAINT "billing_milestones_deal_client_fk" FOREIGN KEY ("deal_id","client_id") REFERENCES "public"."deals"("id","client_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_milestones" ADD CONSTRAINT "billing_milestones_client_organization_fk" FOREIGN KEY ("client_id","organization_id") REFERENCES "public"."clients"("id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_milestones" ADD CONSTRAINT "billing_milestones_contract_client_fk" FOREIGN KEY ("contract_id","client_id") REFERENCES "public"."contracts"("id","client_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_invoices" ADD CONSTRAINT "legal_invoices_recorded_by_profiles_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_invoices" ADD CONSTRAINT "legal_invoices_request_client_fk" FOREIGN KEY ("request_id","client_id") REFERENCES "public"."payment_requests"("id","client_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_invoices" ADD CONSTRAINT "legal_invoices_client_organization_fk" FOREIGN KEY ("client_id","organization_id") REFERENCES "public"."clients"("id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_deal_client_fk" FOREIGN KEY ("deal_id","client_id") REFERENCES "public"."deals"("id","client_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_client_organization_fk" FOREIGN KEY ("client_id","organization_id") REFERENCES "public"."clients"("id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_milestone_client_fk" FOREIGN KEY ("milestone_id","client_id") REFERENCES "public"."billing_milestones"("id","client_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_recorded_by_profiles_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_request_client_fk" FOREIGN KEY ("request_id","client_id") REFERENCES "public"."payment_requests"("id","client_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_client_organization_fk" FOREIGN KEY ("client_id","organization_id") REFERENCES "public"."clients"("id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "billing_milestones_deal_idx" ON "billing_milestones" USING btree ("deal_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_requests_open_per_milestone_key" ON "payment_requests" USING btree ("milestone_id") WHERE "payment_requests"."status" <> 'void';--> statement-breakpoint
CREATE INDEX "payment_requests_deal_idx" ON "payment_requests" USING btree ("deal_id","sent_at");--> statement-breakpoint
CREATE INDEX "payment_requests_open_due_idx" ON "payment_requests" USING btree ("due_date") WHERE "payment_requests"."status" = 'sent';--> statement-breakpoint
CREATE UNIQUE INDEX "payments_provider_event_key" ON "payments" USING btree ("provider_event_id");--> statement-breakpoint
CREATE INDEX "payments_request_idx" ON "payments" USING btree ("request_id");