import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { schema, type CallOutcome } from '@agency-os/db';
import { recordAudit } from '@/modules/audit';
import { emit, requestFlush } from '@/modules/events';
import type { DbContexts, VerifiedClaims } from '@/platform/db';
import { canWriteClient, withActor, writableDeal } from './authorization';
import { syncCallEvent, type HostCalendar } from './booking/service';
import { applyStageChange } from './pipeline/service';
import { addTimelineEntry } from './timeline';

const { applications, calls, contacts, deals } = schema;

export type CallDeps = {
  contexts: DbContexts;
  calendar: (organizationId: string) => Promise<HostCalendar | null>;
  flush?: () => Promise<void>;
};

type CallRefusal = 'not_found' | 'invalid_input' | 'outcome_required' | 'reason_required';
export type CallResult = { ok: true } | { ok: false; rule: CallRefusal };

const scheduleSchema = z.object({
  dealId: z.uuid(),
  start: z.date(),
  durationMinutes: z.number().int().min(15).max(180),
});

export async function scheduleCallManually(
  claims: VerifiedClaims,
  input: { dealId: string; start: Date; durationMinutes: number },
  deps: CallDeps,
): Promise<
  | { ok: true; callId: string }
  | { ok: false; rule: 'not_found' | 'invalid_input' | 'already_scheduled' }
> {
  const parsed = scheduleSchema.safeParse(input);
  if (!parsed.success || parsed.data.start.getTime() <= Date.now()) {
    return { ok: false, rule: 'invalid_input' };
  }
  const { dealId, start, durationMinutes } = parsed.data;

  const result = await withActor(
    deps.contexts,
    claims,
    async (tx, actor) => {
      const deal = await writableDeal(tx, actor, dealId);
      if (!deal) return { ok: false as const, rule: 'not_found' as const };
      const [scheduled] = await tx
        .select({ id: calls.id })
        .from(calls)
        .where(and(eq(calls.dealId, dealId), eq(calls.status, 'scheduled')));
      if (scheduled) return { ok: false as const, rule: 'already_scheduled' as const };

      const [application] = await tx
        .select({ contactId: applications.contactId })
        .from(applications)
        .where(eq(applications.dealId, dealId))
        .orderBy(desc(applications.createdAt))
        .limit(1);
      const [contact] = application
        ? [{ id: application.contactId }]
        : await tx
            .select({ id: contacts.id })
            .from(contacts)
            .where(and(eq(contacts.clientId, deal.clientId), eq(contacts.role, 'decision_maker')))
            .limit(1);

      const [call] = await tx
        .insert(calls)
        .values({
          organizationId: deal.organizationId,
          clientId: deal.clientId,
          dealId,
          contactId: contact?.id ?? null,
          hostUserId: actor.userId,
          startsAt: start,
          endsAt: new Date(start.getTime() + durationMinutes * 60_000),
        })
        .returning({ id: calls.id });
      if (!call) throw new Error('Call was not recorded');

      const [current] = await tx
        .select({ code: deals.pipelineCode })
        .from(deals)
        .where(eq(deals.id, dealId));
      if (current?.code === '0.2') {
        await applyStageChange(tx, {
          dealId,
          to: '0.3',
          reason: null,
          actor: { userId: actor.userId, isFounder: actor.roles.includes('founder') },
        });
      }
      await addTimelineEntry(tx, {
        organizationId: deal.organizationId,
        clientId: deal.clientId,
        dealId,
        kind: 'call_booked',
        summary: { startsAt: start.toISOString(), bookedBy: 'staff' },
        itemType: 'call',
        itemId: call.id,
        actorUserId: actor.userId,
      });
      await recordAudit(tx, {
        organizationId: deal.organizationId,
        action: 'call.booked',
        resourceType: 'call',
        resourceId: call.id,
        clientId: deal.clientId,
        metadata: { startsAt: start.toISOString(), manual: true },
      });
      await emit(tx, {
        type: 'commercial.call.booked',
        organizationId: deal.organizationId,
        clientId: deal.clientId,
        payload: { callId: call.id, dealId, startsAt: start.toISOString() },
      });
      return { ok: true as const, callId: call.id, organizationId: deal.organizationId };
    },
    { ok: false as const, rule: 'not_found' as const },
  );

  if (!result.ok) return result;
  const host = await deps.calendar(result.organizationId);
  if (host && host.hostUserId === claims.sub) {
    await syncCallEvent(result.callId, host.port, deps.contexts).catch(() => undefined);
  }
  await (deps.flush ?? requestFlush)();
  return { ok: true, callId: result.callId };
}

