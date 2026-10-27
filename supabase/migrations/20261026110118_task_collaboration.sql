CREATE TABLE "task_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"author_id" uuid,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_comments_body_length" CHECK (char_length("task_comments"."body") between 1 and 5000)
);
--> statement-breakpoint
ALTER TABLE "task_comments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "task_files" (
	"task_id" uuid NOT NULL,
	"library_file_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_files_pkey" PRIMARY KEY("task_id","library_file_id")
);
--> statement-breakpoint
ALTER TABLE "task_files" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "task_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"url" text NOT NULL,
	"title" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_links_url_https" CHECK (char_length("task_links"."url") <= 2000 and "task_links"."url" like 'https://%'),
	CONSTRAINT "task_links_title_length" CHECK ("task_links"."title" is null or char_length("task_links"."title") <= 200)
);
--> statement-breakpoint
ALTER TABLE "task_links" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_author_id_profiles_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_files" ADD CONSTRAINT "task_files_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_files" ADD CONSTRAINT "task_files_library_file_id_library_files_id_fk" FOREIGN KEY ("library_file_id") REFERENCES "public"."library_files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_files" ADD CONSTRAINT "task_files_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_links" ADD CONSTRAINT "task_links_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_links" ADD CONSTRAINT "task_links_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "task_comments_task_idx" ON "task_comments" USING btree ("task_id","created_at");--> statement-breakpoint
CREATE INDEX "task_files_file_idx" ON "task_files" USING btree ("library_file_id");--> statement-breakpoint
CREATE INDEX "task_links_task_idx" ON "task_links" USING btree ("task_id");