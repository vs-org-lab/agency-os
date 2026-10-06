import { randomUUID } from 'node:crypto';
import type { TransactionSql } from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import {
  closeTestSql,
  createAuthUser,
  createFixtureWorld,
  testDatabase,
  withTestTransaction,
} from '@agency-os/db/testing';
import { resolveActor } from '@/modules/access';
import { createDbContexts, type DbContexts, type VerifiedClaims } from '@/platform/db';
import {
  acceptInvitation,
  bootstrapFounder,
  inviteClientUser,
  inviteTeamMember,
  type AdminPort,
  type InvitationDeps,
  type Session,
} from './invitations';

afterAll(async () => {
  await closeTestSql();
});

function claimsFor(userId: string, aal: 'aal1' | 'aal2' = 'aal2'): VerifiedClaims {
  const now = Math.floor(Date.now() / 1000);
  return {
    sub: userId,
    role: 'authenticated',
    aal,
    session_id: randomUUID(),
    amr:
      aal === 'aal2'
        ? [{ method: 'totp', timestamp: now }]
        : [{ method: 'password', timestamp: now }],
  };
}

function fakeAdmin(sql: TransactionSql): AdminPort & { invited: string[] } {
  const invited: string[] = [];
  return {
    invited,
    async inviteUserByEmail(email) {
      invited.push(email);
      await sql`reset role`;
      const [existing] = await sql<
        { id: string }[]
      >`select id from auth.users where lower(email) = ${email}`;
      if (existing) return { userId: existing.id };
      const id = randomUUID();
      await sql`
        insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
        values (${id}, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', ${email}, now(), now())
      `;
      return { userId: id };
    },
  };
}

async function sessionFor(contexts: DbContexts, userId: string): Promise<Session> {
  const claims = claimsFor(userId);
  const actor = await contexts.withUserContext(claims, (tx) => resolveActor(tx, claims));
  if (!actor) throw new Error('Actor not resolved');
  return { claims, actor };
}

function depsFor(sql: TransactionSql): InvitationDeps & { admin: ReturnType<typeof fakeAdmin> } {
  return {
    contexts: createDbContexts(testDatabase(sql)),
    admin: fakeAdmin(sql),
    invitationRedirectUrl: 'https://app.example/accept-invitation',
  };
}

