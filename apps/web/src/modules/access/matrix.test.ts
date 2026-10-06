import { describe, expect, it } from 'vitest';
import { authorize } from './authorize';
import type { AccessContext, Action, Actor, ClientRole, InternalRole, Resource } from './types';

const CLIENT_A = '00000000-0000-4000-8000-00000000000a';
const CLIENT_B = '00000000-0000-4000-8000-00000000000b';
const ACTIONS: Action[] = ['read', 'write', 'approve', 'draft', 'pay', 'publish', 'invite'];

function internalActor(role: InternalRole, options: { agent?: boolean } = {}): Actor {
  return {
    userId: 'user',
    organizationId: 'organization',
    roles: options.agent ? [role, 'agent'] : [role],
    mfaVerifiedAt: new Date(),
  };
}

function clientActor(): Actor {
  return { userId: 'user', organizationId: 'organization', roles: [], mfaVerifiedAt: null };
}

function context(
  input: { assigned?: string[]; client?: Record<string, ClientRole[]> } = {},
): AccessContext {
  return {
    assignedClientIds: new Set(input.assigned ?? []),
    clientRoles: new Map(Object.entries(input.client ?? {})),
  };
}

function allowedActions(actor: Actor, resource: Resource, clientId: string, ctx: AccessContext) {
  return ACTIONS.filter(
    (action) => authorize(actor, action, { type: resource, clientId }, ctx).allowed,
  );
}

type Expectation = { resource: Resource; assignedOrOwn: Action[]; other: Action[] };

const internalMatrix: Record<InternalRole, Expectation[]> = {
  founder: [
    {
      resource: 'pipeline',
      assignedOrOwn: ['read', 'write', 'draft'],
      other: ['read', 'write', 'draft'],
    },
    {
      resource: 'rooms',
      assignedOrOwn: ['read', 'write', 'draft'],
      other: ['read', 'write', 'draft'],
    },
    {
      resource: 'commercial_values',
      assignedOrOwn: ['read', 'write', 'approve', 'draft'],
      other: ['read', 'write', 'approve', 'draft'],
    },
    {
      resource: 'invoices',
      assignedOrOwn: ['read', 'write', 'draft'],
      other: ['read', 'write', 'draft'],
    },
    {
      resource: 'library',
      assignedOrOwn: ['read', 'write', 'draft'],
      other: ['read', 'write', 'draft'],
    },
    {
      resource: 'brand_hub',
      assignedOrOwn: ['read', 'write', 'draft', 'publish'],
      other: ['read', 'write', 'draft', 'publish'],
    },
    {
      resource: 'vault',
      assignedOrOwn: ['read', 'write', 'draft'],
      other: ['read', 'write', 'draft'],
    },
    {
      resource: 'users',
      assignedOrOwn: ['read', 'write', 'draft', 'invite'],
      other: ['read', 'write', 'draft', 'invite'],
    },
    { resource: 'audit_log', assignedOrOwn: ['read'], other: ['read'] },
  ],
  project_manager: [
    { resource: 'pipeline', assignedOrOwn: ['read', 'write', 'draft'], other: [] },
    { resource: 'rooms', assignedOrOwn: ['read', 'write', 'draft'], other: [] },
    { resource: 'commercial_values', assignedOrOwn: ['read', 'write', 'draft'], other: [] },
    { resource: 'invoices', assignedOrOwn: ['read'], other: ['read'] },
    { resource: 'library', assignedOrOwn: ['read', 'write', 'draft'], other: [] },
    { resource: 'brand_hub', assignedOrOwn: ['read', 'write', 'draft', 'publish'], other: [] },
    { resource: 'vault', assignedOrOwn: ['read'], other: [] },
    { resource: 'users', assignedOrOwn: [], other: [] },
    { resource: 'audit_log', assignedOrOwn: [], other: [] },
  ],
  freelancer: [
    { resource: 'pipeline', assignedOrOwn: [], other: [] },
    { resource: 'rooms', assignedOrOwn: ['read', 'write', 'draft'], other: [] },
    { resource: 'commercial_values', assignedOrOwn: [], other: [] },
    { resource: 'invoices', assignedOrOwn: [], other: [] },
    { resource: 'library', assignedOrOwn: ['read', 'write', 'draft'], other: [] },
    { resource: 'brand_hub', assignedOrOwn: ['read', 'write', 'draft'], other: [] },
    { resource: 'vault', assignedOrOwn: ['read'], other: [] },
    { resource: 'users', assignedOrOwn: [], other: [] },
    { resource: 'audit_log', assignedOrOwn: [], other: [] },
  ],
  finance: [
    { resource: 'pipeline', assignedOrOwn: ['read'], other: ['read'] },
    { resource: 'rooms', assignedOrOwn: ['read'], other: ['read'] },
    { resource: 'commercial_values', assignedOrOwn: ['read'], other: ['read'] },
    {
      resource: 'invoices',
      assignedOrOwn: ['read', 'write', 'draft'],
      other: ['read', 'write', 'draft'],
    },
    { resource: 'library', assignedOrOwn: ['read'], other: ['read'] },
    { resource: 'brand_hub', assignedOrOwn: [], other: [] },
    { resource: 'vault', assignedOrOwn: [], other: [] },
    { resource: 'users', assignedOrOwn: [], other: [] },
    { resource: 'audit_log', assignedOrOwn: [], other: [] },
  ],
};

