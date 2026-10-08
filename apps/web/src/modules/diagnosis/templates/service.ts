import { and, eq, max } from 'drizzle-orm';
import { schema, type CoreTemplateKind, type DbTransaction } from '@agency-os/db';
import { withActor } from '@/modules/access';
import { recordAudit } from '@/modules/audit';
import { isFounderActor } from '@/modules/commercial';
import type { DbContexts, VerifiedClaims } from '@/platform/db';
import { DEFAULT_BRIEFING_GUIDE, DEFAULT_ORBIT_GRID } from './defaults';
import {
  briefingGuideSchema,
  orbitGridSchema,
  type BriefingGuide,
  type OrbitGrid,
} from './definitions';

const { coreTemplates } = schema;

type DefinitionOf = { briefing: BriefingGuide; orbit_grid: OrbitGrid };

export type ActiveTemplate<K extends CoreTemplateKind> = {
  id: string;
  version: number;
  definition: DefinitionOf[K];
};

const SCHEMAS = { briefing: briefingGuideSchema, orbit_grid: orbitGridSchema } as const;
const DEFAULTS: DefinitionOf = { briefing: DEFAULT_BRIEFING_GUIDE, orbit_grid: DEFAULT_ORBIT_GRID };

export function parseTemplate<K extends CoreTemplateKind>(
  kind: K,
  definition: unknown,
): DefinitionOf[K] {
  const parsed = SCHEMAS[kind].safeParse(definition);
  if (!parsed.success) throw new Error(`Core template of kind ${kind} is invalid`);
  return parsed.data as DefinitionOf[K];
}

async function selectActive<K extends CoreTemplateKind>(
  tx: DbTransaction,
  organizationId: string,
  kind: K,
): Promise<ActiveTemplate<K> | null> {
  const [row] = await tx
    .select({
      id: coreTemplates.id,
      version: coreTemplates.version,
      definition: coreTemplates.definition,
    })
    .from(coreTemplates)
    .where(
      and(
        eq(coreTemplates.organizationId, organizationId),
        eq(coreTemplates.kind, kind),
        eq(coreTemplates.isActive, true),
      ),
    );
  return row
    ? { id: row.id, version: row.version, definition: parseTemplate(kind, row.definition) }
    : null;
}

export async function getActiveTemplate<K extends CoreTemplateKind>(
  tx: DbTransaction,
  organizationId: string,
  kind: K,
): Promise<ActiveTemplate<K>> {
  const existing = await selectActive(tx, organizationId, kind);
  if (existing) return existing;

  await tx
    .insert(coreTemplates)
    .values({ organizationId, kind, version: 1, definition: DEFAULTS[kind], isActive: true })
    .onConflictDoNothing();
  const created = await selectActive(tx, organizationId, kind);
  if (!created) throw new Error(`Default Core template of kind ${kind} was not created`);
  return created;
}

export async function getTemplateById<K extends CoreTemplateKind>(
  tx: DbTransaction,
  id: string,
  kind: K,
): Promise<DefinitionOf[K]> {
  const [row] = await tx
    .select({ definition: coreTemplates.definition })
    .from(coreTemplates)
    .where(and(eq(coreTemplates.id, id), eq(coreTemplates.kind, kind)));
  if (!row) throw new Error(`Core template ${id} was not found`);
  return parseTemplate(kind, row.definition);
}

export type PublishTemplateResult =
  { ok: true; version: number } | { ok: false; rule: 'invalid_input' | 'not_found' };

export function publishTemplate(
  claims: VerifiedClaims,
  input: { kind: CoreTemplateKind; definition: unknown },
  deps: { contexts: Pick<DbContexts, 'withUserContext'> },
): Promise<PublishTemplateResult> {
  return withActor<PublishTemplateResult>(
    deps.contexts,
    claims,
    async (tx, actor) => {
      if (!isFounderActor(actor)) return { ok: false, rule: 'not_found' };
      const parsed = SCHEMAS[input.kind].safeParse(input.definition);
      if (!parsed.success) return { ok: false, rule: 'invalid_input' };

      await getActiveTemplate(tx, actor.organizationId, input.kind);
      const [latest] = await tx
        .select({ version: max(coreTemplates.version) })
        .from(coreTemplates)
        .where(
          and(
            eq(coreTemplates.organizationId, actor.organizationId),
            eq(coreTemplates.kind, input.kind),
          ),
        );
      const version = (latest?.version ?? 0) + 1;

      await tx
        .update(coreTemplates)
        .set({ isActive: false })
        .where(
          and(
            eq(coreTemplates.organizationId, actor.organizationId),
            eq(coreTemplates.kind, input.kind),
            eq(coreTemplates.isActive, true),
          ),
        );
      await tx.insert(coreTemplates).values({
        organizationId: actor.organizationId,
        kind: input.kind,
        version,
        definition: parsed.data,
        isActive: true,
        publishedBy: actor.userId,
      });
      await recordAudit(tx, {
        organizationId: actor.organizationId,
        action: 'core_template.published',
        resourceType: 'core_template',
        metadata: { kind: input.kind, version },
      });
      return { ok: true, version };
    },
    { ok: false, rule: 'not_found' },
  );
}
