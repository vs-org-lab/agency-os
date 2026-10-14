import { and, eq, isNotNull } from 'drizzle-orm';
import { schema } from '@agency-os/db';
import type { CalendarEventInput } from '@/modules/commercial';
import type { AgendaDeps } from './access';

const { agendaEvents, clients, contacts } = schema;

type SyncDeps = Pick<AgendaDeps, 'contexts' | 'calendar'>;

/** The calendar event a meeting becomes: the client and title, the notes and place, the invitee. */
async function eventInput(
  eventId: string,
  deps: SyncDeps,
): Promise<{
  meeting: {
    organizationId: string;
    status: 'scheduled' | 'cancelled';
    syncStatus: 'pending' | 'synced' | 'failed';
    externalEventId: string | null;
  };
  input: CalendarEventInput;
} | null> {
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
        externalEventId: row.externalEventId,
      },
      input: {
        requestId: eventId,
        start: row.startsAt,
        end: row.endsAt,
        summary: row.clientName ? `${row.clientName} · ${row.title}` : row.title,
        description: [row.notes, row.location].filter((part) => part.trim() !== '').join('\n\n'),
        attendee: invitee?.email ? { email: invitee.email, name: invitee.name } : null,
      },
    };
  });
}

async function record(
  eventId: string,
  deps: SyncDeps,
  values: Partial<typeof agendaEvents.$inferInsert>,
): Promise<void> {
  await deps.contexts.withSystemContext((tx) =>
    tx.update(agendaEvents).set(values).where(eq(agendaEvents.id, eventId)),
  );
}

/**
 * Brings a meeting's event in the host's Google Calendar up to date (RF-100): creates it with a
 * Meet link, updates it, recreates it when Google lost it, or deletes it once cancelled. A missing
 * connection or a provider error is recorded on the meeting, never thrown.
 */
export async function syncMeeting(
  eventId: string,
  deps: SyncDeps,
): Promise<'synced' | 'failed' | 'skipped'> {
  const read = await eventInput(eventId, deps);
  if (!read || read.meeting.syncStatus === 'synced') return 'skipped';
  const { meeting, input } = read;
  if (meeting.status === 'cancelled' && !meeting.externalEventId) {
    await record(eventId, deps, { syncStatus: 'synced' });
    return 'synced';
  }
  const host = await deps.calendar(meeting.organizationId).catch(() => null);
  if (!host) {
    await record(eventId, deps, { syncStatus: 'failed' });
    return 'failed';
  }
  try {
    if (meeting.status === 'cancelled' && meeting.externalEventId) {
      await host.port.deleteEvent(meeting.externalEventId);
      await record(eventId, deps, { syncStatus: 'synced' });
      return 'synced';
    }
    if (meeting.externalEventId) {
      const updated = await host.port.updateEvent(meeting.externalEventId, input);
      if (updated === 'updated') {
        await record(eventId, deps, { syncStatus: 'synced' });
        return 'synced';
      }
    }
    const created = await host.port.createEvent(input);
    await record(eventId, deps, {
      externalEventId: created.eventId,
      meetUrl: created.meetUrl,
      syncStatus: 'synced',
    });
    return 'synced';
  } catch {
    await record(eventId, deps, { syncStatus: 'failed' });
    return 'failed';
  }
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
