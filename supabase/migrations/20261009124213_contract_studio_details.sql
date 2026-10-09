-- The studio party is frozen with the contract text, so later entity edits never change what was
-- signed. Existing contracts take the entity data they reference.
ALTER TABLE "contracts" ADD COLUMN "studio_details" jsonb;--> statement-breakpoint
UPDATE "contracts" AS c
SET "studio_details" = jsonb_build_object(
  'legalName', e.legal_name,
  'taxId', e.tax_id,
  'address', e.address,
  'country', e.country,
  'email', e.email,
  'representativeName', e.representative_name,
  'representativeRole', e.representative_role
)
FROM "legal_entities" AS e
WHERE e.id = c.legal_entity_id;--> statement-breakpoint
ALTER TABLE "contracts" ALTER COLUMN "studio_details" SET NOT NULL;
