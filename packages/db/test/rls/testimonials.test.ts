import type { TransactionSql } from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import {
  asUser,
  closeTestSql,
  createDeliveryFixture,
  createFixtureWorld,
  withTestTransaction,
} from '../../src/testing';

afterAll(async () => {
  await closeTestSql();
});

type World = Awaited<ReturnType<typeof createFixtureWorld>>;

async function visibleIds(sql: TransactionSql, relation: string): Promise<string[]> {
  const rows = await sql<{ id: string }[]>`select id from ${sql('public.' + relation)}`.catch(
    (error: Error) => {
      if (/permission denied/.test(error.message)) return [];
      throw error;
    },
  );
  return rows.map((row) => row.id).sort();
}

async function seedTestimonial(sql: TransactionSql): Promise<{ id: string; world: World }> {
  const world = await createFixtureWorld(sql);
  const delivery = await createDeliveryFixture(sql, world);
  const [row] = await sql<{ id: string }[]>`
    insert into public.testimonials (organization_id, client_id, project_id, author_id, body,
                                     author_name, author_role, consent_publish)
    values (${world.organizationId}, ${world.clients.a}, ${delivery.projectId},
            ${world.users.decisionMakerA}, 'Trabalho excelente.', 'Marta Lopes', 'Diretora', true)
    returning id
  `;
  if (!row) throw new Error('Testimonial was not created');
  return { id: row.id, world };
}

describe('testimonials access', () => {
  it('team reads testimonials of readable projects only', async () => {
    await withTestTransaction(async (sql) => {
      const { id, world } = await seedTestimonial(sql);

      await asUser(sql, world.users.manager);
      expect(await visibleIds(sql, 'testimonials')).toEqual([id]);
      await asUser(sql, world.users.freelancer);
      expect(await visibleIds(sql, 'testimonials')).toEqual([]);
    });
  });

  it('decision makers read their own testimonial only', async () => {
    await withTestTransaction(async (sql) => {
      const { id, world } = await seedTestimonial(sql);

      await asUser(sql, world.users.decisionMakerA, { aal: 'aal1' });
      expect(await visibleIds(sql, 'portal_testimonials')).toEqual([id]);
      expect(await visibleIds(sql, 'testimonials')).toEqual([]);
      for (const userId of [world.users.operationalA, world.users.clientFinanceB]) {
        await asUser(sql, userId, { aal: 'aal1' });
        expect(await visibleIds(sql, 'portal_testimonials')).toEqual([]);
      }
    });
  });

  it('nobody writes testimonials directly', async () => {
    await withTestTransaction(async (sql) => {
      const { world } = await seedTestimonial(sql);

      for (const [userId, aal] of [
        [world.users.founder, 'aal2'],
        [world.users.decisionMakerA, 'aal1'],
      ] as const) {
        await asUser(sql, userId, { aal });
        for (const statement of [
          sql`update public.testimonials set body = 'Alterado'`,
          sql`delete from public.testimonials`,
        ]) {
          await sql`savepoint probe`;
          expect(await statement.catch((error: Error) => error)).toBeInstanceOf(Error);
          await sql`rollback to savepoint probe`;
        }
      }
    });
  });
});
