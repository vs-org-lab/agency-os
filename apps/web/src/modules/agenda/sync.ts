import { randomUUID } from 'node:crypto';
import { and, eq, gt, isNotNull, or, sql } from 'drizzle-orm';
import { schema } from '@agency-os/db';
import type { CalendarEventInput } from '@/modules/commercial';
import type { AgendaDeps } from './access';

const { agendaEvents, clients, contacts } = schema;

type SyncDeps = Pick<AgendaDeps, 'contexts' | 'calendar'>;

const RETRY_BATCH = 50;

type StoredMeeting = {
  organizationId: string;
  status: 'scheduled' | 'cancelled';
  syncStatus: 'pending' | 'synced' | 'failed';
  syncRevision: number;
  externalEventId: string | null;
};

/** The calendar event a meeting becomes: the client and title, the notes and place, the invitee. */
async function eventInput(
  eventId: string,
  deps: SyncDeps,
): Promise<{ meeting: StoredMeeting; input: CalendarEventInput } | null> {
  return deps.contexts.withSystemContext(async (tx) => {
    const [row] = await tx
      .select({
        organizationId: agendaEvents.organizationId,
        clientId: agendaEvents.clientId,
        title: agendaEvents.title,
        notes: agendaEvents.notes,
        location: agendaEvents.location,
        startsAt: agendaEvents.startsAt,
        endsAt: agendaEvents.endsAt,
        inviteClient: agendaEvents.inviteClient,
        status: agendaEvents.status,
        syncStatus: agendaEvents.syncStatus,
        syncRevision: agendaEvents.syncRevision,
        externalEventId: agendaEvents.externalEventId,
        clientName: clients.name,
      })
      .from(agendaEvents)
      .leftJoin(clients, eq(clients.id, agendaEvents.clientId))
      .where(eq(agendaEvents.id, eventId));
    if (!row) return null;
    const [invitee] =
      row.inviteClient && row.clientId
        ? await tx
            .select({ email: contacts.email, name: contacts.fullName })
            .from(contacts)
            .where(
              and(
                eq(contacts.clientId, row.clientId),
                eq(contacts.role, 'decision_maker'),
                isNotNull(contacts.email),
              ),
            )
            .limit(1)
        : [];
    return {
      meeting: {
        organizationId: row.organizationId,
        status: row.status,
        syncStatus: row.syncStatus,
        syncRevision: row.syncRevision,
        externalEventId: row.externalEventId,
      },
      input: {
        // Google ignores a conference request whose id it has seen, so each create asks anew.
        requestId: randomUUID(),
        start: row.startsAt,
        end: row.endsAt,
        summary: row.clientName ? `${row.clientName} · ${row.title}` : row.title,
        description: [row.notes, row.location].filter((part) => part.trim() !== '').join('\n\n'),
        attendee: invitee?.email ? { email: invitee.email, name: invitee.name } : null,
      },
    };
  });
}

/**
 * Records what reached Google. The event id and Meet link are always kept, so a later run updates
 * that event instead of creating another; the meeting is marked with `outcome` only while it is
 * still at the revision this run sent, so a change made meanwhile stays pending for its own run.
 */
async function record(
  eventId: string,
  revision: number,
  outcome: 'synced' | 'failed',
  deps: SyncDeps,
  event: { externalEventId?: string | null; meetUrl?: string | null } = {},
): Promise<boolean> {
  const rows = await deps.contexts.withSystemContext((tx) =>
    tx
      .update(agendaEvents)
      .set({
        ...(event.externalEventId !== undefined ? { externalEventId: event.externalEventId } : {}),
        ...(event.meetUrl !== undefined ? { meetUrl: event.meetUrl } : {}),
        syncStatus: sql`case when ${agendaEvents.syncRevision} = ${revision} then ${outcome}::app.call_sync_status else ${agendaEvents.syncStatus} end`,
      })
      .where(eq(agendaEvents.id, eventId))
      .returning({ current: agendaEvents.syncRevision }),
  );
  return rows[0]?.current === revision;
}

/**
 * Brings a meeting's event in the host's Google Calendar up to date (RF-100): creates it with a
 * Meet link, updates it, recreates it when Google lost it, or deletes it once cancelled. A missing
 * connection or a provider error is recorded on the meeting as `failed`, never thrown; a meeting
 * changed while the run was in flight is left pending and reported as `skipped`.
 */
export async function syncMeeting(
  eventId: string,
  deps: SyncDeps,
): Promise<'synced' | 'failed' | 'skipped'> {
  const read = await eventInput(eventId, deps);
  if (!read || read.meeting.syncStatus === 'synced') return 'skipped';
  const { meeting, input } = read;
  const revision = meeting.syncRevision;
  const settle = async (
    outcome: 'synced' | 'failed',
    event?: { externalEventId?: string | null; meetUrl?: string | null },
  ) => ((await record(eventId, revision, outcome, deps, event)) ? outcome : 'skipped');

  if (meeting.status === 'cancelled' && !meeting.externalEventId) return settle('synced');
  const host = await deps.calendar(meeting.organizationId).catch(() => null);
  if (!host) return settle('failed');
  try {
    if (meeting.status === 'cancelled' && meeting.externalEventId) {
      await host.port.deleteEvent(meeting.externalEventId);
      return settle('synced', { externalEventId: null });
    }
    if (meeting.externalEventId) {
      const updated = await host.port.updateEvent(meeting.externalEventId, input);
      if (updated === 'updated') return settle('synced');
    }
    const created = await host.port.createEvent(input);
    return settle('synced', { externalEventId: created.eventId, meetUrl: created.meetUrl });
  } catch {
    return settle('failed');
  }
}

/**
 * Hourly: meetings whose last sync failed are tried again, cancellations included, so a Google
 * outage never leaves an event or an invitation behind. Past scheduled meetings are left alone.
 */
export async function retryFailedMeetings(
  deps: SyncDeps & Pick<AgendaDeps, 'now'>,
): Promise<{ retried: number; synced: number }> {
  const now = (deps.now ?? (() => new Date()))();
  const failed = await deps.contexts.withSystemContext((tx) =>
    tx
      .select({ id: agendaEvents.id })
      .from(agendaEvents)
      .where(
        and(
          eq(agendaEvents.syncStatus, 'failed'),
          or(eq(agendaEvents.status, 'cancelled'), gt(agendaEvents.endsAt, now)),
        ),
      )
      .limit(RETRY_BATCH),
  );
  let synced = 0;
  for (const meeting of failed) {
    await deps.contexts.withSystemContext((tx) =>
      tx.update(agendaEvents).set({ syncStatus: 'pending' }).where(eq(agendaEvents.id, meeting.id)),
    );
    if ((await syncMeeting(meeting.id, deps)) === 'synced') synced += 1;
  }
  return { retried: failed.length, synced };
}

/** The host's busy blocks in a range, shown as "Ocupado" without details; none without a calendar. */
export async function hostBusy(
  organizationId: string,
  range: { start: Date; end: Date },
  deps: Pick<AgendaDeps, 'calendar'>,
): Promise<{ start: string; end: string }[]> {
  try {
    const host = await deps.calendar(organizationId);
    if (!host) return [];
    const busy = await host.port.freeBusy(range);
    return busy.map((block) => ({
      start: block.start.toISOString(),
      end: block.end.toISOString(),
    }));
  } catch {
    return [];
  }
}
