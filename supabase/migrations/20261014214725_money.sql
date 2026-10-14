CREATE TYPE "app"."expense_category" AS ENUM('software', 'advertising', 'freelancers', 'equipment', 'travel', 'training', 'other');--> statement-breakpoint
CREATE TYPE "app"."subscription_cycle" AS ENUM('monthly', 'annual');--> statement-breakpoint
CREATE TYPE "app"."subscription_status" AS ENUM('active', 'cancelled');--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"spent_on" date NOT NULL,
	"vendor" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"category" "app"."expense_category" NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"currency" "app"."currency" NOT NULL,
	"receipt_path" text,
	"receipt_name" text,
	"receipt_mime_type" text,
	"client_id" uuid,
	"payment_request_id" uuid,
	"subscription_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expenses_vendor_length" CHECK (char_length("expenses"."vendor") between 1 and 120),
	CONSTRAINT "expenses_description_length" CHECK (char_length("expenses"."description") <= 500),
	CONSTRAINT "expenses_amount_positive" CHECK ("expenses"."amount" > 0),
	CONSTRAINT "expenses_request_needs_client" CHECK ("expenses"."payment_request_id" is null or "expenses"."client_id" is not null),
	CONSTRAINT "expenses_receipt_complete" CHECK (("expenses"."receipt_path" is null) = ("expenses"."receipt_name" is null)
          and ("expenses"."receipt_path" is null) = ("expenses"."receipt_mime_type" is null))
);
--> statement-breakpoint
ALTER TABLE "expenses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"vendor" text DEFAULT '' NOT NULL,
	"category" "app"."expense_category" NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"currency" "app"."currency" NOT NULL,
	"cycle" "app"."subscription_cycle" NOT NULL,
	"next_renewal_on" date NOT NULL,
	"status" "app"."subscription_status" DEFAULT 'active' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_name_length" CHECK (char_length("subscriptions"."name") between 1 and 80),
	CONSTRAINT "subscriptions_vendor_length" CHECK (char_length("subscriptions"."vendor") <= 120),
	CONSTRAINT "subscriptions_amount_positive" CHECK ("subscriptions"."amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "subscriptions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_client_organization_fk" FOREIGN KEY ("client_id","organization_id") REFERENCES "public"."clients"("id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_payment_request_client_fk" FOREIGN KEY ("payment_request_id","client_id") REFERENCES "public"."payment_requests"("id","client_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "expenses_organization_spent_idx" ON "expenses" USING btree ("organization_id","spent_on");--> statement-breakpoint
CREATE INDEX "expenses_payment_request_idx" ON "expenses" USING btree ("payment_request_id");--> statement-breakpoint
CREATE INDEX "subscriptions_organization_renewal_idx" ON "subscriptions" USING btree ("organization_id","next_renewal_on");--> statement-breakpoint
revoke all on table public.expenses, public.subscriptions from anon, authenticated, service_role;--> statement-breakpoint
grant select on table public.expenses, public.subscriptions to authenticated;--> statement-breakpoint
alter table public.expenses force row level security;--> statement-breakpoint
alter table public.subscriptions force row level security;--> statement-breakpoint
create policy expenses_select on public.expenses
  for select to authenticated using (app.can_read_billing(organization_id));--> statement-breakpoint
create policy subscriptions_select on public.subscriptions
  for select to authenticated using (app.can_read_billing(organization_id));--> statement-breakpoint
-- The receipts of the expenses a payment request charges, for the client's decision maker and
-- finance contact in the portal (RF-153).
create view public.portal_payment_request_receipts with (security_barrier = true) as
  select e.id as expense_id, e.payment_request_id, e.client_id, e.receipt_name, e.receipt_path
  from public.expenses e
  where e.payment_request_id is not null
    and e.receipt_path is not null
    and app.is_client_member(
      e.client_id, array['decision_maker', 'client_finance']::app.client_role[]
    );--> statement-breakpoint
revoke all on public.portal_payment_request_receipts from anon, service_role;--> statement-breakpoint
grant select on public.portal_payment_request_receipts to authenticated;
