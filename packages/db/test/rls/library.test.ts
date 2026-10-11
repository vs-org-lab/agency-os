import type { TransactionSql } from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import {
  asUser,
  closeTestSql,
  createFixtureWorld,
  createLibraryFixture,
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

const sorted = (...ids: string[]) => [...ids].sort();

describe('library access', () => {
  it('team reads the library of readable projects only', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const library = await createLibraryFixture(sql, world);
      const clientAFolders = sorted(library.a.rootId, library.a.subfolderId, library.a.internalId);
      const clientAFiles = sorted(
        library.a.rootFileId,
        library.a.subfolderFileId,
        library.a.internalFileId,
        library.a.uploadingFileId,
      );
      await sql`
        insert into public.project_staff_assignments (organization_id, client_id, project_id, user_id)
        values (${world.organizationId}, ${world.clients.a}, ${library.a.projectId},
                ${world.users.freelancer})
      `;

      await asUser(sql, world.users.founder);
      expect(await visibleIds(sql, 'library_folders')).toEqual(
        sorted(...clientAFolders, library.b.rootId),
      );
      await asUser(sql, world.users.freelancer);
      expect(await visibleIds(sql, 'library_folders')).toEqual(clientAFolders);
      expect(await visibleIds(sql, 'library_files')).toEqual(clientAFiles);
      await asUser(sql, world.users.finance);
      expect(await visibleIds(sql, 'library_files')).toEqual(
        sorted(...clientAFiles, library.b.rootFileId),
      );
    });
  });

  it('clients read only folders under visible roots', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const library = await createLibraryFixture(sql, world);

      for (const userId of [world.users.decisionMakerA, world.users.operationalA]) {
        await asUser(sql, userId, { aal: 'aal1' });
        expect(await visibleIds(sql, 'portal_library_folders')).toEqual(
          sorted(library.a.rootId, library.a.subfolderId),
        );
        expect(await visibleIds(sql, 'library_folders')).toEqual([]);
      }
      await asUser(sql, world.users.clientFinanceB, { aal: 'aal1' });
      expect(await visibleIds(sql, 'portal_library_folders')).toEqual([]);
    });
  });

  it('clients read only ready files under visible roots', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const library = await createLibraryFixture(sql, world);

      await asUser(sql, world.users.decisionMakerA, { aal: 'aal1' });
      expect(await visibleIds(sql, 'portal_library_files')).toEqual(
        sorted(library.a.rootFileId, library.a.subfolderFileId),
      );
      expect(await visibleIds(sql, 'library_files')).toEqual([]);
    });
  });

  it('nobody writes the library directly', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      await createLibraryFixture(sql, world);

      for (const [userId, aal] of [
        [world.users.founder, 'aal2'],
        [world.users.operationalA, 'aal1'],
      ] as const) {
        await asUser(sql, userId, { aal });
        for (const statement of [
          sql`update public.library_folders set name = 'Alterada'`,
          sql`delete from public.library_files`,
          sql`delete from public.project_update_files`,
        ]) {
          await sql`savepoint probe`;
          expect(await statement.catch((error: Error) => error)).toBeInstanceOf(Error);
          await sql`rollback to savepoint probe`;
        }
      }
    });
  });

  it('subfolders cannot carry their own visibility', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const library = await createLibraryFixture(sql, world);

      const error = await sql`
        update public.library_folders set visibility = 'client' where id = ${library.a.subfolderId}
      `.catch((caught: Error) => caught);
      expect(error).toBeInstanceOf(Error);
      expect(String((error as Error).message)).toContain('library_folders_root_visibility');
    });
  });
});
