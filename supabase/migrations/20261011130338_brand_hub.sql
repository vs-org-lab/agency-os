CREATE TYPE "app"."brand_hub_block_type" AS ENUM('text', 'strategy', 'image', 'gallery', 'logo', 'colors', 'typeface', 'downloads');--> statement-breakpoint
CREATE TYPE "app"."brand_hub_page_kind" AS ENUM('standard', 'custom');--> statement-breakpoint
CREATE TYPE "app"."brand_hub_standard_key" AS ENUM('strategy', 'gallery', 'logo', 'typography', 'color', 'photography', 'layout', 'brand_objects', 'resources');--> statement-breakpoint
ALTER TYPE "app"."approval_subject" ADD VALUE 'brand_hub_publication';--> statement-breakpoint
CREATE TABLE "brand_hub_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hub_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"name" text NOT NULL,
	"mime_type" text,
	"size_bytes" bigint NOT NULL,
	"storage_path" text NOT NULL,
	"upload_status" "app"."library_file_status" DEFAULT 'uploading' NOT NULL,
	"removed_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brand_hub_assets_name_length" CHECK (char_length("brand_hub_assets"."name") between 1 and 200),
	CONSTRAINT "brand_hub_assets_name_safe" CHECK ("brand_hub_assets"."name" !~ '[/\\[:cntrl:]]' and "brand_hub_assets"."name" not in ('.', '..')),
	CONSTRAINT "brand_hub_assets_size_positive" CHECK ("brand_hub_assets"."size_bytes" > 0),
	CONSTRAINT "brand_hub_assets_ready_has_type" CHECK ("brand_hub_assets"."upload_status" <> 'ready' or "brand_hub_assets"."mime_type" is not null)
);
--> statement-breakpoint
ALTER TABLE "brand_hub_assets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "brand_hub_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"page_id" uuid NOT NULL,
	"hub_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"type" "app"."brand_hub_block_type" NOT NULL,
	"position" integer NOT NULL,
	"content" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "brand_hub_blocks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "brand_hub_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hub_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"kind" "app"."brand_hub_page_kind" NOT NULL,
	"standard_key" "app"."brand_hub_standard_key",
	"title" text NOT NULL,
	"position" integer NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brand_hub_pages_hub_standard_key" UNIQUE("hub_id","standard_key"),
	CONSTRAINT "brand_hub_pages_id_hub_key" UNIQUE("id","hub_id"),
	CONSTRAINT "brand_hub_pages_title_length" CHECK (char_length("brand_hub_pages"."title") between 1 and 80),
	CONSTRAINT "brand_hub_pages_standard_key" CHECK (("brand_hub_pages"."kind" = 'standard') = ("brand_hub_pages"."standard_key" is not null))
);
--> statement-breakpoint
ALTER TABLE "brand_hub_pages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "brand_hub_publications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hub_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"revision" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"published_by" uuid,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brand_hub_publications_hub_number_key" UNIQUE("hub_id","number"),
	CONSTRAINT "brand_hub_publications_number_positive" CHECK ("brand_hub_publications"."number" > 0)
);
--> statement-breakpoint
ALTER TABLE "brand_hub_publications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "brand_hubs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"design" jsonb DEFAULT '{"colors":{"surface":"#FFFFFF","panel":"#F5F5F4","text":"#1C1917","textMuted":"#57534E","accent":"#1C1917","divider":"#E7E5E4"},"corners":"soft","logoTiles":true,"layout":"sidebar"}'::jsonb NOT NULL,
	"draft_revision" integer DEFAULT 1 NOT NULL,
	"draft_updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_publication_id" uuid,
	"approved_publication_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brand_hubs_client_key" UNIQUE("client_id"),
	CONSTRAINT "brand_hubs_id_client_key" UNIQUE("id","client_id"),
	CONSTRAINT "brand_hubs_draft_revision_positive" CHECK ("brand_hubs"."draft_revision" > 0)
);
--> statement-breakpoint
ALTER TABLE "brand_hubs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "brand_hub_assets" ADD CONSTRAINT "brand_hub_assets_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_hub_assets" ADD CONSTRAINT "brand_hub_assets_hub_fk" FOREIGN KEY ("hub_id","client_id") REFERENCES "public"."brand_hubs"("id","client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_hub_blocks" ADD CONSTRAINT "brand_hub_blocks_page_fk" FOREIGN KEY ("page_id","hub_id") REFERENCES "public"."brand_hub_pages"("id","hub_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_hub_blocks" ADD CONSTRAINT "brand_hub_blocks_hub_fk" FOREIGN KEY ("hub_id","client_id") REFERENCES "public"."brand_hubs"("id","client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_hub_pages" ADD CONSTRAINT "brand_hub_pages_hub_fk" FOREIGN KEY ("hub_id","client_id") REFERENCES "public"."brand_hubs"("id","client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_hub_publications" ADD CONSTRAINT "brand_hub_publications_published_by_profiles_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_hub_publications" ADD CONSTRAINT "brand_hub_publications_hub_fk" FOREIGN KEY ("hub_id","client_id") REFERENCES "public"."brand_hubs"("id","client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_hubs" ADD CONSTRAINT "brand_hubs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_hubs" ADD CONSTRAINT "brand_hubs_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_hubs" ADD CONSTRAINT "brand_hubs_client_organization_fk" FOREIGN KEY ("client_id","organization_id") REFERENCES "public"."clients"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "brand_hub_assets_hub_idx" ON "brand_hub_assets" USING btree ("hub_id");--> statement-breakpoint
CREATE INDEX "brand_hub_blocks_page_idx" ON "brand_hub_blocks" USING btree ("page_id");--> statement-breakpoint
CREATE INDEX "brand_hub_pages_hub_idx" ON "brand_hub_pages" USING btree ("hub_id");