import { afterAll, describe, expect, it } from 'vitest';
import {
  closeTestSql,
  createFixtureWorld,
  createLibraryFixture,
  withTestTransaction,
} from '@agency-os/db/testing';
import { saveAcademyItem } from './items';
import { loadPortalAcademy, loadRoomAcademy } from './readers';
import { academyClaims, academyDeps, seedAcademyItem } from './testing';

afterAll(async () => {
  await closeTestSql();
});

const SLOW = 120_000;

describe('academy materials', () => {
  it(
    'tutorials take only library videos',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        const library = await createLibraryFixture(sql, world);
        const deps = academyDeps(sql);
        const tutorial = () =>
          saveAcademyItem(
            academyClaims(world.users.manager),
            {
              clientId: world.clients.a,
              kind: 'tutorial',
              title: 'Como publicar',
              source: { libraryFileId: library.a.rootFileId },
            },
            deps,
          );

        expect(await tutorial()).toEqual({ ok: false, rule: 'invalid_input' });
        await sql`
          update public.library_files set kind = 'video', mime_type = 'video/mp4'
          where id = ${library.a.rootFileId}
        `;
        expect(await tutorial()).toMatchObject({ ok: true });
        const view = await loadRoomAcademy(
          academyClaims(world.users.manager),
          world.clients.a,
          deps,
        );
        expect(view?.files.find((file) => file.id === library.a.rootFileId)?.kind).toBe('video');
      });
    },
    SLOW,
  );

  it(
    'files of cancelled projects are not eligible',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        const library = await createLibraryFixture(sql, world);
        await sql`update public.projects set status = 'cancelled' where id = ${library.a.projectId}`;

        const view = await loadRoomAcademy(
          academyClaims(world.users.manager),
          world.clients.a,
          academyDeps(sql),
        );
        expect(view?.files.map((file) => file.id)).not.toContain(library.a.rootFileId);
      });
    },
    SLOW,
  );

  it(
    'the portal hides a material the client can no longer open',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        const library = await createLibraryFixture(sql, world);
        await seedAcademyItem(sql, world, {
          clientId: world.clients.a,
          kind: 'manual',
          title: 'Manual da marca',
          position: 1,
          published: true,
          libraryFileId: library.a.rootFileId,
        });
        const portal = () =>
          loadPortalAcademy(
            academyClaims(world.users.decisionMakerA, 'client'),
            world.clients.a,
            academyDeps(sql),
          );

        expect((await portal())?.items[0]?.file?.id).toBe(library.a.rootFileId);
        await sql`reset role`;
        await sql`
          update public.library_folders set visibility = 'internal' where id = ${library.a.rootId}
        `;
        expect((await portal())?.items[0]?.file).toBeNull();
      });
    },
    SLOW,
  );
});
