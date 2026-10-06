import { randomUUID } from 'node:crypto';
import type { TransactionSql } from 'postgres';

type OrgRole = 'founder' | 'project_manager' | 'freelancer' | 'finance';
type ClientRole = 'decision_maker' | 'operational' | 'client_finance';
type MembershipStatus = 'invited' | 'active' | 'revoked';

export type World = {
  organizationId: string;
  clients: { a: string; b: string };
  users: {
    founder: string;
    manager: string;
    freelancer: string;
    finance: string;
    decisionMakerA: string;
    operationalA: string;
    clientFinanceB: string;
  };
};

export async function createAuthUser(
  sql: TransactionSql,
  input: { fullName: string; kind: 'internal' | 'client'; email?: string },
): Promise<string> {
  const userId = randomUUID();
  const email = input.email ?? `${userId}@test.agency-os.invalid`;
  await sql`
    insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
    values (${userId}, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            ${email}, now(), now())
  `;
  await sql`
    insert into public.profiles (id, full_name, kind) values (${userId}, ${input.fullName}, ${input.kind})
  `;
  return userId;
}

export async function addOrganizationMember(
  sql: TransactionSql,
  input: { organizationId: string; userId: string; role: OrgRole; status?: MembershipStatus },
): Promise<void> {
  await sql`
    insert into public.organization_memberships (organization_id, user_id, role, status)
    values (${input.organizationId}, ${input.userId}, ${input.role}, ${input.status ?? 'active'})
  `;
}

export async function addClientMember(
  sql: TransactionSql,
  input: {
    organizationId: string;
    clientId: string;
    userId: string;
    role: ClientRole;
    status?: MembershipStatus;
  },
): Promise<void> {
  await sql`
    insert into public.client_memberships (organization_id, client_id, user_id, role, status)
    values (${input.organizationId}, ${input.clientId}, ${input.userId}, ${input.role},
            ${input.status ?? 'active'})
  `;
}

export async function assignStaff(
  sql: TransactionSql,
  input: { organizationId: string; clientId: string; userId: string },
): Promise<void> {
  await sql`
    insert into public.client_staff_assignments (organization_id, client_id, user_id)
    values (${input.organizationId}, ${input.clientId}, ${input.userId})
  `;
}

export async function createFixtureWorld(sql: TransactionSql): Promise<World> {
  const suffix = randomUUID().slice(0, 8);
  const [organization] = await sql<{ id: string }[]>`
    insert into public.organizations (name, slug) values (${`Fixture ${suffix}`}, ${`fixture-${suffix}`})
    returning id
  `;
  if (!organization) throw new Error('Fixture organization was not created');
  const organizationId = organization.id;

  const insertClient = async (name: string): Promise<string> => {
    const [client] = await sql<{ id: string }[]>`
      insert into public.clients (organization_id, name) values (${organizationId}, ${name}) returning id
    `;
    if (!client) throw new Error(`Fixture client ${name} was not created`);
    return client.id;
  };
  const clientA = await insertClient('Client A');
  const clientB = await insertClient('Client B');

  const founder = await createAuthUser(sql, { fullName: 'Founder', kind: 'internal' });
  const manager = await createAuthUser(sql, { fullName: 'Manager', kind: 'internal' });
  const freelancer = await createAuthUser(sql, { fullName: 'Freelancer', kind: 'internal' });
  const finance = await createAuthUser(sql, { fullName: 'Finance', kind: 'internal' });
  const decisionMakerA = await createAuthUser(sql, {
    fullName: 'Decision Maker A',
    kind: 'client',
  });
  const operationalA = await createAuthUser(sql, { fullName: 'Operational A', kind: 'client' });
  const clientFinanceB = await createAuthUser(sql, {
    fullName: 'Client Finance B',
    kind: 'client',
  });

  await addOrganizationMember(sql, { organizationId, userId: founder, role: 'founder' });
  await addOrganizationMember(sql, { organizationId, userId: manager, role: 'project_manager' });
  await addOrganizationMember(sql, { organizationId, userId: freelancer, role: 'freelancer' });
  await addOrganizationMember(sql, { organizationId, userId: finance, role: 'finance' });
  await assignStaff(sql, { organizationId, clientId: clientA, userId: manager });
  await assignStaff(sql, { organizationId, clientId: clientA, userId: freelancer });
  await addClientMember(sql, {
    organizationId,
    clientId: clientA,
    userId: decisionMakerA,
    role: 'decision_maker',
  });
  await addClientMember(sql, {
    organizationId,
    clientId: clientA,
    userId: operationalA,
    role: 'operational',
  });
  await addClientMember(sql, {
    organizationId,
    clientId: clientB,
    userId: clientFinanceB,
    role: 'client_finance',
  });

  return {
    organizationId,
    clients: { a: clientA, b: clientB },
    users: { founder, manager, freelancer, finance, decisionMakerA, operationalA, clientFinanceB },
  };
}
