import { z } from 'zod';
import { schema, type DbTransaction } from '@agency-os/db';
import { recordAudit } from '@/modules/audit';
import { emit, requestFlush } from '@/modules/events';
import { soleClientManager } from '@/modules/rooms/server';
import type { VerifiedClaims } from '@/platform/db';
import { INVALID_INPUT, NOT_FOUND, nowOf, type NotFound, type RetainersDeps } from './access';
import { retainerClient } from './client-access';
import { RETAINER_LIMIT_KINDS } from './domain/kinds';
import { lisbonDay, lisbonMonth } from './domain/months';
import { limitMonths } from './month';
import { quantity } from './retainers';
import { countUsage, lockRetainer, type LockedRetainer } from './usage';

const { retainerExtraRequests, tasks } = schema;

const TASK_TITLE_PREFIX = 'Pedido do cliente: ';
const TASK_DUE_DAYS = 5;
const DAY_MS = 86_400_000;

const requestSchema = z.object({
  retainerId: z.uuid(),
  kind: z.enum(RETAINER_LIMIT_KINDS),
  description: z.string().trim().min(1).max(500),
  quantity,
});

/** The team task for a client's request, assigned to the room's manager. */
export async function createRequestTask(
  tx: DbTransaction,
  retainer: LockedRetainer,
  description: string,
  createdBy: string,
  now: Date,
): Promise<string> {
  const [task] = await tx
    .insert(tasks)
    .values({
      organizationId: retainer.organizationId,
      clientId: retainer.clientId,
      projectId: retainer.projectId,
      title: `${TASK_TITLE_PREFIX}${description}`.slice(0, 200),
      notes: description,
      assigneeId: await soleClientManager(tx, retainer.clientId),
      dueOn: lisbonDay(new Date(now.getTime() + TASK_DUE_DAYS * DAY_MS)),
      createdBy,
    })
    .returning({ id: tasks.id });
  if (!task) throw new Error('The request task was not created');
  return task.id;
}

/**
 * F7 and US-19: the client asks for work. Within the month's allowance it becomes a team task
 * with its usage; above it, an extra request the team quotes and the client approves first
 * (RN-61). The retainer is locked, so concurrent requests never pass the allowance together.
 */
export async function requestWork(
  claims: VerifiedClaims,
  input: { retainerId: string; kind: string; description: string; quantity: string },
  deps: RetainersDeps,
): Promise<{ ok: true; outcome: 'task' | 'extra' } | NotFound | typeof INVALID_INPUT> {
  const client = await retainerClient(claims, input.retainerId, deps);
  if (!client) return NOT_FOUND;
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) return INVALID_INPUT;
  const data = parsed.data;
  const now = nowOf(deps);
  const month = lisbonMonth(now);

  const result = await deps.contexts.withSystemContext(async (tx) => {
    const retainer = await lockRetainer(tx, data.retainerId);
    if (!retainer || retainer.clientId !== client.clientId) return NOT_FOUND;
    if (retainer.status !== 'active') return INVALID_INPUT;
    const state = (await limitMonths(tx, retainer, month)).find(
      (limit) => limit.kind === data.kind,
    );
    const fits = state !== undefined && state.used + Number(data.quantity) <= state.available;

    if (fits) {
      const taskId = await createRequestTask(tx, retainer, data.description, claims.sub, now);
      const counted = await countUsage(
        tx,
        retainer,
        {
          kind: data.kind,
          quantity: data.quantity,
          description: data.description,
          taskId,
          recordedBy: claims.sub,
        },
        month,
      );
      if (!counted.ok) throw new Error('Usage that fits the allowance was refused');
      await recordAudit(tx, {
        organizationId: retainer.organizationId,
        action: 'retainer.requested',
        resourceType: 'retainer',
        resourceId: retainer.id,
        clientId: retainer.clientId,
        metadata: { outcome: 'task', kind: data.kind, quantity: data.quantity, taskId },
      });
      if (counted.crossed.length > 0) {
        await emit(tx, {
          type: 'retainers.usage.recorded',
          organizationId: retainer.organizationId,
          clientId: retainer.clientId,
          payload: { retainerId: retainer.id, month },
        });
      }
      return { ok: true as const, outcome: 'task' as const };
    }

    const [extra] = await tx
      .insert(retainerExtraRequests)
      .values({
        organizationId: retainer.organizationId,
        clientId: retainer.clientId,
        retainerId: retainer.id,
        kind: data.kind,
        description: data.description,
        quantity: data.quantity,
        requestedBy: claims.sub,
      })
      .returning({ id: retainerExtraRequests.id });
    if (!extra) throw new Error('The extra request was not created');
    await recordAudit(tx, {
      organizationId: retainer.organizationId,
      action: 'retainer.requested',
      resourceType: 'retainer_extra_request',
      resourceId: extra.id,
      clientId: retainer.clientId,
      metadata: { outcome: 'extra', kind: data.kind, quantity: data.quantity },
    });
    await emit(tx, {
      type: 'retainers.extra.requested',
      organizationId: retainer.organizationId,
      clientId: retainer.clientId,
      payload: { retainerId: retainer.id, extraRequestId: extra.id },
    });
    return { ok: true as const, outcome: 'extra' as const };
  });
  if (result.ok) await (deps.flush ?? requestFlush)();
  return result;
}
