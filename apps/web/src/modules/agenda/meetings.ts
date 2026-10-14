import { and, eq, ne, sql } from 'drizzle-orm';
import { schema, type DbTransaction } from '@agency-os/db';
import { recordAudit } from '@/modules/audit';
import { emit, requestFlush } from '@/modules/events';
import type { VerifiedClaims } from '@/platform/db';
import {
  agendaWriter,
  INVALID_INPUT,
  INVALID_STATE,
  NOT_FOUND,
  OK,
  uuid,
  type AgendaDeps,
  type NotFound,
} from './access';
import { meetingSchema, type MeetingInput } from './domain/meeting';

const { agendaEvents, projects, tasks } = schema;

type AuditAction =
  'agenda.meeting_scheduled' | 'agenda.meeting_updated' | 'agenda.meeting_cancelled';

async function projectBelongs(tx: DbTransaction, meeting: MeetingInput): Promise<boolean> {
  if (meeting.projectId === null) return true;
  const [project] = await tx
    .select({ id: projects.id })
    .from(projects)
    .where(
      and(
        eq(projects.id, meeting.projectId),
        eq(projects.clientId, meeting.clientId ?? ''),
        ne(projects.status, 'cancelled'),
      ),
    );
  return project !== undefined;
}

async function announce(
  tx: DbTransaction,
  event: { id: string; organizationId: string; clientId: string | null },
  action: AuditAction,
): Promise<void> {
  await recordAudit(tx, {
    organizationId: event.organizationId,
    action,
    resourceType: 'agenda_event',
    resourceId: event.id,
    clientId: event.clientId,
  });
  await emit(tx, {
    type: 'agenda.meeting.changed',
    organizationId: event.organizationId,
    clientId: event.clientId,
    payload: { eventId: event.id },
  });
}

/** AUT-13: a kickoff on the calendar closes the project's "Agendar kickoff" task. */
async function closeKickoffTask(tx: DbTransaction, projectId: string, now: Date): Promise<void> {
  await tx
    .update(tasks)
    .set({ status: 'done', completedAt: now, updatedAt: now })
    .where(
      and(eq(tasks.projectId, projectId), eq(tasks.source, 'kickoff'), eq(tasks.status, 'open')),
    );
}

/** Schedules a meeting and queues it for the host's Google Calendar. */
export async function scheduleMeeting(
  claims: VerifiedClaims,
  input: unknown,
  deps: AgendaDeps,
): Promise<{ ok: true; eventId: string } | NotFound | typeof INVALID_INPUT> {
  const parsed = meetingSchema.safeParse(input);
  if (!parsed.success) return INVALID_INPUT;
  const meeting = parsed.data;
  const writer = await agendaWriter(claims, meeting.clientId, deps);
  if (!writer) return NOT_FOUND;
  const now = (deps.now ?? (() => new Date()))();

  const eventId = await deps.contexts.withSystemContext(async (tx) => {
    if (!(await projectBelongs(tx, meeting))) return null;
    const [created] = await tx
      .insert(agendaEvents)
      .values({
        organizationId: writer.organizationId,
        clientId: meeting.clientId,
        projectId: meeting.projectId,
        kind: meeting.kind,
        title: meeting.title,
        notes: meeting.notes,
        location: meeting.location,
        startsAt: meeting.startsAt,
        endsAt: meeting.endsAt,
        inviteClient: meeting.inviteClient,
        createdBy: writer.userId,
      })
      .returning({ id: agendaEvents.id });
    if (!created) throw new Error('Agenda meeting was not scheduled');
    if (meeting.kind === 'kickoff' && meeting.projectId) {
      await closeKickoffTask(tx, meeting.projectId, now);
    }
    await announce(
      tx,
      { id: created.id, organizationId: writer.organizationId, clientId: meeting.clientId },
      'agenda.meeting_scheduled',
    );
    return created.id;
  });
  if (!eventId) return INVALID_INPUT;
  await (deps.flush ?? requestFlush)();
  return { ok: true, eventId };
}

type StoredMeeting = {
  id: string;
  organization_id: string;
  client_id: string | null;
  kind: string;
  status: string;
  starts_at: Date | string;
};

