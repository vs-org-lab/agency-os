CREATE TYPE "app"."brand_hub_access_mode" AS ENUM('public', 'password', 'restricted');--> statement-breakpoint
ALTER TYPE "app"."throttle_kind" ADD VALUE 'hub_unlock';--> statement-breakpoint
ALTER TABLE "brand_hub_assets" ADD COLUMN "metadata_stripped_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "brand_hubs" ADD COLUMN "slug" text;--> statement-breakpoint
-- Existing hubs take their address from the client's name: lower case, accents removed, anything
-- else as hyphens, at least three characters, and a numeric suffix when two names collide.
DO $$
DECLARE
  hub record;
  base text;
  candidate text;
  suffix integer;
BEGIN
  FOR hub IN
    SELECT h.id, c.name FROM "brand_hubs" h JOIN "clients" c ON c.id = h.client_id
    WHERE h.slug IS NULL ORDER BY h.created_at, h.id
  LOOP
    base := trim(both '-' from left(trim(both '-' from regexp_replace(
      lower(translate(hub.name,
        'áàâãäåçéèêëíìîïñóòôõöúùûüýÁÀÂÃÄÅÇÉÈÊËÍÌÎÏÑÓÒÔÕÖÚÙÛÜÝ',
        'aaaaaaceeeeiiiinooooouuuuyaaaaaaceeeeiiiinooooouuuuy')),
      '[^a-z0-9]+', '-', 'g')), 54));
    IF base = '' THEN
      base := 'hub';
    ELSIF length(base) < 3 THEN
      base := base || '-hub';
    END IF;
    candidate := base;
    suffix := 1;
    WHILE EXISTS (SELECT 1 FROM "brand_hubs" WHERE slug = candidate) LOOP
      suffix := suffix + 1;
      candidate := base || '-' || suffix;
    END LOOP;
    UPDATE "brand_hubs" SET slug = candidate WHERE id = hub.id;
  END LOOP;
END $$;--> statement-breakpoint
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
