import type { TransactionSql } from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import {
  closeTestSql,
  createCoreFixture,
  createFixtureWorld,
  createRoomFixture,
  testDatabase,
  withTestTransaction,
} from '@agency-os/db/testing';
import { randomUUID } from 'node:crypto';
import { createDbContexts, type VerifiedClaims } from '@/platform/db';

function libraryClaims(
  userId: string,
  userKind: 'internal' | 'client' = 'internal',
): VerifiedClaims {
  return {
    sub: userId,
    role: 'authenticated',
    aal: userKind === 'internal' ? 'aal2' : 'aal1',
    session_id: randomUUID(),
    amr: [
      {
        method: userKind === 'internal' ? 'totp' : 'otp',
        timestamp: Math.floor(Date.now() / 1000),
      },
    ],
    user_kind: userKind,
  };
}
import {
  loadClientOnboarding,
  onboardingUploadFolder,
  reopenOnboarding,
  respondToOnboarding,
} from './service';

afterAll(async () => {
  await closeTestSql();
});

const GUIDE = {
  blocks: [1, 2, 3, 4].map((index) => ({
    id: `block_${index}`,
    title: { 'pt-PT': `Bloco ${index}`, en: `Block ${index}` },
    minutes: 15,
    goal: { 'pt-PT': 'Objetivo', en: 'Goal' },
    questions: [
      {
        id: `block_${index}_q1`,
        text: { 'pt-PT': 'Pergunta', en: 'Question' },
        ...(index === 1 ? { answer: { kind: 'yes_no' } } : {}),
      },
    ],
  })),
  onboarding: [
    {
      id: 'brand_files',
      kind: 'upload',
      title: { 'pt-PT': 'Envie a marca', en: 'Send the brand' },
      body: { 'pt-PT': 'Ficheiros', en: 'Files' },
      when: { type: 'answer', questionId: 'block_1_q1', equals: 'yes' },
    },
    {
      id: 'references',
      kind: 'text',
      title: { 'pt-PT': 'Referências', en: 'References' },
      body: { 'pt-PT': 'Partilhe', en: 'Share' },
      when: { type: 'always' },
    },
  ],
};

async function onboardingWorld(sql: TransactionSql) {
  const world = await createFixtureWorld(sql);
  const core = await createCoreFixture(sql, world);
  const rooms = await createRoomFixture(sql, world);
  // The onboarding follows the active template, even for a Core that started on an older one.
  await sql`
    update public.core_templates set is_active = false
    where organization_id = ${world.organizationId} and kind = 'briefing'
  `;
  await sql`
    insert into public.core_templates (organization_id, kind, version, definition, is_active)
    values (${world.organizationId}, 'briefing', 2, ${JSON.stringify(GUIDE)}::jsonb, true)
  `;
  const answer = (value: string) => sql`
    insert into public.core_briefing_notes
      (organization_id, client_id, engagement_id, block_id, question_id, body, answer)
    values (${world.organizationId}, ${world.clients.a}, ${core.a.engagementId}, 'block_1',
            'block_1_q1', '', ${value})
    on conflict (engagement_id, block_id, question_id) do update set answer = excluded.answer
  `;
  return { world, core, rooms, answer };
}

const ids = (view: Awaited<ReturnType<typeof loadClientOnboarding>>) =>
  view?.items.map((item) => `${item.request.id}:${item.done ? 'done' : 'open'}`) ?? null;

