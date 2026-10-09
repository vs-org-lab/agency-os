CREATE TYPE "app"."contract_status" AS ENUM('awaiting_signatures', 'signed', 'void');--> statement-breakpoint
CREATE TYPE "app"."country_code" AS ENUM('PT', 'AO');--> statement-breakpoint
CREATE TYPE "app"."proposal_status" AS ENUM('draft', 'sent', 'accepted', 'withdrawn');--> statement-breakpoint
CREATE TYPE "app"."signature_party" AS ENUM('client', 'studio');--> statement-breakpoint
CREATE TABLE "contract_signatures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"contract_id" uuid NOT NULL,
	"party" "app"."signature_party" NOT NULL,
	"signer_user_id" uuid NOT NULL,
	"typed_name" text NOT NULL,
	"signer_role" text NOT NULL,
	"signer_email" text NOT NULL,
	"signed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" "inet",
	"user_agent" text,
	"body_hash" text NOT NULL,
	CONSTRAINT "contract_signatures_party_key" UNIQUE("contract_id","party")
);
--> statement-breakpoint
ALTER TABLE "contract_signatures" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "contract_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"locale" "app"."locale" NOT NULL,
	"version" integer NOT NULL,
	"body" text NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"published_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contract_templates_version_key" UNIQUE("organization_id","locale","version")
);
--> statement-breakpoint
ALTER TABLE "contract_templates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "contracts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"deal_id" uuid NOT NULL,
	"proposal_id" uuid NOT NULL,
	"option_id" uuid NOT NULL,
	"template_id" uuid NOT NULL,
	"legal_entity_id" uuid NOT NULL,
	"locale" "app"."locale" NOT NULL,
	"body" text NOT NULL,
	"body_hash" text NOT NULL,
	"status" "app"."contract_status" DEFAULT 'awaiting_signatures' NOT NULL,
	"pdf_path" text,
	"signed_at" timestamp with time zone,
	"voided_at" timestamp with time zone,
	"void_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contracts_id_client_id_key" UNIQUE("id","client_id"),
	CONSTRAINT "contracts_body_hash_shape" CHECK ("contracts"."body_hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "contracts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "legal_entities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"legal_name" text NOT NULL,
	"tax_id" text NOT NULL,
	"address" text NOT NULL,
	"country" "app"."country_code" NOT NULL,
	"email" text NOT NULL,
	"representative_name" text NOT NULL,
	"representative_role" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "legal_entities_id_organization_id_key" UNIQUE("id","organization_id")
);
--> statement-breakpoint
ALTER TABLE "legal_entities" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "proposal_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"proposal_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"name" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"scope" jsonb NOT NULL,
	"one_off_amount" numeric(12, 2) NOT NULL,
	"payment_plan" jsonb NOT NULL,
	"retainer_monthly" numeric(12, 2),
	"retainer_months" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "proposal_options_position_key" UNIQUE("proposal_id","position"),
	CONSTRAINT "proposal_options_id_proposal_id_key" UNIQUE("id","proposal_id"),
	CONSTRAINT "proposal_options_position_range" CHECK ("proposal_options"."position" between 1 and 3),
	CONSTRAINT "proposal_options_retainer_shape" CHECK (("proposal_options"."retainer_monthly" is null and "proposal_options"."retainer_months" is null)
        or ("proposal_options"."retainer_monthly" > 0 and "proposal_options"."retainer_months" between 1 and 36))
);
--> statement-breakpoint
ALTER TABLE "proposal_options" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "proposal_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"proposal_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"message" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "proposal_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"deal_id" uuid NOT NULL,
	"legal_entity_id" uuid NOT NULL,
	"currency" "app"."currency" NOT NULL,
	"locale" "app"."locale" NOT NULL,
	"valid_until" date NOT NULL,
	"guarantee" text DEFAULT '' NOT NULL,
	"status" "app"."proposal_status" DEFAULT 'draft' NOT NULL,
	"sent_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"accepted_by" uuid,
	"accepted_option_id" uuid,
	"client_details" jsonb,
	"author_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "proposals_id_client_id_key" UNIQUE("id","client_id")
);
--> statement-breakpoint
ALTER TABLE "proposals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "contract_signatures" ADD CONSTRAINT "contract_signatures_signer_user_id_profiles_id_fk" FOREIGN KEY ("signer_user_id") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_signatures" ADD CONSTRAINT "contract_signatures_contract_client_fk" FOREIGN KEY ("contract_id","client_id") REFERENCES "public"."contracts"("id","client_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_signatures" ADD CONSTRAINT "contract_signatures_client_organization_fk" FOREIGN KEY ("client_id","organization_id") REFERENCES "public"."clients"("id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_templates" ADD CONSTRAINT "contract_templates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_templates" ADD CONSTRAINT "contract_templates_published_by_profiles_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_template_id_contract_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."contract_templates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_deal_client_fk" FOREIGN KEY ("deal_id","client_id") REFERENCES "public"."deals"("id","client_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_client_organization_fk" FOREIGN KEY ("client_id","organization_id") REFERENCES "public"."clients"("id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_proposal_client_fk" FOREIGN KEY ("proposal_id","client_id") REFERENCES "public"."proposals"("id","client_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_option_proposal_fk" FOREIGN KEY ("option_id","proposal_id") REFERENCES "public"."proposal_options"("id","proposal_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_legal_entity_organization_fk" FOREIGN KEY ("legal_entity_id","organization_id") REFERENCES "public"."legal_entities"("id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_entities" ADD CONSTRAINT "legal_entities_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_options" ADD CONSTRAINT "proposal_options_proposal_client_fk" FOREIGN KEY ("proposal_id","client_id") REFERENCES "public"."proposals"("id","client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_options" ADD CONSTRAINT "proposal_options_client_organization_fk" FOREIGN KEY ("client_id","organization_id") REFERENCES "public"."clients"("id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_requests" ADD CONSTRAINT "proposal_requests_author_id_profiles_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_requests" ADD CONSTRAINT "proposal_requests_proposal_client_fk" FOREIGN KEY ("proposal_id","client_id") REFERENCES "public"."proposals"("id","client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_requests" ADD CONSTRAINT "proposal_requests_client_organization_fk" FOREIGN KEY ("client_id","organization_id") REFERENCES "public"."clients"("id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_accepted_by_profiles_id_fk" FOREIGN KEY ("accepted_by") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_author_id_profiles_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_deal_client_fk" FOREIGN KEY ("deal_id","client_id") REFERENCES "public"."deals"("id","client_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_client_organization_fk" FOREIGN KEY ("client_id","organization_id") REFERENCES "public"."clients"("id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_legal_entity_organization_fk" FOREIGN KEY ("legal_entity_id","organization_id") REFERENCES "public"."legal_entities"("id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "contract_templates_active_key" ON "contract_templates" USING btree ("organization_id","locale") WHERE "contract_templates"."is_active";--> statement-breakpoint
CREATE UNIQUE INDEX "contracts_open_per_proposal_key" ON "contracts" USING btree ("proposal_id") WHERE "contracts"."status" <> 'void';--> statement-breakpoint
CREATE INDEX "contracts_deal_idx" ON "contracts" USING btree ("deal_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "legal_entities_default_key" ON "legal_entities" USING btree ("organization_id") WHERE "legal_entities"."is_default" and "legal_entities"."archived_at" is null;--> statement-breakpoint
CREATE INDEX "proposals_deal_idx" ON "proposals" USING btree ("deal_id","created_at");