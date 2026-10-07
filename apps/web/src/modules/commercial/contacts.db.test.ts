import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import {
  closeTestSql,
  createCommercialFixture,
  createFixtureWorld,
  testDatabase,
  withTestTransaction,
} from '@agency-os/db/testing';
import { createDbContexts, type VerifiedClaims } from '@/platform/db';
import { completeFollowUp, upsertContact } from './contacts';

afterAll(async () => {
  await closeTestSql();
});

function claimsFor(userId: string): VerifiedClaims {
  return {
    sub: userId,
    role: 'authenticated',
    aal: 'aal2',
    session_id: randomUUID(),
    amr: [{ method: 'totp', timestamp: Math.floor(Date.now() / 1000) }],
  };
}

describe('contacts', () => {
  it('founder adds and edits contacts', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const contexts = createDbContexts(testDatabase(sql));
      const claims = claimsFor(world.users.founder);

      const created = await upsertContact(
        claims,
        {
          clientId: world.clients.a,
          contactId: null,
          fullName: 'Rui Lopes',
          email: 'Rui@Empresa.pt',
          phone: null,
          jobTitle: 'Diretor financeiro',
          role: 'client_finance',
        },
        { contexts },
      );
      expect(created).toMatchObject({ ok: true });
      if (!created.ok) return;

      const updated = await upsertContact(
        claims,
        {
          clientId: world.clients.a,
          contactId: created.contactId,
          fullName: 'Rui Lopes',
          email: 'rui@empresa.pt',
          phone: '+351 210 000 000',
          jobTitle: 'CFO',
          role: 'client_finance',
        },
        { contexts },
      );
      expect(updated).toEqual({ ok: true, contactId: created.contactId });
      await sql`reset role`;
      const [row] = await sql<{ email: string; phone: string; title: string }[]>`
        select email, phone, job_title as title from public.contacts where id = ${created.contactId}
      `;
      expect(row).toEqual({ email: 'rui@empresa.pt', phone: '+351 210 000 000', title: 'CFO' });
    });
  });

  it('rejects a duplicate email for the same client', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const contexts = createDbContexts(testDatabase(sql));
      const claims = claimsFor(world.users.founder);
      const input = {
        clientId: world.clients.a,
        contactId: null,
        fullName: 'Rui Lopes',
        email: 'rui@empresa.pt',
        phone: null,
        jobTitle: null,
        role: 'operational' as const,
      };

      await upsertContact(claims, input, { contexts });
      expect(await upsertContact(claims, input, { contexts })).toEqual({
        ok: false,
        rule: 'duplicate_email',
      });
    });
  });

  it('completes a follow up and records it on the timeline', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      await createCommercialFixture(sql, world);
      const contexts = createDbContexts(testDatabase(sql));
      const [followUp] = await sql<{ id: string }[]>`
        select id from public.follow_ups where client_id = ${world.clients.a}
      `;

      const result = await completeFollowUp(
        claimsFor(world.users.founder),
        { followUpId: followUp?.id ?? '', status: 'done' },
        { contexts },
      );

      expect(result).toEqual({ ok: true });
      await sql`reset role`;
      const [row] = await sql<{ status: string; completed: boolean }[]>`
        select status::text, completed_at is not null as completed from public.follow_ups where id = ${followUp?.id ?? ''}
      `;
      expect(row).toEqual({ status: 'done', completed: true });
    });
  });
});
