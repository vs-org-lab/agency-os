import { randomUUID } from 'node:crypto';
import type { TransactionSql } from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import {
  closeTestSql,
  createFixtureWorld,
  testDatabase,
  withTestTransaction,
} from '@agency-os/db/testing';
import { createDbContexts, type VerifiedClaims } from '@/platform/db';
import { convertAcquisitionTarget, listAcquisitionTargets, saveAcquisitionTarget } from './service';

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
  };
}

const TARGET = {
  targetId: null,
  companyName: 'Energia Atlântica',
  sector: 'energy',
  website: 'https://energia.example',
  notes: 'Novo diretor de marketing desde setembro.',
  status: 'to_contact' as const,
};

async function setup(sql: TransactionSql) {
  const world = await createFixtureWorld(sql);
  const contexts = createDbContexts(testDatabase(sql));
  const saved = await saveAcquisitionTarget(claimsFor(world.users.founder), TARGET, { contexts });
  if (!saved.ok) throw new Error('expected the target to be saved');
  return { world, contexts, targetId: saved.targetId };
}

describe('acquisition', () => {
  it('converts a target into prospect, contact and deal at 0.1', async () => {
    await withTestTransaction(async (sql) => {
      const { world, contexts, targetId } = await setup(sql);

      const result = await convertAcquisitionTarget(
        claimsFor(world.users.founder),
        {
          targetId,
          contact: {
            fullName: 'Marta Reis',
            email: 'marta@energia.example',
            role: 'decision_maker',
          },
        },
        { contexts },
      );

      expect(result).toMatchObject({ ok: true });
      if (!result.ok) return;
      await sql`reset role`;
      const [deal] = await sql<
        { code: string; source: string; lifecycle: string; name: string; status: string }[]
      >`
        select d.pipeline_code::text as code, d.source::text, c.lifecycle::text, c.name, t.status::text
        from public.deals d
        join public.clients c on c.id = d.client_id
        join public.acquisition_targets t on t.converted_client_id = c.id
        where d.id = ${result.dealId}
      `;
      expect(deal).toEqual({
        code: '0.1',
        source: 'acquisition',
        lifecycle: 'prospect',
        name: 'Energia Atlântica',
        status: 'converted',
      });
      const [contact] = await sql<{ name: string }[]>`
        select c.full_name as name from public.contacts c
        join public.deals d on d.client_id = c.client_id where d.id = ${result.dealId}
      `;
      expect(contact?.name).toBe('Marta Reis');
    });
  });

  it('a converted target cannot be converted again', async () => {
    await withTestTransaction(async (sql) => {
      const { world, contexts, targetId } = await setup(sql);
      const input = {
        targetId,
        contact: { fullName: 'Marta Reis', email: null, role: 'decision_maker' as const },
      };

      await convertAcquisitionTarget(claimsFor(world.users.founder), input, { contexts });
      expect(
        await convertAcquisitionTarget(claimsFor(world.users.founder), input, { contexts }),
      ).toEqual({ ok: false, rule: 'already_converted' });
    });
  });

  it('finance reads targets but cannot change them', async () => {
    await withTestTransaction(async (sql) => {
      const { world, contexts, targetId } = await setup(sql);

      const listed = await contexts.withUserContext(claimsFor(world.users.finance), (tx) =>
        listAcquisitionTargets(tx),
      );
      expect(listed.map((target) => target.id)).toEqual([targetId]);

      expect(
        await saveAcquisitionTarget(
          claimsFor(world.users.finance),
          { ...TARGET, targetId, status: 'contacted' },
          { contexts },
        ),
      ).toEqual({ ok: false, rule: 'forbidden' });
    });
  });

  it('manager has no access to targets', async () => {
    await withTestTransaction(async (sql) => {
      const { world, contexts, targetId } = await setup(sql);

      const listed = await contexts.withUserContext(claimsFor(world.users.manager), (tx) =>
        listAcquisitionTargets(tx),
      );
      expect(listed).toEqual([]);
      expect(
        await convertAcquisitionTarget(
          claimsFor(world.users.manager),
          { targetId, contact: { fullName: 'Marta', email: null, role: 'decision_maker' } },
          { contexts },
        ),
      ).toEqual({ ok: false, rule: 'forbidden' });
    });
  });
});
