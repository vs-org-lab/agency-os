CREATE TYPE "app"."brand_hub_access_mode" AS ENUM('public', 'password', 'restricted');--> statement-breakpoint
ALTER TYPE "app"."throttle_kind" ADD VALUE 'hub_unlock';--> statement-breakpoint
ALTER TABLE "brand_hub_assets" ADD COLUMN "metadata_stripped_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "brand_hubs" ADD COLUMN "slug" text;--> statement-breakpoint
-- Existing hubs take their address from the client's name: lower case, accents removed, anything
-- else as hyphens, at least three characters, and a numeric suffix when two names collide.
WITH base AS (
  SELECT h.id,
         left(coalesce(nullif(trim(both '-' from regexp_replace(
           lower(translate(c.name,
             'áàâãäåçéèêëíìîïñóòôõöúùûüýÁÀÂÃÄÅÇÉÈÊËÍÌÎÏÑÓÒÔÕÖÚÙÛÜÝ',
             'aaaaaaceeeeiiiinooooouuuuyaaaaaaceeeeiiiinooooouuuuy')),
           '[^a-z0-9]+', '-', 'g')), ''), 'hub'), 54) AS slug
  FROM "brand_hubs" h
  JOIN "clients" c ON c.id = h.client_id
), padded AS (
  SELECT id, CASE WHEN length(slug) < 3 THEN slug || '-hub' ELSE slug END AS slug FROM base
), ranked AS (
  SELECT id, slug, row_number() OVER (PARTITION BY slug ORDER BY id) AS position FROM padded
)
UPDATE "brand_hubs" h
SET slug = CASE WHEN r.position = 1 THEN r.slug ELSE r.slug || '-' || r.position END
FROM ranked r
WHERE r.id = h.id;--> statement-breakpoint
ALTER TABLE "brand_hubs" ALTER COLUMN "slug" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "brand_hubs" ADD COLUMN "access_mode" "app"."brand_hub_access_mode" DEFAULT 'restricted' NOT NULL;--> statement-breakpoint
ALTER TABLE "brand_hubs" ADD COLUMN "password_hash" text;--> statement-breakpoint
ALTER TABLE "brand_hubs" ADD COLUMN "access_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "brand_hubs" ADD CONSTRAINT "brand_hubs_slug_key" UNIQUE("slug");--> statement-breakpoint
ALTER TABLE "brand_hubs" ADD CONSTRAINT "brand_hubs_slug_format" CHECK ("brand_hubs"."slug" ~ '^[a-z0-9-]{3,60}$');--> statement-breakpoint
ALTER TABLE "brand_hubs" ADD CONSTRAINT "brand_hubs_password_by_mode" CHECK (("brand_hubs"."access_mode" = 'password') = ("brand_hubs"."password_hash" is not null));--> statement-breakpoint
-- The site password hash never leaves the server: staff read hubs under row level security, so
-- the column is withheld from them.
REVOKE SELECT ON TABLE "brand_hubs" FROM authenticated;--> statement-breakpoint
GRANT SELECT (id, organization_id, client_id, slug, access_mode, access_version, design,
  draft_revision, draft_updated_at, published_publication_id, approved_publication_id, created_by,
  created_at, updated_at) ON TABLE "brand_hubs" TO authenticated;
