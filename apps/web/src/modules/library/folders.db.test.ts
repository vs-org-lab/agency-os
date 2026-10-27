import type { TransactionSql } from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import { schema } from '@agency-os/db';
import {
  closeTestSql,
  createFixtureWorld,
  createLibraryFixture,
  withTestTransaction,
} from '@agency-os/db/testing';
import {
  createFolder,
  deleteFolder,
  ensureRootFolder,
  renameFolder,
  setFolderVisibility,
} from './folders';
import { libraryClaims, libraryDeps } from './testing';

afterAll(async () => {
  await closeTestSql();
});

async function folder(sql: TransactionSql, folderId: string) {
  await sql`reset role`;
  const [row] = await sql<
    { name: string; depth: number; visibility: string | null; root_id: string }[]
  >`
    select name, depth, visibility::text, root_id from public.library_folders where id = ${folderId}
  `;
  return row;
}

describe('library folders', () => {
  it('the team creates root folders as internal and nested folders up to four levels', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const library = await createLibraryFixture(sql, world);
      const { deps } = libraryDeps(sql);
      const manager = libraryClaims(world.users.manager);

      const root = await createFolder(
        manager,
        { projectId: library.a.projectId, parentId: null, name: '  Entregas  ' },
        deps,
      );
      if (!root.ok) throw new Error('Root folder was not created');
      expect(await folder(sql, root.folderId)).toEqual({
        name: 'Entregas',
        depth: 0,
        visibility: 'internal',
        root_id: root.folderId,
      });

      let parentId = root.folderId;
      for (const name of ['Nível 1', 'Nível 2', 'Nível 3']) {
        const created = await createFolder(
          manager,
          { projectId: library.a.projectId, parentId, name },
          deps,
        );
        if (!created.ok) throw new Error(`${name} was not created`);
        parentId = created.folderId;
      }
      expect(await folder(sql, parentId)).toEqual({
        name: 'Nível 3',
        depth: 3,
        visibility: null,
        root_id: root.folderId,
      });
      expect(
        await createFolder(
          manager,
          { projectId: library.a.projectId, parentId, name: 'Nível 4' },
          deps,
        ),
      ).toEqual({ ok: false, rule: 'too_deep' });
      expect(
        await createFolder(
          manager,
          { projectId: library.a.projectId, parentId: null, name: ' ' },
          deps,
        ),
      ).toEqual({ ok: false, rule: 'invalid_input' });
      expect(
        await createFolder(
          manager,
          { projectId: library.b.projectId, parentId: library.a.rootId, name: 'Cruzada' },
          deps,
        ),
      ).toEqual({ ok: false, rule: 'not_found' });
    });
  });

  it('sibling names are unique regardless of case', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const library = await createLibraryFixture(sql, world);
      const { deps } = libraryDeps(sql);
      const founder = libraryClaims(world.users.founder);

      expect(
        await createFolder(
          founder,
          { projectId: library.a.projectId, parentId: null, name: 'MARCA' },
          deps,
        ),
      ).toEqual({ ok: false, rule: 'name_taken' });
      expect(
        await createFolder(
          founder,
          { projectId: library.a.projectId, parentId: library.a.rootId, name: 'logótipos' },
          deps,
        ),
      ).toEqual({ ok: false, rule: 'name_taken' });
      expect(
        await renameFolder(founder, { folderId: library.a.internalId, name: 'marca' }, deps),
      ).toEqual({ ok: false, rule: 'name_taken' });
      expect(
        await renameFolder(founder, { folderId: library.a.internalId, name: 'Equipa' }, deps),
      ).toEqual({ ok: true });
      expect((await folder(sql, library.a.internalId))?.name).toBe('Equipa');
    });
  });

  it('folder names cannot carry path separators, dots or control characters', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const library = await createLibraryFixture(sql, world);
      const { deps } = libraryDeps(sql);
      const founder = libraryClaims(world.users.founder);

      for (const name of ['..', '.', 'a/b', 'x\\y', 'linha\nnova', 'nulo\u0000']) {
        expect(
          await createFolder(
            founder,
            { projectId: library.a.projectId, parentId: null, name },
            deps,
          ),
          name,
        ).toEqual({ ok: false, rule: 'invalid_input' });
        expect(
          await renameFolder(founder, { folderId: library.a.internalId, name }, deps),
          name,
        ).toEqual({ ok: false, rule: 'invalid_input' });
      }
      await sql`reset role`;
      const error = await sql`
        update public.library_folders set name = '..' where id = ${library.a.internalId}
      `.catch((caught: Error) => caught);
      expect(String((error as Error).message)).toContain('library_folders_name_safe');
    });
  });

  it('only roots carry visibility', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const library = await createLibraryFixture(sql, world);
      const { deps } = libraryDeps(sql);
      const manager = libraryClaims(world.users.manager);

      expect(
        await setFolderVisibility(
          manager,
          { folderId: library.a.internalId, visibility: 'client' },
          deps,
        ),
      ).toEqual({ ok: true });
      expect((await folder(sql, library.a.internalId))?.visibility).toBe('client');
      expect(
        await setFolderVisibility(
          manager,
          { folderId: library.a.subfolderId, visibility: 'internal' },
          deps,
        ),
      ).toEqual({ ok: false, rule: 'invalid_input' });
      expect(
        await setFolderVisibility(
          manager,
          { folderId: library.a.rootId, visibility: 'public' as never },
          deps,
        ),
      ).toEqual({ ok: false, rule: 'invalid_input' });
    });
  });

  it('deleting a folder removes its tree and stored files', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const library = await createLibraryFixture(sql, world);
      const { deps, storage } = libraryDeps(sql);

      expect(
        await deleteFolder(
          libraryClaims(world.users.founder),
          { folderId: library.a.rootId },
          deps,
        ),
      ).toEqual({ ok: true, removed: 3 });
      await sql`reset role`;
      const folders = await sql<{ id: string }[]>`
        select id from public.library_folders where project_id = ${library.a.projectId}
      `;
      expect(folders.map((row) => row.id)).toEqual([library.a.internalId]);
      const files = await sql<{ id: string }[]>`
        select id from public.library_files where project_id = ${library.a.projectId}
      `;
      expect(files.map((row) => row.id)).toEqual([library.a.internalFileId]);
      const prefix = `${world.organizationId}/${world.clients.a}/${library.a.projectId}`;
      expect([...storage.removed].sort()).toEqual(
        [library.a.rootFileId, library.a.subfolderFileId, library.a.uploadingFileId]
          .map((fileId) => `${prefix}/${fileId}`)
          .sort(),
      );
    });
  });

  it('operational users create subfolders only under visible roots', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const library = await createLibraryFixture(sql, world);
      const { deps } = libraryDeps(sql);
      const operational = libraryClaims(world.users.operationalA, 'client');
      const projectId = library.a.projectId;

      expect(
        await createFolder(
          operational,
          { projectId, parentId: library.a.rootId, name: 'Fotos' },
          deps,
        ),
      ).toMatchObject({ ok: true });
      for (const parentId of [null, library.a.internalId]) {
        expect(
          await createFolder(operational, { projectId, parentId, name: 'Fotos 2' }, deps),
        ).toEqual({ ok: false, rule: 'not_found' });
      }
      expect(
        await renameFolder(operational, { folderId: library.a.subfolderId, name: 'Logos' }, deps),
      ).toEqual({ ok: false, rule: 'not_found' });
      for (const claims of [
        libraryClaims(world.users.decisionMakerA, 'client'),
        libraryClaims(world.users.finance),
        libraryClaims(world.users.freelancer),
      ]) {
        expect(
          await createFolder(
            claims,
            { projectId, parentId: library.a.rootId, name: 'Outra' },
            deps,
          ),
        ).toEqual({ ok: false, rule: 'not_found' });
      }
    });
  });

  it('ensuring a root folder returns the existing one when a concurrent call created it first', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const library = await createLibraryFixture(sql, world);
      const { deps } = libraryDeps(sql);
      const manager = libraryClaims(world.users.manager);
      const input = { projectId: library.a.projectId, name: 'Tarefas' };
      const first = await ensureRootFolder(manager, input, deps);
      if (!first.ok) throw new Error('Root folder was not created');

      // The first lookup misses the folder, as when the other call has not committed yet.
      const empty: unknown = new Proxy(
        {},
        {
          get: (_target, key) =>
            key === 'then' ? (done: (rows: []) => void) => done([]) : () => empty,
        },
      );
      const racing = {
        ...deps,
        contexts: {
          ...deps.contexts,
          withSystemContext: ((run) =>
            deps.contexts.withSystemContext((tx) => {
              let blind = true;
              return run(
                new Proxy(tx, {
                  get(target, key) {
                    if (key === 'select') {
                      return (...args: unknown[]) => {
                        const query = (target.select as (...a: unknown[]) => unknown)(...args) as {
                          from: (table: unknown) => unknown;
                        };
                        return {
                          from(table: unknown) {
                            if (table !== schema.libraryFolders || !blind) return query.from(table);
                            blind = false;
                            return empty;
                          },
                        };
                      };
                    }
                    const value = Reflect.get(target, key) as unknown;
                    return typeof value === 'function' ? value.bind(target) : value;
                  },
                }),
              );
            })) as typeof deps.contexts.withSystemContext,
        },
      };

      expect(await ensureRootFolder(manager, input, racing)).toEqual({
        ok: true,
        folderId: first.folderId,
      });
    });
  });
});
