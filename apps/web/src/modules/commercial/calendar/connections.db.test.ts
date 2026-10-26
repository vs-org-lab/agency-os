import { randomUUID } from 'node:crypto';
import type { TransactionSql } from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import {
  asUser,
  closeTestSql,
  createFixtureWorld,
  testDatabase,
  withTestTransaction,
} from '@agency-os/db/testing';
import { createDbContexts, type VerifiedClaims } from '@/platform/db';
import {
  calendarConnectionStatus,
  disconnectGoogle,
  getHostCalendar,
  saveGoogleConnection,
} from './connections';

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

async function connectionRow(sql: TransactionSql, userId: string) {
  await sql`reset role`;
  const [row] = await sql<{ id: string; status: string; vault_secret_id: string | null }[]>`
    select id, status::text, vault_secret_id from public.calendar_connections where user_id = ${userId}
  `;
  return row;
}

describe('calendar connections', () => {
  it('stores the refresh token in the vault and never in the table', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const contexts = createDbContexts(testDatabase(sql));

      await saveGoogleConnection(
        claimsFor(world.users.founder),
        { refreshToken: 'refresh-token-value', email: 'founder@gmail.com' },
        { contexts },
      );

      const row = await connectionRow(sql, world.users.founder);
      expect(row?.status).toBe('active');
      const [stored] = await sql<{ row: string }[]>`
        select row_to_json(c)::text as row from public.calendar_connections c where c.id = ${row?.id ?? ''}
      `;
      expect(stored?.row).not.toContain('refresh-token-value');
      const [secret] = await sql<{ value: string }[]>`
        select app.read_calendar_secret(${row?.id ?? ''}::uuid) as value
      `;
      expect(secret?.value).toBe('refresh-token-value');
      const [settings] = await sql<{ host: string }[]>`
        select host_user_id as host from public.commercial_settings
        where organization_id = ${world.organizationId}
      `;
      expect(settings?.host).toBe(world.users.founder);
      expect(await calendarConnectionStatus(claimsFor(world.users.founder), { contexts })).toEqual({
        status: 'active',
        email: 'founder@gmail.com',
        connectedAt: expect.any(Date),
      });
    });
  });

  it('only the founder can connect a calendar', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const contexts = createDbContexts(testDatabase(sql));

      const result = await saveGoogleConnection(
        claimsFor(world.users.manager),
        { refreshToken: 'token', email: 'manager@gmail.com' },
        { contexts },
      );

      expect(result).toEqual({ ok: false });
      expect(await connectionRow(sql, world.users.manager)).toBeUndefined();
    });
  });

  it('authenticated users cannot execute the vault functions', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const contexts = createDbContexts(testDatabase(sql));
      await saveGoogleConnection(
        claimsFor(world.users.founder),
        { refreshToken: 'token', email: 'founder@gmail.com' },
        { contexts },
      );
      const row = await connectionRow(sql, world.users.founder);
      await asUser(sql, world.users.founder);

      await expect(sql`select app.read_calendar_secret(${row?.id ?? ''}::uuid)`).rejects.toThrow(
        /permission denied/,
      );
    });
  });

  it('disconnect deletes the secret and marks the connection revoked', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const contexts = createDbContexts(testDatabase(sql));
      const revoked: string[] = [];
      await saveGoogleConnection(
        claimsFor(world.users.founder),
        { refreshToken: 'token-to-revoke', email: 'founder@gmail.com' },
        { contexts },
      );

      await disconnectGoogle(claimsFor(world.users.founder), {
        contexts,
        revoke: async (token) => {
          revoked.push(token);
        },
      });

      const row = await connectionRow(sql, world.users.founder);
      expect(row).toMatchObject({ status: 'revoked', vault_secret_id: null });
      expect(revoked).toEqual(['token-to-revoke']);
    });
  });

  it('invalid_grant marks the connection revoked', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const contexts = createDbContexts(testDatabase(sql));
      await saveGoogleConnection(
        claimsFor(world.users.founder),
        { refreshToken: 'revoked-token', email: 'founder@gmail.com' },
        { contexts },
      );
      const invalidGrant = (async () =>
        new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 })) as typeof fetch;

      const host = await getHostCalendar(world.organizationId, {
        contexts,
        provider: 'google',
        clientId: 'id',
        clientSecret: 'secret',
        fetch: invalidGrant,
      });
      await expect(
        host?.port.freeBusy({ start: new Date(), end: new Date(Date.now() + 3_600_000) }),
      ).rejects.toMatchObject({ reason: 'revoked' });

      expect((await connectionRow(sql, world.users.founder))?.status).toBe('revoked');
      const [event] = await sql<{ type: string }[]>`
        select type from public.domain_events
        where organization_id = ${world.organizationId} and type = 'commercial.calendar.unavailable'
      `;
      expect(event).toBeDefined();
    });
  });

  it('returns a fake calendar for the host when the provider is fake', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const contexts = createDbContexts(testDatabase(sql));

      const host = await getHostCalendar(world.organizationId, {
        contexts,
        provider: 'fake',
        clientId: '',
        clientSecret: '',
      });

      expect(host?.hostUserId).toBe(world.users.founder);
      await expect(
        host?.port.freeBusy({ start: new Date(), end: new Date(Date.now() + 3_600_000) }),
      ).resolves.toEqual([]);
    });
  });
});
