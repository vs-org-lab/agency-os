import type { TransactionSql } from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import {
  asUser,
  closeTestSql,
  createFixtureWorld,
  createProofFixture,
  withTestTransaction,
} from '../../src/testing';

afterAll(async () => {
  await closeTestSql();
});

async function visibleIds(sql: TransactionSql, relation: string): Promise<string[]> {
  const rows = await sql<{ id: string }[]>`select id from ${sql('public.' + relation)}`.catch(
    (error: Error) => {
      if (/permission denied/.test(error.message)) return [];
      throw error;
    },
  );
  return rows.map((row) => row.id).sort();
}

describe('proofing access', () => {
  it('team reads proofs of readable projects only', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const proof = await createProofFixture(sql, world);

      await asUser(sql, world.users.manager);
      expect(await visibleIds(sql, 'proof_files')).toEqual([proof.fileId]);
      expect(await visibleIds(sql, 'proof_comments')).toEqual(
        [proof.clientCommentId, proof.internalCommentId].sort(),
      );

      await asUser(sql, world.users.freelancer);
      expect(await visibleIds(sql, 'proof_files')).toEqual([]);
      expect(await visibleIds(sql, 'proof_versions')).toEqual([]);
    });
  });

  it('clients read requested versions and public comments only', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const proof = await createProofFixture(sql, world);

      for (const userId of [world.users.decisionMakerA, world.users.operationalA]) {
        await asUser(sql, userId, { aal: 'aal1' });
        expect(await visibleIds(sql, 'portal_proof_versions')).toEqual([proof.versionTwoId]);
        expect(await visibleIds(sql, 'portal_proof_comments')).toEqual([proof.clientCommentId]);
        expect(await visibleIds(sql, 'proof_files')).toEqual([]);
      }
    });
  });

  it('client finance reads no proofs', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      await createProofFixture(sql, world);
      await asUser(sql, world.users.clientFinanceB, { aal: 'aal1' });

      expect(await visibleIds(sql, 'portal_proof_versions')).toEqual([]);
      expect(await visibleIds(sql, 'portal_proof_comments')).toEqual([]);
    });
  });

  it('nobody writes proofs directly', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const proof = await createProofFixture(sql, world);
      await asUser(sql, world.users.founder);

      for (const statement of [
        sql`update public.proof_versions set status = 'rejected'`,
        sql`delete from public.proof_comments`,
        sql`insert into public.proof_comments (organization_id, client_id, project_id, version_id, body)
            values (${world.organizationId}, ${world.clients.a}, ${proof.rooms.a.projectId},
                    ${proof.versionTwoId}, 'Direto')`,
      ]) {
        await sql`savepoint probe`;
        expect(await statement.catch((error: Error) => error)).toBeInstanceOf(Error);
        await sql`rollback to savepoint probe`;
      }
    });
  });
});
