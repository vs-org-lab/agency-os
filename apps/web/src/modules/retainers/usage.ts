import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { schema, type DbTransaction } from '@agency-os/db';
import { recordAudit } from '@/modules/audit';
import type { VerifiedClaims } from '@/platform/db';
import {
  INVALID_INPUT,
  LIMIT_REACHED,
  NOT_FOUND,
  nowOf,
  OK,
  retainerWriter,
  type NotFound,
  type RetainersDeps,
} from './access';
import { crossedThresholds, type AlertThreshold } from './domain/allowance';
import { RETAINER_LIMIT_KINDS, type RetainerLimitKind } from './domain/kinds';
import { lisbonMonth } from './domain/months';
import { limitMonths } from './month';
import { quantity } from './retainers';

const { retainerUsage, retainers } = schema;

export type LockedRetainer = typeof retainers.$inferSelect;

/** Locks the retainer for the rest of the transaction, so usage is decided one entry at a time. */
export async function lockRetainer(
  tx: DbTransaction,
  retainerId: string,
): Promise<LockedRetainer | null> {
  const [row] = await tx.select().from(retainers).where(eq(retainers.id, retainerId)).for('update');
  return row ?? null;
}

export type CountedUsage =
  | { ok: true; usageId: string; crossed: AlertThreshold[] }
  | typeof LIMIT_REACHED
  | typeof INVALID_INPUT;

/**
 * Records usage counted against the month's allowance, inside the caller's transaction and with
 * the retainer locked; refused when it would pass the available (RN-61).
 */
export async function countUsage(
  tx: DbTransaction,
  retainer: LockedRetainer,
  entry: {
    kind: RetainerLimitKind;
    quantity: string;
    description: string;
    taskId?: string | null;
    recordedBy: string;
  },
  month: string,
): Promise<CountedUsage> {
  const state = (await limitMonths(tx, retainer, month)).find((limit) => limit.kind === entry.kind);
  if (!state) return INVALID_INPUT;
  const after = Math.round((state.used + Number(entry.quantity)) * 10) / 10;
  if (after > state.available) return LIMIT_REACHED;
  const [row] = await tx
    .insert(retainerUsage)
    .values({
      organizationId: retainer.organizationId,
      clientId: retainer.clientId,
      retainerId: retainer.id,
      kind: entry.kind,
      month,
      quantity: entry.quantity,
      description: entry.description,
      taskId: entry.taskId ?? null,
      recordedBy: entry.recordedBy,
    })
    .returning({ id: retainerUsage.id });
  if (!row) throw new Error('The usage was not recorded');
  return {
    ok: true,
    usageId: row.id,
    crossed: crossedThresholds(state.used, after, state.available),
  };
}

const usageSchema = z.object({
  retainerId: z.uuid(),
  kind: z.enum(RETAINER_LIMIT_KINDS),
  quantity,
  description: z.string().trim().min(1).max(500),
  taskId: z.uuid().optional(),
});

/** RF-111: the team records work done this month against a limit. */
export async function recordUsage(
  claims: VerifiedClaims,
  input: {
    retainerId: string;
    kind: string;
    quantity: string;
    description: string;
    taskId?: string;
  },
  deps: RetainersDeps,
): Promise<typeof OK | NotFound | typeof INVALID_INPUT | typeof LIMIT_REACHED> {
  const parsed = usageSchema.safeParse(input);
  if (!parsed.success)
    return z.uuid().safeParse(input.retainerId).success ? INVALID_INPUT : NOT_FOUND;
  const data = parsed.data;
  const [owner] = await deps.contexts.withSystemContext((tx) =>
    tx
      .select({ clientId: retainers.clientId })
      .from(retainers)
      .where(eq(retainers.id, data.retainerId)),
  );
  if (!owner) return NOT_FOUND;
  const actor = await retainerWriter(claims, owner.clientId, deps);
  if (!actor) return NOT_FOUND;
  const month = lisbonMonth(nowOf(deps));

  return deps.contexts.withSystemContext(async (tx) => {
    const retainer = await lockRetainer(tx, data.retainerId);
    if (!retainer || retainer.organizationId !== actor.organizationId) return NOT_FOUND;
    if (retainer.status !== 'active') return INVALID_INPUT;
    const counted = await countUsage(
      tx,
      retainer,
      {
        kind: data.kind,
        quantity: data.quantity,
        description: data.description,
        taskId: data.taskId ?? null,
        recordedBy: actor.userId,
      },
      month,
    );
    if (!counted.ok) return counted;
    await recordAudit(tx, {
      organizationId: retainer.organizationId,
      action: 'retainer.usage_recorded',
      resourceType: 'retainer_usage',
      resourceId: counted.usageId,
      clientId: retainer.clientId,
      metadata: { kind: data.kind, quantity: data.quantity, month },
    });
    return OK;
  });
}

/** Removes a usage entry; correcting usage is deleting and recording again. */
export async function deleteUsage(
  claims: VerifiedClaims,
  usageId: string,
  deps: RetainersDeps,
): Promise<typeof OK | NotFound> {
  if (!z.uuid().safeParse(usageId).success) return NOT_FOUND;
  const [usage] = await deps.contexts.withSystemContext((tx) =>
    tx.select().from(retainerUsage).where(eq(retainerUsage.id, usageId)),
  );
  if (!usage) return NOT_FOUND;
  const actor = await retainerWriter(claims, usage.clientId, deps);
  if (!actor || actor.organizationId !== usage.organizationId) return NOT_FOUND;
  return deps.contexts.withSystemContext(async (tx) => {
    const deleted = await tx
      .delete(retainerUsage)
      .where(
        and(eq(retainerUsage.id, usage.id), eq(retainerUsage.organizationId, actor.organizationId)),
      )
      .returning({ id: retainerUsage.id });
    if (deleted.length === 0) return NOT_FOUND;
    await recordAudit(tx, {
      organizationId: usage.organizationId,
      action: 'retainer.usage_deleted',
      resourceType: 'retainer_usage',
      resourceId: usage.id,
      clientId: usage.clientId,
      metadata: { kind: usage.kind, quantity: usage.quantity, month: usage.month },
    });
    return OK;
  });
}
