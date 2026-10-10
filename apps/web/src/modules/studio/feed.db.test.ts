import { randomUUID } from 'node:crypto';
import type { TransactionSql } from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import {
  closeTestSql,
  createFixtureWorld,
  createTeamFixture,
  testDatabase,
  withTestTransaction,
} from '@agency-os/db/testing';
import { createDbContexts, type VerifiedClaims } from '@/platform/db';
import { loadStudioFeed } from './feed';

afterAll(async () => {
  await closeTestSql();
});

const NOW = new Date('2026-10-12T09:00:00Z');

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

async function insertEvent(
  sql: TransactionSql,
  input: { organizationId: string; clientId: string; type: string; daysAgo: number },
): Promise<string> {
  const dealId = randomUUID();
  const occurredAt = new Date(NOW.getTime() - input.daysAgo * 24 * 60 * 60 * 1000);
  const [row] = await sql<{ id: string }[]>`
    insert into public.domain_events (organization_id, client_id, type, payload, created_at)
    values (${input.organizationId}, ${input.clientId}, ${input.type},
            ${JSON.stringify({ dealId })}::jsonb, ${occurredAt.toISOString()}::timestamptz)
    returning id
  `;
  if (!row) throw new Error('Event was not inserted');
  return row.id;
}

describe('studio feed', () => {
  it('feed shows only readable clients', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const own = await insertEvent(sql, {
        organizationId: world.organizationId,
        clientId: world.clients.a,
        type: 'billing.payment.received',
        daysAgo: 1,
      });
      const other = await insertEvent(sql, {
        organizationId: world.organizationId,
        clientId: world.clients.b,
        type: 'contracts.proposal.accepted',
        daysAgo: 1,
      });
      await insertEvent(sql, {
        organizationId: world.organizationId,
        clientId: world.clients.a,
        type: 'commercial.deal.moved',
        daysAgo: 1,
      });
      const contexts = createDbContexts(testDatabase(sql));

      const managerFeed = await loadStudioFeed(claimsFor(world.users.manager), NOW, { contexts });
      const founderFeed = await loadStudioFeed(claimsFor(world.users.founder), NOW, { contexts });

      expect(managerFeed?.map((entry) => entry.id)).toEqual([own]);
      expect(managerFeed?.[0]).toMatchObject({
        type: 'billing.payment.received',
        clientId: world.clients.a,
        href: expect.stringContaining('/pipeline/'),
      });
      expect(founderFeed?.map((entry) => entry.id).sort()).toEqual([own, other].sort());
      expect(
        await loadStudioFeed(claimsFor(world.users.decisionMakerA), NOW, { contexts }),
      ).toBeNull();
    });
  });

  it('freelancers see approvals but no commercial or billing events', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const ids: Record<string, string> = {};
      for (const type of [
        'contracts.proposal.accepted',
        'contracts.contract.client_signed',
        'billing.payment.received',
        'rooms.approval.decided',
      ]) {
        ids[type] = await insertEvent(sql, {
          organizationId: world.organizationId,
          clientId: world.clients.a,
          type,
          daysAgo: 1,
        });
      }
      const contexts = createDbContexts(testDatabase(sql));

      const feed = await loadStudioFeed(claimsFor(world.users.freelancer), NOW, { contexts });

      expect(feed?.map((entry) => entry.id)).toEqual([ids['rooms.approval.decided']]);
    });
  });

  it('freelancer feed skips approvals of other projects', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const team = await createTeamFixture(sql, world);
      const approvalEvent = async (projectId: string) => {
        const [row] = await sql<{ id: string }[]>`
          insert into public.domain_events (organization_id, client_id, type, payload, created_at)
          values (${world.organizationId}, ${world.clients.a}, 'rooms.approval.decided',
                  ${JSON.stringify({ projectId, decision: 'approved' })}::jsonb,
                  ${new Date(NOW.getTime() - 60_000).toISOString()}::timestamptz)
          returning id
        `;
        return row?.id ?? '';
      };
      const assigned = await approvalEvent(team.rooms.a.projectId);
      const other = await approvalEvent(team.other.projectId);
      const contexts = createDbContexts(testDatabase(sql));

      const freelancer = await loadStudioFeed(claimsFor(world.users.freelancer), NOW, { contexts });
      const manager = await loadStudioFeed(claimsFor(world.users.manager), NOW, { contexts });

      expect(freelancer?.map((entry) => entry.id)).toEqual([assigned]);
      expect(manager?.map((entry) => entry.id).sort()).toEqual([assigned, other].sort());
    });
  });

  it('feed keeps 30 days', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const recent = await insertEvent(sql, {
        organizationId: world.organizationId,
        clientId: world.clients.a,
        type: 'contracts.contract.client_signed',
        daysAgo: 29,
      });
      await insertEvent(sql, {
        organizationId: world.organizationId,
        clientId: world.clients.a,
        type: 'contracts.contract.client_signed',
        daysAgo: 31,
      });
      const contexts = createDbContexts(testDatabase(sql));

      const feed = await loadStudioFeed(claimsFor(world.users.founder), NOW, { contexts });

      expect(feed?.map((entry) => entry.id)).toEqual([recent]);
    });
  });
});
