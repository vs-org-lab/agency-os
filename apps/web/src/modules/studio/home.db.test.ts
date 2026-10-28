import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import {
  closeTestSql,
  createBillingFixture,
  createFixtureWorld,
  createRetainerBillingFixture,
  createRetainerFixture,
  addOrganizationMember,
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
  it('never lists rows of another organisation where the membership is revoked', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const other = await createFixtureWorld(sql);
      const otherBilling = await createBillingFixture(sql, other);
      const otherRooms = await createRoomFixture(sql, other);
      await addOrganizationMember(sql, {
        organizationId: other.organizationId,
        userId: world.users.founder,
        role: 'founder',
        status: 'revoked',
      });
      await sql`
        update public.payment_requests set due_date = current_date - 3
        where id = ${otherBilling.a.sentRequestId}
      `;
      await sql`
        update public.project_steps set status = 'todo', due_on = current_date - 2
        where id = ${otherRooms.a.visibleStepId}
      `;
      await sql`
        insert into public.tasks (organization_id, client_id, title, due_on, created_by)
        values (${other.organizationId}, ${other.clients.a}, 'Outra organização', current_date - 1,
                ${other.users.founder})
      `;
      const contexts = createDbContexts(testDatabase(sql));

      const home = await loadHome(claimsFor(world.users.founder), new Date(), { contexts });

      expect(home?.today).toEqual([]);
      expect(home?.clients).toEqual([]);
      expect(home?.indicators.activeProjects).toBe(0);
      expect(home?.indicators.receivable).toEqual([]);
      expect(home?.readerFirstName).toBe('Founder');
      expect(home?.localDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

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

  it('an overdue retainer request links to the retainer room', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const fixture = await createRetainerBillingFixture(sql, world);
      const [request] = await sql<{ id: string }[]>`
        insert into public.payment_requests (organization_id, client_id, deal_id, retainer_id,
                                             retainer_month, number, label, amount, currency,
                                             locale, due_date, issuer_details, client_details)
        values (${world.organizationId}, ${world.clients.a}, ${fixture.dealId},
                ${fixture.retainer.retainerId}, '2026-10-01', 'PP-2099-0004', 'Retainer', 1500,
                'EUR', 'pt-PT', current_date - 3, '{}'::jsonb, '{}'::jsonb)
        returning id
      `;
      const contexts = createDbContexts(testDatabase(sql));

      const home = await loadHome(claimsFor(world.users.founder), new Date(), { contexts });

      const item = home?.today.find((entry) => entry.id === request?.id);
      expect(item).toMatchObject({ kind: 'payment', href: `/c/${world.clients.a}/retainer` });
    });
  });

  it('home clients show the retainer label and the latest health level', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      await createRetainerFixture(sql, world);
      for (const [day, score, level] of [
        ['2026-10-10', 80, 'healthy'],
        ['2026-10-14', 30, 'at_risk'],
      ] as const) {
        await sql`
          insert into public.client_health_snapshots (organization_id, client_id, day, score,
                                                      level)
          values (${world.organizationId}, ${world.clients.a}, ${day}, ${score},
                  ${level}::app.health_level)
        `;
      }
      const contexts = createDbContexts(testDatabase(sql));
      const clientA = async (userId: string) =>
        (await loadHome(claimsFor(userId), new Date(), { contexts }))?.clients.find(
          (client) => client.id === world.clients.a,
        );

      expect(await clientA(world.users.founder)).toMatchObject({
        retainer: true,
        healthLevel: 'at_risk',
      });
      const freelancer = await loadHome(claimsFor(world.users.freelancer), new Date(), {
        contexts,
      });
      expect(freelancer?.clients.every((client) => client.healthLevel === null)).toBe(true);
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