const outcomeSchema = z.object({
  callId: z.uuid(),
  status: z.enum(['completed', 'no_show']),
  outcome: z.enum(['advance', 'decline', 'follow_up']).nullable(),
  reason: z.string().trim().max(500).nullable(),
  notes: z.string().trim().max(5000).nullable(),
});

export async function recordCallOutcome(
  claims: VerifiedClaims,
  input: {
    callId: string;
    status: 'completed' | 'no_show';
    outcome: CallOutcome | null;
    reason: string | null;
    notes: string | null;
  },
  deps: CallDeps,
): Promise<CallResult> {
  const parsed = outcomeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, rule: 'invalid_input' };
  const data = parsed.data;
  const reason = data.reason === '' ? null : data.reason;
  if (data.status === 'completed' && !data.outcome) return { ok: false, rule: 'outcome_required' };
  if (data.outcome === 'decline' && !reason) return { ok: false, rule: 'reason_required' };

  const result = await withActor<CallResult>(
    deps.contexts,
    claims,
    async (tx, actor) => {
      const [call] = await tx
        .select({
          dealId: calls.dealId,
          clientId: calls.clientId,
          organizationId: calls.organizationId,
        })
        .from(calls)
        .where(eq(calls.id, data.callId));
      if (!call || !(await canWriteClient(tx, actor, call.clientId))) {
        return { ok: false, rule: 'not_found' };
      }

      const outcome = data.status === 'completed' ? data.outcome : null;
      await tx
        .update(calls)
        .set({ status: data.status, outcome, outcomeReason: reason, notes: data.notes })
        .where(eq(calls.id, data.callId));

      const [deal] = await tx
        .select({ code: deals.pipelineCode })
        .from(deals)
        .where(eq(deals.id, call.dealId));
      const stageActor = { userId: actor.userId, isFounder: actor.roles.includes('founder') };
      if (outcome === 'decline' && deal?.code !== 'X.4') {
        await applyStageChange(tx, { dealId: call.dealId, to: 'X.4', reason, actor: stageActor });
      } else if ((outcome === 'advance' || outcome === 'follow_up') && deal?.code === '0.3') {
        await applyStageChange(tx, {
          dealId: call.dealId,
          to: '0.4',
          reason: null,
          actor: stageActor,
        });
      }

      await addTimelineEntry(tx, {
        organizationId: call.organizationId,
        clientId: call.clientId,
        dealId: call.dealId,
        kind: 'call_completed',
        summary: { status: data.status, outcome, reason },
        itemType: 'call',
        itemId: data.callId,
        actorUserId: actor.userId,
      });
      await recordAudit(tx, {
        organizationId: call.organizationId,
        action: 'call.outcome_recorded',
        resourceType: 'call',
        resourceId: data.callId,
        clientId: call.clientId,
        metadata: { status: data.status, outcome },
      });
      await emit(tx, {
        type: 'commercial.call.completed',
        organizationId: call.organizationId,
        clientId: call.clientId,
        payload: { callId: data.callId, dealId: call.dealId, status: data.status, outcome },
      });
      return { ok: true };
    },
    { ok: false, rule: 'not_found' },
  );

  if (result.ok) await (deps.flush ?? requestFlush)();
  return result;
}
