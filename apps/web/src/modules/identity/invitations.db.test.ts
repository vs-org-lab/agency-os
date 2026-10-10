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
import type { EmailPort, OutgoingEmail } from '@/modules/email';
import { createDbContexts, type DbContexts, type VerifiedClaims } from '@/platform/db';
import {
  acceptInvitation,
  bootstrapFounder,
  inviteClientUser,
  inviteTeamMember,
  resendInvitation,
  type AdminPort,
  type BootstrapDeps,
  type InvitationDeps,
  type InvitationLinkPort,
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

async function ensureAuthUser(sql: TransactionSql, email: string): Promise<string> {
  await sql`reset role`;
  const [existing] = await sql<
    { id: string }[]
  >`select id from auth.users where lower(email) = ${email}`;
  if (existing) return existing.id;
  const id = randomUUID();
  await sql`
    insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
    values (${id}, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', ${email}, now(), now())
  `;
  return id;
}

function fakeLinks(sql: TransactionSql): InvitationLinkPort & { invited: string[] } {
  const invited: string[] = [];
  return {
    invited,
    async createInvitationLink(email) {
      invited.push(email);
      const userId = await ensureAuthUser(sql, email);
      return {
        userId,
        link: `https://app.example/accept-invitation?token_hash=${randomUUID()}&type=invite`,
      };
    },
  };
}

function fakeEmail(): EmailPort & { sent: OutgoingEmail[] } {
  const sent: OutgoingEmail[] = [];
  return {
    sent,
    async send(message) {
      sent.push(message);
    },
  };
}

function depsFor(sql: TransactionSql) {
  const deps: InvitationDeps &
    BootstrapDeps & {
      admin: ReturnType<typeof fakeAdmin>;
      links: ReturnType<typeof fakeLinks>;
      email: ReturnType<typeof fakeEmail>;
    } = {
    contexts: createDbContexts(testDatabase(sql)),
    admin: fakeAdmin(sql),
    links: fakeLinks(sql),
    email: fakeEmail(),
    invitationRedirectUrl: 'https://app.example/accept-invitation',
  };
  return deps;
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
      expect(deps.links.invited).toEqual([]);
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
      expect(deps.links.invited).toEqual(['new@agency.example']);

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
      expect(deps.links.invited).toEqual(['colleague@client-a.example']);
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

describe('invitations sent by the OS', () => {
  it('team invitation sends the OS email with the link', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const deps = depsFor(sql);
      const founder = await sessionFor(deps.contexts, world.users.founder);

      await inviteTeamMember(
        founder,
        { email: 'designer@agency.example', role: 'freelancer', fullName: 'Rui Costa' },
        deps,
      );

      expect(deps.email.sent).toHaveLength(1);
      expect(deps.email.sent[0]).toMatchObject({
        to: 'designer@agency.example',
        template: 'team.invitation',
        organizationId: world.organizationId,
      });
      expect(deps.email.sent[0]?.text).toContain(
        'https://app.example/accept-invitation?token_hash=',
      );
    });
  });

  it('existing account gets a membership and an email', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const deps = depsFor(sql);
      const founder = await sessionFor(deps.contexts, world.users.founder);
      const existingEmail = 'existing.person@agency.example';
      const existingId = await ensureAuthUser(sql, existingEmail);

      const result = await inviteTeamMember(
        founder,
        { email: existingEmail, role: 'project_manager', fullName: 'Existing Person' },
        deps,
      );
      await sql`reset role`;

      if (!('membershipId' in result)) throw new Error('Invitation failed');
      const [membership] = await sql<{ user_id: string }[]>`
        select user_id from public.organization_memberships where id = ${result.membershipId}
      `;
      expect(membership?.user_id).toBe(existingId);
      expect(deps.email.sent.map((message) => message.to)).toEqual([existingEmail]);
    });
  });

  it('invited event carries no link', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const deps = depsFor(sql);
      const founder = await sessionFor(deps.contexts, world.users.founder);

      await inviteClientUser(
        founder,
        {
          clientId: world.clients.a,
          email: 'ops@client-a.example',
          role: 'operational',
          fullName: 'Ops',
        },
        deps,
      );
      await sql`reset role`;

      const events = await sql<{ payload: string }[]>`
        select payload::text as payload from public.domain_events
        where organization_id = ${world.organizationId} and type = 'identity.user.invited'
      `;
      expect(events).toHaveLength(1);
      expect(events[0]?.payload).not.toContain('token_hash');
      expect(deps.email.sent[0]?.template).toBe('client.invitation');
    });
  });

  it('a client account cannot join the team', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const deps = depsFor(sql);
      const founder = await sessionFor(deps.contexts, world.users.founder);
      await sql`reset role`;
      const [client] = await sql<{ email: string }[]>`
        select email from auth.users where id = ${world.users.decisionMakerA}
      `;

      expect(
        await inviteTeamMember(
          founder,
          { email: client?.email ?? '', role: 'freelancer', fullName: 'Client Person' },
          deps,
        ),
      ).toEqual({ error: 'client_account' });
      expect(deps.links.invited).toEqual([]);
      expect(deps.email.sent).toEqual([]);
    });
  });

  it('inviting again resends to pending members and refuses active or revoked ones', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const deps = depsFor(sql);
      const founder = await sessionFor(deps.contexts, world.users.founder);
      const input = {
        email: 'again@agency.example',
        role: 'freelancer' as const,
        fullName: 'Again',
      };
      const first = await inviteTeamMember(founder, input, deps);
      if (!('membershipId' in first)) throw new Error('Invitation failed');

      expect(await inviteTeamMember(founder, input, deps)).toEqual(first);
      expect(deps.email.sent).toHaveLength(2);

      await sql`reset role`;
      await sql`update public.organization_memberships set status = 'active' where id = ${first.membershipId}`;
      expect(await inviteTeamMember(founder, input, deps)).toEqual({ error: 'already_member' });
      await sql`update public.organization_memberships set status = 'revoked' where id = ${first.membershipId}`;
      expect(await inviteTeamMember(founder, input, deps)).toEqual({ error: 'revoked_member' });
      expect(deps.email.sent).toHaveLength(2);
    });
  });

  it('a revoked client user can be invited again', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const deps = depsFor(sql);
      const decisionMaker = await sessionFor(deps.contexts, world.users.decisionMakerA);
      const input = {
        clientId: world.clients.a,
        email: 'returning@client-a.example',
        role: 'operational' as const,
        fullName: 'Returning',
      };
      const first = await inviteClientUser(decisionMaker, input, deps);
      if (!('membershipId' in first)) throw new Error('Invitation failed');
      await sql`reset role`;
      await sql`update public.client_memberships set status = 'revoked' where id = ${first.membershipId}`;

      expect(await inviteClientUser(decisionMaker, input, deps)).toEqual(first);
      await sql`reset role`;
      const [row] = await sql<{ status: string }[]>`
        select status::text from public.client_memberships where id = ${first.membershipId}
      `;
      expect(row?.status).toBe('invited');
      expect(deps.email.sent).toHaveLength(2);
    });
  });

  it('resend only for pending invitations', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const deps = depsFor(sql);
      const founder = await sessionFor(deps.contexts, world.users.founder);
      const invited = await inviteTeamMember(
        founder,
        { email: 'pending@agency.example', role: 'finance', fullName: 'Pending' },
        deps,
      );
      if (!('membershipId' in invited)) throw new Error('Invitation failed');

      expect(
        await resendInvitation(
          founder,
          { membershipId: invited.membershipId, kind: 'internal' },
          deps,
        ),
      ).toEqual({ ok: true });
      expect(deps.email.sent).toHaveLength(2);

      await sql`reset role`;
      await sql`
        update public.organization_memberships set status = 'active'
        where id = ${invited.membershipId}
      `;
      expect(
        await resendInvitation(
          founder,
          { membershipId: invited.membershipId, kind: 'internal' },
          deps,
        ),
      ).toEqual({ ok: false, rule: 'invalid_state' });
      const manager = await sessionFor(deps.contexts, world.users.manager);
      expect(
        await resendInvitation(
          manager,
          { membershipId: invited.membershipId, kind: 'internal' },
          deps,
        ),
      ).toEqual({ ok: false, rule: 'not_found' });
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
