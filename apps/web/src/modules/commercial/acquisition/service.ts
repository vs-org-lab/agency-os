import { randomUUID } from 'node:crypto';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { schema, type AcquisitionStatus, type ClientRole, type DbTransaction } from '@agency-os/db';
import { recordAudit } from '@/modules/audit';
import type { DbContexts, VerifiedClaims } from '@/platform/db';
import { isFounderActor } from '../access';
import { withActor } from '../authorization';

const { acquisitionTargets, clients, contacts, deals, messageTemplates } = schema;

export type AcquisitionTarget = {
  id: string;
  companyName: string;
  sector: string;
  website: string | null;
  notes: string | null;
  status: AcquisitionStatus;
  convertedClientId: string | null;
};

export type AcquisitionTemplate = { id: string; sector: string | null; name: string; body: string };

const targetSchema = z.object({
  targetId: z.uuid().nullable(),
  companyName: z.string().trim().min(1).max(200),
  sector: z.string().trim().min(1).max(80),
  website: z.string().trim().max(500).nullable(),
  notes: z.string().trim().max(5000).nullable(),
  status: z.enum(['to_contact', 'contacted', 'replied', 'converted', 'discarded']),
});

export type TargetInput = z.input<typeof targetSchema>;

export async function listAcquisitionTargets(tx: DbTransaction): Promise<AcquisitionTarget[]> {
  return tx
    .select({
      id: acquisitionTargets.id,
      companyName: acquisitionTargets.companyName,
      sector: acquisitionTargets.sector,
      website: acquisitionTargets.website,
      notes: acquisitionTargets.notes,
      status: acquisitionTargets.status,
      convertedClientId: acquisitionTargets.convertedClientId,
    })
    .from(acquisitionTargets)
    .where(isNull(acquisitionTargets.archivedAt))
    .orderBy(asc(acquisitionTargets.sector), asc(acquisitionTargets.companyName));
}

export async function listAcquisitionTemplates(tx: DbTransaction): Promise<AcquisitionTemplate[]> {
  return tx
    .select({
      id: messageTemplates.id,
      sector: messageTemplates.sector,
      name: messageTemplates.name,
      body: messageTemplates.body,
    })
    .from(messageTemplates)
    .where(and(eq(messageTemplates.kind, 'acquisition'), isNull(messageTemplates.archivedAt)))
    .orderBy(asc(messageTemplates.name));
}

function nullable(value: string | null): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
}

export async function saveAcquisitionTarget(
  claims: VerifiedClaims,
  input: TargetInput,
  deps: { contexts: Pick<DbContexts, 'withUserContext'> },
): Promise<{ ok: true; targetId: string } | { ok: false; rule: 'forbidden' | 'invalid_input' }> {
  const parsed = targetSchema.safeParse({
    ...input,
    website: nullable(input.website),
    notes: nullable(input.notes),
  });
  if (!parsed.success) return { ok: false, rule: 'invalid_input' };
  const data = parsed.data;

  return withActor<
    { ok: true; targetId: string } | { ok: false; rule: 'forbidden' | 'invalid_input' }
  >(
    deps.contexts,
    claims,
    async (tx, actor) => {
      if (!isFounderActor(actor)) return { ok: false, rule: 'forbidden' };
      const values = {
        companyName: data.companyName,
        sector: data.sector,
        website: data.website,
        notes: data.notes,
        status: data.status,
      };
      const [saved] = data.targetId
        ? await tx
            .update(acquisitionTargets)
            .set(values)
            .where(eq(acquisitionTargets.id, data.targetId))
            .returning({ id: acquisitionTargets.id })
        : await tx
            .insert(acquisitionTargets)
            .values({ ...values, organizationId: actor.organizationId })
            .returning({ id: acquisitionTargets.id });
      if (!saved) return { ok: false, rule: 'forbidden' };

      await recordAudit(tx, {
        organizationId: actor.organizationId,
        action: 'acquisition_target.saved',
        resourceType: 'acquisition_target',
        resourceId: saved.id,
        metadata: { status: data.status },
      });
      return { ok: true, targetId: saved.id };
    },
    { ok: false, rule: 'forbidden' },
  );
}

const convertSchema = z.object({
  targetId: z.uuid(),
  contact: z.object({
    fullName: z.string().trim().min(1).max(200),
    email: z.email().max(320).nullable(),
    role: z.enum(['decision_maker', 'operational', 'client_finance']),
  }),
});

export type ConvertResult =
  | { ok: true; dealId: string }
  | { ok: false; rule: 'forbidden' | 'not_found' | 'already_converted' | 'invalid_input' };

export async function convertAcquisitionTarget(
  claims: VerifiedClaims,
  input: {
    targetId: string;
    contact: { fullName: string; email: string | null; role: ClientRole };
  },
  deps: { contexts: Pick<DbContexts, 'withUserContext'> },
): Promise<ConvertResult> {
  const parsed = convertSchema.safeParse({
    ...input,
    contact: { ...input.contact, email: nullable(input.contact.email)?.toLowerCase() ?? null },
  });
  if (!parsed.success) return { ok: false, rule: 'invalid_input' };
  const data = parsed.data;

  return withActor<ConvertResult>(
    deps.contexts,
    claims,
    async (tx, actor) => {
      if (!isFounderActor(actor)) return { ok: false, rule: 'forbidden' };
      const [target] = await tx
        .select()
        .from(acquisitionTargets)
        .where(eq(acquisitionTargets.id, data.targetId))
        .for('update');
      if (!target) return { ok: false, rule: 'not_found' };
      if (target.convertedClientId) return { ok: false, rule: 'already_converted' };

      const client = { id: randomUUID() };
      await tx.insert(clients).values({
        id: client.id,
        organizationId: target.organizationId,
        name: target.companyName,
        sector: target.sector,
        website: target.website,
        lifecycle: 'prospect',
      });

      await tx.insert(contacts).values({
        organizationId: target.organizationId,
        clientId: client.id,
        fullName: data.contact.fullName,
        email: data.contact.email,
        role: data.contact.role,
      });
      const [deal] = await tx
        .insert(deals)
        .values({
          organizationId: target.organizationId,
          clientId: client.id,
          title: target.companyName,
          source: 'acquisition',
        })
        .returning({ id: deals.id });
      if (!deal) throw new Error('Deal was not created');

      await tx
        .update(acquisitionTargets)
        .set({ status: 'converted', convertedClientId: client.id })
        .where(eq(acquisitionTargets.id, target.id));
      await recordAudit(tx, {
        organizationId: target.organizationId,
        action: 'acquisition_target.converted',
        resourceType: 'acquisition_target',
        resourceId: target.id,
        clientId: client.id,
        metadata: { dealId: deal.id },
      });
      return { ok: true, dealId: deal.id };
    },
    { ok: false, rule: 'forbidden' },
  );
}