async function lockMeeting(tx: DbTransaction, eventId: string): Promise<StoredMeeting | null> {
  const [row] = await tx.execute<StoredMeeting>(sql`
    select id, organization_id, client_id, kind::text as kind, status::text as status, starts_at
    from public.agenda_events where id = ${eventId}::uuid
    for update
  `);
  return row ?? null;
}

/** The stored meeting and its writer, before any change is attempted. */
async function writableMeeting(
  claims: VerifiedClaims,
  eventId: string,
  deps: AgendaDeps,
): Promise<{ clientId: string | null } | null> {
  if (!uuid.safeParse(eventId).success) return null;
  const [row] = await deps.contexts.withSystemContext((tx) =>
    tx
      .select({ clientId: agendaEvents.clientId })
      .from(agendaEvents)
      .where(eq(agendaEvents.id, eventId)),
  );
  if (!row) return null;
  return (await agendaWriter(claims, row.clientId, deps)) ? row : null;
}

function isClosed(meeting: StoredMeeting, now: Date): boolean {
  return meeting.status !== 'scheduled' || new Date(meeting.starts_at).getTime() <= now.getTime();
}

/** Changes a future meeting's time, title, notes, place or invitation; its client and kind stay. */
export async function updateMeeting(
  claims: VerifiedClaims,
  input: { eventId: string } & Record<string, unknown>,
  deps: AgendaDeps,
): Promise<typeof OK | NotFound | typeof INVALID_INPUT | typeof INVALID_STATE> {
  const stored = await writableMeeting(claims, input.eventId, deps);
  if (!stored) return NOT_FOUND;
  const parsed = meetingSchema.safeParse(input);
  if (!parsed.success) return INVALID_INPUT;
  const meeting = parsed.data;
  const now = (deps.now ?? (() => new Date()))();

  const result = await deps.contexts.withSystemContext(async (tx) => {
    const locked = await lockMeeting(tx, input.eventId);
    if (!locked) return NOT_FOUND;
    if (locked.kind !== meeting.kind || locked.client_id !== meeting.clientId) {
      return INVALID_INPUT;
    }
    if (isClosed(locked, now)) return INVALID_STATE;
    if (!(await projectBelongs(tx, meeting))) return INVALID_INPUT;
    await tx
      .update(agendaEvents)
      .set({
        projectId: meeting.projectId,
        title: meeting.title,
        notes: meeting.notes,
        location: meeting.location,
        startsAt: meeting.startsAt,
        endsAt: meeting.endsAt,
        inviteClient: meeting.inviteClient,
        syncStatus: 'pending',
        syncRevision: sql`${agendaEvents.syncRevision} + 1`,
        updatedAt: now,
      })
      .where(eq(agendaEvents.id, locked.id));
    await announce(
      tx,
      { id: locked.id, organizationId: locked.organization_id, clientId: locked.client_id },
      'agenda.meeting_updated',
    );
    return OK;
  });
  if (result.ok) await (deps.flush ?? requestFlush)();
  return result;
}

/** Cancels a future meeting; the sync removes it from the host's calendar. */
export async function cancelMeeting(
  claims: VerifiedClaims,
  input: { eventId: string },
  deps: AgendaDeps,
): Promise<typeof OK | NotFound | typeof INVALID_STATE> {
  const stored = await writableMeeting(claims, input.eventId, deps);
  if (!stored) return NOT_FOUND;
  const now = (deps.now ?? (() => new Date()))();

  const result = await deps.contexts.withSystemContext(async (tx) => {
    const locked = await lockMeeting(tx, input.eventId);
    if (!locked) return NOT_FOUND;
    if (isClosed(locked, now)) return INVALID_STATE;
    await tx
      .update(agendaEvents)
      .set({
        status: 'cancelled',
        syncStatus: 'pending',
        syncRevision: sql`${agendaEvents.syncRevision} + 1`,
        updatedAt: now,
      })
      .where(eq(agendaEvents.id, locked.id));
    await announce(
      tx,
      { id: locked.id, organizationId: locked.organization_id, clientId: locked.client_id },
      'agenda.meeting_cancelled',
    );
    return OK;
  });
  if (result.ok) await (deps.flush ?? requestFlush)();
  return result;
}
