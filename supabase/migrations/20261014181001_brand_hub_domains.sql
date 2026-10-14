CREATE TYPE "app"."brand_hub_domain_status" AS ENUM('pending', 'verified', 'connected');--> statement-breakpoint
ALTER TYPE "app"."throttle_kind" ADD VALUE 'hub_domain_check';--> statement-breakpoint
CREATE TABLE "brand_hub_domains" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"hub_id" uuid NOT NULL,
	"hostname" text NOT NULL,
	"verification_code" text NOT NULL,
	"status" "app"."brand_hub_domain_status" DEFAULT 'pending' NOT NULL,
	"verified_at" timestamp with time zone,
	"connected_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brand_hub_domains_hub_key" UNIQUE("hub_id"),
	CONSTRAINT "brand_hub_domains_hostname_key" UNIQUE("hostname"),
	CONSTRAINT "brand_hub_domains_hostname_format" CHECK (char_length("brand_hub_domains"."hostname") <= 253 and "brand_hub_domains"."hostname" ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.){2,}[a-z]{2,63}$')
);
--> statement-breakpoint
ALTER TABLE "brand_hub_domains" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "brand_hub_domains" ADD CONSTRAINT "brand_hub_domains_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_hub_domains" ADD CONSTRAINT "brand_hub_domains_hub_fk" FOREIGN KEY ("hub_id","client_id") REFERENCES "public"."brand_hubs"("id","client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
revoke all on table public.brand_hub_domains from anon, authenticated, service_role;--> statement-breakpoint
grant select on table public.brand_hub_domains to authenticated;--> statement-breakpoint
alter table public.brand_hub_domains force row level security;--> statement-breakpoint
create policy brand_hub_domains_select on public.brand_hub_domains
  for select to authenticated using (app.can_edit_brand_hub(organization_id, client_id));
