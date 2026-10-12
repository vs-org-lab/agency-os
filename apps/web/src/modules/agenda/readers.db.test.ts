import type { TransactionSql } from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import {
  closeTestSql,
  createAgendaFixture,
  createCommercialFixture,
  createFixtureWorld,
  withTestTransaction,
  type AgendaFixture,
  type World,
} from '@agency-os/db/testing';
import { loadAgenda, loadUpcoming } from './readers';
import { agendaClaims, agendaDeps } from './testing';
import type { AgendaItem } from './views';

afterAll(async () => {
  await closeTestSql();
});

const RANGE = { from: '2026-10-12', to: '2026-10-20' };

/** Deadlines, a delivery and calls inside the range, on top of the agenda fixture. */
async function seedDated(sql: TransactionSql, world: World, agenda: AgendaFixture) {
  const commercial = await createCommercialFixture(sql, world);
  await sql`update public.calls set starts_at = '2026-10-15T10:00:00Z', ends_at = '2026-10-15T10:45:00Z'
            where id in (${commercial.a.callId}, ${commercial.b.callId})`;
  await sql`update public.project_phases set due_on = '2026-10-14'
            where id in (${agenda.rooms.a.phaseIds[0]}, ${agenda.rooms.b.phaseIds[0]})`;
  await sql`update public.project_steps set due_on = '2026-10-15', status = 'todo' where id = ${agenda.rooms.a.visibleStepId}`;
  await sql`update public.projects set ends_on = '2026-10-16' where id = ${agenda.rooms.a.projectId}`;
  await sql`
    insert into public.tasks (organization_id, client_id, project_id, title, due_on, assignee_id)
    values (${world.organizationId}, ${world.clients.a}, ${agenda.rooms.a.projectId}, 'Rever textos',
            '2026-10-13', ${world.users.manager})
  `;
  return commercial;
}

const kinds = (items: AgendaItem[]) => items.map((item) => item.kind).sort();

describe('agenda readers', () => {
  it('the range joins meetings, calls, deadlines and deliveries', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const agenda = await createAgendaFixture(sql, world);
      await seedDated(sql, world, agenda);
      const { deps } = agendaDeps(sql);

      const view = await loadAgenda(agendaClaims(world.users.founder), RANGE, deps);
      if (!view) throw new Error('Agenda is missing');
      expect(view.canSchedule).toBe(true);
      expect(kinds(view.items)).toEqual(
        [
          'call',
          'call',
          'delivery',
          'meeting',
          'meeting',
          'meeting',
          'phase_due',
          'phase_due',
          'step_due',
          'task_due',
        ].sort(),
      );
      const days = view.items.map((item) => item.day);
      expect([...days].sort()).toEqual(days);
      const kickoff = view.items.find((item) => item.id === agenda.kickoffAId);
      expect(kickoff).toMatchObject({
        allDay: false,
        day: '2026-10-13',
        clientId: world.clients.a,
        meeting: { kind: 'kickoff', editable: true },
      });
      const delivery = view.items.find((item) => item.kind === 'delivery');
      expect(delivery).toMatchObject({
        allDay: true,
        day: '2026-10-16',
        href: `/c/${world.clients.a}`,
      });
    });
  });

  it('the range only holds what the reader may see', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const agenda = await createAgendaFixture(sql, world);
      await seedDated(sql, world, agenda);
      const { deps } = agendaDeps(sql);

      const room = await loadAgenda(
        agendaClaims(world.users.founder),
        { ...RANGE, clientId: world.clients.a },
        deps,
      );
      expect(room?.items.every((item) => item.clientId === world.clients.a)).toBe(true);
      expect(room?.items.some((item) => item.kind === 'call')).toBe(true);

      const finance = await loadAgenda(agendaClaims(world.users.finance), RANGE, deps);
      expect(finance?.canSchedule).toBe(false);
      expect(finance?.items.some((item) => item.kind === 'call')).toBe(true);
      expect(finance?.items.some((item) => item.id === agenda.internalId)).toBe(false);

      await sql`reset role`;
      await sql`
        insert into public.project_staff_assignments (organization_id, client_id, project_id, user_id)
        values (${world.organizationId}, ${world.clients.a}, ${agenda.rooms.a.projectId},
                ${world.users.freelancer})
      `;
      const freelancer = await loadAgenda(agendaClaims(world.users.freelancer), RANGE, deps);
      expect(freelancer?.items.some((item) => item.kind === 'call')).toBe(false);
      expect(
        freelancer?.items
          .filter((item) => item.kind === 'phase_due')
          .every((item) => item.projectId === agenda.rooms.a.projectId),
      ).toBe(true);
      expect(
        freelancer?.items
          .filter((item) => item.clientId === world.clients.b)
          .map((item) => item.kind),
      ).toEqual([]);
      expect(
        await loadAgenda(agendaClaims(world.users.decisionMakerA, 'client'), RANGE, deps),
      ).toBeNull();
    });
  });

  it('cancelled meetings leave the agenda', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const agenda = await createAgendaFixture(sql, world);
      const { deps } = agendaDeps(sql);

      const view = await loadAgenda(agendaClaims(world.users.founder), RANGE, deps);
      expect(view?.items.some((item) => item.id === agenda.cancelledAId)).toBe(false);
    });
  });

  it('ranges over 45 days are refused', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const { deps } = agendaDeps(sql);
      const founder = agendaClaims(world.users.founder);

      expect(await loadAgenda(founder, { from: '2026-10-01', to: '2026-11-20' }, deps)).toBeNull();
      expect(await loadAgenda(founder, { from: '2026-10-20', to: '2026-10-01' }, deps)).toBeNull();
      expect(await loadAgenda(founder, { from: 'x', to: '2026-10-01' }, deps)).toBeNull();
    });
  });

  it('upcoming items for the home', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const agenda = await createAgendaFixture(sql, world);
      await seedDated(sql, world, agenda);
      const { deps } = agendaDeps(sql);

      const upcoming = await loadUpcoming(agendaClaims(world.users.founder), deps);
      const timed = upcoming.filter((item) => !item.allDay);
      expect(timed.length).toBeLessThanOrEqual(5);
      expect(timed[0]?.id).toBe(agenda.internalId);
      expect(upcoming.some((item) => item.kind === 'delivery')).toBe(true);
      expect(upcoming.some((item) => item.kind === 'task_due')).toBe(true);
    });
  });
});
