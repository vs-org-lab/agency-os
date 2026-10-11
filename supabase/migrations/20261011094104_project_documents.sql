CREATE TYPE "app"."project_document_kind" AS ENUM('figma', 'pdf', 'file', 'link');--> statement-breakpoint
CREATE TYPE "app"."project_document_status" AS ENUM('draft', 'with_client', 'approved');--> statement-breakpoint
ALTER TYPE "app"."approval_subject" ADD VALUE 'document_version';--> statement-breakpoint
CREATE TABLE "project_document_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"author_id" uuid,
	"body" text NOT NULL,
	"internal" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_document_comments_body_length" CHECK (char_length("project_document_comments"."body") between 1 and 2000)
);
--> statement-breakpoint
ALTER TABLE "project_document_comments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "project_document_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"kind" "app"."project_document_kind" NOT NULL,
	"url" text,
	"storage_path" text,
	"file_name" text,
	"mime_type" text,
	"size_bytes" bigint,
	"pages" integer,
	"upload_status" "app"."library_file_status" DEFAULT 'ready' NOT NULL,
	"shared_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_document_versions_document_number_key" UNIQUE("document_id","number"),
	CONSTRAINT "project_document_versions_number_positive" CHECK ("project_document_versions"."number" > 0),
	CONSTRAINT "project_document_versions_content" CHECK (("project_document_versions"."kind" in ('figma', 'link') and "project_document_versions"."url" is not null and "project_document_versions"."storage_path" is null)
        or ("project_document_versions"."kind" in ('pdf', 'file') and "project_document_versions"."storage_path" is not null and "project_document_versions"."url" is null))
);
--> statement-breakpoint
ALTER TABLE "project_document_versions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "project_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"title" text NOT NULL,
	"kind" "app"."project_document_kind" NOT NULL,
	"status" "app"."project_document_status" DEFAULT 'draft' NOT NULL,
	"current_version_id" uuid,
	"shared_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_documents_id_project_key" UNIQUE("id","project_id"),
	CONSTRAINT "project_documents_title_length" CHECK (char_length("project_documents"."title") between 1 and 200)
);
--> statement-breakpoint
ALTER TABLE "project_documents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "project_document_comments" ADD CONSTRAINT "project_document_comments_version_id_project_document_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."project_document_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_document_comments" ADD CONSTRAINT "project_document_comments_author_id_profiles_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_document_comments" ADD CONSTRAINT "project_document_comments_document_fk" FOREIGN KEY ("document_id","project_id") REFERENCES "public"."project_documents"("id","project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_document_comments" ADD CONSTRAINT "project_document_comments_project_client_fk" FOREIGN KEY ("project_id","client_id") REFERENCES "public"."projects"("id","client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_document_versions" ADD CONSTRAINT "project_document_versions_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_document_versions" ADD CONSTRAINT "project_document_versions_document_fk" FOREIGN KEY ("document_id","project_id") REFERENCES "public"."project_documents"("id","project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_document_versions" ADD CONSTRAINT "project_document_versions_project_client_fk" FOREIGN KEY ("project_id","client_id") REFERENCES "public"."projects"("id","client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_documents" ADD CONSTRAINT "project_documents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_documents" ADD CONSTRAINT "project_documents_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_documents" ADD CONSTRAINT "project_documents_client_organization_fk" FOREIGN KEY ("client_id","organization_id") REFERENCES "public"."clients"("id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_documents" ADD CONSTRAINT "project_documents_project_client_fk" FOREIGN KEY ("project_id","client_id") REFERENCES "public"."projects"("id","client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_document_comments_document_idx" ON "project_document_comments" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "project_documents_project_idx" ON "project_documents" USING btree ("project_id");