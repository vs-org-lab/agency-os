import type { TransactionSql } from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import {
  closeTestSql,
  createFixtureWorld,
  createLibraryFixture,
  withTestTransaction,
} from '@agency-os/db/testing';
import { getClientRoom } from './portal';
import { loadRoom, loadRoomPreview } from './room';
import { roomClaims, roomDeps } from './testing';
import { publishUpdate } from './updates';

afterAll(async () => {
  await closeTestSql();
});

async function updateIdByBody(
  sql: TransactionSql,
  projectId: string,
  body: string,
): Promise<string> {
  await sql`reset role`;
  const [row] = await sql<{ id: string }[]>`
    select id from public.project_updates where project_id = ${projectId} and body = ${body}
  `;
  if (!row) throw new Error('No update was published');
  return row.id;
}

describe('update attachments', () => {
  it('updates attach library files of the same project', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const library = await createLibraryFixture(sql, world);
      const { deps } = roomDeps(sql);
      const manager = roomClaims(world.users.manager);
      const base = {
        projectId: library.a.projectId,
        body: 'Ficheiros da semana',
        milestone: null,
        visibility: 'internal' as const,
      };

      expect(
        await publishUpdate(
          manager,
          { ...base, fileIds: [library.a.internalFileId, library.a.rootFileId] },
          deps,
        ),
      ).toEqual({ ok: true });
      const updateId = await updateIdByBody(sql, library.a.projectId, base.body);
      const room = await loadRoom(manager, { clientId: world.clients.a }, deps);
      expect(room?.project?.updates.find((update) => update.id === updateId)?.files).toEqual([
        { id: library.a.rootFileId, name: 'manual.png', kind: 'image', sizeBytes: 2048 },
        { id: library.a.internalFileId, name: 'notas.png', kind: 'image', sizeBytes: 2048 },
      ]);

      for (const fileIds of [
        [library.b.rootFileId],
        [library.a.uploadingFileId],
        Array.from({ length: 11 }, () => library.a.rootFileId),
      ]) {
        expect(await publishUpdate(manager, { ...base, fileIds }, deps)).toEqual({
          ok: false,
          rule: 'invalid_input',
        });
      }
    });
  });

  it('client-visible updates refuse files from internal folders', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const library = await createLibraryFixture(sql, world);
      const { deps } = roomDeps(sql);

      expect(
        await publishUpdate(
          roomClaims(world.users.manager),
          {
            projectId: library.a.projectId,
            body: 'Para o cliente',
            milestone: null,
            visibility: 'client',
            fileIds: [library.a.rootFileId, library.a.internalFileId],
          },
          deps,
        ),
      ).toEqual({ ok: false, rule: 'attachment_hidden' });
    });
  });

  it('attachments leave the portal when their folder turns internal', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const library = await createLibraryFixture(sql, world);
      const { deps } = roomDeps(sql);
      expect(
        await publishUpdate(
          roomClaims(world.users.manager),
          {
            projectId: library.a.projectId,
            body: 'Logótipo final',
            milestone: null,
            visibility: 'client',
            fileIds: [library.a.subfolderFileId],
          },
          deps,
        ),
      ).toEqual({ ok: true });
      const updateId = await updateIdByBody(sql, library.a.projectId, 'Logótipo final');
      const portalFiles = async () => {
        const room = await deps.contexts.withUserContext(
          roomClaims(world.users.decisionMakerA, 'client'),
          (tx) => getClientRoom(tx, world.clients.a, library.a.projectId),
        );
        return room?.project?.updates.find((update) => update.id === updateId)?.files;
      };
      const previewFiles = async () =>
        (
          await loadRoomPreview(
            roomClaims(world.users.manager),
            { clientId: world.clients.a },
            deps,
          )
        )?.project?.updates.find((update) => update.id === updateId)?.files;

      const attached = [
        { id: library.a.subfolderFileId, name: 'logo.png', kind: 'image', sizeBytes: 2048 },
      ];
      expect(await portalFiles()).toEqual(attached);
      expect(await previewFiles()).toEqual(attached);
      await sql`reset role`;
      await sql`update public.library_folders set visibility = 'internal' where id = ${library.a.rootId}`;
      expect(await portalFiles()).toEqual([]);
      expect(await previewFiles()).toEqual([]);
    });
  });
});