const clientMatrix: Record<ClientRole, Record<Resource, Action[]>> = {
  decision_maker: {
    pipeline: [],
    rooms: ['read', 'approve'],
    commercial_values: ['read', 'approve'],
    invoices: ['read', 'pay'],
    library: ['read'],
    brand_hub: ['read', 'approve'],
    vault: ['write', 'draft'],
    users: ['invite'],
    audit_log: [],
  },
  operational: {
    pipeline: [],
    rooms: ['read', 'write', 'draft'],
    commercial_values: [],
    invoices: [],
    library: ['read', 'write', 'draft'],
    brand_hub: ['read'],
    vault: ['write', 'draft'],
    users: [],
    audit_log: [],
  },
  client_finance: {
    pipeline: [],
    rooms: [],
    commercial_values: ['read'],
    invoices: ['read', 'pay'],
    library: [],
    brand_hub: [],
    vault: [],
    users: [],
    audit_log: [],
  },
};

describe('permission matrix (separador 08)', () => {
  for (const [role, expectations] of Object.entries(internalMatrix) as [
    InternalRole,
    Expectation[],
  ][]) {
    for (const expectation of expectations) {
      it(`${role} on ${expectation.resource}`, () => {
        const ctx = context({ assigned: [CLIENT_A] });
        const actor = internalActor(role);

        expect(allowedActions(actor, expectation.resource, CLIENT_A, ctx)).toEqual(
          expectation.assignedOrOwn,
        );
        expect(allowedActions(actor, expectation.resource, CLIENT_B, ctx)).toEqual(
          expectation.other,
        );
      });
    }
  }

  for (const [role, resources] of Object.entries(clientMatrix) as [
    ClientRole,
    Record<Resource, Action[]>,
  ][]) {
    for (const [resource, actions] of Object.entries(resources) as [Resource, Action[]][]) {
      it(`${role} on ${resource}`, () => {
        const ctx = context({ client: { [CLIENT_A]: [role] } });

        expect(allowedActions(clientActor(), resource, CLIENT_A, ctx)).toEqual(actions);
        expect(allowedActions(clientActor(), resource, CLIENT_B, ctx)).toEqual([]);
      });
    }
  }

  it('freelancer has no access to commercial_values', () => {
    const ctx = context({ assigned: [CLIENT_A] });
    expect(allowedActions(internalActor('freelancer'), 'commercial_values', CLIENT_A, ctx)).toEqual(
      [],
    );
  });

  it('client_finance reads invoices of own room and can pay', () => {
    const ctx = context({ client: { [CLIENT_A]: ['client_finance'] } });
    expect(allowedActions(clientActor(), 'invoices', CLIENT_A, ctx)).toEqual(['read', 'pay']);
  });

  it('agent can only draft on pipeline', () => {
    const ctx = context();
    expect(
      allowedActions(internalActor('founder', { agent: true }), 'pipeline', CLIENT_B, ctx),
    ).toEqual(['read', 'draft']);
  });

  it('agent never exceeds the permissions of the user who connected it', () => {
    const ctx = context({ assigned: [CLIENT_A] });
    expect(
      allowedActions(internalActor('freelancer', { agent: true }), 'pipeline', CLIENT_A, ctx),
    ).toEqual([]);
    expect(
      allowedActions(internalActor('founder', { agent: true }), 'vault', CLIENT_A, ctx),
    ).toEqual([]);
    expect(
      allowedActions(internalActor('founder', { agent: true }), 'audit_log', CLIENT_A, ctx),
    ).toEqual([]);
  });

  it('project_manager writes rooms only for assigned clients', () => {
    const ctx = context({ assigned: [CLIENT_A] });
    expect(
      authorize(
        internalActor('project_manager'),
        'write',
        { type: 'rooms', clientId: CLIENT_A },
        ctx,
      ),
    ).toEqual({
      allowed: true,
    });
    expect(
      authorize(
        internalActor('project_manager'),
        'write',
        { type: 'rooms', clientId: CLIENT_B },
        ctx,
      ),
    ).toEqual({
      allowed: false,
      reason: 'forbidden',
    });
  });

  it('operational writes library only for own room', () => {
    const ctx = context({
      client: { [CLIENT_A]: ['operational'], [CLIENT_B]: ['client_finance'] },
    });
    expect(
      authorize(clientActor(), 'write', { type: 'library', clientId: CLIENT_A }, ctx).allowed,
    ).toBe(true);
    expect(
      authorize(clientActor(), 'write', { type: 'library', clientId: CLIENT_B }, ctx).allowed,
    ).toBe(false);
  });

  it('client roles apply only to the client where they are held', () => {
    const ctx = context({
      client: { [CLIENT_A]: ['decision_maker'], [CLIENT_B]: ['operational'] },
    });
    expect(
      authorize(clientActor(), 'approve', { type: 'rooms', clientId: CLIENT_A }, ctx).allowed,
    ).toBe(true);
    expect(
      authorize(clientActor(), 'approve', { type: 'rooms', clientId: CLIENT_B }, ctx).allowed,
    ).toBe(false);
  });

  it('nobody but founder reads audit_log', () => {
    const ctx = context({ assigned: [CLIENT_A], client: { [CLIENT_A]: ['decision_maker'] } });
    for (const role of ['project_manager', 'freelancer', 'finance'] as InternalRole[]) {
      expect(authorize(internalActor(role), 'read', { type: 'audit_log' }, ctx).allowed, role).toBe(
        false,
      );
    }
    expect(
      authorize(clientActor(), 'read', { type: 'audit_log', clientId: CLIENT_A }, ctx).allowed,
    ).toBe(false);
    expect(authorize(internalActor('founder'), 'read', { type: 'audit_log' }, ctx).allowed).toBe(
      true,
    );
  });
});