describe('client onboarding', () => {
  it('follows the briefing answers and is read by the client members and the room team', async () => {
    await withTestTransaction(async (sql) => {
      const { world, answer } = await onboardingWorld(sql);
      const deps = { contexts: createDbContexts(testDatabase(sql)) };
      const decisionMaker = libraryClaims(world.users.decisionMakerA, 'client');

      expect(ids(await loadClientOnboarding(decisionMaker, world.clients.a, deps))).toEqual([
        'references:open',
      ]);
      await answer('yes');
      expect(ids(await loadClientOnboarding(decisionMaker, world.clients.a, deps))).toEqual([
        'brand_files:open',
        'references:open',
      ]);
      expect(
        ids(await loadClientOnboarding(libraryClaims(world.users.manager), world.clients.a, deps)),
      ).toEqual(['brand_files:open', 'references:open']);

      for (const claims of [
        libraryClaims(world.users.clientFinanceB, 'client'),
        libraryClaims(world.users.manager),
      ]) {
        expect(await loadClientOnboarding(claims, world.clients.b, deps)).toBeNull();
      }
    });
  });

  it('client members answer, a written request needs words, and the team asks again', async () => {
    await withTestTransaction(async (sql) => {
      const { world } = await onboardingWorld(sql);
      const deps = { contexts: createDbContexts(testDatabase(sql)) };
      const operational = libraryClaims(world.users.operationalA, 'client');
      const input = { clientId: world.clients.a, requestId: 'references' };

      expect(await respondToOnboarding(operational, { ...input, response: '  ' }, deps)).toEqual({
        ok: false,
        rule: 'response_required',
      });
      expect(
        await respondToOnboarding(
          operational,
          { ...input, requestId: 'brand_files', response: '' },
          deps,
        ),
      ).toEqual({ ok: false, rule: 'not_found' });
      expect(
        await respondToOnboarding(
          libraryClaims(world.users.manager),
          { ...input, response: 'x' },
          deps,
        ),
      ).toEqual({ ok: false, rule: 'not_found' });
      expect(
        await respondToOnboarding(
          {
            ...libraryClaims(world.users.founder),
            user_kind: 'client',
            preview_client: world.clients.a,
          },
          { ...input, response: 'x' },
          deps,
        ),
      ).toEqual({ ok: false, rule: 'not_found' });

      expect(
        await respondToOnboarding(
          operational,
          { ...input, response: 'apple.com, aesop.com' },
          deps,
        ),
      ).toEqual({ ok: true });
      const view = await loadClientOnboarding(operational, world.clients.a, deps);
      expect(view?.items[0]).toMatchObject({ done: true, response: 'apple.com, aesop.com' });

      expect(
        await reopenOnboarding(libraryClaims(world.users.decisionMakerA, 'client'), input, deps),
      ).toEqual({ ok: false, rule: 'not_found' });
      expect(await reopenOnboarding(libraryClaims(world.users.manager), input, deps)).toEqual({
        ok: true,
      });
      expect(ids(await loadClientOnboarding(operational, world.clients.a, deps))).toEqual([
        'references:open',
      ]);
    });
  });

  it('upload requests get one client-visible folder, created the first time', async () => {
    await withTestTransaction(async (sql) => {
      const { world, rooms, answer } = await onboardingWorld(sql);
      await answer('yes');
      const deps = { contexts: createDbContexts(testDatabase(sql)) };
      const decisionMaker = libraryClaims(world.users.decisionMakerA, 'client');
      const input = { clientId: world.clients.a, requestId: 'brand_files' };

      expect(
        await onboardingUploadFolder(decisionMaker, { ...input, requestId: 'references' }, deps),
      ).toBeNull();
      expect(
        await onboardingUploadFolder(libraryClaims(world.users.manager), input, deps),
      ).toBeNull();
      const folderId = await onboardingUploadFolder(decisionMaker, input, deps);
      expect(await onboardingUploadFolder(decisionMaker, input, deps)).toBe(folderId);
      const [folder] = await sql<
        { project_id: string; visibility: string; client_uploads: boolean; name: string }[]
      >`
        select project_id, visibility::text, client_uploads, name from public.library_folders
        where id = ${folderId ?? ''}
      `;
      expect(folder).toEqual({
        project_id: rooms.a.projectId,
        visibility: 'client',
        client_uploads: true,
        name: 'Enviado pelo cliente',
      });
    });
  });
});
