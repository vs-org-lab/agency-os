import type { TransactionSql } from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import {
  closeTestSql,
  createFixtureWorld,
  createRoomFixture,
  withTestTransaction,
} from '@agency-os/db/testing';
import { setStepCheck } from './checks';
import { academyClaims, academyDeps, seedAcademyItem } from './testing';

afterAll(async () => {
  await closeTestSql();
});

const SLOW = 120_000;
const NOT_FOUND = { ok: false, rule: 'not_found' };

async function checks(sql: TransactionSql, stepId: string) {
  await sql`reset role`;
  return sql<{ checked_by: string }[]>`
    select checked_by::text from public.academy_step_checks where step_id = ${stepId}
  `;
}

describe('academy step checks', () => {
  it(
    'only room members of the client check steps of published lists',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        await createRoomFixture(sql, world);
        const deps = academyDeps(sql);
        const published = await seedAcademyItem(sql, world, {
          clientId: world.clients.a,
          kind: 'checklist',
          title: 'Arranque',
          position: 1,
          published: true,
          steps: ['Entrar'],
        });
        const draft = await seedAcademyItem(sql, world, {
          clientId: world.clients.a,
          kind: 'checklist',
          title: 'Rascunho',
          position: 2,
          steps: ['Entrar'],
        });
        const theirs = await seedAcademyItem(sql, world, {
          clientId: world.clients.b,
          kind: 'checklist',
          title: 'Do outro',
          position: 1,
          published: true,
          steps: ['Entrar'],
        });
        const decisionMaker = academyClaims(world.users.decisionMakerA, 'client');
        const step = published.stepIds[0] ?? '';

        expect(
          await setStepCheck(decisionMaker, { stepId: draft.stepIds[0] ?? '', done: true }, deps),
        ).toEqual(NOT_FOUND);
        expect(
          await setStepCheck(decisionMaker, { stepId: theirs.stepIds[0] ?? '', done: true }, deps),
        ).toEqual(NOT_FOUND);
        expect(
          await setStepCheck(
            academyClaims(world.users.clientFinanceB, 'client'),
            { stepId: theirs.stepIds[0] ?? '', done: true },
            deps,
          ),
        ).toEqual(NOT_FOUND);
        expect(
          await setStepCheck(
            academyClaims(world.users.freelancer),
            { stepId: step, done: true },
            deps,
          ),
        ).toEqual(NOT_FOUND);
        expect(await setStepCheck(decisionMaker, { stepId: 'nope', done: true }, deps)).toEqual(
          NOT_FOUND,
        );

        expect(await setStepCheck(decisionMaker, { stepId: step, done: true }, deps)).toEqual({
          ok: true,
        });
        expect(await checks(sql, step)).toEqual([{ checked_by: world.users.decisionMakerA }]);
        expect(await setStepCheck(decisionMaker, { stepId: step, done: false }, deps)).toEqual({
          ok: true,
        });
        expect(await checks(sql, step)).toEqual([]);
      });
    },
    SLOW,
  );

  it(
    'the team checks steps too',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        await createRoomFixture(sql, world);
        const draft = await seedAcademyItem(sql, world, {
          clientId: world.clients.a,
          kind: 'checklist',
          title: 'Rascunho',
          position: 1,
          steps: ['Entrar'],
        });
        const step = draft.stepIds[0] ?? '';

        expect(
          await setStepCheck(
            academyClaims(world.users.manager),
            { stepId: step, done: true },
            academyDeps(sql),
          ),
        ).toEqual({ ok: true });
        expect(await checks(sql, step)).toEqual([{ checked_by: world.users.manager }]);
      });
    },
    SLOW,
  );

  it(
    'checking twice keeps one check',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        await createRoomFixture(sql, world);
        const deps = academyDeps(sql);
        const published = await seedAcademyItem(sql, world, {
          clientId: world.clients.a,
          kind: 'checklist',
          title: 'Arranque',
          position: 1,
          published: true,
          steps: ['Entrar'],
        });
        const step = published.stepIds[0] ?? '';

        await setStepCheck(
          academyClaims(world.users.decisionMakerA, 'client'),
          { stepId: step, done: true },
          deps,
        );
        await setStepCheck(academyClaims(world.users.manager), { stepId: step, done: true }, deps);

        expect(await checks(sql, step)).toEqual([{ checked_by: world.users.decisionMakerA }]);
      });
    },
    SLOW,
  );
});
