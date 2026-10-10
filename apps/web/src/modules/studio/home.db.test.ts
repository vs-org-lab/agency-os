import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import {
  closeTestSql,
  createBillingFixture,
  createFixtureWorld,
  createRoomFixture,
  testDatabase,
  withTestTransaction,
} from '@agency-os/db/testing';
import { createDbContexts, type VerifiedClaims } from '@/platform/db';
import { loadHome } from './home';

afterAll(async () => {
  await closeTestSql();
});

function claimsFor(userId: string): VerifiedClaims {
  return {
    sub: userId,
    role: 'authenticated',
    aal: 'aal2',
    session_id: randomUUID(),
    amr: [{ method: 'totp', timestamp: Math.floor(Date.now() / 1000) }],
    user_kind: 'internal',
  };
}

describe('studio home', () => {
  it('today merges tasks, late steps, changes requested and overdue requests', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const billing = await createBillingFixture(sql, world);
      const rooms = await createRoomFixture(sql, world);
      await sql`
        update public.project_steps set status = 'todo', due_on = current_date - 2
        where id = ${rooms.a.visibleStepId}
      `;
      await sql`
        update public.approvals set status = 'changes_requested', decided_at = now(),
               comment = 'Mudar a cor'
        where id = ${rooms.a.approvalId}
      `;
      await sql`
        update public.project_phases set status = 'in_progress' where id = ${rooms.a.phaseIds[0]}
      `;
      await sql`
        update public.payment_requests set due_date = current_date - 3
        where id = ${billing.a.sentRequestId}
      `;
      await sql`
        insert into public.tasks (organization_id, client_id, title, due_on, created_by)
        values (${world.organizationId}, ${world.clients.a}, 'Ligar ao cliente', current_date - 1,
                ${world.users.founder})
      `;
      const contexts = createDbContexts(testDatabase(sql));

      const home = await loadHome(claimsFor(world.users.founder), new Date(), { contexts });

      const kinds = new Set(home?.today.map((item) => item.kind));
      for (const kind of ['task', 'step', 'approval', 'payment'])
        expect(kinds.has(kind as never), kind).toBe(true);
      expect(home?.today[0]?.overdue).toBe(true);
      expect(home?.indicators.waiting).toBe(home?.today.length);
      expect(home?.indicators.receivable?.length).toBeGreaterThan(0);
    });
  });

  it('freelancer sees no receivable nor payments', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const billing = await createBillingFixture(sql, world);
      await sql`
        update public.payment_requests set due_date = current_date - 3
        where id = ${billing.a.sentRequestId}
      `;
      const contexts = createDbContexts(testDatabase(sql));

      const home = await loadHome(claimsFor(world.users.freelancer), new Date(), { contexts });

      expect(home?.indicators.receivable).toBeNull();
      expect(home?.today.some((item) => item.kind === 'payment')).toBe(false);
    });
  });

  it('progress counts done phases of active projects', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const rooms = await createRoomFixture(sql, world);
      await sql`update public.project_phases set status = 'done' where id = ${rooms.a.phaseIds[0]}`;
      const contexts = createDbContexts(testDatabase(sql));

      const home = await loadHome(claimsFor(world.users.founder), new Date(), { contexts });

      const clientA = home?.clients.find((client) => client.id === world.clients.a);
      expect(clientA?.progress).toEqual({ done: 1, total: 2 });
      expect(home?.indicators.activeProjects).toBe(2);
      expect(home?.indicators.clients).toBe(2);
    });
  });

  it('clients get no home', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const contexts = createDbContexts(testDatabase(sql));

      expect(
        await loadHome(claimsFor(world.users.decisionMakerA), new Date(), { contexts }),
      ).toBeNull();
    });
  });
});
