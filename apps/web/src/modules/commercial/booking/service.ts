import { and, desc, eq, gte, ne, sql } from 'drizzle-orm';
import { schema, type DbTransaction } from '@agency-os/db';
import { recordAudit } from '@/modules/audit';
import { emit, requestFlush } from '@/modules/events';
import type { DbContexts } from '@/platform/db';
import { verifyToken } from '@/platform/signed-token';
import { applicationFormDefinitionSchema } from '../applications/form-definition';
import type { CalendarEventInput, CalendarPort } from '../calendar/port';
import { applyStageChange } from '../pipeline/service';
import { consumeThrottle, THROTTLE_LIMITS } from '../protection/throttle';
import { addTimelineEntry } from '../timeline';
import { hashManageToken } from './links';
import {
  computeAvailableSlots,
  DEFAULT_BOOKING_RULES,
  resolveTimeZone,
  type BookingRules,
  type Interval,
} from './slots';

const {
  applicationForms,
  applications,
  calls,
  clients,
  commercialSettings,
  contacts,
  deals,
  organizations,
} = schema;

export const MANAGE_CUTOFF_MS = 2 * 60 * 60 * 1000;

export type HostCalendar = { port: CalendarPort; hostUserId: string };

export type BookingDeps = {
  contexts: Pick<DbContexts, 'withSystemContext'>;
  linkSecret: string;
  now: () => Date;
  calendar: (organizationId: string) => Promise<HostCalendar | null>;
  flush?: () => Promise<void>;
};

export type BookingSource =
  | { kind: 'thanks'; token: string }
  | { kind: 'link'; token: string }
  | { kind: 'manage'; token: string };

export type BookingAccess = {
  dealId: string;
  organizationId: string;
  clientId: string;
  callId: string | null;
};

export type SlotsResult =
  | { status: 'available'; slots: Date[]; rules: BookingRules; scheduledAt: Date | null }
  | { status: 'unavailable' }
  | { status: 'closed' };

export type BookResult =
  | { status: 'booked'; callId: string; startsAt: Date; meetUrl: string | null }
  | { status: 'slot_taken' }
  | { status: 'unavailable' }
  | { status: 'throttled' }
  | { status: 'closed' };

export type RescheduleResult =
  | { status: 'rescheduled'; startsAt: Date }
  | { status: 'slot_taken' }
  | { status: 'too_late' }
  | { status: 'unavailable' }
  | { status: 'closed' };

export type CancelResult = { status: 'cancelled' } | { status: 'too_late' } | { status: 'closed' };

async function flush(deps: BookingDeps): Promise<void> {
  await (deps.flush ?? requestFlush)();
}

export async function resolveBookingAccess(
  source: BookingSource,
  deps: BookingDeps,
): Promise<BookingAccess | null> {
  const now = deps.now();
  return deps.contexts.withSystemContext(async (tx) => {
    if (source.kind === 'manage') {
      const [call] = await tx
        .select({
          id: calls.id,
          dealId: calls.dealId,
          organizationId: calls.organizationId,
          clientId: calls.clientId,
        })
        .from(calls)
        .where(eq(calls.manageTokenHash, hashManageToken(source.token)));
      return call
        ? {
            dealId: call.dealId,
            organizationId: call.organizationId,
            clientId: call.clientId,
            callId: call.id,
          }
        : null;
    }

    const purpose = source.kind === 'thanks' ? 'apply_thanks' : 'booking_link';
    const data = verifyToken(source.token, purpose, deps.linkSecret, now);
    if (!data) return null;

    let dealId = data.dealId;
    if (source.kind === 'thanks') {
      if (data.path !== 'a' || !data.applicationId) return null;
      const [application] = await tx
        .select({ dealId: applications.dealId })
        .from(applications)
        .where(eq(applications.id, data.applicationId));
      dealId = application?.dealId;
    }
    if (!dealId) return null;

    const [deal] = await tx
      .select({ id: deals.id, organizationId: deals.organizationId, clientId: deals.clientId })
      .from(deals)
      .where(eq(deals.id, dealId));
    return deal
      ? {
          dealId: deal.id,
          organizationId: deal.organizationId,
          clientId: deal.clientId,
          callId: null,
        }
      : null;
  });
}

