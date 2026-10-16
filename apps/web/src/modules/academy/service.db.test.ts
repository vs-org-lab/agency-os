import type { TransactionSql } from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import {
  closeTestSql,
  createFixtureWorld,
  createLibraryFixture,
  createRoomFixture,
  withTestTransaction,
} from '@agency-os/db/testing';
import { deleteAcademyItem, moveAcademyItem, saveAcademyItem, setAcademyItemStatus } from './items';
import { deleteTrainingSession, saveTrainingSession } from './sessions';
import { academyClaims, academyDeps } from './testing';

afterAll(async () => {
  await closeTestSql();
});

const SLOW = 120_000;
const NOT_FOUND = { ok: false, rule: 'not_found' };
const INVALID = { ok: false, rule: 'invalid_input' };

async function item(sql: TransactionSql, itemId: string) {
  await sql`reset role`;
  const [row] = await sql<
    { status: string; title: string; position: number; url: string | null }[]
  >`
    select status::text, title, position, url from public.academy_items where id = ${itemId}
  `;
  return row;
}

async function steps(sql: TransactionSql, itemId: string) {
  await sql`reset role`;
  return sql<{ id: string; text: string; position: number; done: boolean }[]>`
    select s.id, s.text, s.position, c.step_id is not null as done
    from public.academy_checklist_steps s
    left join public.academy_step_checks c on c.step_id = s.id
    where s.item_id = ${itemId} order by s.position
  `;
}

async function check(
  sql: TransactionSql,
  world: { organizationId: string; clients: { a: string }; users: { decisionMakerA: string } },
  stepId: string,
) {
  await sql`reset role`;
  await sql`
    insert into public.academy_step_checks (step_id, organization_id, client_id, checked_by)
    values (${stepId}, ${world.organizationId}, ${world.clients.a}, ${world.users.decisionMakerA})
  `;
}

