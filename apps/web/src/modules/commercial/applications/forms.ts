import { and, eq } from 'drizzle-orm';
import { schema, type DbTransaction } from '@agency-os/db';
import { DEFAULT_APPLICATION_FORM } from './default-form';
import { applicationFormDefinitionSchema, type ApplicationFormDefinition } from './form-definition';

const { applicationForms } = schema;

export type ActiveForm = { id: string; version: number; definition: ApplicationFormDefinition };

async function selectActiveForm(
  tx: DbTransaction,
  organizationId: string,
): Promise<ActiveForm | null> {
  const [row] = await tx
    .select({
      id: applicationForms.id,
      version: applicationForms.version,
      definition: applicationForms.definition,
    })
    .from(applicationForms)
    .where(
      and(eq(applicationForms.organizationId, organizationId), eq(applicationForms.isActive, true)),
    );
  if (!row) return null;

  const parsed = applicationFormDefinitionSchema.safeParse(row.definition);
  if (!parsed.success) throw new Error(`Active application form ${row.id} is invalid`);
  return { id: row.id, version: row.version, definition: parsed.data };
}

export async function getActiveForm(
  tx: DbTransaction,
  organizationId: string,
): Promise<ActiveForm> {
  const existing = await selectActiveForm(tx, organizationId);
  if (existing) return existing;

  await tx
    .insert(applicationForms)
    .values({ organizationId, version: 1, definition: DEFAULT_APPLICATION_FORM, isActive: true })
    .onConflictDoNothing();
  const created = await selectActiveForm(tx, organizationId);
  if (!created) throw new Error('Default application form was not created');
  return created;
}
