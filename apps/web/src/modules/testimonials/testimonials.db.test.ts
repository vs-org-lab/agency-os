import { randomUUID } from 'node:crypto';
import type { TransactionSql } from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import {
  closeTestSql,
  createDeliveryFixture,
  createFixtureWorld,
  testDatabase,
  withTestTransaction,
} from '@agency-os/db/testing';
import { createDbContexts, type VerifiedClaims } from '@/platform/db';
import { getClientTestimonial } from './portal';
import { createMemoryBucketStorage } from '@/platform/bucket-storage-memory';
import { MAX_TESTIMONIAL_VIDEO_BYTES } from './input';
import { submitTestimonial, type TestimonialDeps } from './service';
import {
  confirmTestimonialVideo,
  loadTeamTestimonial,
  startTestimonialVideo,
  type TestimonialVideoDeps,
} from './video';

afterAll(async () => {
  await closeTestSql();
});

function clientClaims(userId: string): VerifiedClaims {
  return {
    sub: userId,
    role: 'authenticated',
    aal: 'aal1',
    session_id: randomUUID(),
    amr: [{ method: 'otp', timestamp: Math.floor(Date.now() / 1000) }],
    user_kind: 'client',
  };
}

function testimonialDeps(sql: TransactionSql): TestimonialDeps {
  return { contexts: createDbContexts(testDatabase(sql)), flush: async () => {} };
}

const INPUT = {
  body: 'Trabalho excelente.',
  authorName: 'Marta Lopes',
  authorRole: 'Diretora',
  consentPublish: true,
};

describe('testimonials', () => {
  it('decision makers leave and replace a testimonial', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const delivery = await createDeliveryFixture(sql, world);
      const deps = testimonialDeps(sql);
      const decider = clientClaims(world.users.decisionMakerA);
      const submit = (claims: VerifiedClaims, input: Partial<typeof INPUT> = {}) =>
        submitTestimonial(claims, { projectId: delivery.projectId, ...INPUT, ...input }, deps);

      expect(await submit(decider)).toEqual({ ok: false, rule: 'not_found' });
      await sql`reset role`;
      await sql`update public.projects set status = 'delivered' where id = ${delivery.projectId}`;
      expect(await submit(decider)).toEqual({ ok: true });
      expect(await submit(decider, { body: 'Voltaria a trabalhar convosco.' })).toEqual({
        ok: true,
      });
      expect(await submit(clientClaims(world.users.operationalA))).toEqual({
        ok: false,
        rule: 'not_found',
      });
      expect(await submit(decider, { body: 'x'.repeat(1001) })).toEqual({
        ok: false,
        rule: 'invalid_input',
      });
      expect(await submit(decider, { authorName: ' ' })).toEqual({
        ok: false,
        rule: 'invalid_input',
      });

      await sql`reset role`;
      const rows = await sql<{ body: string; author_id: string; consent_publish: boolean }[]>`
        select body, author_id, consent_publish from public.testimonials
        where project_id = ${delivery.projectId}
      `;
      expect(rows).toEqual([
        {
          body: 'Voltaria a trabalhar convosco.',
          author_id: world.users.decisionMakerA,
          consent_publish: true,
        },
      ]);
      const [events] = await sql<{ total: number }[]>`
        select count(*)::int as total from public.domain_events
        where organization_id = ${world.organizationId} and type = 'testimonials.received'
      `;
      expect(events?.total).toBe(2);
    });
  });

  it('the portal reads the project and its testimonial for the decision maker only', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const delivery = await createDeliveryFixture(sql, world);
      const deps = testimonialDeps(sql);
      await sql`update public.projects set status = 'delivered' where id = ${delivery.projectId}`;
      await submitTestimonial(
        clientClaims(world.users.decisionMakerA),
        { projectId: delivery.projectId, ...INPUT },
        deps,
      );

      const read = (userId: string) =>
        deps.contexts.withUserContext(clientClaims(userId), (tx) =>
          getClientTestimonial(tx, delivery.projectId),
        );
      expect(await read(world.users.decisionMakerA)).toEqual({
        projectName: 'Website',
        testimonial: {
          body: INPUT.body,
          authorName: INPUT.authorName,
          authorRole: INPUT.authorRole,
          consentPublish: true,
          hasVideo: false,
        },
      });
      expect(await read(world.users.operationalA)).toBeNull();
    });
  });
});

function internalClaims(userId: string): VerifiedClaims {
  return {
    sub: userId,
    role: 'authenticated',
    aal: 'aal2',
    session_id: randomUUID(),
    amr: [{ method: 'totp', timestamp: Math.floor(Date.now() / 1000) }],
    user_kind: 'internal',
  };
}

const VIDEO_START = {
  authorName: 'Marta Lopes',
  authorRole: 'Diretora',
  consentPublish: false,
  consentRecording: true,
  contentType: 'video/webm;codecs=vp9,opus',
};
const CHAPTERS = [
  { index: 0, startedAtMs: 0 },
  { index: 1, startedAtMs: 42_000 },
];

