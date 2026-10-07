import { and, desc, eq, notInArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { schema, type DbTransaction } from '@agency-os/db';
import { authorize, loadAccessContext, resolveActor, type Actor } from '@/modules/access';
import { recordAudit } from '@/modules/audit';
import { emit, requestFlush } from '@/modules/events';
import type { DbContexts, VerifiedClaims } from '@/platform/db';
import { addTimelineEntry } from '../timeline';
import { OFF_CYCLE_CODES, type PipelineCode } from './codes';
import {
  evaluateTransition,
  type PendingModule,
  type TransitionActor,
  type TransitionRefusal,
} from './transitions';

const { calls, dealStageChanges, deals } = schema;

export type StageActor = 'system' | { userId: string; isFounder: boolean };

export type StageChangeResult =
  | { ok: true; from: PipelineCode; to: PipelineCode }
  | { ok: false; rule: TransitionRefusal; module?: PendingModule }
  | { ok: false; rule: 'not_found' };

export type StageChangeInput = {
  dealId: string;
  to: PipelineCode;
  reason: string | null;
  actor: StageActor;
};

export type PipelineDeps = {
  contexts: DbContexts;
  flush?: () => Promise<void>;
};

const NOT_FOUND = { ok: false, rule: 'not_found' } as const;

function transitionActor(actor: StageActor): TransitionActor {
  if (actor === 'system') return 'system';
  return actor.isFounder ? 'founder' : 'staff';
}

function actorUserId(actor: StageActor): string | null {
  return actor === 'system' ? null : actor.userId;
}

function normalisedReason(reason: string | null): string | null {
  const trimmed = reason?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
}

async function previousOpenCode(tx: DbTransaction, dealId: string): Promise<PipelineCode | null> {
  const [row] = await tx
    .select({ code: dealStageChanges.toCode })
    .from(dealStageChanges)
    .where(
      and(
        eq(dealStageChanges.dealId, dealId),
        notInArray(dealStageChanges.toCode, [...OFF_CYCLE_CODES]),
      ),
    )
    .orderBy(desc(dealStageChanges.createdAt))
    .limit(1);
  return row?.code ?? null;
}

async function callFacts(tx: DbTransaction, dealId: string) {
  const rows = await tx
    .select({ status: calls.status, outcome: calls.outcome })
    .from(calls)
    .where(eq(calls.dealId, dealId));
  return {
    hasScheduledCall: rows.some((row) => row.status === 'scheduled'),
    hasCompletedCallWithOutcome: rows.some(
      (row) => row.status === 'completed' && row.outcome !== null,
    ),
  };
}

export async function applyStageChange(
  tx: DbTransaction,
  input: StageChangeInput,
): Promise<StageChangeResult> {
  const [deal] = await tx
    .select({
      id: deals.id,
      organizationId: deals.organizationId,
      clientId: deals.clientId,
      pipelineCode: deals.pipelineCode,
    })
    .from(deals)
    .where(eq(deals.id, input.dealId))
    .for('update');
  if (!deal) return NOT_FOUND;

  const reason = normalisedReason(input.reason);
  const decision = evaluateTransition({
    from: deal.pipelineCode,
    to: input.to,
    previousOpenCode: await previousOpenCode(tx, deal.id),
    actor: transitionActor(input.actor),
    reason,
    facts: await callFacts(tx, deal.id),
  });
  if (!decision.allowed) {
    return decision.module
      ? { ok: false, rule: decision.rule, module: decision.module }
      : { ok: false, rule: decision.rule };
  }

  await tx.execute(sql`select set_config('app.stage_change_reason', ${reason ?? ''}, true)`);
  await tx
    .update(deals)
    .set({
      pipelineCode: input.to,
      ...(input.to === 'X.4' ? { lostReason: reason } : {}),
    })
    .where(eq(deals.id, deal.id));
  await tx.execute(sql`select set_config('app.stage_change_reason', '', true)`);

  const summary = { from: deal.pipelineCode, to: input.to, reason };
  await addTimelineEntry(tx, {
    organizationId: deal.organizationId,
    clientId: deal.clientId,
    dealId: deal.id,
    kind: 'stage_changed',
    summary,
    itemType: 'deal',
    itemId: deal.id,
    actorUserId: actorUserId(input.actor),
  });
  await emit(tx, {
    type: 'commercial.deal.stage_changed',
    organizationId: deal.organizationId,
    clientId: deal.clientId,
    payload: { dealId: deal.id, from: deal.pipelineCode, to: input.to },
  });
  await recordAudit(tx, {
    organizationId: deal.organizationId,
    action: 'deal.stage_changed',
    resourceType: 'deal',
    resourceId: deal.id,
    clientId: deal.clientId,
    metadata: { from: deal.pipelineCode, to: input.to },
  });

  return { ok: true, from: deal.pipelineCode, to: input.to };
}

async function authorizedDealClient(
  tx: DbTransaction,
  actor: Actor,
  dealId: string,
): Promise<string | null> {
  const [deal] = await tx
    .select({ clientId: deals.clientId })
    .from(deals)
    .where(eq(deals.id, dealId));
  if (!deal) return null;
  const ctx = await loadAccessContext(tx, actor);
  const decision = authorize(actor, 'write', { type: 'pipeline', clientId: deal.clientId }, ctx);
  return decision.allowed ? deal.clientId : null;
}

export async function changeDealStage(
  claims: VerifiedClaims,
  input: { dealId: string; to: PipelineCode; reason: string | null },
  deps: PipelineDeps,
): Promise<StageChangeResult> {
  const result = await deps.contexts.withUserContext(claims, async (tx) => {
    const actor = await resolveActor(tx, claims);
    if (!actor || !(await authorizedDealClient(tx, actor, input.dealId))) return NOT_FOUND;
    return applyStageChange(tx, {
      ...input,
      actor: { userId: actor.userId, isFounder: actor.roles.includes('founder') },
    });
  });
  if (result.ok) await (deps.flush ?? requestFlush)();
  return result;
}

const trackingSchema = z.object({
  dealId: z.uuid(),
  nextStep: z.string().trim().max(500).nullable(),
  nextStepOwnerKind: z.enum(['staff', 'client']).nullable(),
  nextStepOwnerUserId: z.uuid().nullable(),
  nextStepDueOn: z.iso.date().nullable(),
  estimatedValue: z
    .string()
    .regex(/^\d{1,10}(\.\d{1,2})?$/)
    .nullable(),
  currency: z.enum(['EUR', 'GBP', 'USD']),
});

export type DealTrackingInput = z.input<typeof trackingSchema>;

export async function updateDealTracking(
  claims: VerifiedClaims,
  input: DealTrackingInput,
  deps: Pick<PipelineDeps, 'contexts'>,
): Promise<{ ok: true } | { ok: false; rule: 'not_found' | 'invalid_input' }> {
  const parsed = trackingSchema.safeParse(input);
  if (!parsed.success) return { ok: false, rule: 'invalid_input' };
  const data = parsed.data;

  return deps.contexts.withUserContext(claims, async (tx) => {
    const actor = await resolveActor(tx, claims);
    const clientId = actor ? await authorizedDealClient(tx, actor, data.dealId) : null;
    if (!actor || !clientId) return NOT_FOUND;

    const updated = await tx
      .update(deals)
      .set({
        nextStep: data.nextStep === '' ? null : data.nextStep,
        nextStepOwnerKind: data.nextStepOwnerKind,
        nextStepOwnerUserId: data.nextStepOwnerKind === 'staff' ? data.nextStepOwnerUserId : null,
        nextStepDueOn: data.nextStepDueOn,
        estimatedValue: data.estimatedValue,
        currency: data.currency,
      })
      .where(eq(deals.id, data.dealId))
      .returning({ id: deals.id });
    if (updated.length === 0) return NOT_FOUND;

    await recordAudit(tx, {
      organizationId: actor.organizationId,
      action: 'deal.updated',
      resourceType: 'deal',
      resourceId: data.dealId,
      clientId,
      metadata: { fields: ['next_step', 'owner', 'due_on', 'estimated_value', 'currency'] },
    });
    return { ok: true } as const;
  });
}