async function bookingRules(tx: DbTransaction, organizationId: string): Promise<BookingRules> {
  const [settings] = await tx
    .select()
    .from(commercialSettings)
    .where(eq(commercialSettings.organizationId, organizationId));
  if (!settings) return DEFAULT_BOOKING_RULES;
  return {
    timeZone: settings.timeZone,
    weeklyHours: settings.weeklyHours,
    durationMinutes: settings.durationMinutes,
    bufferMinutes: settings.bufferMinutes,
    minimumNoticeHours: settings.minimumNoticeHours,
    horizonDays: settings.horizonDays,
    stepMinutes: DEFAULT_BOOKING_RULES.stepMinutes,
  };
}

async function dealState(tx: DbTransaction, dealId: string, lock: boolean) {
  const query = tx.select({ code: deals.pipelineCode }).from(deals).where(eq(deals.id, dealId));
  const [deal] = lock ? await query.for('update') : await query;
  const [scheduled] = await tx
    .select({ id: calls.id, startsAt: calls.startsAt })
    .from(calls)
    .where(and(eq(calls.dealId, dealId), eq(calls.status, 'scheduled')));
  return { code: deal?.code ?? null, scheduled: scheduled ?? null };
}

async function hostBookings(
  tx: DbTransaction,
  hostUserId: string,
  now: Date,
  excludeCallId: string | null,
): Promise<Interval[]> {
  const rows = await tx
    .select({ start: calls.startsAt, end: calls.endsAt })
    .from(calls)
    .where(
      and(
        eq(calls.hostUserId, hostUserId),
        eq(calls.status, 'scheduled'),
        gte(calls.endsAt, now),
        excludeCallId ? ne(calls.id, excludeCallId) : undefined,
      ),
    );
  return rows.map((row) => ({ start: row.start, end: row.end }));
}

function horizonRange(now: Date, rules: BookingRules): Interval {
  return { start: now, end: new Date(now.getTime() + (rules.horizonDays + 2) * 86_400_000) };
}

async function externalBusy(host: HostCalendar, range: Interval): Promise<Interval[] | null> {
  try {
    return await host.port.freeBusy(range);
  } catch {
    return null;
  }
}

async function emitUnavailable(deps: BookingDeps, organizationId: string): Promise<void> {
  await deps.contexts.withSystemContext((tx) =>
    emit(tx, {
      type: 'commercial.calendar.unavailable',
      organizationId,
      payload: { reason: 'not_connected' },
    }),
  );
  await flush(deps);
}

function sameInstant(first: Date, second: Date): boolean {
  return first.getTime() === second.getTime();
}

export async function listSlots(access: BookingAccess, deps: BookingDeps): Promise<SlotsResult> {
  const now = deps.now();
  const state = await deps.contexts.withSystemContext(async (tx) => ({
    rules: await bookingRules(tx, access.organizationId),
    deal: await dealState(tx, access.dealId, false),
  }));

  const managingOwnCall = access.callId !== null && state.deal.scheduled?.id === access.callId;
  const open = state.deal.code === '0.2' && state.deal.scheduled === null;
  if (!open && !(managingOwnCall && state.deal.code === '0.3')) return { status: 'closed' };

  const host = await deps.calendar(access.organizationId);
  if (!host) {
    await emitUnavailable(deps, access.organizationId);
    return { status: 'unavailable' };
  }
  const external = await externalBusy(host, horizonRange(now, state.rules));
  if (!external) return { status: 'unavailable' };

  const booked = await deps.contexts.withSystemContext((tx) =>
    hostBookings(tx, host.hostUserId, now, managingOwnCall ? access.callId : null),
  );
  return {
    status: 'available',
    slots: computeAvailableSlots({ now, rules: state.rules, busy: [...external, ...booked] }),
    rules: state.rules,
    scheduledAt: managingOwnCall ? (state.deal.scheduled?.startsAt ?? null) : null,
  };
}