describe('academy service', () => {
  it(
    'only room writers change the academy',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        await createRoomFixture(sql, world);
        const deps = academyDeps(sql);
        const checklist = { kind: 'checklist', title: 'Arranque', steps: ['Entrar'] };

        for (const claims of [
          academyClaims(world.users.freelancer),
          academyClaims(world.users.decisionMakerA, 'client'),
        ]) {
          expect(
            await saveAcademyItem(claims, { clientId: world.clients.a, ...checklist }, deps),
          ).toEqual(NOT_FOUND);
        }
        expect(
          await saveAcademyItem(
            academyClaims(world.users.manager),
            { clientId: world.clients.b, ...checklist },
            deps,
          ),
        ).toEqual(NOT_FOUND);
        const created = await saveAcademyItem(
          academyClaims(world.users.manager),
          { clientId: world.clients.a, ...checklist },
          deps,
        );
        if (!created.ok) throw new Error('The item was not created');
        expect(
          await setAcademyItemStatus(
            academyClaims(world.users.decisionMakerA, 'client'),
            { itemId: created.itemId, status: 'published' },
            deps,
          ),
        ).toEqual(NOT_FOUND);
        expect(
          await deleteAcademyItem(academyClaims(world.users.freelancer), created.itemId, deps),
        ).toEqual(NOT_FOUND);
      });
    },
    SLOW,
  );

  it(
    'only files the client already sees',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        const library = await createLibraryFixture(sql, world);
        const deps = academyDeps(sql);
        const manager = academyClaims(world.users.manager);
        const manual = (libraryFileId: string) =>
          saveAcademyItem(
            manager,
            {
              clientId: world.clients.a,
              kind: 'manual',
              title: 'Manual',
              source: { libraryFileId },
            },
            deps,
          );

        expect(await manual(library.a.internalFileId)).toEqual(INVALID);
        expect(await manual(library.a.uploadingFileId)).toEqual(INVALID);
        expect(await manual(library.b.rootFileId)).toEqual(INVALID);
        expect(await manual(library.a.subfolderFileId)).toMatchObject({ ok: true });
      });
    },
    SLOW,
  );

  it(
    'links must be https',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        await createRoomFixture(sql, world);
        const tutorial = (url: string) =>
          saveAcademyItem(
            academyClaims(world.users.manager),
            { clientId: world.clients.a, kind: 'tutorial', title: 'Vídeo', source: { url } },
            academyDeps(sql),
          );

        expect(await tutorial('javascript:alert(1)')).toEqual(INVALID);
        expect(await tutorial('http://youtu.be/abc')).toEqual(INVALID);
        const saved = await tutorial('https://youtu.be/abc');
        if (!saved.ok) throw new Error('The tutorial was not saved');
        expect((await item(sql, saved.itemId))?.url).toBe('https://youtu.be/abc');
      });
    },
    SLOW,
  );

  it(
    'withdrawing hides the item and keeps its checks',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        await createRoomFixture(sql, world);
        const deps = academyDeps(sql);
        const manager = academyClaims(world.users.manager);
        const created = await saveAcademyItem(
          manager,
          {
            clientId: world.clients.a,
            kind: 'checklist',
            title: 'Arranque',
            steps: ['Entrar', 'Publicar'],
          },
          deps,
        );
        if (!created.ok) throw new Error('The item was not created');

        expect(
          await setAcademyItemStatus(
            manager,
            { itemId: created.itemId, status: 'published' },
            deps,
          ),
        ).toEqual({ ok: true });
        const [first] = await steps(sql, created.itemId);
        await check(sql, world, first?.id ?? '');
        expect(
          await setAcademyItemStatus(manager, { itemId: created.itemId, status: 'draft' }, deps),
        ).toEqual({ ok: true });

        expect((await item(sql, created.itemId))?.status).toBe('draft');
        expect((await steps(sql, created.itemId)).map((step) => step.done)).toEqual([true, false]);
      });
    },
    SLOW,
  );

  it(
    'editing a checklist keeps the checks of unchanged steps',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        await createRoomFixture(sql, world);
        const deps = academyDeps(sql);
        const manager = academyClaims(world.users.manager);
        const created = await saveAcademyItem(
          manager,
          {
            clientId: world.clients.a,
            kind: 'checklist',
            title: 'Arranque',
            steps: ['Entrar', 'Publicar', 'Partilhar'],
          },
          deps,
        );
        if (!created.ok) throw new Error('The item was not created');
        const before = await steps(sql, created.itemId);
        await check(sql, world, before[0]?.id ?? '');
        await check(sql, world, before[1]?.id ?? '');

        expect(
          await saveAcademyItem(
            manager,
            {
              clientId: world.clients.a,
              itemId: created.itemId,
              kind: 'checklist',
              title: 'Arranque do CMS',
              steps: ['Entrar', 'Rever', 'Publicar'],
            },
            deps,
          ),
        ).toEqual({ ok: true, itemId: created.itemId });

        const after = await steps(sql, created.itemId);
        expect(after.map((step) => [step.text, step.done])).toEqual([
          ['Entrar', true],
          ['Rever', false],
          ['Publicar', true],
        ]);
        expect((await item(sql, created.itemId))?.title).toBe('Arranque do CMS');
      });
    },
    SLOW,
  );

  it(
    'items are added at the end and move up and down',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        await createRoomFixture(sql, world);
        const deps = academyDeps(sql);
        const manager = academyClaims(world.users.manager);
        const make = async (title: string) => {
          const saved = await saveAcademyItem(
            manager,
            { clientId: world.clients.a, kind: 'checklist', title, steps: ['Passo'] },
            deps,
          );
          if (!saved.ok) throw new Error('The item was not created');
          return saved.itemId;
        };
        const first = await make('Primeiro');
        const second = await make('Segundo');

        expect(await moveAcademyItem(manager, { itemId: second, direction: 'up' }, deps)).toEqual({
          ok: true,
        });
        expect((await item(sql, second))?.position).toBeLessThan(
          (await item(sql, first))?.position ?? 0,
        );
        expect(await moveAcademyItem(manager, { itemId: second, direction: 'up' }, deps)).toEqual({
          ok: true,
        });
        expect((await item(sql, second))?.position).toBeLessThan(
          (await item(sql, first))?.position ?? 0,
        );
      });
    },
    SLOW,
  );

  it(
    'deleting an item removes it from sessions',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        await createRoomFixture(sql, world);
        const deps = academyDeps(sql);
        const manager = academyClaims(world.users.manager);
        const created = await saveAcademyItem(
          manager,
          { clientId: world.clients.a, kind: 'checklist', title: 'Arranque', steps: ['Entrar'] },
          deps,
        );
        if (!created.ok) throw new Error('The item was not created');
        const session = await saveTrainingSession(
          manager,
          {
            clientId: world.clients.a,
            heldOn: '2026-10-14',
            title: 'Formação',
            materialIds: [created.itemId],
          },
          deps,
        );
        if (!session.ok) throw new Error('The session was not saved');

        expect(await deleteAcademyItem(manager, created.itemId, deps)).toEqual({ ok: true });
        await sql`reset role`;
        const materials = await sql`
          select item_id from public.training_session_materials where session_id = ${session.sessionId}
        `;
        expect(materials).toHaveLength(0);
      });
    },
    SLOW,
  );

  it(
    'sessions take participants and materials of the same client',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        await createRoomFixture(sql, world);
        const deps = academyDeps(sql);
        const manager = academyClaims(world.users.manager);
        const founder = academyClaims(world.users.founder);
        const theirs = await saveAcademyItem(
          founder,
          { clientId: world.clients.b, kind: 'checklist', title: 'Do outro', steps: ['Passo'] },
          deps,
        );
        if (!theirs.ok) throw new Error('The item was not created');
        const base = { clientId: world.clients.a, heldOn: '2026-10-14', title: 'Formação do CMS' };

        expect(
          await saveTrainingSession(manager, { ...base, materialIds: [theirs.itemId] }, deps),
        ).toEqual(INVALID);
        expect(
          await saveTrainingSession(
            manager,
            { ...base, participantIds: [world.users.clientFinanceB] },
            deps,
          ),
        ).toEqual(INVALID);
        const saved = await saveTrainingSession(
          manager,
          {
            ...base,
            durationMinutes: 60,
            participantIds: [world.users.decisionMakerA, world.users.manager],
            guests: ['Ana Costa'],
          },
          deps,
        );
        if (!saved.ok) throw new Error('The session was not saved');
        await sql`reset role`;
        const people = await sql<{ user_id: string | null; guest_name: string | null }[]>`
          select user_id::text, guest_name from public.training_session_participants
          where session_id = ${saved.sessionId} order by guest_name nulls first, user_id
        `;
        expect(people).toHaveLength(3);
        expect(people.at(-1)).toEqual({ user_id: null, guest_name: 'Ana Costa' });

        expect(
          await saveTrainingSession(
            manager,
            { ...base, sessionId: saved.sessionId, guests: [] },
            deps,
          ),
        ).toEqual({ ok: true, sessionId: saved.sessionId });
        const left = await sql`
          select 1 from public.training_session_participants where session_id = ${saved.sessionId}
        `;
        expect(left).toHaveLength(0);
        expect(
          await deleteTrainingSession(academyClaims(world.users.freelancer), saved.sessionId, deps),
        ).toEqual(NOT_FOUND);
        expect(await deleteTrainingSession(manager, saved.sessionId, deps)).toEqual({ ok: true });
      });
    },
    SLOW,
  );
});
