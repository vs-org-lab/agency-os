import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { schema } from '@agency-os/db';
import { recordAudit } from '@/modules/audit';
import { emit, requestFlush } from '@/modules/events';
import type { VerifiedClaims } from '@/platform/db';
import {
  INVALID_INPUT,
  INVALID_STATE,
  NOT_FOUND,
  nowOf,
  OK,
  retainerWriter,
  type NotFound,
  type RetainersDeps,
} from './access';
import { retainerClient } from './client-access';
import { issueRetainerRequests } from './billing';
import { lisbonMonth } from './domain/months';
import { createRequestTask } from './requests';
import { lockRetainer } from './usage';

const { approvals, retainerExtraRequests, retainerUsage } = schema;

const DECLINED_COMMENT = 'Recusado';

const quoteSchema = z.object({
  extraRequestId: z.uuid(),
  amount: z
    .string()
    .regex(/^\d{1,10}(\.\d{1,2})?$/)
    .refine((value) => Number(value) > 0),
  currency: z.enum(['EUR', 'GBP', 'USD', 'AOA']),
});

async function loadExtra(extraRequestId: string, deps: RetainersDeps) {
  if (!z.uuid().safeParse(extraRequestId).success) return null;
  const [extra] = await deps.contexts.withSystemContext((tx) =>
    tx.select().from(retainerExtraRequests).where(eq(retainerExtraRequests.id, extraRequestId)),
  );
  return extra ?? null;
}

/**
 * RF-112: the room's team quotes an extra request, which asks the client's decision maker for
 * approval through the approvals of 2D, with their reminders.
 */
export async function quoteExtra(
  claims: VerifiedClaims,
  input: { extraRequestId: string; amount: string; currency: string },
  deps: RetainersDeps,
): Promise<typeof OK | NotFound | typeof INVALID_INPUT | typeof INVALID_STATE> {
  const extra = await loadExtra(input.extraRequestId, deps);
  if (!extra) return NOT_FOUND;
  const actor = await retainerWriter(claims, extra.clientId, deps);
  if (!actor || actor.organizationId !== extra.organizationId) return NOT_FOUND;
  const parsed = quoteSchema.safeParse(input);
  if (!parsed.success) return INVALID_INPUT;
  const now = nowOf(deps);

  const result = await deps.contexts.withSystemContext(async (tx) => {
    const retainer = await lockRetainer(tx, extra.retainerId);
    if (!retainer) return NOT_FOUND;
    const [current] = await tx
      .select({ status: retainerExtraRequests.status })
      .from(retainerExtraRequests)
      .where(eq(retainerExtraRequests.id, extra.id))
      .for('update');
    if (current?.status !== 'requested') return INVALID_STATE;
    const [approval] = await tx
      .insert(approvals)
      .values({
        organizationId: retainer.organizationId,
        clientId: retainer.clientId,
        projectId: retainer.projectId,
        subjectType: 'retainer_extra',
        subjectId: extra.id,
        requestedBy: actor.userId,
        requestedAt: now,
      })
      .returning({ id: approvals.id });
    if (!approval) throw new Error('The extra request approval was not created');
    await tx
      .update(retainerExtraRequests)
      .set({
        status: 'quoted',
        quoteAmount: parsed.data.amount,
        currency: parsed.data.currency,
        approvalId: approval.id,
        updatedAt: now,
      })
      .where(eq(retainerExtraRequests.id, extra.id));
    await recordAudit(tx, {
      organizationId: retainer.organizationId,
      action: 'retainer.extra_quoted',
      resourceType: 'retainer_extra_request',
      resourceId: extra.id,
      clientId: retainer.clientId,
      metadata: { amount: parsed.data.amount, currency: parsed.data.currency },
    });
    await emit(tx, {
      type: 'rooms.approval.requested',
      organizationId: retainer.organizationId,
      clientId: retainer.clientId,
      payload: { projectId: retainer.projectId, approvalId: approval.id },
    });
    return OK;
  });
  if (result.ok) await (deps.flush ?? requestFlush)();
  return result;
}

/**
 * RN-61: the client's decision maker decides a quoted extra request. Approving creates the team
 * task, records its usage outside the month's limit and bills the quote (3B.2); declining closes it.
 */
export async function decideExtra(
  claims: VerifiedClaims,
  input: { extraRequestId: string; decision: 'approved' | 'declined' },
  deps: RetainersDeps,
): Promise<typeof OK | NotFound | typeof INVALID_STATE> {
  const extra = await loadExtra(input.extraRequestId, deps);
  if (!extra) return NOT_FOUND;
  const client = await retainerClient(claims, extra.retainerId, deps);
  if (!client?.decides || client.clientId !== extra.clientId) return NOT_FOUND;
  if (input.decision !== 'approved' && input.decision !== 'declined') return INVALID_STATE;
  const now = nowOf(deps);

  const decided = await deps.contexts.withSystemContext(async (tx) => {
    const retainer = await lockRetainer(tx, extra.retainerId);
    if (!retainer) return { result: NOT_FOUND, billed: false };
    const [current] = await tx
      .select()
      .from(retainerExtraRequests)
      .where(eq(retainerExtraRequests.id, extra.id))
      .for('update');
    if (current?.status !== 'quoted') return { result: INVALID_STATE, billed: false };
    const approved = input.decision === 'approved';
    if (current.approvalId) {
      await tx
        .update(approvals)
        .set({
          status: approved ? 'approved' : 'changes_requested',
          decidedBy: claims.sub,
          decidedAt: now,
          comment: approved ? null : DECLINED_COMMENT,
        })
        .where(and(eq(approvals.id, current.approvalId), eq(approvals.status, 'pending')));
    }
    let taskId: string | null = null;
    if (approved) {
      taskId = await createRequestTask(tx, retainer, current.description, claims.sub, now);
      await tx.insert(retainerUsage).values({
        organizationId: retainer.organizationId,
        clientId: retainer.clientId,
        retainerId: retainer.id,
        kind: current.kind,
        month: lisbonMonth(now),
        quantity: current.quantity,
        description: current.description,
        taskId,
        extraRequestId: current.id,
        recordedBy: claims.sub,
      });
    }
    await tx
      .update(retainerExtraRequests)
      .set({ status: approved ? 'approved' : 'declined', taskId, updatedAt: now })
      .where(eq(retainerExtraRequests.id, current.id));
    await recordAudit(tx, {
      organizationId: retainer.organizationId,
      action: 'retainer.extra_decided',
      resourceType: 'retainer_extra_request',
      resourceId: current.id,
      clientId: retainer.clientId,
      metadata: { decision: input.decision },
    });
    const billed = approved
      ? await issueRetainerRequests(tx, retainer.id, deps, 'extras')
      : { months: 0, extras: 0 };
    return { result: OK, billed: billed.extras > 0 };
  });
  if (decided.result.ok && decided.billed) await (deps.flush ?? requestFlush)();
  return decided.result;
}