async function eventInput(
  tx: DbTransaction,
  callId: string,
): Promise<CalendarEventInput & { externalEventId: string | null }> {
  const [row] = await tx
    .select({
      callId: calls.id,
      dealId: calls.dealId,
      startsAt: calls.startsAt,
      endsAt: calls.endsAt,
      externalEventId: calls.externalEventId,
      contactName: contacts.fullName,
      contactEmail: contacts.email,
      companyName: clients.name,
      organizationName: organizations.name,
      locale: organizations.defaultLocale,
    })
    .from(calls)
    .innerJoin(clients, eq(clients.id, calls.clientId))
    .innerJoin(organizations, eq(organizations.id, calls.organizationId))
    .leftJoin(contacts, eq(contacts.id, calls.contactId))
    .where(eq(calls.id, callId));
  if (!row) throw new Error(`Call ${callId} was not found`);

  const [application] = await tx
    .select({ answers: applications.answers, definition: applicationForms.definition })
    .from(applications)
    .innerJoin(applicationForms, eq(applicationForms.id, applications.formId))
    .where(eq(applications.dealId, row.dealId))
    .orderBy(desc(applications.createdAt))
    .limit(1);

  let description = '';
  const definition = applicationFormDefinitionSchema.safeParse(application?.definition);
  const texts =
    (application?.answers as { texts?: Record<string, string> } | undefined)?.texts ?? {};
  if (definition.success) {
    description = definition.data.questions
      .filter((question) => question.kind === 'long_text' && texts[question.id])
      .map((question) => `${question.label[row.locale]}\n${texts[question.id]}`)
      .join('\n\n');
  }

  return {
    requestId: row.callId,
    start: row.startsAt,
    end: row.endsAt,
    summary: `${row.organizationName} · ${row.companyName}`,
    description,
    attendee: row.contactEmail
      ? { email: row.contactEmail, name: row.contactName ?? row.companyName }
      : null,
    externalEventId: row.externalEventId,
  };
}

export async function syncCallEvent(
  callId: string,
  port: CalendarPort,
  contexts: Pick<DbContexts, 'withSystemContext'>,
): Promise<{ meetUrl: string | null }> {
  const input = await contexts.withSystemContext((tx) => eventInput(tx, callId));
  if (input.externalEventId) {
    const updated = await port.updateEvent(input.externalEventId, input);
    if (updated === 'updated') {
      await contexts.withSystemContext((tx) =>
        tx.update(calls).set({ syncStatus: 'synced' }).where(eq(calls.id, callId)),
      );
      const [call] = await contexts.withSystemContext((tx) =>
        tx.select({ meetUrl: calls.meetUrl }).from(calls).where(eq(calls.id, callId)),
      );
      return { meetUrl: call?.meetUrl ?? null };
    }
  }

  const created = await port.createEvent(input);
  await contexts.withSystemContext((tx) =>
    tx
      .update(calls)
      .set({ externalEventId: created.eventId, meetUrl: created.meetUrl, syncStatus: 'synced' })
      .where(eq(calls.id, callId)),
  );
  return { meetUrl: created.meetUrl };
}

export type PendingSyncResult = { endsAt: string; sync: 'synced' | 'skipped' | 'failed' };

/**
 * Brings a call's calendar event up to date without ever blocking the lead's messages: a
 * failure is recorded on the call instead of thrown, and calls hosted by someone other than
 * the connected calendar's owner stay out of that calendar.
 */
export async function syncPendingCall(
  callId: string,
  deps: Pick<BookingDeps, 'contexts' | 'calendar'>,
): Promise<PendingSyncResult | null> {
  const [call] = await deps.contexts.withSystemContext((tx) =>
    tx
      .select({
        organizationId: calls.organizationId,
        hostUserId: calls.hostUserId,
        status: calls.status,
        syncStatus: calls.syncStatus,
        endsAt: calls.endsAt,
      })
      .from(calls)
      .where(eq(calls.id, callId)),
  );
  if (!call) return null;
  const endsAt = call.endsAt.toISOString();
  if (call.syncStatus === 'synced' || call.status !== 'scheduled') {
    return { endsAt, sync: 'skipped' };
  }

  const host = await deps.calendar(call.organizationId);
  if (!host || host.hostUserId !== call.hostUserId) return { endsAt, sync: 'skipped' };
  try {
    await syncCallEvent(callId, host.port, deps.contexts);
    return { endsAt, sync: 'synced' };
  } catch {
    await deps.contexts.withSystemContext((tx) =>
      tx.update(calls).set({ syncStatus: 'failed' }).where(eq(calls.id, callId)),
    );
    return { endsAt, sync: 'failed' };
  }
}

async function trySync(
  callId: string,
  host: HostCalendar,
  deps: BookingDeps,
): Promise<string | null> {
  try {
    return (await syncCallEvent(callId, host.port, deps.contexts)).meetUrl;
  } catch {
    return null;
  }
}

async function primaryContactId(tx: DbTransaction, dealId: string, clientId: string) {
  const [fromApplication] = await tx
    .select({ contactId: applications.contactId })
    .from(applications)
    .where(eq(applications.dealId, dealId))
    .orderBy(desc(applications.createdAt))
    .limit(1);
  if (fromApplication) return fromApplication.contactId;
  const [contact] = await tx
    .select({ id: contacts.id })
    .from(contacts)
    .where(and(eq(contacts.clientId, clientId), eq(contacts.role, 'decision_maker')))
    .limit(1);
  return contact?.id ?? null;
}

