import { afterAll, describe, expect, it } from 'vitest';
import {
  closeTestSql,
  createFixtureWorld,
  createLibraryFixture,
  withTestTransaction,
} from '@agency-os/db/testing';
import { loadPortalAcademy, loadRoomAcademy } from './readers';
import { academyClaims, academyDeps, seedAcademyItem } from './testing';

afterAll(async () => {
  await closeTestSql();
});

const SLOW = 120_000;

describe('academy readers', () => {
  it(
    'room view lists items, progress and sessions',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        const library = await createLibraryFixture(sql, world);
        const checklist = await seedAcademyItem(sql, world, {
          clientId: world.clients.a,
          kind: 'checklist',
          title: 'Arranque',
          position: 1,
          published: true,
          steps: ['Entrar no CMS', 'Publicar um artigo'],
        });
        await seedAcademyItem(sql, world, {
          clientId: world.clients.a,
          kind: 'manual',
          title: 'Manual da marca',
          position: 2,
          libraryFileId: library.a.rootFileId,
        });
        await sql`
          insert into public.academy_step_checks (step_id, organization_id, client_id, checked_by)
          values (${checklist.stepIds[0] ?? ''}, ${world.organizationId}, ${world.clients.a},
                  ${world.users.decisionMakerA})
        `;
        const [session] = await sql<{ id: string }[]>`
          insert into public.training_sessions (organization_id, client_id, held_on, title)
          values (${world.organizationId}, ${world.clients.a}, '2026-10-14', 'Formação do CMS')
          returning id
        `;
        await sql`
          insert into public.training_session_participants (organization_id, session_id,
                                                            client_id, guest_name)
          values (${world.organizationId}, ${session?.id ?? ''}, ${world.clients.a}, 'Ana Costa')
        `;

        const view = await loadRoomAcademy(
          academyClaims(world.users.manager),
          world.clients.a,
          academyDeps(sql),
        );

        expect(view?.canWrite).toBe(true);
        expect(view?.items.map((item) => [item.title, item.status])).toEqual([
          ['Arranque', 'published'],
          ['Manual da marca', 'draft'],
        ]);
        expect(view?.items[0]?.progress).toEqual({ done: 1, total: 2 });
        expect(view?.items[0]?.steps[0]).toMatchObject({ text: 'Entrar no CMS', done: true });
        expect(view?.items[1]?.file?.id).toBe(library.a.rootFileId);
        expect(view?.sessions).toMatchObject([
          { title: 'Formação do CMS', heldOn: '2026-10-14', participants: [{ name: 'Ana Costa' }] },
        ]);
        expect(view?.files.map((file) => file.id)).toContain(library.a.rootFileId);
        expect(view?.files.map((file) => file.id)).not.toContain(library.a.internalFileId);
        expect(view?.files.map((file) => file.id)).not.toContain(library.a.uploadingFileId);
        expect(view?.people.map((person) => person.id)).toContain(world.users.decisionMakerA);

        expect(
          await loadRoomAcademy(
            academyClaims(world.users.manager),
            world.clients.b,
            academyDeps(sql),
          ),
        ).toBeNull();
      });
    },
    SLOW,
  );

  it(
    'portal shows only published items',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        await seedAcademyItem(sql, world, {
          clientId: world.clients.a,
          kind: 'tutorial',
          title: 'Como publicar',
          position: 1,
          published: true,
          url: 'https://youtu.be/abc',
        });
        await seedAcademyItem(sql, world, {
          clientId: world.clients.a,
          kind: 'checklist',
          title: 'Rascunho',
          position: 2,
          steps: ['Passo'],
        });

        const view = await loadPortalAcademy(
          academyClaims(world.users.decisionMakerA, 'client'),
          world.clients.a,
          academyDeps(sql),
        );

        expect(view?.canCheck).toBe(true);
        expect(view?.items).toMatchObject([
          { title: 'Como publicar', kind: 'tutorial', url: 'https://youtu.be/abc' },
        ]);
        expect(
          await loadPortalAcademy(
            academyClaims(world.users.manager),
            world.clients.a,
            academyDeps(sql),
          ),
        ).toBeNull();
      });
    },
    SLOW,
  );

  it(
    'portal sessions list only published materials',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        const published = await seedAcademyItem(sql, world, {
          clientId: world.clients.a,
          kind: 'checklist',
          title: 'Publicada',
          position: 1,
          published: true,
          steps: ['Passo'],
        });
        const draft = await seedAcademyItem(sql, world, {
          clientId: world.clients.a,
          kind: 'checklist',
          title: 'Rascunho',
          position: 2,
          steps: ['Passo'],
        });
        const [session] = await sql<{ id: string }[]>`
          insert into public.training_sessions (organization_id, client_id, held_on, title)
          values (${world.organizationId}, ${world.clients.a}, '2026-10-14', 'Formação')
          returning id
        `;
        for (const itemId of [published.itemId, draft.itemId]) {
          await sql`
            insert into public.training_session_materials (organization_id, session_id, client_id,
                                                           item_id)
            values (${world.organizationId}, ${session?.id ?? ''}, ${world.clients.a}, ${itemId})
          `;
        }

        const view = await loadPortalAcademy(
          academyClaims(world.users.decisionMakerA, 'client'),
          world.clients.a,
          academyDeps(sql),
        );

        expect(view?.sessions).toMatchObject([
          { title: 'Formação', materials: [{ id: published.itemId, title: 'Publicada' }] },
        ]);
      });
    },
    SLOW,
  );
});
