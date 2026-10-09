import { and, asc, desc, eq, isNull, ne } from 'drizzle-orm';
import { z } from 'zod';
import { schema, type CountryCode, type DbTransaction } from '@agency-os/db';
import { withActor } from '@/modules/access';
import { recordAudit } from '@/modules/audit';
import { isFounderActor } from '@/modules/commercial';
import type { DbContexts, VerifiedClaims } from '@/platform/db';

const { legalEntities } = schema;

export type LegalEntity = {
  id: string;
  legalName: string;
  taxId: string;
  address: string;
  country: CountryCode;
  email: string;
  representativeName: string;
  representativeRole: string;
  isDefault: boolean;
};

export type LegalEntityInput = Omit<LegalEntity, 'id'> & { entityId?: string };

export type SettingsDeps = { contexts: Pick<DbContexts, 'withUserContext'> };

const text = (max: number) => z.string().trim().min(1).max(max);

const entitySchema = z.object({
  entityId: z.uuid().optional(),
  legalName: text(200),
  taxId: text(40),
  address: text(500),
  country: z.enum(['PT', 'AO']),
  email: z.email().max(320),
  representativeName: text(200),
  representativeRole: text(120),
  isDefault: z.boolean(),
});

export async function listLegalEntities(tx: DbTransaction): Promise<LegalEntity[]> {
  return tx
    .select({
      id: legalEntities.id,
      legalName: legalEntities.legalName,
      taxId: legalEntities.taxId,
      address: legalEntities.address,
      country: legalEntities.country,
      email: legalEntities.email,
      representativeName: legalEntities.representativeName,
      representativeRole: legalEntities.representativeRole,
      isDefault: legalEntities.isDefault,
    })
    .from(legalEntities)
    .where(isNull(legalEntities.archivedAt))
    .orderBy(desc(legalEntities.isDefault), asc(legalEntities.createdAt));
}

export function saveLegalEntity(
  claims: VerifiedClaims,
  input: LegalEntityInput,
  deps: SettingsDeps,
): Promise<{ ok: true; entityId: string } | { ok: false; rule: 'not_found' | 'invalid_input' }> {
  const parsed = entitySchema.safeParse(input);
  return withActor(
    deps.contexts,
    claims,
    async (tx, actor) => {
      if (!isFounderActor(actor)) return { ok: false as const, rule: 'not_found' as const };
      if (!parsed.success) return { ok: false as const, rule: 'invalid_input' as const };
      const { entityId, ...data } = parsed.data;

      const [currentDefault] = await tx
        .select({ id: legalEntities.id })
        .from(legalEntities)
        .where(
          and(
            eq(legalEntities.organizationId, actor.organizationId),
            eq(legalEntities.isDefault, true),
            isNull(legalEntities.archivedAt),
          ),
        );
      const isDefault = data.isDefault || !currentDefault || currentDefault.id === entityId;
      if (isDefault && currentDefault && currentDefault.id !== entityId) {
        await tx
          .update(legalEntities)
          .set({ isDefault: false })
          .where(eq(legalEntities.id, currentDefault.id));
      }

      let savedId = entityId;
      if (savedId) {
        const updated = await tx
          .update(legalEntities)
          .set({ ...data, isDefault })
          .where(and(eq(legalEntities.id, savedId), isNull(legalEntities.archivedAt)))
          .returning({ id: legalEntities.id });
        if (updated.length === 0) return { ok: false as const, rule: 'not_found' as const };
      } else {
        const [created] = await tx
          .insert(legalEntities)
          .values({ ...data, isDefault, organizationId: actor.organizationId })
          .returning({ id: legalEntities.id });
        if (!created) throw new Error('Legal entity was not created');
        savedId = created.id;
      }

      await recordAudit(tx, {
        organizationId: actor.organizationId,
        action: 'legal_entity.saved',
        resourceType: 'legal_entity',
        resourceId: savedId,
        metadata: { country: data.country, isDefault },
      });
      return { ok: true as const, entityId: savedId };
    },
    { ok: false as const, rule: 'not_found' as const },
  );
}

export function archiveLegalEntity(
  claims: VerifiedClaims,
  input: { entityId: string },
  deps: SettingsDeps,
): Promise<{ ok: true } | { ok: false; rule: 'not_found' }> {
  return withActor(
    deps.contexts,
    claims,
    async (tx, actor) => {
      if (!isFounderActor(actor) || !z.uuid().safeParse(input.entityId).success) {
        return { ok: false as const, rule: 'not_found' as const };
      }
      const archived = await tx
        .update(legalEntities)
        .set({ archivedAt: new Date(), isDefault: false })
        .where(and(eq(legalEntities.id, input.entityId), isNull(legalEntities.archivedAt)))
        .returning({ id: legalEntities.id });
      if (archived.length === 0) return { ok: false as const, rule: 'not_found' as const };

      const [next] = await tx
        .select({ id: legalEntities.id })
        .from(legalEntities)
        .where(
          and(
            eq(legalEntities.organizationId, actor.organizationId),
            isNull(legalEntities.archivedAt),
            ne(legalEntities.id, input.entityId),
          ),
        )
        .orderBy(asc(legalEntities.createdAt))
        .limit(1);
      if (next) {
        await tx
          .update(legalEntities)
          .set({ isDefault: true })
          .where(eq(legalEntities.id, next.id));
      }
      await recordAudit(tx, {
        organizationId: actor.organizationId,
        action: 'legal_entity.archived',
        resourceType: 'legal_entity',
        resourceId: input.entityId,
        metadata: {},
      });
      return { ok: true as const };
    },
    { ok: false as const, rule: 'not_found' as const },
  );
}