async function lockHost(tx: DbTransaction, hostUserId: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`booking:${hostUserId}`}))`);
}

export async function bookCall(
  access: BookingAccess,
  input: { start: Date; leadTimeZone: string; ipAddress: string | null },
  deps: BookingDeps,
): Promise<BookResult> {
  const now = deps.now();
  const host = await deps.calendar(access.organizationId);
  if (!host) {
    await emitUnavailable(deps, access.organizationId);
    return { status: 'unavailable' };
  }

  const result = await deps.contexts.withSystemContext(async (tx): Promise<BookResult> => {
    if (input.ipAddress) {
      const allowed = await consumeThrottle(tx, {
        organizationId: access.organizationId,
        kind: 'booking_ip',
        key: input.ipAddress,
        now,
        secret: deps.linkSecret,
        ...THROTTLE_LIMITS.bookingIp,
      });
      if (!allowed) return { status: 'throttled' };
    }

    const rules = await bookingRules(tx, access.organizationId);
    const external = await externalBusy(host, horizonRange(now, rules));
    if (!external) return { status: 'unavailable' };

    await lockHost(tx, host.hostUserId);
    const state = await dealState(tx, access.dealId, true);
    if (state.code !== '0.2' || state.scheduled) return { status: 'closed' };

    const booked = await hostBookings(tx, host.hostUserId, now, null);
    const slots = computeAvailableSlots({ now, rules, busy: [...external, ...booked] });
    if (!slots.some((slot) => sameInstant(slot, input.start))) return { status: 'slot_taken' };

    const endsAt = new Date(input.start.getTime() + rules.durationMinutes * 60_000);
    const [call] = await tx
      .insert(calls)
      .values({
        organizationId: access.organizationId,
        clientId: access.clientId,
        dealId: access.dealId,
        contactId: await primaryContactId(tx, access.dealId, access.clientId),
        hostUserId: host.hostUserId,
        startsAt: input.start,
        endsAt,
        leadTimeZone: resolveTimeZone(input.leadTimeZone, rules.timeZone),
      })
      .returning({ id: calls.id });
    if (!call) throw new Error('Call was not recorded');

    const change = await applyStageChange(tx, {
      dealId: access.dealId,
      to: '0.3',
      reason: null,
      actor: 'system',
    });
    if (!change.ok) throw new Error(`Booking stage change was refused: ${change.rule}`);

    await addTimelineEntry(tx, {
      organizationId: access.organizationId,
      clientId: access.clientId,
      dealId: access.dealId,
      kind: 'call_booked',
      summary: { startsAt: input.start.toISOString(), bookedBy: 'lead' },
      itemType: 'call',
      itemId: call.id,
      actorUserId: null,
    });
    await recordAudit(tx, {
      organizationId: access.organizationId,
      action: 'call.booked',
      resourceType: 'call',
      resourceId: call.id,
      clientId: access.clientId,
      metadata: { startsAt: input.start.toISOString() },
    });
    await emit(tx, {
      type: 'commercial.call.booked',
      organizationId: access.organizationId,
      clientId: access.clientId,
      payload: { callId: call.id, dealId: access.dealId, startsAt: input.start.toISOString() },
    });
    return { status: 'booked', callId: call.id, startsAt: input.start, meetUrl: null };
  });

  if (result.status !== 'booked') return result;
  const meetUrl = await trySync(result.callId, host, deps);
  await flush(deps);
  return { ...result, meetUrl };
}

async function manageableCall(tx: DbTransaction, manageToken: string, now: Date) {
  const [call] = await tx
    .select({
      id: calls.id,
      dealId: calls.dealId,
      clientId: calls.clientId,
      organizationId: calls.organizationId,
      hostUserId: calls.hostUserId,
      startsAt: calls.startsAt,
      status: calls.status,
      externalEventId: calls.externalEventId,
    })
    .from(calls)
    .where(eq(calls.manageTokenHash, hashManageToken(manageToken)))
    .for('update');
  if (!call || call.status !== 'scheduled') return { call: null, tooLate: false };
  return { call, tooLate: call.startsAt.getTime() - now.getTime() < MANAGE_CUTOFF_MS };
}

export async function rescheduleCall(
  manageToken: string,
  input: { start: Date; leadTimeZone: string },
  deps: BookingDeps,
): Promise<RescheduleResult> {
  const now = deps.now();
  const access = await resolveBookingAccess({ kind: 'manage', token: manageToken }, deps);
  if (!access) return { status: 'closed' };
  const host = await deps.calendar(access.organizationId);
  if (!host) return { status: 'unavailable' };

  const result = await deps.contexts.withSystemContext(async (tx): Promise<RescheduleResult> => {
    const { call, tooLate } = await manageableCall(tx, manageToken, now);
    if (!call) return { status: 'closed' };
    if (tooLate) return { status: 'too_late' };

    const rules = await bookingRules(tx, call.organizationId);
    const external = await externalBusy(host, horizonRange(now, rules));
    if (!external) return { status: 'unavailable' };

    await lockHost(tx, call.hostUserId);
    const booked = await hostBookings(tx, call.hostUserId, now, call.id);
    const slots = computeAvailableSlots({ now, rules, busy: [...external, ...booked] });
    if (!slots.some((slot) => sameInstant(slot, input.start))) return { status: 'slot_taken' };

    await tx
      .update(calls)
      .set({
        startsAt: input.start,
        endsAt: new Date(input.start.getTime() + rules.durationMinutes * 60_000),
        leadTimeZone: resolveTimeZone(input.leadTimeZone, rules.timeZone),
        syncStatus: 'pending',
      })
      .where(eq(calls.id, call.id));
    await addTimelineEntry(tx, {
      organizationId: call.organizationId,
      clientId: call.clientId,
      dealId: call.dealId,
      kind: 'call_rescheduled',
      summary: { from: call.startsAt.toISOString(), to: input.start.toISOString() },
      itemType: 'call',
      itemId: call.id,
      actorUserId: null,
    });
    await recordAudit(tx, {
      organizationId: call.organizationId,
      action: 'call.rescheduled',
      resourceType: 'call',
      resourceId: call.id,
      clientId: call.clientId,
      metadata: { startsAt: input.start.toISOString() },
    });
    await emit(tx, {
      type: 'commercial.call.rescheduled',
      organizationId: call.organizationId,
      clientId: call.clientId,
      payload: { callId: call.id, dealId: call.dealId, startsAt: input.start.toISOString() },
    });
    return { status: 'rescheduled', startsAt: input.start };
  });

  if (result.status === 'rescheduled' && access.callId) {
    await trySync(access.callId, host, deps);
    await flush(deps);
  }
  return result;
}

export async function cancelCall(manageToken: string, deps: BookingDeps): Promise<CancelResult> {
  const now = deps.now();
  const result = await deps.contexts.withSystemContext(async (tx) => {
    const { call, tooLate } = await manageableCall(tx, manageToken, now);
    if (!call) return { status: 'closed' as const };
    if (tooLate) return { status: 'too_late' as const };

    await tx.update(calls).set({ status: 'cancelled' }).where(eq(calls.id, call.id));
    const [deal] = await tx
      .select({ code: deals.pipelineCode })
      .from(deals)
      .where(eq(deals.id, call.dealId));
    if (deal?.code === '0.3') {
      await applyStageChange(tx, {
        dealId: call.dealId,
        to: '0.2',
        reason: 'lead_cancelled',
        actor: 'system',
      });
    }
    await addTimelineEntry(tx, {
      organizationId: call.organizationId,
      clientId: call.clientId,
      dealId: call.dealId,
      kind: 'call_cancelled',
      summary: { startsAt: call.startsAt.toISOString(), cancelledBy: 'lead' },
      itemType: 'call',
      itemId: call.id,
      actorUserId: null,
    });
    await recordAudit(tx, {
      organizationId: call.organizationId,
      action: 'call.cancelled',
      resourceType: 'call',
      resourceId: call.id,
      clientId: call.clientId,
      metadata: {},
    });
    await emit(tx, {
      type: 'commercial.call.cancelled',
      organizationId: call.organizationId,
      clientId: call.clientId,
      payload: { callId: call.id, dealId: call.dealId },
    });
    return {
      status: 'cancelled' as const,
      organizationId: call.organizationId,
      externalEventId: call.externalEventId,
    };
  });

  if (result.status !== 'cancelled') return result;
  if (result.externalEventId) {
    const host = await deps.calendar(result.organizationId);
    await host?.port.deleteEvent(result.externalEventId).catch(() => undefined);
  }
  await flush(deps);
  return { status: 'cancelled' };
}
