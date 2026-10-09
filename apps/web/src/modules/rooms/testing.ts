import { randomUUID } from 'node:crypto';
import type { TransactionSql } from 'postgres';
import type { DbTransaction } from '@agency-os/db';
import { testDatabase } from '@agency-os/db/testing';
import { createDbContexts, type VerifiedClaims } from '@/platform/db';
import { createProjectForDeal } from './projects';
import type { RoomsDeps } from './runtime-types';

export const ROOMS_TEST_NOW = new Date('2026-10-12T09:00:00Z');

export function roomClaims(
  userId: string,
  userKind: 'internal' | 'client' = 'internal',
): VerifiedClaims {
  return {
    sub: userId,
    role: 'authenticated',
    aal: 'aal2',
    session_id: randomUUID(),
    amr: [{ method: 'totp', timestamp: Math.floor(Date.now() / 1000) }],
    user_kind: userKind,
  };
}

export function roomDeps(sql: TransactionSql, overrides: Partial<RoomsDeps> = {}) {
  const moves: Array<{ dealId: string; code: string }> = [];
  const deps: RoomsDeps = {
    contexts: createDbContexts(testDatabase(sql)),
    moveDeal: async (_tx: DbTransaction, dealId: string, code: string) => {
      moves.push({ dealId, code });
    },
    flush: async () => {},
    now: () => ROOMS_TEST_NOW,
    ...overrides,
  };
  return { deps, moves };
}

export type StartedProject = { projectId: string; dealId: string; phaseIds: string[] };

/**
 * A deal at 2.3 whose project has its first phase in progress with every step done, ready for an
 * approval request. Seeded directly to keep db tests fast against a remote database.
 */
export async function projectAwaitingApproval(
  sql: TransactionSql,
  world: { organizationId: string; clients: { a: string } },
  deps: RoomsDeps,
): Promise<StartedProject> {
  const [deal] = await sql<{ id: string }[]>`
    insert into public.deals (organization_id, client_id, title, pipeline_code, source)
    values (${world.organizationId}, ${world.clients.a}, 'Website', '2.3', 'acquisition')
    returning id
  `;
  if (!deal) throw new Error('Deal was not created');
  const created = await createProjectForDeal(deal.id, deps);
  const projectId = created.projectId ?? '';
  const phases = await sql<{ id: string }[]>`
    select id from public.project_phases where project_id = ${projectId} order by position
  `;
  const [first] = phases;
  if (!first) throw new Error('Project has no phases');
  await sql`update public.project_phases set status = 'in_progress', started_at = now() where id = ${first.id}`;
  await sql`update public.project_steps set status = 'done' where phase_id = ${first.id}`;
  return { projectId, dealId: deal.id, phaseIds: phases.map((phase) => phase.id) };
}
