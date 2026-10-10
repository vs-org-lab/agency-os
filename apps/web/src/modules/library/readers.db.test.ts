import type { TransactionSql } from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import {
  closeTestSql,
  createFixtureWorld,
  createLibraryFixture,
  withTestTransaction,
} from '@agency-os/db/testing';
import { loadLibrary } from './readers';
import { libraryClaims, libraryDeps } from './testing';
import { zipManifest } from './zip';

afterAll(async () => {
  await closeTestSql();
});

async function setSize(sql: TransactionSql, fileId: string, sizeBytes: number, createdAt: string) {
  await sql`
    update public.library_files set size_bytes = ${sizeBytes}, created_at = ${createdAt}
    where id = ${fileId}
  `;
}

describe('library readers', () => {
  it('the team sees folders with recursive counts and files of the current folder', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const library = await createLibraryFixture(sql, world);
      const { deps } = libraryDeps(sql);
      const manager = libraryClaims(world.users.manager);

      const root = await loadLibrary(manager, { clientId: world.clients.a }, 'staff', deps);
      expect(root).toMatchObject({
        projectId: library.a.projectId,
        folder: null,
        canWrite: true,
        canCreateRoot: true,
        files: [],
      });
      expect(root?.folders).toEqual([
        { id: library.a.internalId, name: 'Interno', visibility: 'internal', fileCount: 1 },
        { id: library.a.rootId, name: 'Marca', visibility: 'client', fileCount: 2 },
      ]);

      const marca = await loadLibrary(
        manager,
        { clientId: world.clients.a, folderId: library.a.rootId },
        'staff',
        deps,
      );
      expect(marca?.folder).toEqual({
        id: library.a.rootId,
        name: 'Marca',
        visibility: 'client',
        trail: [],
      });
      expect(marca?.folders).toEqual([
        { id: library.a.subfolderId, name: 'Logótipos', visibility: 'client', fileCount: 1 },
      ]);
      expect(marca?.files).toEqual([
        expect.objectContaining({ id: library.a.rootFileId, name: 'manual.png', canDelete: true }),
      ]);
      const logos = await loadLibrary(
        manager,
        { clientId: world.clients.a, folderId: library.a.subfolderId },
        'staff',
        deps,
      );
      expect(logos?.folder?.trail).toEqual([{ id: library.a.rootId, name: 'Marca' }]);
    });
  });

  it('the portal library shows only visible roots', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const library = await createLibraryFixture(sql, world);
      const { deps } = libraryDeps(sql);

      const decisionMaker = libraryClaims(world.users.decisionMakerA, 'client');
      const root = await loadLibrary(decisionMaker, { clientId: world.clients.a }, 'portal', deps);
      expect(root).toMatchObject({ canWrite: false, canCreateRoot: false });
      expect(root?.folders).toEqual([
        { id: library.a.rootId, name: 'Marca', visibility: 'client', fileCount: 2 },
      ]);
      expect(
        await loadLibrary(
          decisionMaker,
          { clientId: world.clients.a, folderId: library.a.internalId },
          'portal',
          deps,
        ),
      ).toMatchObject({ folder: null, files: [] });

      const operational = libraryClaims(world.users.operationalA, 'client');
      const marca = await loadLibrary(
        operational,
        { clientId: world.clients.a, folderId: library.a.rootId },
        'portal',
        deps,
      );
      expect(marca).toMatchObject({ canWrite: true, canCreateRoot: false });
      expect(marca?.files).toEqual([
        expect.objectContaining({ id: library.a.rootFileId, canDelete: false }),
      ]);
      expect(
        await loadLibrary(operational, { clientId: world.clients.b }, 'portal', deps),
      ).toBeNull();
    });
  });

  it('search finds files across folders and filters by kind', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const library = await createLibraryFixture(sql, world);
      const { deps } = libraryDeps(sql);
      const founder = libraryClaims(world.users.founder);
      await sql`
        update public.library_files set kind = 'document', mime_type = 'application/pdf'
        where id = ${library.a.internalFileId}
      `;

      const found = await loadLibrary(
        founder,
        { clientId: world.clients.a, q: 'LOGO' },
        'staff',
        deps,
      );
      expect(found?.folders).toEqual([]);
      expect(found?.files).toEqual([
        expect.objectContaining({ id: library.a.subfolderFileId, folderName: 'Logótipos' }),
      ]);
      expect(
        (await loadLibrary(founder, { clientId: world.clients.a, q: '%' }, 'staff', deps))?.files,
      ).toEqual([]);
      const documents = await loadLibrary(
        founder,
        { clientId: world.clients.a, kind: 'document' },
        'staff',
        deps,
      );
      expect(documents?.files.map((file) => file.id)).toEqual([library.a.internalFileId]);
      const folders = await loadLibrary(
        founder,
        { clientId: world.clients.a, folderId: library.a.rootId, kind: 'folders' },
        'staff',
        deps,
      );
      expect(folders?.files).toEqual([]);
      expect(folders?.folders.map((folder) => folder.id)).toEqual([library.a.subfolderId]);
    });
  });

  it('sorting by size and date', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const library = await createLibraryFixture(sql, world);
      const { deps } = libraryDeps(sql);
      const founder = libraryClaims(world.users.founder);
      const extra = await sql<{ id: string }[]>`
        insert into public.library_files (organization_id, client_id, project_id, folder_id,
                                          root_id, name, storage_path, kind, mime_type,
                                          size_bytes, status)
        values (${world.organizationId}, ${world.clients.a}, ${library.a.projectId},
                ${library.a.rootId}, ${library.a.rootId}, 'aaa.png', 'x', 'image', 'image/png',
                10, 'ready')
        returning id
      `;
      const extraId = extra[0]?.id ?? '';
      await setSize(sql, library.a.rootFileId, 5000, '2026-10-01T10:00:00Z');
      await setSize(sql, extraId, 10, '2026-10-05T10:00:00Z');
      const order = async (sort: 'name' | 'date' | 'size') =>
        (
          await loadLibrary(
            founder,
            { clientId: world.clients.a, folderId: library.a.rootId, sort },
            'staff',
            deps,
          )
        )?.files.map((file) => file.id);

      expect(await order('name')).toEqual([extraId, library.a.rootFileId]);
      expect(await order('size')).toEqual([library.a.rootFileId, extraId]);
      expect(await order('date')).toEqual([extraId, library.a.rootFileId]);
    });
  });

  it("the client's zip manifest leaves internal folders out", async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const library = await createLibraryFixture(sql, world);
      const { deps } = libraryDeps(sql);
      const prefix = `memory://file/${world.organizationId}/${world.clients.a}/${library.a.projectId}`;

      const everything = await zipManifest(
        libraryClaims(world.users.decisionMakerA, 'client'),
        { projectId: library.a.projectId, folderId: null },
        deps,
      );
      expect(everything).toEqual({
        ok: true,
        archiveName: 'Website.zip',
        entries: [
          {
            path: 'Marca/Logótipos/logo.png',
            url: `${prefix}/${library.a.subfolderFileId}?ttl=900`,
          },
          { path: 'Marca/manual.png', url: `${prefix}/${library.a.rootFileId}?ttl=900` },
        ],
      });
      const folder = await zipManifest(
        libraryClaims(world.users.founder),
        { projectId: library.a.projectId, folderId: library.a.rootId },
        deps,
      );
      expect(folder).toMatchObject({
        ok: true,
        archiveName: 'Marca.zip',
        entries: [{ path: 'Logótipos/logo.png' }, { path: 'manual.png' }],
      });
      expect(
        await zipManifest(
          libraryClaims(world.users.decisionMakerA, 'client'),
          { projectId: library.a.projectId, folderId: library.a.internalId },
          deps,
        ),
      ).toEqual({ ok: false, rule: 'not_found' });
      const team = await zipManifest(
        libraryClaims(world.users.founder),
        { projectId: library.a.projectId, folderId: null },
        deps,
      );
      expect(team.ok && team.entries.map((entry) => entry.path)).toEqual([
        'Interno/notas.png',
        'Marca/Logótipos/logo.png',
        'Marca/manual.png',
      ]);
    });
  });

  it('oversized zips are refused', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const library = await createLibraryFixture(sql, world);
      const { deps } = libraryDeps(sql);
      await sql`
        update public.library_files set size_bytes = 524288000 where id = ${library.a.rootFileId}
      `;

      expect(
        await zipManifest(
          libraryClaims(world.users.founder),
          { projectId: library.a.projectId, folderId: library.a.rootId },
          deps,
        ),
      ).toEqual({ ok: false, rule: 'zip_too_large' });
    });
  });
});
