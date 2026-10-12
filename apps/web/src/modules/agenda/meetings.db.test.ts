import type { TransactionSql } from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import {
  AGENDA_TEST_NOW,
  closeTestSql,
  createAgendaFixture,
  createFixtureWorld,
  createRoomFixture,
  withTestTransaction,
} from '@agency-os/db/testing';
import { cancelMeeting, scheduleMeeting, updateMeeting } from './meetings';
import { agendaClaims, agendaDeps } from './testing';

afterAll(async () => {
  await closeTestSql();
});

const HOUR = 3_600_000;
const at = (hours: number) => new Date(AGENDA_TEST_NOW.getTime() + hours * HOUR).toISOString();

async function event(sql: TransactionSql, eventId: string) {
  await sql`reset role`;
  const [row] = await sql<
    { kind: string; status: string; sync_status: string; title: string; client_id: string | null }[]
  >`
    select kind::text, status::text, sync_status::text, title, client_id
    from public.agenda_events where id = ${eventId}
  `;
  return row;
}

async function changedEvents(sql: TransactionSql, organizationId: string): Promise<number> {
  await sql`reset role`;
  const [row] = await sql<{ total: number }[]>`
    select count(*)::int as total from public.domain_events
    where organization_id = ${organizationId} and type = 'agenda.meeting.changed'
  `;
  return row?.total ?? 0;
}

const meeting = (overrides: Record<string, unknown>) => ({
  kind: 'meeting',
  clientId: null,
  projectId: null,
  title: 'Revisão',
  notes: '',
  location: '',
  startsAt: at(24),
  endsAt: at(25),
  inviteClient: false,
  ...overrides,
});

describe('agenda meetings', () => {
  it('meetings are scheduled for clients, projects and the studio', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const rooms = await createRoomFixture(sql, world);
      const { deps, flushes } = agendaDeps(sql);
      const manager = agendaClaims(world.users.manager);

      const client = await scheduleMeeting(
        manager,
        meeting({ clientId: world.clients.a, inviteClient: true }),
        deps,
      );
      const project = await scheduleMeeting(
        manager,
        meeting({ kind: 'review', clientId: world.clients.a, projectId: rooms.a.projectId }),
        deps,
      );
      const internal = await scheduleMeeting(
        manager,
        meeting({ kind: 'internal', title: 'Planeamento' }),
        deps,
      );
      if (!client.ok || !project.ok || !internal.ok) throw new Error('Meetings were not scheduled');
      expect(await event(sql, client.eventId)).toEqual({
        kind: 'meeting',
        status: 'scheduled',
        sync_status: 'pending',
        title: 'Revisão',
        client_id: world.clients.a,
      });
      expect((await event(sql, internal.eventId))?.client_id).toBeNull();
      expect(await changedEvents(sql, world.organizationId)).toBe(3);
      expect(flushes).toHaveLength(3);
      expect(
        await scheduleMeeting(manager, meeting({ clientId: world.clients.a, title: '' }), deps),
      ).toEqual({ ok: false, rule: 'invalid_input' });
    });
  });

  it('a kickoff closes the open kickoff task of its project', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const rooms = await createRoomFixture(sql, world);
      const { deps } = agendaDeps(sql);
      await sql`
        insert into public.tasks (organization_id, client_id, project_id, title, source, assignee_id)
        values (${world.organizationId}, ${world.clients.a}, ${rooms.a.projectId}, 'Agendar kickoff',
                'kickoff', ${world.users.manager})
      `;

      const kickoff = await scheduleMeeting(
        agendaClaims(world.users.manager),
        meeting({ kind: 'kickoff', clientId: world.clients.a, projectId: rooms.a.projectId }),
        deps,
      );
      expect(kickoff.ok).toBe(true);
      await sql`reset role`;
      const [task] = await sql<{ status: string; done: boolean }[]>`
        select status::text, completed_at is not null as done from public.tasks
        where project_id = ${rooms.a.projectId} and source = 'kickoff'
      `;
      expect(task).toEqual({ status: 'done', done: true });
    });
  });

  it('meetings are updated and cancelled', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const agenda = await createAgendaFixture(sql, world);
      const { deps } = agendaDeps(sql);
      const manager = agendaClaims(world.users.manager);

      expect(
        await updateMeeting(
          manager,
          {
            eventId: agenda.kickoffAId,
            ...meeting({
              kind: 'kickoff',
              clientId: world.clients.a,
              projectId: agenda.rooms.a.projectId,
              title: 'Kickoff do site',
              startsAt: at(48),
              endsAt: at(50),
            }),
          },
          deps,
        ),
      ).toEqual({ ok: true });
      expect((await event(sql, agenda.kickoffAId))?.title).toBe('Kickoff do site');
      expect(await cancelMeeting(manager, { eventId: agenda.kickoffAId }, deps)).toEqual({
        ok: true,
      });
      expect(await event(sql, agenda.kickoffAId)).toMatchObject({
        status: 'cancelled',
        sync_status: 'pending',
      });
    });
  });

  it('past and cancelled meetings do not change', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const agenda = await createAgendaFixture(sql, world);
      const { deps } = agendaDeps(sql);
      const founder = agendaClaims(world.users.founder);

      expect(await cancelMeeting(founder, { eventId: agenda.cancelledAId }, deps)).toEqual({
        ok: false,
        rule: 'invalid_state',
      });
      await sql`reset role`;
      await sql`
        update public.agenda_events
        set starts_at = ${at(-3)}, ends_at = ${at(-2)} where id = ${agenda.meetingBId}
      `;
      expect(await cancelMeeting(founder, { eventId: agenda.meetingBId }, deps)).toEqual({
        ok: false,
        rule: 'invalid_state',
      });
      expect(
        await updateMeeting(
          founder,
          { eventId: agenda.meetingBId, ...meeting({ clientId: world.clients.b }) },
          deps,
        ),
      ).toEqual({ ok: false, rule: 'invalid_state' });
    });
  });

  it('freelancers, finance and clients cannot schedule', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const agenda = await createAgendaFixture(sql, world);
      const { deps } = agendaDeps(sql);
      await sql`
        insert into public.project_staff_assignments (organization_id, client_id, project_id, user_id)
        values (${world.organizationId}, ${world.clients.a}, ${agenda.rooms.a.projectId},
                ${world.users.freelancer})
      `;

      for (const [userId, kind] of [
        [world.users.freelancer, 'internal'],
        [world.users.finance, 'internal'],
        [world.users.decisionMakerA, 'client'],
      ] as const) {
        const claims = agendaClaims(userId, kind);
        expect(await scheduleMeeting(claims, meeting({ clientId: world.clients.a }), deps)).toEqual(
          { ok: false, rule: 'not_found' },
        );
        expect(await cancelMeeting(claims, { eventId: agenda.kickoffAId }, deps)).toEqual({
          ok: false,
          rule: 'not_found',
        });
      }
      expect(
        await scheduleMeeting(
          agendaClaims(world.users.finance),
          meeting({ kind: 'internal' }),
          deps,
        ),
      ).toEqual({ ok: false, rule: 'not_found' });
    });
  });

  it('a project of another client is refused', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const rooms = await createRoomFixture(sql, world);
      const { deps } = agendaDeps(sql);

      expect(
        await scheduleMeeting(
          agendaClaims(world.users.founder),
          meeting({ kind: 'kickoff', clientId: world.clients.a, projectId: rooms.b.projectId }),
          deps,
        ),
      ).toEqual({ ok: false, rule: 'invalid_input' });
    });
  });
});
