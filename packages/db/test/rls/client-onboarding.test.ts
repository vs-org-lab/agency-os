import type { TransactionSql } from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import {
  asSystem,
  asUser,
  closeTestSql,
  createCoreFixture,
  createFixtureWorld,
  createRoomFixture,
  withTestTransaction,
} from '../../src/testing';

afterAll(async () => {
  await closeTestSql();
});

async function ids(sql: TransactionSql, relation: string, column = 'id'): Promise<string[]> {
  const rows = await sql<{ value: string }[]>`
    select ${sql(column)}::text as value from ${sql('public.' + relation)}
  `.catch((error: Error) => {
    if (/permission denied/.test(error.message)) return [];
    throw error;
  });
  return rows.map((row) => row.value).sort();
}

async function respond(
  sql: TransactionSql,
  world: { organizationId: string },
  clientId: string,
  engagementId: string,
) {
  const [row] = await sql<{ id: string }[]>`
    insert into public.client_onboarding_responses
      (organization_id, client_id, engagement_id, request_id, response, completed_at)
    values (${world.organizationId}, ${clientId}, ${engagementId}, 'brand_files', '', now())
    returning id
  `;
  if (!row) throw new Error('Onboarding response was not created');
  return row.id;
}

describe('client onboarding access', () => {
  it('the room team reads the answers; client members read their own through the portal', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const core = await createCoreFixture(sql, world);
      const a = await respond(sql, world, world.clients.a, core.a.engagementId);
      const b = await respond(sql, world, world.clients.b, core.b.engagementId);

      await asUser(sql, world.users.founder);
      expect(await ids(sql, 'client_onboarding_responses')).toEqual([a, b].sort());
      await asSystem(sql);

      await asUser(sql, world.users.manager);
      expect(await ids(sql, 'client_onboarding_responses')).toEqual([a]);
      await asSystem(sql);

      for (const [user, expected] of [
        [world.users.decisionMakerA, [a]],
        [world.users.operationalA, [a]],
        [world.users.clientFinanceB, []],
      ] as const) {
        await asUser(sql, user);
        expect(await ids(sql, 'client_onboarding_responses')).toEqual([]);
        expect(await ids(sql, 'portal_onboarding_responses')).toEqual([...expected]);
        await asSystem(sql);
      }
    });
  });

  it('nobody writes the answers directly', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const core = await createCoreFixture(sql, world);

      for (const user of [world.users.founder, world.users.decisionMakerA]) {
        await asUser(sql, user);
        await sql`savepoint write_probe`;
        await expect(
          sql`
            insert into public.client_onboarding_responses
              (organization_id, client_id, engagement_id, request_id, completed_at)
            values (${world.organizationId}, ${world.clients.a}, ${core.a.engagementId}, 'x', now())
          `,
        ).rejects.toThrow(/permission denied/);
        await sql`rollback to savepoint write_probe`;
        await asSystem(sql);
      }
    });
  });

  it('client members see the agency people on their account and nobody else', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);

      await asUser(sql, world.users.decisionMakerA);
      const team = await sql<{ user_id: string; client_id: string; email: string }[]>`
        select user_id::text, client_id::text, email from public.portal_client_team
      `;
      expect(team.map((row) => row.user_id)).toEqual([world.users.manager]);
      expect(team.every((row) => row.client_id === world.clients.a && row.email)).toBe(true);
      await asSystem(sql);

      await asUser(sql, world.users.manager);
      expect(await ids(sql, 'portal_client_team', 'user_id')).toEqual([]);
    });
  });

  it('client members see only the meetings they are invited to', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const rooms = await createRoomFixture(sql, world);
      const event = async (inviteClient: boolean, kind: string, clientId: string) => {
        const [row] = await sql<{ id: string }[]>`
          insert into public.agenda_events (organization_id, client_id, project_id, kind, title,
                                            starts_at, ends_at, invite_client, created_by)
          values (${world.organizationId}, ${clientId},
                  ${clientId === world.clients.a ? rooms.a.projectId : rooms.b.projectId},
                  ${kind}::app.agenda_event_kind, 'Reunião', now() + interval '1 day',
                  now() + interval '1 day 1 hour', ${inviteClient}, ${world.users.founder})
          returning id
        `;
        if (!row) throw new Error('Agenda event was not created');
        return row.id;
      };
      const invited = await event(true, 'kickoff', world.clients.a);
      await event(false, 'meeting', world.clients.a);
      await event(true, 'meeting', world.clients.b);

      await asUser(sql, world.users.operationalA);
      expect(await ids(sql, 'portal_agenda_events')).toEqual([invited]);
    });
  });
});
