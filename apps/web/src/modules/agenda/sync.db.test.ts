import type { TransactionSql } from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import {
  AGENDA_TEST_NOW,
  closeTestSql,
  createAgendaFixture,
  createFixtureWorld,
  withTestTransaction,
} from '@agency-os/db/testing';
import { cancelMeeting, updateMeeting } from './meetings';
import { syncMeeting } from './sync';
import { agendaClaims, agendaDeps } from './testing';

afterAll(async () => {
  await closeTestSql();
});

const HOUR = 3_600_000;
const at = (hours: number) => new Date(AGENDA_TEST_NOW.getTime() + hours * HOUR).toISOString();

async function syncState(sql: TransactionSql, eventId: string) {
  await sql`reset role`;
  const [row] = await sql<
    { sync_status: string; external_event_id: string | null; meet_url: string | null }[]
  >`
    select sync_status::text, external_event_id, meet_url from public.agenda_events
    where id = ${eventId}
  `;
  return row;
}

async function addDecisionMaker(sql: TransactionSql, organizationId: string, clientId: string) {
  await sql`reset role`;
  await sql`
    insert into public.contacts (organization_id, client_id, full_name, email, role)
    values (${organizationId}, ${clientId}, 'Marta Lopes', 'marta@cliente.example', 'decision_maker')
  `;
}

describe('agenda sync', () => {
  it('meetings are created, updated and deleted in the host calendar', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const agenda = await createAgendaFixture(sql, world);
      const { deps, calendar } = agendaDeps(sql);
      const manager = agendaClaims(world.users.manager);

      expect(await syncMeeting(agenda.kickoffAId, deps)).toBe('synced');
      expect(calendar.created).toHaveLength(1);
      expect(calendar.created[0]).toMatchObject({ requestId: agenda.kickoffAId, attendee: null });
      expect(calendar.created[0]?.summary).toContain('Kickoff');
      expect(await syncState(sql, agenda.kickoffAId)).toEqual({
        sync_status: 'synced',
        external_event_id: 'event-1',
        meet_url: 'https://meet.google.com/abc',
      });
      expect(await syncMeeting(agenda.kickoffAId, deps)).toBe('skipped');

      await updateMeeting(
        manager,
        {
          eventId: agenda.kickoffAId,
          kind: 'kickoff',
          clientId: world.clients.a,
          projectId: agenda.rooms.a.projectId,
          title: 'Kickoff do site',
          notes: 'Trazer o briefing',
          location: '',
          startsAt: at(48),
          endsAt: at(49),
          inviteClient: false,
        },
        deps,
      );
      expect(await syncMeeting(agenda.kickoffAId, deps)).toBe('synced');
      expect(calendar.updated.map((call) => call.eventId)).toEqual(['event-1']);
      expect(calendar.updated[0]?.input.description).toContain('Trazer o briefing');

      calendar.missing = true;
      await updateMeeting(
        manager,
        {
          eventId: agenda.kickoffAId,
          kind: 'kickoff',
          clientId: world.clients.a,
          projectId: agenda.rooms.a.projectId,
          title: 'Kickoff do site',
          notes: '',
          location: '',
          startsAt: at(50),
          endsAt: at(51),
          inviteClient: false,
        },
        deps,
      );
      expect(await syncMeeting(agenda.kickoffAId, deps)).toBe('synced');
      expect(calendar.created).toHaveLength(2);
      expect((await syncState(sql, agenda.kickoffAId))?.external_event_id).toBe('event-2');

      await cancelMeeting(manager, { eventId: agenda.kickoffAId }, deps);
      expect(await syncMeeting(agenda.kickoffAId, deps)).toBe('synced');
      expect(calendar.deleted).toEqual(['event-2']);
    });
  });

  it('the decision maker is invited only when asked', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const agenda = await createAgendaFixture(sql, world);
      await addDecisionMaker(sql, world.organizationId, world.clients.b);
      const { deps, calendar } = agendaDeps(sql);

      await syncMeeting(agenda.meetingBId, deps);
      expect(calendar.created[0]?.attendee).toBeNull();

      await sql`update public.agenda_events set invite_client = true, sync_status = 'pending',
                external_event_id = null where id = ${agenda.meetingBId}`;
      await syncMeeting(agenda.meetingBId, deps);
      expect(calendar.created[1]?.attendee).toEqual({
        email: 'marta@cliente.example',
        name: 'Marta Lopes',
      });
      expect(await syncMeeting(agenda.internalId, deps)).toBe('synced');
      expect(calendar.created[2]?.summary).toBe('Planeamento');
    });
  });

  it('an unreachable calendar leaves the meeting failed and retried on save', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const agenda = await createAgendaFixture(sql, world);
      const disconnected = agendaDeps(sql, { connected: false });

      expect(await syncMeeting(agenda.meetingBId, disconnected.deps)).toBe('failed');
      expect((await syncState(sql, agenda.meetingBId))?.sync_status).toBe('failed');

      const { deps, calendar } = agendaDeps(sql);
      calendar.failing = true;
      expect(await syncMeeting(agenda.meetingBId, deps)).toBe('failed');

      calendar.failing = false;
      await updateMeeting(
        agendaClaims(world.users.founder),
        {
          eventId: agenda.meetingBId,
          kind: 'meeting',
          clientId: world.clients.b,
          projectId: null,
          title: 'Reunião B',
          notes: '',
          location: '',
          startsAt: at(30),
          endsAt: at(31),
          inviteClient: false,
        },
        deps,
      );
      expect((await syncState(sql, agenda.meetingBId))?.sync_status).toBe('pending');
      expect(await syncMeeting(agenda.meetingBId, deps)).toBe('synced');
    });
  });
});
