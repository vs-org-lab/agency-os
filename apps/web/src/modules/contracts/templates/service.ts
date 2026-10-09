import { and, eq, max } from 'drizzle-orm';
import { z } from 'zod';
import { schema, type DbTransaction } from '@agency-os/db';
import type { Locale } from '@agency-os/i18n';
import { withActor } from '@/modules/access';
import { recordAudit } from '@/modules/audit';
import { isFounderActor } from '@/modules/commercial';
import type { DbContexts, VerifiedClaims } from '@/platform/db';
import { validateTemplate } from '../domain/template';
import { DEFAULT_CONTRACT_TEMPLATES } from './defaults';

const { contractTemplates } = schema;

export type ContractTemplate = { id: string; version: number; body: string };

export type PublishContractTemplateResult =
  | { ok: true; version: number }
  | { ok: false; rule: 'not_found' | 'invalid_input' }
  | { ok: false; rule: 'invalid_template'; unknown: string[] };

export const MAX_TEMPLATE_LENGTH = 100_000;

async function selectActive(
  tx: DbTransaction,
  organizationId: string,
  locale: Locale,
): Promise<ContractTemplate | null> {
  const [row] = await tx
    .select({
      id: contractTemplates.id,
      version: contractTemplates.version,
      body: contractTemplates.body,
    })
    .from(contractTemplates)
    .where(
      and(
        eq(contractTemplates.organizationId, organizationId),
        eq(contractTemplates.locale, locale),
        eq(contractTemplates.isActive, true),
      ),
    );
  return row ?? null;
}

/** The active template of a language; the base text becomes version 1 on first use. */
export async function activeContractTemplate(
  tx: DbTransaction,
  organizationId: string,
  locale: Locale,
): Promise<ContractTemplate> {
  const existing = await selectActive(tx, organizationId, locale);
  if (existing) return existing;
  await tx
    .insert(contractTemplates)
    .values({
      organizationId,
      locale,
      version: 1,
      body: DEFAULT_CONTRACT_TEMPLATES[locale],
      isActive: true,
    })
    .onConflictDoNothing();
  const created = await selectActive(tx, organizationId, locale);
  if (!created) throw new Error(`Default contract template for ${locale} was not created`);
  return created;
}

const publishSchema = z.object({
  locale: z.enum(['pt-PT', 'en']),
  body: z.string().trim().min(1).max(MAX_TEMPLATE_LENGTH),
});

export function publishContractTemplate(
  claims: VerifiedClaims,
  input: { locale: Locale; body: string },
  deps: { contexts: Pick<DbContexts, 'withUserContext'> },
): Promise<PublishContractTemplateResult> {
  return withActor<PublishContractTemplateResult>(
    deps.contexts,
    claims,
    async (tx, actor) => {
      if (!isFounderActor(actor)) return { ok: false, rule: 'not_found' };
      const parsed = publishSchema.safeParse(input);
      if (!parsed.success) return { ok: false, rule: 'invalid_input' };
      const validation = validateTemplate(parsed.data.body);
      if (!validation.ok) {
        return validation.unknown.length > 0
          ? { ok: false, rule: 'invalid_template', unknown: validation.unknown }
          : { ok: false, rule: 'invalid_input' };
      }
      const { locale, body } = parsed.data;

      await activeContractTemplate(tx, actor.organizationId, locale);
      const [latest] = await tx
        .select({ version: max(contractTemplates.version) })
        .from(contractTemplates)
        .where(
          and(
            eq(contractTemplates.organizationId, actor.organizationId),
            eq(contractTemplates.locale, locale),
          ),
        );
      const version = (latest?.version ?? 0) + 1;
      await tx
        .update(contractTemplates)
        .set({ isActive: false })
        .where(
          and(
            eq(contractTemplates.organizationId, actor.organizationId),
            eq(contractTemplates.locale, locale),
            eq(contractTemplates.isActive, true),
          ),
        );
      const [created] = await tx
        .insert(contractTemplates)
        .values({
          organizationId: actor.organizationId,
          locale,
          version,
          body,
          isActive: true,
          publishedBy: actor.userId,
        })
        .returning({ id: contractTemplates.id });
      await recordAudit(tx, {
        organizationId: actor.organizationId,
        action: 'contract_template.published',
        resourceType: 'contract_template',
        resourceId: created?.id ?? null,
        metadata: { locale, version },
      });
      return { ok: true, version };
    },
    { ok: false, rule: 'not_found' },
  );
}
