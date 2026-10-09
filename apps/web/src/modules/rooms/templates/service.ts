import { and, asc, desc, eq, max } from 'drizzle-orm';
import { z } from 'zod';
import { schema, type DbTransaction } from '@agency-os/db';
import { withActor } from '@/modules/access';
import { recordAudit } from '@/modules/audit';
import { isFounderActor } from '@/modules/commercial';
import type { DbContexts, VerifiedClaims } from '@/platform/db';
import { validateProcessDefinition, type ProcessDefinition } from '../domain/template';
import { ORBIT_PROCESS, ORBIT_TEMPLATE_KEY, ORBIT_TEMPLATE_NAME } from './defaults';

const { processTemplates } = schema;

export type ProcessTemplate = {
  id: string;
  key: string;
  name: string;
  version: number;
  isDefault: boolean;
  definition: ProcessDefinition;
};

function parsed(row: typeof processTemplates.$inferSelect): ProcessTemplate {
  const result = validateProcessDefinition(row.definition);
  if (!result.ok) throw new Error(`Process template ${row.id} is invalid`);
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    version: row.version,
    isDefault: row.isDefault,
    definition: result.definition,
  };
}

/** Creates the Orbit default the first time an organisation needs a process. */
export async function ensureProcessTemplates(
  tx: DbTransaction,
  organizationId: string,
): Promise<void> {
  const [existing] = await tx
    .select({ id: processTemplates.id })
    .from(processTemplates)
    .where(
      and(eq(processTemplates.organizationId, organizationId), eq(processTemplates.isActive, true)),
    )
    .limit(1);
  if (existing) return;
  await tx
    .insert(processTemplates)
    .values({
      organizationId,
      key: ORBIT_TEMPLATE_KEY,
      name: ORBIT_TEMPLATE_NAME,
      version: 1,
      definition: ORBIT_PROCESS,
      isActive: true,
      isDefault: true,
    })
    .onConflictDoNothing();
}

/** Active templates, the default first and then by name. */
export async function listProcessTemplates(
  tx: DbTransaction,
  organizationId: string,
): Promise<ProcessTemplate[]> {
  const rows = await tx
    .select()
    .from(processTemplates)
    .where(
      and(eq(processTemplates.organizationId, organizationId), eq(processTemplates.isActive, true)),
    )
    .orderBy(desc(processTemplates.isDefault), asc(processTemplates.name));
  return rows.map(parsed);
}

/** The active template with `key`, or the organisation's default when no key is given. */
export async function activeProcessTemplate(
  tx: DbTransaction,
  organizationId: string,
  key?: string,
): Promise<ProcessTemplate | null> {
  await ensureProcessTemplates(tx, organizationId);
  const [row] = await tx
    .select()
    .from(processTemplates)
    .where(
      and(
        eq(processTemplates.organizationId, organizationId),
        eq(processTemplates.isActive, true),
        key ? eq(processTemplates.key, key) : eq(processTemplates.isDefault, true),
      ),
    );
  return row ? parsed(row) : null;
}

export function templateKeyFrom(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

const publishSchema = z.object({
  key: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]{0,39}$/)
    .optional(),
  name: z.string().trim().min(1).max(80),
  makeDefault: z.boolean(),
});

export type PublishProcessTemplateResult =
  { ok: true; key: string; version: number } | { ok: false; rule: 'not_found' | 'invalid_input' };

/** Publishes a new active version of a process template; projects keep the copy they started with. */
export async function publishProcessTemplate(
  claims: VerifiedClaims,
  input: { key?: string; name: string; definition: unknown; makeDefault: boolean },
  deps: { contexts: Pick<DbContexts, 'withUserContext' | 'withSystemContext'> },
): Promise<PublishProcessTemplateResult> {
  const organizationId = await withActor(
    deps.contexts,
    claims,
    async (_tx, actor) => (isFounderActor(actor) ? actor.organizationId : null),
    null,
  );
  if (!organizationId) return { ok: false, rule: 'not_found' };
  const fields = publishSchema.safeParse(input);
  const definition = validateProcessDefinition(input.definition);
  if (!fields.success || !definition.ok) return { ok: false, rule: 'invalid_input' };
  const key = fields.data.key ?? templateKeyFrom(fields.data.name);
  if (!key) return { ok: false, rule: 'invalid_input' };

  return deps.contexts.withSystemContext(async (tx) => {
    await ensureProcessTemplates(tx, organizationId);
    const [current] = await tx
      .select({ isDefault: processTemplates.isDefault })
      .from(processTemplates)
      .where(
        and(
          eq(processTemplates.organizationId, organizationId),
          eq(processTemplates.key, key),
          eq(processTemplates.isActive, true),
        ),
      )
      .for('update');
    const [latest] = await tx
      .select({ version: max(processTemplates.version) })
      .from(processTemplates)
      .where(
        and(eq(processTemplates.organizationId, organizationId), eq(processTemplates.key, key)),
      );
    const version = (latest?.version ?? 0) + 1;
    const isDefault = fields.data.makeDefault || current?.isDefault === true;

    if (isDefault) {
      await tx
        .update(processTemplates)
        .set({ isDefault: false })
        .where(eq(processTemplates.organizationId, organizationId));
    }
    await tx
      .update(processTemplates)
      .set({ isActive: false })
      .where(
        and(eq(processTemplates.organizationId, organizationId), eq(processTemplates.key, key)),
      );
    await tx.insert(processTemplates).values({
      organizationId,
      key,
      name: fields.data.name,
      version,
      definition: definition.definition,
      isActive: true,
      isDefault,
      publishedBy: claims.sub,
    });
    await recordAudit(tx, {
      organizationId,
      action: 'process_template.published',
      resourceType: 'process_template',
      metadata: { key, version, isDefault },
    });
    return { ok: true as const, key, version };
  });
}
