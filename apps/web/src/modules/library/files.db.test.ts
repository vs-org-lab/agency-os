import type { TransactionSql } from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import {
  closeTestSql,
  createFixtureWorld,
  createLibraryFixture,
  withTestTransaction,
} from '@agency-os/db/testing';
import {
  confirmUpload,
  deleteFile,
  libraryFileUrl,
  requestUploads,
  sweepStaleUploads,
} from './files';
import { LIBRARY_TEST_NOW, libraryClaims, libraryDeps, PNG_BYTES } from './testing';

afterAll(async () => {
  await closeTestSql();
});

const PATH_PREFIX = 'memory://upload/';

function storagePathOf(uploadUrl: string): string {
  return uploadUrl.slice(PATH_PREFIX.length);
}

async function file(sql: TransactionSql, fileId: string) {
  await sql`reset role`;
  const [row] = await sql<
    {
      status: string;
      kind: string | null;
      mime_type: string | null;
      size_bytes: string | null;
      name: string;
      folder_id: string;
    }[]
  >`
    select status::text, kind::text, mime_type, size_bytes::text, name, folder_id
    from public.library_files where id = ${fileId}
  `;
  return row;
}

describe('library files', () => {
  it('an upload is confirmed with its real type and size', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const library = await createLibraryFixture(sql, world);
      const { deps, storage } = libraryDeps(sql);
      const manager = libraryClaims(world.users.manager);

      const requested = await requestUploads(
        manager,
        { folderId: library.a.internalId, files: [{ path: 'capa.png', sizeBytes: 16 }] },
        deps,
      );
      if (!requested.ok) throw new Error('Upload was not requested');
      const [upload] = requested.uploads;
      if (!upload) throw new Error('Upload link is missing');
      expect(upload.path).toBe('capa.png');
      expect(storagePathOf(upload.uploadUrl)).toBe(
        `${world.organizationId}/${world.clients.a}/${library.a.projectId}/${upload.fileId}`,
      );
      storage.files.set(storagePathOf(upload.uploadUrl), PNG_BYTES);

      expect(await confirmUpload(manager, { fileId: upload.fileId }, deps)).toEqual({
        ok: true,
        kind: 'image',
      });
      expect(await file(sql, upload.fileId)).toMatchObject({
        status: 'ready',
        kind: 'image',
        mime_type: 'image/png',
        size_bytes: '16',
        name: 'capa.png',
        folder_id: library.a.internalId,
      });
      expect(await confirmUpload(manager, { fileId: upload.fileId }, deps)).toEqual({
        ok: false,
        rule: 'not_found',
      });
    });
  });

  it('a disguised file is rejected and removed', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const library = await createLibraryFixture(sql, world);
      const { deps, storage } = libraryDeps(sql);
      const manager = libraryClaims(world.users.manager);
      const requested = await requestUploads(
        manager,
        { folderId: library.a.rootId, files: [{ path: 'logo.png', sizeBytes: 16 }] },
        deps,
      );
      if (!requested.ok || !requested.uploads[0]) throw new Error('Upload was not requested');
      const { fileId, uploadUrl } = requested.uploads[0];
      const path = storagePathOf(uploadUrl);
      storage.files.set(path, new TextEncoder().encode('MZ executable payload'));

      expect(await confirmUpload(manager, { fileId }, deps)).toEqual({
        ok: false,
        rule: 'invalid_file',
      });
      expect((await file(sql, fileId))?.status).toBe('rejected');
      expect(storage.removed).toEqual([path]);
    });
  });

  it('folder upload creates subfolders once', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const library = await createLibraryFixture(sql, world);
      const { deps } = libraryDeps(sql);
      const manager = libraryClaims(world.users.manager);

      for (const path of ['Logos/a.png', 'logos/b.png']) {
        const requested = await requestUploads(
          manager,
          { folderId: library.a.internalId, files: [{ path, sizeBytes: 16 }] },
          deps,
        );
        expect(requested.ok).toBe(true);
      }
      await sql`reset role`;
      const folders = await sql<{ name: string; depth: number }[]>`
        select name, depth from public.library_folders where parent_id = ${library.a.internalId}
      `;
      expect(folders).toEqual([{ name: 'Logos', depth: 1 }]);
      expect(
        await requestUploads(
          manager,
          {
            folderId: library.a.internalId,
            files: [{ path: 'Um/Dois/Três/Quatro/x.png', sizeBytes: 16 }],
          },
          deps,
        ),
      ).toEqual({ ok: false, rule: 'too_deep' });
      expect(
        await requestUploads(
          manager,
          { folderId: library.a.internalId, files: [{ path: '../x.png', sizeBytes: 16 }] },
          deps,
        ),
      ).toEqual({ ok: false, rule: 'invalid_input' });
    });
  });

  it('uploads beyond the organisation quota are refused', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const library = await createLibraryFixture(sql, world);
      const { deps } = libraryDeps(sql);
      const manager = libraryClaims(world.users.manager);
      await sql`
        update public.library_files set size_bytes = 943714304
        where id = ${library.b.rootFileId}
      `;

      expect(
        await requestUploads(
          manager,
          { folderId: library.a.rootId, files: [{ path: 'video.mp4', sizeBytes: 2048 }] },
          deps,
        ),
      ).toEqual({ ok: false, rule: 'storage_full' });
      expect(
        await requestUploads(
          manager,
          { folderId: library.a.rootId, files: [{ path: 'enorme.mp4', sizeBytes: 52_428_801 }] },
          deps,
        ),
      ).toEqual({ ok: false, rule: 'invalid_input' });
    });
  });

  it('a confirmed upload must match its declared size', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const library = await createLibraryFixture(sql, world);
      const { deps, storage } = libraryDeps(sql);
      const manager = libraryClaims(world.users.manager);
      const requested = await requestUploads(
        manager,
        { folderId: library.a.rootId, files: [{ path: 'leve.png', sizeBytes: 1 }] },
        deps,
      );
      if (!requested.ok || !requested.uploads[0]) throw new Error('Upload was not requested');
      const { fileId, uploadUrl } = requested.uploads[0];
      const path = storagePathOf(uploadUrl);
      storage.files.set(path, PNG_BYTES);

      expect(await confirmUpload(manager, { fileId }, deps)).toEqual({
        ok: false,
        rule: 'invalid_file',
      });
      expect((await file(sql, fileId))?.status).toBe('rejected');
      expect(storage.removed).toEqual([path]);
    });
  });

  it('uploads still waiting count against the quota', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const library = await createLibraryFixture(sql, world);
      const { deps } = libraryDeps(sql);
      const manager = libraryClaims(world.users.manager);
      await sql`
        update public.library_files set size_bytes = 943709256
        where id = ${library.b.rootFileId}
      `;
      const upload = () =>
        requestUploads(
          manager,
          { folderId: library.a.rootId, files: [{ path: 'capa.png', sizeBytes: 2048 }] },
          deps,
        );

      expect((await upload()).ok).toBe(true);
      expect(await upload()).toEqual({ ok: false, rule: 'storage_full' });
    });
  });

  it('stale uploads are removed with their stored objects', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const library = await createLibraryFixture(sql, world);
      const { deps, storage } = libraryDeps(sql);
      const requested = await requestUploads(
        libraryClaims(world.users.manager),
        { folderId: library.a.rootId, files: [{ path: 'recente.png', sizeBytes: 16 }] },
        deps,
      );
      if (!requested.ok || !requested.uploads[0]) throw new Error('Upload was not requested');
      const recentId = requested.uploads[0].fileId;
      await sql`
        update public.library_files set created_at = ${LIBRARY_TEST_NOW.toISOString()}::timestamptz - interval '4 hours'
        where id = ${library.a.uploadingFileId}
      `;
      await sql`
        update public.library_files set created_at = ${LIBRARY_TEST_NOW.toISOString()}::timestamptz - interval '1 hour'
        where id = ${recentId}
      `;

      expect(await sweepStaleUploads(deps)).toEqual({ removed: 1 });
      expect((await file(sql, library.a.uploadingFileId))?.status).toBe('rejected');
      expect((await file(sql, recentId))?.status).toBe('uploading');
      expect(storage.removed).toEqual([
        `${world.organizationId}/${world.clients.a}/${library.a.projectId}/${library.a.uploadingFileId}`,
      ]);
    });
  });

  it('operational users upload under visible roots and delete only their own files', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const library = await createLibraryFixture(sql, world);
      const { deps } = libraryDeps(sql);
      const operational = libraryClaims(world.users.operationalA, 'client');

      const requested = await requestUploads(
        operational,
        { folderId: library.a.subfolderId, files: [{ path: 'Fotos/equipa.png', sizeBytes: 16 }] },
        deps,
      );
      if (!requested.ok || !requested.uploads[0]) throw new Error('Upload was not requested');
      expect(
        await requestUploads(
          operational,
          { folderId: library.a.internalId, files: [{ path: 'x.png', sizeBytes: 16 }] },
          deps,
        ),
      ).toEqual({ ok: false, rule: 'not_found' });
      expect(
        await requestUploads(
          libraryClaims(world.users.decisionMakerA, 'client'),
          { folderId: library.a.rootId, files: [{ path: 'x.png', sizeBytes: 16 }] },
          deps,
        ),
      ).toEqual({ ok: false, rule: 'not_found' });

      expect(await deleteFile(operational, { fileId: library.a.rootFileId }, deps)).toEqual({
        ok: false,
        rule: 'not_found',
      });
      expect(await deleteFile(operational, { fileId: requested.uploads[0].fileId }, deps)).toEqual({
        ok: true,
      });
      expect(
        await deleteFile(
          libraryClaims(world.users.founder),
          { fileId: library.a.rootFileId },
          deps,
        ),
      ).toEqual({ ok: true });
      expect(await file(sql, library.a.rootFileId)).toBeUndefined();
    });
  });

  it('file links are signed for readers only', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const library = await createLibraryFixture(sql, world);
      const { deps } = libraryDeps(sql);
      const decisionMaker = libraryClaims(world.users.decisionMakerA, 'client');

      expect(await libraryFileUrl(decisionMaker, library.a.subfolderFileId, deps)).toBe(
        `memory://file/${world.organizationId}/${world.clients.a}/${library.a.projectId}/${library.a.subfolderFileId}?ttl=900&download=logo.png`,
      );
      expect(await libraryFileUrl(decisionMaker, library.a.internalFileId, deps)).toBeNull();
      expect(await libraryFileUrl(decisionMaker, library.b.rootFileId, deps)).toBeNull();
      expect(
        await libraryFileUrl(libraryClaims(world.users.finance), library.a.internalFileId, deps),
      ).not.toBeNull();
      expect(
        await libraryFileUrl(libraryClaims(world.users.founder), library.a.uploadingFileId, deps),
      ).toBeNull();
    });
  });
});
