import { randomUUID } from 'node:crypto';
import type { TransactionSql } from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import {
  closeTestSql,
  createFixtureWorld,
  testDatabase,
  withTestTransaction,
} from '@agency-os/db/testing';
import type { EmailPort, OutgoingEmail } from '@/modules/email';
import type { InvitationDeps } from '@/modules/identity';
import { createDbContexts, type VerifiedClaims } from '@/platform/db';
import {
  changeColleagueRole,
  inviteColleague,
  listColleagues,
  revokeColleague,
} from './colleagues';

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

function depsFor(sql: TransactionSql): InvitationDeps & { email: { sent: OutgoingEmail[] } } {
  const sent: OutgoingEmail[] = [];
  const email: EmailPort & { sent: OutgoingEmail[] } = {
    sent,
    async send(message) {
      sent.push(message);
    },
  };
  return {
    contexts: createDbContexts(testDatabase(sql)),
    email,
    links: {
      async createInvitationLink(address) {
        await sql`reset role`;
        const id = randomUUID();
        await sql`
          insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
          values (${id}, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
                  ${address}, now(), now())
        `;
        return { userId: id, link: `https://app.example/accept-invitation?token_hash=${id}` };
      },
    },
  };
}

async function membershipOf(sql: TransactionSql, userId: string, clientId: string) {
  const [row] = await sql<{ id: string; role: string; status: string }[]>`
    select id, role::text, status::text from public.client_memberships
    where user_id = ${userId} and client_id = ${clientId}
  `;
  if (!row) throw new Error('Membership not found');
  return row;
}

describe('portal colleagues', () => {
  it('decision maker invites an operational colleague', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const deps = depsFor(sql);
      const claims = clientClaims(world.users.decisionMakerA);

      const invited = await inviteColleague(
        claims,
        {
          clientId: world.clients.a,
          email: 'colleague@client-a.example',
          fullName: 'Colleague',
          role: 'operational',
        },
        deps,
      );

      expect(invited).toEqual({ ok: true });
      expect(deps.email.sent.map((message) => message.template)).toEqual(['client.invitation']);
      const colleagues = await listColleagues(claims, world.clients.a, deps);
      expect(
        colleagues?.find((colleague) => colleague.email === 'colleague@client-a.example'),
      ).toMatchObject({ role: 'operational', status: 'invited', isSelf: false });
      expect(colleagues?.find((colleague) => colleague.isSelf)?.role).toBe('decision_maker');
    });
  });

  it('operational members cannot manage colleagues', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const deps = depsFor(sql);
      const operational = clientClaims(world.users.operationalA);
      const decisionMaker = await membershipOf(sql, world.users.decisionMakerA, world.clients.a);

      expect(await listColleagues(operational, world.clients.a, deps)).toBeNull();
      expect(await revokeColleague(operational, { membershipId: decisionMaker.id }, deps)).toEqual({
        ok: false,
        rule: 'not_found',
      });
      expect(
        await inviteColleague(
          operational,
          {
            clientId: world.clients.a,
            email: 'x@client-a.example',
            fullName: 'X',
            role: 'operational',
          },
          deps,
        ),
      ).toEqual({ ok: false, rule: 'not_found' });
    });
  });

  it('the last decision maker stays', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const deps = depsFor(sql);
      const claims = clientClaims(world.users.decisionMakerA);
      const self = await membershipOf(sql, world.users.decisionMakerA, world.clients.a);
      const operational = await membershipOf(sql, world.users.operationalA, world.clients.a);

      expect(await revokeColleague(claims, { membershipId: self.id }, deps)).toEqual({
        ok: false,
        rule: 'invalid_input',
      });
      expect(
        await changeColleagueRole(claims, { membershipId: self.id, role: 'operational' }, deps),
      ).toEqual({ ok: false, rule: 'invalid_input' });
      expect(
        await changeColleagueRole(
          claims,
          { membershipId: operational.id, role: 'client_finance' },
          deps,
        ),
      ).toEqual({ ok: true });
      expect(await revokeColleague(claims, { membershipId: operational.id }, deps)).toEqual({
        ok: true,
      });
      expect((await membershipOf(sql, world.users.operationalA, world.clients.a)).status).toBe(
        'revoked',
      );
    });
  });

  it('colleagues of other clients are not found', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const deps = depsFor(sql);
      const claims = clientClaims(world.users.decisionMakerA);
      const other = await membershipOf(sql, world.users.clientFinanceB, world.clients.b);

      expect(await listColleagues(claims, world.clients.b, deps)).toBeNull();
      expect(
        await changeColleagueRole(claims, { membershipId: other.id, role: 'operational' }, deps),
      ).toEqual({ ok: false, rule: 'not_found' });
    });
  });
});