function videoDeps(sql: TransactionSql) {
  const storage = createMemoryBucketStorage();
  const deps: TestimonialVideoDeps = { ...testimonialDeps(sql), storage };
  return { deps, storage };
}

describe('testimonial videos', () => {
  it('records a video without text, readable by the team with its chapters', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const delivery = await createDeliveryFixture(sql, world);
      await sql`update public.projects set status = 'delivered' where id = ${delivery.projectId}`;
      const { deps, storage } = videoDeps(sql);
      const decider = clientClaims(world.users.decisionMakerA);

      const started = await startTestimonialVideo(
        decider,
        { projectId: delivery.projectId, ...VIDEO_START },
        deps,
      );
      if (!started.ok) throw new Error(started.rule);
      expect(started.uploadUrl).toMatch(/\/[0-9a-f-]{36}\.webm$/);
      const path = started.uploadUrl.replace('memory://upload/', '');
      const confirm = () =>
        confirmTestimonialVideo(
          decider,
          { projectId: delivery.projectId, durationSeconds: 95, chapters: CHAPTERS },
          deps,
        );

      expect(await confirm()).toEqual({ ok: false, rule: 'upload_missing' });
      storage.put(path, new Uint8Array([1, 2, 3]));
      expect(await confirm()).toEqual({ ok: true });
      expect(await confirm()).toEqual({ ok: false, rule: 'not_found' });

      const read = (userId: string) =>
        loadTeamTestimonial(internalClaims(userId), delivery.projectId, deps);
      expect(await read(world.users.manager)).toMatchObject({
        authorName: 'Marta Lopes',
        body: '',
        video: { contentType: 'video/webm', durationSeconds: 95, chapters: CHAPTERS },
      });
      expect(await read(world.users.freelancer)).toBeNull();
      const portal = await deps.contexts.withUserContext(decider, (tx) =>
        getClientTestimonial(tx, delivery.projectId),
      );
      expect(portal?.testimonial?.hasVideo).toBe(true);

      await sql`reset role`;
      const [events] = await sql<{ total: number }[]>`
        select count(*)::int as total from public.domain_events
        where organization_id = ${world.organizationId} and type = 'testimonials.received'
      `;
      expect(events?.total).toBe(1);
    });
  });

  it('requires consent to record, a delivered project and the decision maker', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const delivery = await createDeliveryFixture(sql, world);
      const { deps } = videoDeps(sql);
      const start = (claims: VerifiedClaims, input: Partial<typeof VIDEO_START> = {}) =>
        startTestimonialVideo(
          claims,
          { projectId: delivery.projectId, ...VIDEO_START, ...input },
          deps,
        );
      const decider = clientClaims(world.users.decisionMakerA);

      expect(await start(decider)).toEqual({ ok: false, rule: 'not_found' });
      await sql`reset role`;
      await sql`update public.projects set status = 'delivered' where id = ${delivery.projectId}`;
      expect(await start(decider, { consentRecording: false })).toEqual({
        ok: false,
        rule: 'consent_required',
      });
      expect(await start(decider, { contentType: 'video/quicktime' })).toEqual({
        ok: false,
        rule: 'file_type',
      });
      expect(await start(decider, { authorName: ' ' })).toEqual({
        ok: false,
        rule: 'invalid_input',
      });
      expect(await start(clientClaims(world.users.operationalA))).toEqual({
        ok: false,
        rule: 'not_found',
      });
    });
  });

  it('removes an oversized recording and keeps the written testimonial', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const delivery = await createDeliveryFixture(sql, world);
      await sql`update public.projects set status = 'delivered' where id = ${delivery.projectId}`;
      const { deps, storage } = videoDeps(sql);
      const decider = clientClaims(world.users.decisionMakerA);
      await submitTestimonial(decider, { projectId: delivery.projectId, ...INPUT }, deps);

      const started = await startTestimonialVideo(
        decider,
        { projectId: delivery.projectId, ...VIDEO_START },
        deps,
      );
      if (!started.ok) throw new Error(started.rule);
      const path = started.uploadUrl.replace('memory://upload/', '');
      storage.put(path, new Uint8Array(MAX_TESTIMONIAL_VIDEO_BYTES + 1));

      expect(
        await confirmTestimonialVideo(
          decider,
          { projectId: delivery.projectId, durationSeconds: 60, chapters: [] },
          deps,
        ),
      ).toEqual({ ok: false, rule: 'too_large' });
      expect(storage.files.has(path)).toBe(false);

      await sql`reset role`;
      const rows = await sql<{ body: string; video_status: string | null }[]>`
        select body, video_status from public.testimonials where project_id = ${delivery.projectId}
      `;
      expect(rows).toEqual([{ body: INPUT.body, video_status: null }]);
    });
  });
});