describe('invitations', () => {
  it('only founder invites team members', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const deps = depsFor(sql);
      const manager = await sessionFor(deps.contexts, world.users.manager);

      expect(
        await inviteTeamMember(
          manager,
          { email: 'new@agency.example', role: 'freelancer', fullName: 'New Person' },
          deps,
        ),
      ).toEqual({ error: 'forbidden' });
      expect(deps.admin.invited).toEqual([]);
    });
  });

  it('invite creates invited membership, emits identity.user.invited and audits invitation.created', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const deps = depsFor(sql);
      const founder = await sessionFor(deps.contexts, world.users.founder);

      const result = await inviteTeamMember(
        founder,
        { email: ' New@Agency.Example ', role: 'freelancer', fullName: 'New Person' },
        deps,
      );
      await sql`reset role`;

      if (!('membershipId' in result)) throw new Error('Invitation failed');
      const [membership] = await sql<
        { role: string; status: string; kind: string; full_name: string }[]
      >`
        select m.role, m.status, p.kind, p.full_name
        from public.organization_memberships m join public.profiles p on p.id = m.user_id
        where m.id = ${result.membershipId}
      `;
      expect(membership).toEqual({
        role: 'freelancer',
        status: 'invited',
        kind: 'internal',
        full_name: 'New Person',
      });
      expect(deps.admin.invited).toEqual(['new@agency.example']);

      const events = await sql`
        select 1 from public.domain_events
        where organization_id = ${world.organizationId} and type = 'identity.user.invited'
          and payload ->> 'membershipId' = ${result.membershipId}
      `;
      expect(events).toHaveLength(1);
      const audits = await sql<{ actor_user_id: string }[]>`
        select actor_user_id from public.audit_log
        where organization_id = ${world.organizationId} and action = 'invitation.created'
      `;
      expect(audits).toEqual([{ actor_user_id: world.users.founder }]);
    });
  });

  it('decision maker invites only to own client and only client roles', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const deps = depsFor(sql);
      const decisionMaker = await sessionFor(deps.contexts, world.users.decisionMakerA);

      const ownClient = await inviteClientUser(
        decisionMaker,
        {
          clientId: world.clients.a,
          email: 'colleague@client-a.example',
          role: 'operational',
          fullName: 'Colleague',
        },
        deps,
      );
      expect(ownClient).toHaveProperty('membershipId');

      expect(
        await inviteClientUser(
          decisionMaker,
          {
            clientId: world.clients.b,
            email: 'spy@client-a.example',
            role: 'operational',
            fullName: 'Spy',
          },
          deps,
        ),
      ).toEqual({ error: 'forbidden' });

      expect(
        await inviteClientUser(
          decisionMaker,
          {
            clientId: world.clients.a,
            email: 'boss@client-a.example',
            // @ts-expect-error internal roles cannot be granted through client invitations
            role: 'founder',
            fullName: 'Boss',
          },
          deps,
        ),
      ).toEqual({ error: 'invalid_input' });
      expect(deps.admin.invited).toEqual(['colleague@client-a.example']);
    });
  });

  it('accepting activates membership once', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const deps = depsFor(sql);
      const founder = await sessionFor(deps.contexts, world.users.founder);
      const result = await inviteTeamMember(
        founder,
        { email: 'joiner@agency.example', role: 'finance', fullName: 'Joiner' },
        deps,
      );
      if (!('membershipId' in result)) throw new Error('Invitation failed');
      await sql`reset role`;
      const [joiner] = await sql<
        { id: string }[]
      >`select id from auth.users where email = 'joiner@agency.example'`;

      const first = await acceptInvitation(claimsFor(joiner?.id ?? '', 'aal1'), deps);
      const second = await acceptInvitation(claimsFor(joiner?.id ?? '', 'aal1'), deps);
      await sql`reset role`;

      expect(first).toEqual({ activated: 1 });
      expect(second).toEqual({ activated: 0 });
      const [membership] = await sql<{ status: string }[]>`
        select status from public.organization_memberships where id = ${result.membershipId}
      `;
      expect(membership?.status).toBe('active');
      const audits = await sql`
        select 1 from public.audit_log where action = 'invitation.accepted' and actor_user_id = ${joiner?.id ?? ''}
      `;
      expect(audits).toHaveLength(1);
    });
  });

  it('re-inviting an existing member does not duplicate the membership', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const deps = depsFor(sql);
      const founder = await sessionFor(deps.contexts, world.users.founder);
      const input = {
        email: 'twice@agency.example',
        role: 'freelancer' as const,
        fullName: 'Twice',
      };

      const first = await inviteTeamMember(founder, input, deps);
      const second = await inviteTeamMember(founder, input, deps);
      await sql`reset role`;

      expect(second).toEqual(first);
      const rows = await sql`
        select 1 from public.organization_memberships m join auth.users u on u.id = m.user_id
        where u.email = 'twice@agency.example'
      `;
      expect(rows).toHaveLength(1);
    });
  });
});

describe('bootstrapFounder', () => {
  it('bootstrap is idempotent', async () => {
    await withTestTransaction(async (sql) => {
      const deps = depsFor(sql);
      const organizationName = `Bootstrap ${randomUUID().slice(0, 8)}`;
      const input = { email: 'Founder@Bootstrap.Example', fullName: 'Founder', organizationName };

      const first = await bootstrapFounder(input, deps);
      const second = await bootstrapFounder(input, deps);
      await sql`reset role`;

      expect(second).toEqual({ ...first, created: false });
      expect(first.created).toBe(true);
      const organizations =
        await sql`select 1 from public.organizations where name = ${organizationName}`;
      expect(organizations).toHaveLength(1);
      const founders = await sql<{ role: string; status: string }[]>`
        select role, status from public.organization_memberships where organization_id = ${first.organizationId}
      `;
      expect(founders).toEqual([{ role: 'founder', status: 'invited' }]);
    });
  });

  it('keeps an existing profile when the founder already has an account', async () => {
    await withTestTransaction(async (sql) => {
      const existing = await createAuthUser(sql, {
        fullName: 'Existing Name',
        kind: 'internal',
        email: 'existing@bootstrap.example',
      });
      const deps = depsFor(sql);

      const result = await bootstrapFounder(
        {
          email: 'existing@bootstrap.example',
          fullName: 'Other Name',
          organizationName: `Org ${randomUUID()}`,
        },
        deps,
      );
      await sql`reset role`;

      expect(result.userId).toBe(existing);
      const [profile] = await sql<
        { full_name: string }[]
      >`select full_name from public.profiles where id = ${existing}`;
      expect(profile?.full_name).toBe('Existing Name');
    });
  });
});
