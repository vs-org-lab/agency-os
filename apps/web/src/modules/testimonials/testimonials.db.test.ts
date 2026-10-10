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
import { submitTestimonial, type TestimonialDeps } from './service';

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
        },
      });
      expect(await read(world.users.operationalA)).toBeNull();
    });
  });
});
