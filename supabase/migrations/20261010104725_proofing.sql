CREATE TYPE "app"."proof_kind" AS ENUM('image', 'pdf', 'video');--> statement-breakpoint
CREATE TYPE "app"."proof_version_status" AS ENUM('uploading', 'ready', 'rejected');--> statement-breakpoint
ALTER TYPE "app"."approval_subject" ADD VALUE 'file_version';--> statement-breakpoint
CREATE TABLE "proof_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"parent_id" uuid,
	"author_id" uuid,
	"body" text NOT NULL,
	"anchor" jsonb,
	"number" integer,
	"internal" boolean DEFAULT false NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "proof_comments_version_number_key" UNIQUE("version_id","number"),
	CONSTRAINT "proof_comments_body_length" CHECK (char_length("proof_comments"."body") between 1 and 2000)
);
--> statement-breakpoint
ALTER TABLE "proof_comments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "proof_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"phase_id" uuid,
	"title" text NOT NULL,
	"created_by" uuid,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "proof_files_id_project_key" UNIQUE("id","project_id"),
	CONSTRAINT "proof_files_title_length" CHECK (char_length("proof_files"."title") between 1 and 200)
);
--> statement-breakpoint
ALTER TABLE "proof_files" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "proof_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"storage_path" text NOT NULL,
	"kind" "app"."proof_kind",
	"mime_type" text,
	"size_bytes" bigint,
	"pages" integer,
	"status" "app"."proof_version_status" DEFAULT 'uploading' NOT NULL,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "proof_versions_file_number_key" UNIQUE("file_id","number"),
	CONSTRAINT "proof_versions_number_positive" CHECK ("proof_versions"."number" > 0),
	CONSTRAINT "proof_versions_ready_has_type" CHECK ("proof_versions"."status" <> 'ready' or ("proof_versions"."kind" is not null and "proof_versions"."mime_type" is not null))
);
--> statement-breakpoint
ALTER TABLE "proof_versions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "approvals" ADD COLUMN "extra_round" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "revision_limit" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "rounds_warned_limit" integer;--> statement-breakpoint
ALTER TABLE "proof_comments" ADD CONSTRAINT "proof_comments_version_id_proof_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."proof_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proof_comments" ADD CONSTRAINT "proof_comments_author_id_profiles_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proof_comments" ADD CONSTRAINT "proof_comments_project_client_fk" FOREIGN KEY ("project_id","client_id") REFERENCES "public"."projects"("id","client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proof_comments" ADD CONSTRAINT "proof_comments_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."proof_comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proof_files" ADD CONSTRAINT "proof_files_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proof_files" ADD CONSTRAINT "proof_files_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proof_files" ADD CONSTRAINT "proof_files_client_organization_fk" FOREIGN KEY ("client_id","organization_id") REFERENCES "public"."clients"("id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proof_files" ADD CONSTRAINT "proof_files_project_client_fk" FOREIGN KEY ("project_id","client_id") REFERENCES "public"."projects"("id","client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proof_files" ADD CONSTRAINT "proof_files_phase_client_fk" FOREIGN KEY ("phase_id","client_id") REFERENCES "public"."project_phases"("id","client_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proof_versions" ADD CONSTRAINT "proof_versions_uploaded_by_profiles_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proof_versions" ADD CONSTRAINT "proof_versions_file_project_fk" FOREIGN KEY ("file_id","project_id") REFERENCES "public"."proof_files"("id","project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proof_versions" ADD CONSTRAINT "proof_versions_project_client_fk" FOREIGN KEY ("project_id","client_id") REFERENCES "public"."projects"("id","client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "proof_comments_version_idx" ON "proof_comments" USING btree ("version_id");--> statement-breakpoint
CREATE INDEX "proof_files_project_idx" ON "proof_files" USING btree ("project_id");--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_revision_limit_range" CHECK ("projects"."revision_limit" between 1 and 20);