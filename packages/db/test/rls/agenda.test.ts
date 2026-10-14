import type { TransactionSql } from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import {
  asUser,
  closeTestSql,
  createAgendaFixture,
  createFixtureWorld,
  withTestTransaction,
} from '../../src/testing';

afterAll(async () => {
  await closeTestSql();
});

async function visibleIds(sql: TransactionSql): Promise<string[]> {
  const rows = await sql<{ id: string }[]>`select id from public.agenda_events`.catch(
    (error: Error) => {
      if (/permission denied/.test(error.message)) return [];
      throw error;
    },
  );
  return rows.map((row) => row.id).sort();
}

const sorted = (...ids: string[]) => [...ids].sort();

describe('agenda access', () => {
  it('team reads agenda events of the rooms and projects it reads', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const agenda = await createAgendaFixture(sql, world);
      const all = [agenda.internalId, agenda.kickoffAId, agenda.meetingBId, agenda.cancelledAId];

      await asUser(sql, world.users.founder);
      expect(await visibleIds(sql)).toEqual(sorted(...all));
      await asUser(sql, world.users.manager);
      expect(await visibleIds(sql)).toEqual(
        sorted(agenda.internalId, agenda.kickoffAId, agenda.cancelledAId),
      );
      await asUser(sql, world.users.finance);
      expect(await visibleIds(sql)).toEqual(
        sorted(agenda.kickoffAId, agenda.meetingBId, agenda.cancelledAId),
      );

      await sql`reset role`;
      await sql`
        insert into public.project_staff_assignments (organization_id, client_id, project_id, user_id)
        values (${world.organizationId}, ${world.clients.a}, ${agenda.rooms.a.projectId},
                ${world.users.freelancer})
      `;
      await asUser(sql, world.users.freelancer);
      expect(await visibleIds(sql)).toContain(agenda.kickoffAId);
      expect(await visibleIds(sql)).not.toContain(agenda.internalId);
      expect(await visibleIds(sql)).not.toContain(agenda.meetingBId);
    });
  });

  it('clients read no agenda events', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      await createAgendaFixture(sql, world);

      for (const userId of [world.users.decisionMakerA, world.users.clientFinanceB]) {
        await asUser(sql, userId, { aal: 'aal1' });
        expect(await visibleIds(sql)).toEqual([]);
      }
    });
  });

  it('nobody writes agenda events directly', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      await createAgendaFixture(sql, world);

      await asUser(sql, world.users.founder);
      for (const statement of [
        sql`update public.agenda_events set title = 'Alterado'`,
        sql`delete from public.agenda_events`,
      ]) {
        await sql`savepoint probe`;
        expect(await statement.catch((error: Error) => error)).toBeInstanceOf(Error);
        await sql`rollback to savepoint probe`;
      }
    });
  });
});
