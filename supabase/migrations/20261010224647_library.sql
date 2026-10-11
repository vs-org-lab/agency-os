CREATE TYPE "app"."library_file_kind" AS ENUM('image', 'video', 'document', 'other');--> statement-breakpoint
CREATE TYPE "app"."library_file_status" AS ENUM('uploading', 'ready', 'rejected');--> statement-breakpoint
CREATE TABLE "library_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"folder_id" uuid NOT NULL,
	"root_id" uuid NOT NULL,
	"name" text NOT NULL,
	"storage_path" text NOT NULL,
	"kind" "app"."library_file_kind",
	"mime_type" text,
	"size_bytes" bigint,
	"status" "app"."library_file_status" DEFAULT 'uploading' NOT NULL,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "library_files_id_project_key" UNIQUE("id","project_id"),
	CONSTRAINT "library_files_name_length" CHECK (char_length("library_files"."name") between 1 and 200),
	CONSTRAINT "library_files_ready_has_type" CHECK ("library_files"."status" <> 'ready' or ("library_files"."kind" is not null and "library_files"."mime_type" is not null and "library_files"."size_bytes" is not null))
);
--> statement-breakpoint
ALTER TABLE "library_files" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "library_folders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"parent_id" uuid,
	"root_id" uuid NOT NULL,
	"depth" smallint DEFAULT 0 NOT NULL,
	"name" text NOT NULL,
	"visibility" "app"."update_visibility",
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "library_folders_id_project_key" UNIQUE("id","project_id"),
	CONSTRAINT "library_folders_root_visibility" CHECK (("library_folders"."parent_id" is null) = ("library_folders"."visibility" is not null)),
	CONSTRAINT "library_folders_root_depth" CHECK (("library_folders"."parent_id" is null) = ("library_folders"."depth" = 0)),
	CONSTRAINT "library_folders_depth_range" CHECK ("library_folders"."depth" between 0 and 3),
	CONSTRAINT "library_folders_name_length" CHECK (char_length("library_folders"."name") between 1 and 120)
);
--> statement-breakpoint
ALTER TABLE "library_folders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "project_update_files" (
	"update_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	CONSTRAINT "project_update_files_pkey" PRIMARY KEY("update_id","file_id")
);
--> statement-breakpoint
ALTER TABLE "project_update_files" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "library_files" ADD CONSTRAINT "library_files_uploaded_by_profiles_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_files" ADD CONSTRAINT "library_files_client_organization_fk" FOREIGN KEY ("client_id","organization_id") REFERENCES "public"."clients"("id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_files" ADD CONSTRAINT "library_files_project_client_fk" FOREIGN KEY ("project_id","client_id") REFERENCES "public"."projects"("id","client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_files" ADD CONSTRAINT "library_files_folder_fk" FOREIGN KEY ("folder_id","project_id") REFERENCES "public"."library_folders"("id","project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_files" ADD CONSTRAINT "library_files_root_fk" FOREIGN KEY ("root_id","project_id") REFERENCES "public"."library_folders"("id","project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_folders" ADD CONSTRAINT "library_folders_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_folders" ADD CONSTRAINT "library_folders_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_folders" ADD CONSTRAINT "library_folders_client_organization_fk" FOREIGN KEY ("client_id","organization_id") REFERENCES "public"."clients"("id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_folders" ADD CONSTRAINT "library_folders_project_client_fk" FOREIGN KEY ("project_id","client_id") REFERENCES "public"."projects"("id","client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_folders" ADD CONSTRAINT "library_folders_parent_fk" FOREIGN KEY ("parent_id","project_id") REFERENCES "public"."library_folders"("id","project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_folders" ADD CONSTRAINT "library_folders_root_fk" FOREIGN KEY ("root_id","project_id") REFERENCES "public"."library_folders"("id","project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_update_files" ADD CONSTRAINT "project_update_files_update_id_project_updates_id_fk" FOREIGN KEY ("update_id") REFERENCES "public"."project_updates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_update_files" ADD CONSTRAINT "project_update_files_file_fk" FOREIGN KEY ("file_id","project_id") REFERENCES "public"."library_files"("id","project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_update_files" ADD CONSTRAINT "project_update_files_project_client_fk" FOREIGN KEY ("project_id","client_id") REFERENCES "public"."projects"("id","client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "library_files_folder_idx" ON "library_files" USING btree ("folder_id");--> statement-breakpoint
CREATE INDEX "library_files_project_status_idx" ON "library_files" USING btree ("project_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "library_folders_sibling_name_key" ON "library_folders" USING btree ("project_id",coalesce("parent_id", '00000000-0000-0000-0000-000000000000'::uuid),lower("name"));--> statement-breakpoint
CREATE INDEX "library_folders_root_idx" ON "library_folders" USING btree ("root_id");--> statement-breakpoint
CREATE INDEX "project_update_files_file_idx" ON "project_update_files" USING btree ("file_id");