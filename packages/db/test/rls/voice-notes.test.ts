import { randomUUID } from 'node:crypto';
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

type World = Awaited<ReturnType<typeof createFixtureWorld>>;
type Proof = Awaited<ReturnType<typeof createProofFixture>>;

async function visibleIds(sql: TransactionSql, relation: string): Promise<string[]> {
  const rows = await sql<{ id: string }[]>`select id from ${sql('public.' + relation)}`.catch(
    (error: Error) => {
      if (/permission denied/.test(error.message)) return [];
      throw error;
    },
  );
  return rows.map((row) => row.id).sort();
}

async function seedVoiceNote(
  sql: TransactionSql,
  world: World,
  proof: Proof,
  input: { targetKind: string; targetId: string; status?: string },
): Promise<string> {
  const [row] = await sql<{ id: string }[]>`
    insert into public.voice_notes (organization_id, client_id, project_id, target_kind, target_id,
                                    author_id, path, content_type, duration_seconds, status)
    values (${world.organizationId}, ${world.clients.a}, ${proof.rooms.a.projectId},
            ${input.targetKind}::app.voice_note_target, ${input.targetId},
            ${world.users.decisionMakerA},
            ${`${world.organizationId}/${world.clients.a}/${randomUUID()}.webm`},
            'audio/webm', 12, ${input.status ?? 'uploaded'}::app.voice_note_status)
    returning id
  `;
  if (!row) throw new Error('Voice note was not created');
  return row.id;
}

describe('voice notes access', () => {
  it('team reads voice notes of readable projects only', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const proof = await createProofFixture(sql, world);
      const id = await seedVoiceNote(sql, world, proof, {
        targetKind: 'proof_comment',
        targetId: proof.clientCommentId,
      });

      await asUser(sql, world.users.manager);
      expect(await visibleIds(sql, 'voice_notes')).toEqual([id]);
      await asUser(sql, world.users.freelancer);
      expect(await visibleIds(sql, 'voice_notes')).toEqual([]);
    });
  });

  it('clients read the notes of visible comments and approvals, never the table', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const proof = await createProofFixture(sql, world);
      const onComment = await seedVoiceNote(sql, world, proof, {
        targetKind: 'proof_comment',
        targetId: proof.clientCommentId,
      });
      const onApproval = await seedVoiceNote(sql, world, proof, {
        targetKind: 'approval_change_request',
        targetId: proof.approvalId,
      });
      await seedVoiceNote(sql, world, proof, {
        targetKind: 'proof_comment',
        targetId: proof.internalCommentId,
      });
      await seedVoiceNote(sql, world, proof, {
        targetKind: 'proof_comment',
        targetId: proof.clientCommentId,
        status: 'pending',
      });

      for (const userId of [world.users.decisionMakerA, world.users.operationalA]) {
        await asUser(sql, userId, { aal: 'aal1' });
        expect(await visibleIds(sql, 'portal_voice_notes')).toEqual([onComment, onApproval].sort());
        expect(await visibleIds(sql, 'voice_notes')).toEqual([]);
      }
    });
  });

  it('client finance reads no voice notes', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const proof = await createProofFixture(sql, world);
      await seedVoiceNote(sql, world, proof, {
        targetKind: 'proof_comment',
        targetId: proof.clientCommentId,
      });

      await asUser(sql, world.users.clientFinanceB, { aal: 'aal1' });
      expect(await visibleIds(sql, 'portal_voice_notes')).toEqual([]);
      expect(await visibleIds(sql, 'voice_notes')).toEqual([]);
    });
  });

  it('nobody writes voice notes directly and the closed lists hold', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const proof = await createProofFixture(sql, world);
      const id = await seedVoiceNote(sql, world, proof, {
        targetKind: 'proof_comment',
        targetId: proof.clientCommentId,
      });

      await asUser(sql, world.users.founder);
      for (const statement of [
        sql`update public.voice_notes set transcript = 'Alterado' where id = ${id}`,
        sql`delete from public.voice_notes`,
        sql`insert into public.voice_notes (organization_id, client_id, project_id, target_kind,
                  target_id, path, content_type, duration_seconds)
            values (${world.organizationId}, ${world.clients.a}, ${proof.rooms.a.projectId},
                    'proof_comment', ${proof.clientCommentId}, 'p', 'audio/webm', 5)`,
      ]) {
        await sql`savepoint probe`;
        expect(await statement.catch((error: Error) => error)).toBeInstanceOf(Error);
        await sql`rollback to savepoint probe`;
      }

      await sql`reset role`;
      for (const [contentType, seconds] of [
        ['audio/wav', 5],
        ['audio/webm', 181],
        ['audio/webm', 0],
      ] as const) {
        await sql`savepoint probe`;
        const rejected = await sql`
          insert into public.voice_notes (organization_id, client_id, project_id, target_kind,
                                          target_id, path, content_type, duration_seconds)
          values (${world.organizationId}, ${world.clients.a}, ${proof.rooms.a.projectId},
                  'proof_comment', ${proof.clientCommentId}, 'p', ${contentType}, ${seconds})
        `.catch((error: Error) => error);
        expect(rejected).toBeInstanceOf(Error);
        await sql`rollback to savepoint probe`;
      }
    });
  });
});
